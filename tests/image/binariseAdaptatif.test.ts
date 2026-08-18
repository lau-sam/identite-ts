import { describe, expect, it } from 'vitest';
import { binariser, binariserAdaptatif, type ImageDataLike } from '../../src/image/preprocess';

const LARGEUR = 120;
const HAUTEUR = 40;

/**
 * Document au fond très inégal : un dégradé de 30 (sombre à gauche) à 230 (clair à
 * droite), sur lequel court une bande d'« encre » toujours 60 niveaux sous son fond
 * immédiat. C'est la situation d'une carte à fond coloré : l'encre tranche partout
 * localement, mais aucune valeur de seuil unique ne la sépare du fond sur toute la
 * largeur — celle de l'encre à droite (170) dépasse celle du fond à gauche (30).
 */
function documentAFondInegal(): ImageDataLike {
  const data = new Uint8ClampedArray(LARGEUR * HAUTEUR * 4);
  for (let y = 0; y < HAUTEUR; y++) {
    for (let x = 0; x < LARGEUR; x++) {
      const fond = Math.round(30 + (200 * x) / (LARGEUR - 1));
      // Bande d'encre sur les lignes 18 à 21.
      const encre = y >= 18 && y <= 21;
      const v = encre ? fond - 60 : fond;
      data.set([v, v, v, 255], (y * LARGEUR + x) * 4);
    }
  }
  return { width: LARGEUR, height: HAUTEUR, data };
}

/** Valeur du canal rouge (= luminance après binarisation) au pixel donné. */
function valeur(image: ImageDataLike, x: number, y: number): number {
  return image.data[(y * LARGEUR + x) * 4] as number;
}

/** L'encre doit être noire (0) et le fond qui l'entoure blanc (255), à cette abscisse. */
function encreDetachee(image: ImageDataLike, x: number): boolean {
  return valeur(image, x, 19) === 0 && valeur(image, x, 5) === 255;
}

describe('binariserAdaptatif', () => {
  it("détache l'encre du fond aux deux extrémités du dégradé", () => {
    const image = documentAFondInegal();
    binariserAdaptatif(image);
    expect(encreDetachee(image, 12)).toBe(true);
    expect(encreDetachee(image, LARGEUR - 12)).toBe(true);
  });

  it("réussit là où le seuillage global d'Otsu échoue", () => {
    // Sur la même image, Otsu ne peut pas détacher l'encre des deux côtés à la fois :
    // c'est la raison d'être de cette fonction, et ce test le fige.
    const parOtsu = documentAFondInegal();
    binariser(parOtsu);
    const otsuReussitPartout = encreDetachee(parOtsu, 12) && encreDetachee(parOtsu, LARGEUR - 12);
    expect(otsuReussitPartout).toBe(false);
  });

  it('ne produit que du noir et du blanc, alpha préservé', () => {
    const image = documentAFondInegal();
    binariserAdaptatif(image);
    for (let i = 0; i < image.data.length; i += 4) {
      expect([0, 255]).toContain(image.data[i]);
      expect(image.data[i + 1]).toBe(image.data[i]);
      expect(image.data[i + 2]).toBe(image.data[i]);
      expect(image.data[i + 3]).toBe(255);
    }
  });

  it('laisse une image uniforme en blanc plutôt que d’inventer du texte', () => {
    // Sans écart local, il n'y a rien à lire : le bruit de fond ne doit pas devenir
    // de l'encre, sinon l'OCR reçoit une image pleine de faux caractères.
    const data = new Uint8ClampedArray(LARGEUR * HAUTEUR * 4);
    for (let i = 0; i < LARGEUR * HAUTEUR; i++) data.set([180, 180, 180, 255], i * 4);
    const image: ImageDataLike = { width: LARGEUR, height: HAUTEUR, data };
    binariserAdaptatif(image);
    for (let i = 0; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
  });
});
