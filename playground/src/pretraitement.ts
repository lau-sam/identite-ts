import {
  binariser,
  binariserAdaptatif,
  niveauxDeGris,
  preparerImage,
} from '../../src/image/preprocess';

/**
 * Reproduit, pour l'œil, les images que reçoit le moteur OCR.
 *
 * C'est l'observation qui tranche un diagnostic de lecture : si le numéro est illisible
 * sur la vignette binarisée, le prétraitement est en cause ; s'il y est net et que
 * l'extraction échoue quand même, ce sont l'OCR ou la détection de motif.
 *
 * Ces vignettes montrent le document réel : elles restent locales, on ne les partage pas.
 */

function copie(image: ImageData): ImageData {
  const data = new Uint8ClampedArray(image.data);
  return new ImageData(data, image.width, image.height);
}

function versCanvas(image: ImageData, largeurMax = 520): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const echelle = Math.min(1, largeurMax / image.width);
  canvas.width = Math.round(image.width * echelle);
  canvas.height = Math.round(image.height * echelle);

  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  source.getContext('2d')?.putImageData(image, 0, 0);

  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export interface Vignette {
  legende: string;
  canvas: HTMLCanvasElement;
}

/** Les deux formes sous lesquelles l'image est soumise à l'OCR, plus l'image préparée. */
export async function pretraitements(f: File): Promise<Vignette[]> {
  const preparee = await preparerImage(f);

  const gris = copie(preparee);
  niveauxDeGris(gris);

  const parOtsu = copie(preparee);
  niveauxDeGris(parOtsu);
  binariser(parOtsu);

  const parSauvola = copie(preparee);
  niveauxDeGris(parSauvola);
  binariserAdaptatif(parSauvola);

  return [
    {
      legende: `préparée — ${preparee.width} × ${preparee.height} (passe 1 : couleur)`,
      canvas: versCanvas(preparee),
    },
    { legende: 'niveaux de gris', canvas: versCanvas(gris) },
    { legende: 'seuil global Otsu — MRZ', canvas: versCanvas(parOtsu) },
    {
      legende: 'seuil adaptatif Sauvola — NIR (passe 2)',
      canvas: versCanvas(parSauvola),
    },
  ];
}
