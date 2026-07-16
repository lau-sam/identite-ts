import { describe, expect, it } from 'vitest';
import { binariser, rognerBas } from '../../src/image/preprocess';

function image(niveaux: number[]): { width: number; height: number; data: Uint8ClampedArray } {
  return {
    width: niveaux.length,
    height: 1,
    data: new Uint8ClampedArray(niveaux.flatMap((v) => [v, v, v, 255])),
  };
}

describe('binariser', () => {
  it('sépare une distribution bimodale en noir et blanc', () => {
    // fond clair (200-220) et encre sombre (30-50) : seuil d'Otsu entre les deux
    const img = image([200, 210, 220, 30, 40, 50, 215, 35]);
    binariser(img);
    const valeurs = [...Array(8)].map((_, i) => img.data[i * 4]);
    expect(valeurs).toEqual([255, 255, 255, 0, 0, 0, 255, 0]);
  });

  it('préserve alpha et laisse une image uniforme intacte en pratique', () => {
    const img = image([128, 128, 128]);
    binariser(img);
    expect(img.data[3]).toBe(255);
    // uniforme : tout bascule du même côté, pas de mélange
    const valeurs = [img.data[0], img.data[4], img.data[8]];
    expect(new Set(valeurs).size).toBe(1);
  });
});

describe('rognerBas', () => {
  it('conserve la fraction basse des lignes', () => {
    const img = {
      width: 2,
      height: 4,
      data: new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80].flatMap((v) => [v, v, v, 255])),
    };
    const bas = rognerBas(img, 0.5);
    expect(bas.height).toBe(2);
    expect(bas.width).toBe(2);
    expect([...bas.data].filter((_, i) => i % 4 === 0)).toEqual([50, 60, 70, 80]);
  });

  it('arrondit et garde au moins une ligne', () => {
    const img = { width: 1, height: 3, data: new Uint8ClampedArray(12) };
    expect(rognerBas(img, 0.1).height).toBe(1);
  });
});
