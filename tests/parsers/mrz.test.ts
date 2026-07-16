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

// Spécimen d'ancienne CNI (format IDFRA 2×36)
const IDFRA = ['IDFRALOISEAU<<<<<<<<<<<<<<<<<<<<<<<<', '970675K002774HERVE<<DJAMEL<7303216M4'];

describe('parseMrz TD3 (passeport)', () => {
  it('extrait toutes les données du spécimen ICAO', () => {
    const r = parseMrz(TD3);
    expect(r.format).toBe('td3');
    expect(r.document).toBe('passeport');
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
    expect(r.document).toBe('cni-2021');
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

describe('parseMrz IDFRA (ancienne CNI)', () => {
  it('extrait toutes les données du spécimen', () => {
    const r = parseMrz(IDFRA);
    expect(r.format).toBe('idfra');
    expect(r.document).toBe('cni');
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
