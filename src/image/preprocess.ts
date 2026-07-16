/** Entrées d'image acceptées par extractDocument. */
export type ImageInput = File | Blob | HTMLImageElement | ImageData;

/** Sous-ensemble d'ImageData manipulable hors navigateur (tests, workers). */
export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Largeur maximale envoyée aux moteurs OCR/Datamatrix. */
const LARGEUR_MAX = 1600;

/**
 * Convertit une entrée quelconque en ImageData redimensionnée, en niveaux de
 * gris et au contraste étiré — le format attendu par les engines.
 * Nécessite un environnement navigateur (OffscreenCanvas + createImageBitmap).
 */
export async function preparerImage(input: ImageInput): Promise<ImageData> {
  const imageData = await versImageData(input);
  niveauxDeGris(imageData);
  etirerContraste(imageData);
  return imageData;
}

async function versImageData(input: ImageInput): Promise<ImageData> {
  if (estImageData(input)) {
    return redimensionner(await createImageBitmap(input));
  }
  const bitmap = await createImageBitmap(input);
  return redimensionner(bitmap);
}

function estImageData(input: ImageInput): input is ImageData {
  return typeof ImageData !== 'undefined' && input instanceof ImageData;
}

function redimensionner(bitmap: ImageBitmap): ImageData {
  const echelle = Math.min(1, LARGEUR_MAX / bitmap.width);
  const largeur = Math.round(bitmap.width * echelle);
  const hauteur = Math.round(bitmap.height * echelle);
  const canvas = new OffscreenCanvas(largeur, hauteur);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2d indisponible');
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close();
  return ctx.getImageData(0, 0, largeur, hauteur);
}

/** Convertit en place vers la luminance Rec. 601 (alpha préservé). */
export function niveauxDeGris(image: ImageDataLike): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(
      0.299 * (d[i] as number) + 0.587 * (d[i + 1] as number) + 0.114 * (d[i + 2] as number),
    );
    d[i] = y;
    d[i + 1] = y;
    d[i + 2] = y;
  }
}

/**
 * Retourne une nouvelle image réduite à la fraction basse de l'originale
 * (la zone MRZ est toujours en bas des documents). Au moins une ligne.
 */
export function rognerBas(image: ImageDataLike, fraction: number): ImageDataLike {
  const hauteur = Math.max(1, Math.round(image.height * fraction));
  const debut = (image.height - hauteur) * image.width * 4;
  return {
    width: image.width,
    height: hauteur,
    data: image.data.slice(debut),
  };
}

/**
 * Binarise en place par seuillage d'Otsu (alpha préservé). Élimine les fonds
 * guillochés / micro-textes des documents sécurisés, décisif pour l'OCR de
 * la zone MRZ. À appliquer après conversion en niveaux de gris.
 */
export function binariser(image: ImageDataLike): void {
  const d = image.data;
  const histogramme = new Array<number>(256).fill(0);
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    histogramme[d[i] as number] = (histogramme[d[i] as number] as number) + 1;
    total++;
  }

  // Seuil d'Otsu : maximise la variance inter-classes.
  let sommeTotale = 0;
  for (let v = 0; v < 256; v++) sommeTotale += v * (histogramme[v] as number);
  let sommeFond = 0;
  let poidsFond = 0;
  let varianceMax = -1;
  let seuil = 127;
  for (let v = 0; v < 256; v++) {
    poidsFond += histogramme[v] as number;
    if (poidsFond === 0) continue;
    const poidsEncre = total - poidsFond;
    if (poidsEncre === 0) break;
    sommeFond += v * (histogramme[v] as number);
    const moyenneFond = sommeFond / poidsFond;
    const moyenneEncre = (sommeTotale - sommeFond) / poidsEncre;
    const variance = poidsFond * poidsEncre * (moyenneFond - moyenneEncre) ** 2;
    if (variance > varianceMax) {
      varianceMax = variance;
      seuil = v;
    }
  }

  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] as number) > seuil ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
}

/** Étire en place la dynamique de luminance sur [0, 255] (alpha préservé). */
export function etirerContraste(image: ImageDataLike): void {
  const d = image.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max <= min) return;
  const facteur = 255 / (max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(((d[i] as number) - min) * facteur);
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
}
