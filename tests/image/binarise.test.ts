import { describe, expect, it } from 'vitest';
import { binariser } from '../../src/image/preprocess';

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
