import { describe, expect, it } from 'vitest';
import { resolveCommune } from '../../src/insee/index';

describe('resolveCommune', () => {
  it('résout une commune de métropole', () => {
    expect(resolveCommune('75056')).toEqual({
      codeInsee: '75056',
      nom: 'Paris',
      departement: '75',
    });
  });

  it('résout une commune corse (département 2A)', () => {
    expect(resolveCommune('2A004')).toEqual({
      codeInsee: '2A004',
      nom: 'Ajaccio',
      departement: '2A',
    });
  });

  it("résout une commune d'outre-mer (département à 3 chiffres)", () => {
    expect(resolveCommune('97105')).toEqual({
      codeInsee: '97105',
      nom: 'Basse-Terre',
      departement: '971',
    });
  });

  it('retourne undefined pour un code inconnu', () => {
    expect(resolveCommune('00000')).toBeUndefined();
  });

  it('retourne undefined pour un code mal formé', () => {
    expect(resolveCommune('paris')).toBeUndefined();
  });
});
