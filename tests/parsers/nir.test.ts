import { describe, expect, it } from 'vitest';
import { NirParseError, parseNir } from '../../src/parsers/nir';

describe('parseNir métropole', () => {
  // Exemple canonique (Wikipédia) : femme née en mai 1969 à Baugé (49588)
  it('extrait sexe, date et lieu de naissance', () => {
    const r = parseNir('269054958815780');
    expect(r.sexe).toBe('F');
    expect(r.naissance.anneeProbable).toBe(1969);
    expect(r.naissance.mois).toBe(5);
    expect(r.lieuNaissance.type).toBe('metropole');
    expect(r.lieuNaissance.codeInsee).toBe('49588');
    expect(r.lieuNaissance.departement).toBe('49');
    expect(r.ordre).toBe('157');
    expect(r.cle).toBe('80');
    expect(r.cleValide).toBe(true);
  });

  it('normalise espaces et points', () => {
    const r = parseNir('2 69.05 49 588 157 80');
    expect(r.nir).toBe('2690549588157');
    expect(r.cleValide).toBe(true);
  });

  it('détecte une clé invalide', () => {
    const r = parseNir('269054958815781');
    expect(r.cleValide).toBe(false);
  });

  it('accepte un NIR sans clé', () => {
    const r = parseNir('2690549588157');
    expect(r.cle).toBeUndefined();
    expect(r.cleValide).toBeUndefined();
    expect(r.sexe).toBe('F');
  });

  it('laisse le mois indéterminé pour les pseudo-mois (>12)', () => {
    const r = parseNir('269204958815729');
    expect(r.naissance.mois).toBeUndefined();
    expect(r.cleValide).toBe(true);
  });
});

describe('parseNir Corse', () => {
  it('valide la clé en substituant 2A→19', () => {
    const r = parseNir('194102A00402386');
    expect(r.cleValide).toBe(true);
    expect(r.lieuNaissance.codeInsee).toBe('2A004');
    expect(r.lieuNaissance.departement).toBe('2A');
    expect(r.sexe).toBe('M');
  });
});

describe('parseNir outre-mer', () => {
  it('lit un département à 3 chiffres', () => {
    const r = parseNir('185039710612396');
    expect(r.lieuNaissance.type).toBe('dom');
    expect(r.lieuNaissance.codeInsee).toBe('97106');
    expect(r.lieuNaissance.departement).toBe('971');
    expect(r.cleValide).toBe(true);
  });
});

describe('parseNir naissance à l’étranger', () => {
  it('expose le code pays INSEE', () => {
    const r = parseNir('276049935045671');
    expect(r.lieuNaissance.type).toBe('etranger');
    expect(r.lieuNaissance.paysEtranger).toBe(true);
    expect(r.lieuNaissance.codePaysInsee).toBe('350');
    expect(r.lieuNaissance.codeInsee).toBeUndefined();
    expect(r.cleValide).toBe(true);
  });
});

describe('parseNir erreurs', () => {
  it('rejette une longueur invalide', () => {
    expect(() => parseNir('12345')).toThrow(NirParseError);
  });

  it('rejette un premier chiffre de sexe inconnu', () => {
    expect(() => parseNir('069054958815780')).toThrow(NirParseError);
  });
});
