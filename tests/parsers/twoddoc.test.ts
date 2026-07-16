import { describe, expect, it } from 'vitest';
import { parse2ddoc, TwoDDocParseError } from '../../src/parsers/twoddoc';

const GS = '\u001d'; // fin de champ variable
const RS = '\u001e'; // champ tronqué
const US = '\u001f'; // début de la zone de signature

// En-tête v04 (26 car.) : DC 04 FR01 1234 111E 111F 00 01 FR
// 0x111E = 4382 jours après le 01/01/2000 = 31/12/2011 (exemple de la spec ANTS)
const ENTETE_V04 = 'DC04FR011234111E111F0001FR';

const MESSAGE = [
  `62MARTIN${GS}`, // nom patronymique (variable)
  `60MAELYS/GAELLE/MARIE${GS}`, // liste des prénoms (variable)
  '68F', // genre (fixe, 1)
  '6913071990', // date de naissance JJMMAAAA (fixe, 8)
  `6APARIS${GS}`, // lieu de naissance (variable)
  '67FR', // nationalité (fixe, 2)
  '66X4RTBPFW4', // n° de pièce (variable, dernier champ : pas de GS)
].join('');

const SIGNATURE = 'A7GRAVCS7A2LFVDXVSHYBLZUKHQBXCPUOSQNMSYNRRP6NPKUWPHA';

const CODE = `${ENTETE_V04}${MESSAGE}${US}${SIGNATURE}`;

describe('parse2ddoc en-tête', () => {
  it('décode un en-tête v04', () => {
    const r = parse2ddoc(CODE);
    expect(r.header.version).toBe(4);
    expect(r.header.autoriteCertification).toBe('FR01');
    expect(r.header.identifiantCertificat).toBe('1234');
    expect(r.header.dateEmission).toBe('2011-12-31');
    expect(r.header.typeDocument).toBe('00');
    expect(r.header.perimetre).toBe('01');
    expect(r.header.pays).toBe('FR');
  });

  it('décode un en-tête v03 (24 caractères, sans pays)', () => {
    const r = parse2ddoc(`DC03FR011234111E111F0001${MESSAGE}`);
    expect(r.header.version).toBe(3);
    expect(r.header.perimetre).toBe('01');
    expect(r.header.pays).toBeUndefined();
  });

  it('décode un en-tête v02 (22 caractères, sans périmètre)', () => {
    const r = parse2ddoc(`DC02FR011234111E111F00${MESSAGE}`);
    expect(r.header.version).toBe(2);
    expect(r.header.perimetre).toBeUndefined();
  });

  it('laisse la date indéfinie quand elle vaut FFFF', () => {
    const r = parse2ddoc(`DC04FR011234FFFF111F0001FR${MESSAGE}`);
    expect(r.header.dateEmission).toBeUndefined();
  });

  it('rejette un marqueur inconnu', () => {
    expect(() => parse2ddoc('XX04FR011234111E111F0001FR62MARTIN')).toThrow(TwoDDocParseError);
  });
});

describe('parse2ddoc zone de message', () => {
  it('découpe champs fixes et variables', () => {
    const r = parse2ddoc(CODE);
    const parId = Object.fromEntries(r.champs.map((c) => [c.id, c.valeur]));
    expect(parId['62']).toBe('MARTIN');
    expect(parId['60']).toBe('MAELYS/GAELLE/MARIE');
    expect(parId['68']).toBe('F');
    expect(parId['69']).toBe('13071990');
    expect(parId['6A']).toBe('PARIS');
    expect(parId['67']).toBe('FR');
    expect(parId['66']).toBe('X4RTBPFW4');
  });

  it('libelle les champs connus du registre', () => {
    const r = parse2ddoc(CODE);
    const nom = r.champs.find((c) => c.id === '62');
    expect(nom?.libelle).toBe('Nom patronymique');
  });

  it('marque les champs tronqués (RS)', () => {
    const r = parse2ddoc(`${ENTETE_V04}63DUPO${RS}68F`);
    const usage = r.champs.find((c) => c.id === '63');
    expect(usage?.valeur).toBe('DUPO');
    expect(usage?.tronque).toBe(true);
  });

  it('traite un identifiant inconnu comme champ variable sans libellé', () => {
    const r = parse2ddoc(`${ENTETE_V04}ZZMYSTERE${GS}68F`);
    const inconnu = r.champs.find((c) => c.id === 'ZZ');
    expect(inconnu?.valeur).toBe('MYSTERE');
    expect(inconnu?.libelle).toBeUndefined();
    expect(r.champs.find((c) => c.id === '68')?.valeur).toBe('F');
  });
});

describe('parse2ddoc identité et signature', () => {
  it('mappe les champs identité vers le modèle commun', () => {
    const r = parse2ddoc(CODE);
    expect(r.identite.nom?.valeur).toBe('MARTIN');
    expect(r.identite.prenoms?.valeur).toEqual(['MAELYS', 'GAELLE', 'MARIE']);
    expect(r.identite.sexe?.valeur).toBe('F');
    expect(r.identite.dateNaissance?.valeur).toBe('1990-07-13');
    expect(r.identite.lieuNaissance?.valeur.commune).toBe('PARIS');
    expect(r.identite.nationalite?.valeur).toBe('FRA');
    expect(r.identite.numeroDocument?.valeur).toBe('X4RTBPFW4');
    expect(r.identite.nom?.source).toBe('2ddoc');
  });

  it('convertit une date de naissance au jour inconnu en date partielle', () => {
    const r = parse2ddoc(`${ENTETE_V04}6900071990`);
    expect(r.identite.dateNaissance?.valeur).toEqual({ annee: 1990, mois: 7 });
  });

  it('expose la signature brute sans la vérifier', () => {
    const r = parse2ddoc(CODE);
    expect(r.signature).toBe(SIGNATURE);
    expect(r.signatureVerifiee).toBe(false);
  });

  it('tolère une zone de signature absente', () => {
    const r = parse2ddoc(`${ENTETE_V04}${MESSAGE}`);
    expect(r.signature).toBeUndefined();
  });
});
