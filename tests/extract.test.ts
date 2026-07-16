import { describe, expect, it } from 'vitest';
import type { ExtractOptions } from '../src/extract';
import { extractDocument } from '../src/extract';

const IMAGE_FACTICE = { width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData;

const CODE_2DDOC = [
  'DC04FR011234111E111F0001FR',
  '62MARTIN\u001d60MAELYS/GAELLE/MARIE\u001d68F691307199066X4RTBPFW4',
  '\u001fSIGNATUREFACTICE',
].join('');

const TD3 = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
];

function optionsAvec(engines: {
  datamatrix?: string[];
  ocrMrz?: string;
  ocrTexte?: string;
  traces?: string[];
}): ExtractOptions {
  const traces = engines.traces ?? [];
  return {
    preparer: async () => IMAGE_FACTICE,
    engines: {
      datamatrix: {
        async decoder() {
          traces.push('datamatrix');
          return engines.datamatrix ?? [];
        },
      },
      ocr: {
        async reconnaitre(_image, mode) {
          traces.push(`ocr:${mode}`);
          return (mode === 'mrz' ? engines.ocrMrz : engines.ocrTexte) ?? '';
        },
        async liberer() {
          traces.push('liberer');
        },
      },
    },
  };
}

describe('extractDocument via 2D-DOC', () => {
  it('privilégie le Datamatrix et ne lance pas l’OCR', async () => {
    const traces: string[] = [];
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ datamatrix: [CODE_2DDOC], traces }),
    );
    expect(r.document).toBe('cni-2021');
    expect(r.source).toBe('2ddoc');
    expect(r.data?.nom?.valeur).toBe('MARTIN');
    expect(r.data?.dateNaissance?.valeur).toBe('1990-07-13');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(traces).not.toContain('ocr:mrz');
    expect(r.raw.payloadsDatamatrix).toEqual([CODE_2DDOC]);
  });

  it('ignore un payload non 2D-DOC et retombe sur l’OCR', async () => {
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ datamatrix: ['https://example.com'], ocrMrz: TD3.join('\n') }),
    );
    expect(r.source).toBe('mrz');
  });
});

describe('extractDocument via MRZ', () => {
  it('détecte une MRZ TD3 dans du texte OCR bruité', async () => {
    const texte = `RÉPUBLIQUE FRANÇAISE\n${TD3[0]}\n${TD3[1]}\n`;
    const r = await extractDocument(IMAGE_FACTICE, optionsAvec({ ocrMrz: texte }));
    expect(r.document).toBe('passeport');
    expect(r.source).toBe('mrz');
    expect(r.data?.nom?.valeur).toBe('ERIKSSON');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.raw.lignesMrz).toEqual(TD3);
  });

  it('tolère les espaces insérés par l’OCR dans la MRZ', async () => {
    const texte = `${TD3[0]?.slice(0, 10)} ${TD3[0]?.slice(10)}\n${TD3[1]}`;
    const r = await extractDocument(IMAGE_FACTICE, optionsAvec({ ocrMrz: texte }));
    expect(r.source).toBe('mrz');
    expect(r.data?.nom?.valeur).toBe('ERIKSSON');
  });

  it('réduit la confiance quand des checksums échouent', async () => {
    const lignesAbimees = `${TD3[0]}\n${TD3[1]?.replace('7408122', '7408123')}`;
    const r = await extractDocument(IMAGE_FACTICE, optionsAvec({ ocrMrz: lignesAbimees }));
    expect(r.source).toBe('mrz');
    expect(r.confidence).toBeLessThan(0.9);
  });
});

describe('extractDocument via NIR', () => {
  it('détecte un NIR et résout la commune de naissance', async () => {
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ ocrTexte: 'CARTE VITALE\n2 69 05 75 056 157 12\nASSURANCE MALADIE' }),
    );
    expect(r.document).toBe('carte-vitale');
    expect(r.source).toBe('nir');
    expect(r.data?.sexe?.valeur).toBe('F');
    expect(r.data?.dateNaissance?.valeur).toEqual({ annee: 1969, mois: 5 });
    expect(r.data?.lieuNaissance?.valeur.commune).toBe('Paris');
    expect(r.raw.nir).toBe('2690575056157');
  });

  it('peut désactiver la résolution INSEE', async () => {
    const r = await extractDocument(IMAGE_FACTICE, {
      ...optionsAvec({ ocrTexte: '2 69 05 75 056 157 12' }),
      resoudreCommune: false,
    });
    expect(r.data?.lieuNaissance?.valeur.codeInsee).toBe('75056');
    expect(r.data?.lieuNaissance?.valeur.commune).toBeUndefined();
  });
});

describe('extractDocument sans détection', () => {
  it('renvoie unknown sans jeter, avec le texte brut pour debug', async () => {
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ ocrMrz: 'rien ici', ocrTexte: 'toujours rien' }),
    );
    expect(r.document).toBe('unknown');
    expect(r.data).toBeNull();
    expect(r.source).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.raw.texteOcr).toContain('toujours rien');
  });

  it('libère le moteur OCR injecté ? non : le propriétaire le garde', async () => {
    const traces: string[] = [];
    await extractDocument(IMAGE_FACTICE, optionsAvec({ traces }));
    expect(traces).not.toContain('liberer');
  });
});
