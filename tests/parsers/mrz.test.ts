import { describe, expect, it } from 'vitest';
import { MrzParseError, parseMrz } from '../../src/parsers/mrz';

// Spécimen officiel ICAO 9303 (Utopia)
const TD3: [string, string] = [
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
];

// Spécimen ANTS de la nouvelle CNI 2021 (carte MARTIN Maëlys)
const TD1 = [
  'IDFRAX4RTBPFW46<<<<<<<<<<<<<<<',
  '9007138F3002119FRA<<<<<<<<<<<6',
  'MARTIN<<MAELYS<GAELLE<MARIE<<<',
];

// Spécimen officiel ICAO 9303 partie 6, appendice B (Utopia)
const TD2 = ['I<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<', 'D231458907UTO7408122F1204159<<<<<<<6'];

// Spécimen d'ancienne CNI (format IDFRA 2×36)
const IDFRA = ['IDFRALOISEAU<<<<<<<<<<<<<<<<<<<<<<<<', '970675K002774HERVE<<DJAMEL<7303216M4'];

describe('parseMrz TD3 (passeport)', () => {
  it('extrait toutes les données du spécimen ICAO', () => {
    const r = parseMrz(TD3);
    expect(r.format).toBe('td3');
    expect(r.categorie).toBe('passeport');
    expect(r.paysEmetteur).toBe('UTO');
    expect(r.identite.nom?.valeur).toBe('ERIKSSON');
    expect(r.identite.prenoms?.valeur).toEqual(['ANNA', 'MARIA']);
    expect(r.identite.sexe?.valeur).toBe('F');
    expect(r.identite.dateNaissance?.valeur).toBe('1974-08-12');
    expect(r.identite.nationalite?.valeur).toBe('UTO');
    expect(r.identite.numeroDocument?.valeur).toBe('L898902C3');
    expect(r.identite.dateExpiration?.valeur).toBe('2012-04-15');
    expect(r.valide).toBe(true);
    expect(r.checksums.composite).toBe(true);
  });

  it('marque le champ en échec quand un checksum est invalide', () => {
    const lignes = [TD3[0], TD3[1].replace('7408122', '7408123')];
    const r = parseMrz(lignes);
    expect(r.checksums.dateNaissance).toBe(false);
    expect(r.valide).toBe(false);
    expect(r.identite.dateNaissance?.checksumValide).toBe(false);
  });
});

describe('parseMrz TD1 (nouvelle CNI 2021)', () => {
  it('extrait toutes les données du spécimen ANTS', () => {
    const r = parseMrz(TD1);
    expect(r.format).toBe('td1');
    expect(r.categorie).toBe('carte-identite');
    expect(r.identite.nom?.valeur).toBe('MARTIN');
    expect(r.identite.prenoms?.valeur).toEqual(['MAELYS', 'GAELLE', 'MARIE']);
    expect(r.identite.sexe?.valeur).toBe('F');
    expect(r.identite.dateNaissance?.valeur).toBe('1990-07-13');
    expect(r.identite.nationalite?.valeur).toBe('FRA');
    expect(r.identite.numeroDocument?.valeur).toBe('X4RTBPFW4');
    expect(r.identite.dateExpiration?.valeur).toBe('2030-02-11');
    expect(r.valide).toBe(true);
  });
});

describe('parseMrz TD2 (titre de séjour, carte officielle)', () => {
  it('extrait toutes les données du spécimen ICAO', () => {
    const r = parseMrz(TD2);
    expect(r.format).toBe('td2');
    expect(r.categorie).toBe('carte-identite');
    expect(r.paysEmetteur).toBe('UTO');
    expect(r.identite.nom?.valeur).toBe('ERIKSSON');
    expect(r.identite.prenoms?.valeur).toEqual(['ANNA', 'MARIA']);
    expect(r.identite.sexe?.valeur).toBe('F');
    expect(r.identite.dateNaissance?.valeur).toBe('1974-08-12');
    expect(r.identite.nationalite?.valeur).toBe('UTO');
    expect(r.identite.numeroDocument?.valeur).toBe('D23145890');
    expect(r.identite.dateExpiration?.valeur).toBe('2012-04-15');
    expect(r.valide).toBe(true);
  });
});

// MRZ TD2 fictive (checksums recalculés) dont le code document commence par
// « ID », comme l'ancienne CNI française : les deux formats partagent la forme
// 2×36, seuls les checksums peuvent les départager.
const TD2_AMBIGU = ['IDCHEMUSTER<<HANS<PETER<<<<<<<<<<<<<', 'S1234567<2CHE8501019M3001019<<<<<<<8'];

describe('parseMrz IDFRA (ancienne CNI)', () => {
  it('extrait toutes les données du spécimen', () => {
    const r = parseMrz(IDFRA);
    expect(r.format).toBe('idfra');
    expect(r.categorie).toBe('carte-identite');
    expect(r.identite.nom?.valeur).toBe('LOISEAU');
    expect(r.identite.prenoms?.valeur).toEqual(['HERVE', 'DJAMEL']);
    expect(r.identite.sexe?.valeur).toBe('M');
    expect(r.identite.dateNaissance?.valeur).toBe('1973-03-21');
    expect(r.identite.nationalite?.valeur).toBe('FRA');
    expect(r.identite.numeroDocument?.valeur).toBe('970675K00277');
    expect(r.identite.dateExpiration).toBeUndefined();
    expect(r.valide).toBe(true);
  });
});

// MRZ fictive au format TD1, construite pour ce test (checksums recalculés) :
// aucune carte réelle, suisse ou autre, n'est reproduite ici.
const TD1_CHE = [
  'IDCHES1234567<2<<<<<<<<<<<<<<<',
  '8501019M3001019CHE<<<<<<<<<<<8',
  'MUSTER<<HANS<PETER<<<<<<<<<<<<',
];

describe('parseMrz émetteur et catégorie', () => {
  it('lit le code document et le pays émetteur du TD1', () => {
    const r = parseMrz(TD1);
    expect(r.codeDocument).toBe('ID');
    expect(r.paysEmetteur).toBe('FRA');
    expect(r.categorie).toBe('carte-identite');
  });

  it("distingue l'État émetteur de la nationalité sur un TD1 non français", () => {
    const r = parseMrz(TD1_CHE);
    expect(r.paysEmetteur).toBe('CHE');
    expect(r.categorie).toBe('carte-identite');
    expect(r.identite.nom?.valeur).toBe('MUSTER');
    expect(r.identite.prenoms?.valeur).toEqual(['HANS', 'PETER']);
    expect(r.identite.nationalite?.valeur).toBe('CHE');
    expect(r.identite.numeroDocument?.valeur).toBe('S1234567');
    expect(r.valide).toBe(true);
  });

  it('classe un code document non normalisé en catégorie inconnue', () => {
    const [l1, l2, l3] = TD1 as [string, string, string];
    const r = parseMrz([`XX${l1.slice(2)}`, l2, l3]);
    expect(r.codeDocument).toBe('XX');
    expect(r.categorie).toBe('inconnu');
  });
});

describe('parseMrz arbitrage de la forme 2×36', () => {
  it('ne prend pas un TD2 commençant par « ID » pour une ancienne CNI', () => {
    const r = parseMrz(TD2_AMBIGU);
    expect(r.format).toBe('td2');
    expect(r.paysEmetteur).toBe('CHE');
    expect(r.identite.nom?.valeur).toBe('MUSTER');
    expect(r.identite.prenoms?.valeur).toEqual(['HANS', 'PETER']);
    // La nationalité était auparavant codée en dur à FRA par le parseur IDFRA.
    expect(r.identite.nationalite?.valeur).toBe('CHE');
    expect(r.valide).toBe(true);
  });

  it('conserve la lecture IDFRA pour une ancienne CNI', () => {
    expect(parseMrz(IDFRA).format).toBe('idfra');
  });

  it("n'annonce aucune validité sur une forme 2×36 illisible", () => {
    // Conformément au reste du parseur, une MRZ absurde ne jette pas : elle
    // ressort avec tous ses checksums en échec.
    const r = parseMrz(['1'.repeat(36), '2'.repeat(36)]);
    expect(r.valide).toBe(false);
    expect(Object.values(r.checksums).some(Boolean)).toBe(false);
  });
});

describe('parseMrz robustesse', () => {
  it("n'émet pas de date de naissance quand la zone n'est pas numérique", () => {
    // fenêtre OCR décalée : la zone date contient un chevron
    const l2 = '970675K002774HERVE<<DJAMEL<<7303216M';
    const r = parseMrz(['IDFRALOISEAU<<<<<<<<<<<<<<<<<<<<<<<<', l2]);
    expect(r.identite.dateNaissance).toBeUndefined();
    expect(r.checksums.dateNaissance).toBe(false);
  });

  it('normalise casse et espaces parasites', () => {
    const r = parseMrz([` ${TD3[0].toLowerCase()} `, TD3[1]]);
    expect(r.identite.nom?.valeur).toBe('ERIKSSON');
  });

  it('rejette un nombre de lignes inconnu', () => {
    expect(() => parseMrz(['ABC'])).toThrow(MrzParseError);
  });

  it('rejette des longueurs de lignes inconnues', () => {
    expect(() => parseMrz(['P<UTO', 'L898902C36'])).toThrow(MrzParseError);
  });
});
