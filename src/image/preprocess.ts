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
 * Convertit une entrée quelconque en ImageData redimensionnée, en couleur.
 * Chaque passe d'extraction applique ensuite son propre traitement (la
 * binarisation pour la MRZ) : dégrader l'image globalement pénalise l'OCR
 * généraliste, meilleur sur l'originale (validé sur carte Vitale).
 * Nécessite un environnement navigateur (OffscreenCanvas + createImageBitmap).
 */
export async function preparerImage(input: ImageInput): Promise<ImageData> {
  return versImageData(input);
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

export interface OptionsSauvola {
  /** Côté de la fenêtre d'analyse, en pixels. Défaut : un seizième du petit côté, au moins 15. */
  fenetre?: number;
  /**
   * Sensibilité. Plus `k` est grand, plus il faut trancher pour être compté comme encre.
   * Défaut 0,2, la valeur recommandée par Sauvola & Pietikäinen pour les documents : au-delà,
   * une encre à 60 niveaux sous son fond passe déjà au travers dans les zones claires.
   */
  k?: number;
}

/**
 * Binarise en place par seuillage adaptatif de Sauvola (alpha préservé).
 *
 * Otsu cherche **un** seuil pour toute l'image : il suppose un fond uniforme. Cette
 * hypothèse tombe sur une carte à fond coloré parcouru d'une trame de sécurité — la
 * carte Vitale au premier chef : le seuil global range la trame et le texte du même
 * côté, et le numéro disparaît dans une masse noire.
 *
 * Sauvola compare chaque pixel à son seul voisinage :
 *
 *     t(x, y) = m(x, y) · (1 + k · (s(x, y) / R − 1))
 *
 * où `m` et `s` sont moyenne et écart-type locaux et `R` = 128 la dynamique maximale
 * de `s`. Là où le voisinage est plat (fond nu, trame régulière), `s` est faible, le
 * seuil descend loin sous la moyenne et rien n'est retenu : le fond reste blanc. Là où
 * un caractère tranche, `s` monte et le seuil remonte vers la moyenne : l'encre passe.
 *
 * Moyennes et variances viennent d'images intégrales, donc en temps constant par pixel
 * quelle que soit la fenêtre. À appliquer après conversion en niveaux de gris.
 */
export function binariserAdaptatif(image: ImageDataLike, options: OptionsSauvola = {}): void {
  const { width: largeur, height: hauteur, data: d } = image;
  const k = options.k ?? 0.2;
  const fenetre = Math.max(
    3,
    options.fenetre ?? Math.max(15, Math.round(Math.min(largeur, hauteur) / 16)),
  );
  const rayon = Math.floor(fenetre / 2);

  // Images intégrales (une ligne et une colonne de marge, pour éviter les tests de bord).
  // Les sommes de carrés dépassent la capacité d'un entier 32 bits sur une grande image :
  // 255² × 1600 × 1200 ≈ 1,2·10¹¹. D'où Float64Array, exact jusqu'à 2⁵³.
  const pas = largeur + 1;
  const somme = new Float64Array(pas * (hauteur + 1));
  const sommeCarres = new Float64Array(pas * (hauteur + 1));
  for (let y = 0; y < hauteur; y++) {
    let ligne = 0;
    let ligneCarres = 0;
    for (let x = 0; x < largeur; x++) {
      const v = d[(y * largeur + x) * 4] as number;
      ligne += v;
      ligneCarres += v * v;
      const i = (y + 1) * pas + (x + 1);
      somme[i] = (somme[i - pas] as number) + ligne;
      sommeCarres[i] = (sommeCarres[i - pas] as number) + ligneCarres;
    }
  }

  const R = 128;
  for (let y = 0; y < hauteur; y++) {
    const y0 = Math.max(0, y - rayon);
    const y1 = Math.min(hauteur - 1, y + rayon);
    for (let x = 0; x < largeur; x++) {
      const x0 = Math.max(0, x - rayon);
      const x1 = Math.min(largeur - 1, x + rayon);
      const nombre = (x1 - x0 + 1) * (y1 - y0 + 1);

      const hautGauche = y0 * pas + x0;
      const hautDroit = y0 * pas + (x1 + 1);
      const basGauche = (y1 + 1) * pas + x0;
      const basDroit = (y1 + 1) * pas + (x1 + 1);

      const total =
        (somme[basDroit] as number) -
        (somme[hautDroit] as number) -
        (somme[basGauche] as number) +
        (somme[hautGauche] as number);
      const totalCarres =
        (sommeCarres[basDroit] as number) -
        (sommeCarres[hautDroit] as number) -
        (sommeCarres[basGauche] as number) +
        (sommeCarres[hautGauche] as number);

      const moyenne = total / nombre;
      // Négatif possible par arrondi flottant quand la variance est nulle.
      const ecartType = Math.sqrt(Math.max(0, totalCarres / nombre - moyenne * moyenne));
      const seuil = moyenne * (1 + k * (ecartType / R - 1));

      const i = (y * largeur + x) * 4;
      const v = (d[i] as number) > seuil ? 255 : 0;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
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
