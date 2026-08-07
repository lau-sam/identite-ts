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

// MRZ TD1 fictive émise par un État autre que la France (checksums recalculés).
const TD1_ETRANGER = [
  'IDCHES1234567<2<<<<<<<<<<<<<<<',
  '8501019M3001019CHE<<<<<<<<<<<8',
  'MUSTER<<HANS<PETER<<<<<<<<<<<<',
];

function optionsAvec(engines: {
  datamatrix?: string[];
  qr?: string[];
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
          return [
            ...(engines.datamatrix ?? []).map((texte) => ({ format: 'DataMatrix', texte })),
            ...(engines.qr ?? []).map((texte) => ({ format: 'QRCode', texte })),
          ];
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
    expect(r.document).toBe('carte-identite');
    expect(r.source).toBe('2ddoc');
    expect(r.data?.nom?.valeur).toBe('MARTIN');
    expect(r.data?.dateNaissance?.valeur).toBe('1990-07-13');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(traces).not.toContain('ocr:mrz');
    expect(r.raw.codesBarres).toEqual([{ format: 'DataMatrix', texte: CODE_2DDOC }]);
  });

  it("expose un QR non 2D-DOC sans l'interpréter", async () => {
    // Permis de conduire suisse : QR au format non documenté publiquement.
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ qr: ['CH01|charge utile inconnue'] }),
    );
    expect(r.raw.codesBarres).toEqual([{ format: 'QRCode', texte: 'CH01|charge utile inconnue' }]);
    expect(r.document).toBe('inconnu');
    expect(r.data).toBeNull();
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

  it("remonte l'État émetteur d'une carte d'identité étrangère", async () => {
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ ocrMrz: TD1_ETRANGER.join('\n') }),
    );
    expect(r.document).toBe('carte-identite');
    expect(r.paysEmetteur).toBe('CHE');
    expect(r.data?.nom?.valeur).toBe('MUSTER');
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

  it('récupère nom et prénom imprimés au-dessus du NIR (source ocr)', async () => {
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({
        ocrTexte:
          'Vitale\ncarte d’assurance maladie\nNATHALIE\nDURAND\n2 69 05 75 056 157 12\nSPECIMEN',
      }),
    );
    expect(r.data?.prenoms?.valeur).toEqual(['NATHALIE']);
    expect(r.data?.nom?.valeur).toBe('DURAND');
    expect(r.data?.nom?.source).toBe('ocr');
    expect(r.data?.nom?.checksumValide).toBeUndefined();
  });

  it('sépare nom et prénom quand ils sont sur la même ligne', async () => {
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ ocrTexte: 'CARTE VITALE\nNATHALIE DURAND\n2 69 05 75 056 157 12' }),
    );
    expect(r.data?.prenoms?.valeur).toEqual(['NATHALIE']);
    expect(r.data?.nom?.valeur).toBe('DURAND');
  });

  it("n'invente pas de nom quand rien n'est lisible au-dessus du NIR", async () => {
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ ocrTexte: 'carte d’assurance maladie\n2 69 05 75 056 157 12' }),
    );
    expect(r.data?.nom).toBeUndefined();
    expect(r.data?.prenoms).toBeUndefined();
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

describe('detecterMrz robustesse OCR', () => {
  it('élimine les caractères parasites autour des lignes MRZ (fenêtrage par checksums)', async () => {
    // parasites en tête de ligne : étoiles/décor lus comme chiffres par l'OCR
    const texte = [
      'IDFRAX4RTBPFW46<<<<<<<<<<<<<<<',
      '39007138F3002119FRA<<<<<<<<<<<6',
      '5MARTIN<<MAELYS<GAELLE<MARIE<<<',
    ].join('\n');
    const r = await extractDocument(IMAGE_FACTICE, optionsAvec({ ocrMrz: texte }));
    expect(r.source).toBe('mrz');
    expect(r.document).toBe('carte-identite');
    expect(r.data?.nom?.valeur).toBe('MARTIN');
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('tolère un parasite en tête de la ligne du nom', async () => {
    // Aucun checksum ne couvre cette ligne : sans garde, la fenêtre décalée
    // passe pour valide et le nom sort amputé de sa première lettre.
    const texte = `7${TD3[0]}\n${TD3[1]}`;
    const r = await extractDocument(IMAGE_FACTICE, optionsAvec({ ocrMrz: texte }));
    expect(r.raw.lignesMrz).toEqual(TD3);
    expect(r.data?.nom?.valeur).toBe('ERIKSSON');
    expect(r.paysEmetteur).toBe('UTO');
  });

  it("tolère un parasite en tête quand l'État émetteur tient en une lettre", async () => {
    // Spécimen allemand (Erika Mustermann) : le code pays « D » est complété
    // par des chevrons — un en-tête parfaitement légal qui n'a rien d'anormal.
    const lignes = [
      'P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<',
      'C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4',
    ];
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ ocrMrz: `9${lignes[0]}\n${lignes[1]}` }),
    );
    expect(r.raw.lignesMrz).toEqual(lignes);
    expect(r.data?.nom?.valeur).toBe('MUSTERMANN');
    expect(r.paysEmetteur).toBe('D');
  });

  it('tolère un parasite en fin de ligne', async () => {
    const texte = `${TD3[0]}4\n${TD3[1]}`;
    const r = await extractDocument(IMAGE_FACTICE, optionsAvec({ ocrMrz: texte }));
    expect(r.source).toBe('mrz');
    expect(r.data?.nom?.valeur).toBe('ERIKSSON');
  });
});

describe('detecterMrz sur une MRZ TD2', () => {
  it('retrouve les lignes exactes malgré des parasites en tête', async () => {
    // Spécimen ICAO 9303 partie 6, précédé du décor lu comme un caractère
    const lignes = ['I<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<', 'D231458907UTO7408122F1204159<<<<<<<6'];
    const texte = `5${lignes[0]}\n3${lignes[1]}`;
    const r = await extractDocument(IMAGE_FACTICE, optionsAvec({ ocrMrz: texte }));
    expect(r.source).toBe('mrz');
    expect(r.raw.lignesMrz).toEqual(lignes);
    expect(r.data?.nom?.valeur).toBe('ERIKSSON');
    expect(r.paysEmetteur).toBe('UTO');
  });
});

describe('detecterMrz insertion OCR au milieu de ligne', () => {
  it('choisit la fenêtre qui donne une vraie date de naissance', async () => {
    // insertion OCR simulée : 'HERVE' lu 'HERV0E' → ligne de 37 caractères
    const texte = [
      'IDFRALOISEAU<<<<<<<<<<<<<<<<<<<<<<<<',
      '970675K002774HERV0E<<DJAMEL<7303216M4',
    ].join('\n');
    const r = await extractDocument(IMAGE_FACTICE, optionsAvec({ ocrMrz: texte }));
    expect(r.source).toBe('mrz');
    expect(r.data?.dateNaissance?.valeur).toBe('1973-03-21');
    expect(r.data?.dateNaissance?.checksumValide).toBe(true);
    expect(r.data?.sexe?.valeur).toBe('M');
  });
});

describe('extractDocument sans détection', () => {
  it('renvoie unknown sans jeter, avec le texte brut pour debug', async () => {
    const r = await extractDocument(
      IMAGE_FACTICE,
      optionsAvec({ ocrMrz: 'rien ici', ocrTexte: 'toujours rien' }),
    );
    expect(r.document).toBe('inconnu');
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
