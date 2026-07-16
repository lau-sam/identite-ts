import { describe, expect, it } from 'vitest';
import { etirerContraste, niveauxDeGris } from '../../src/image/preprocess';

function pixels(valeurs: number[][]): { width: number; height: number; data: Uint8ClampedArray } {
  // valeurs = liste de pixels [r, g, b, a]
  return {
    width: valeurs.length,
    height: 1,
    data: new Uint8ClampedArray(valeurs.flat()),
  };
}

describe('niveauxDeGris', () => {
  it('convertit en luminance (Rec. 601) sur les trois canaux', () => {
    const img = pixels([[255, 0, 0, 255]]);
    niveauxDeGris(img);
    // 0.299*255 ≈ 76
    expect(img.data[0]).toBe(76);
    expect(img.data[1]).toBe(76);
    expect(img.data[2]).toBe(76);
    expect(img.data[3]).toBe(255); // alpha intact
  });

  it('laisse un gris inchangé', () => {
    const img = pixels([[128, 128, 128, 255]]);
    niveauxDeGris(img);
    expect(img.data[0]).toBe(128);
  });
});

describe('etirerContraste', () => {
  it('étale la dynamique sur 0-255', () => {
    const img = pixels([
      [100, 100, 100, 255],
      [150, 150, 150, 255],
      [200, 200, 200, 255],
    ]);
    etirerContraste(img);
    expect(img.data[0]).toBe(0); // min → 0
    expect(img.data[4]).toBe(127); // milieu → 127,499… en flottant, arrondi à 127
    expect(img.data[8]).toBe(255); // max → 255
  });

  it('ne divise pas par zéro sur une image uniforme', () => {
    const img = pixels([
      [90, 90, 90, 255],
      [90, 90, 90, 255],
    ]);
    etirerContraste(img);
    expect(img.data[0]).toBe(90);
  });
});
