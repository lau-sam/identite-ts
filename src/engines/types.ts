/**
 * Interfaces des moteurs de reconnaissance. `extractDocument` en reçoit des
 * implémentations injectables : les moteurs réels (tesseract.js, zxing-wasm)
 * sont chargés paresseusement, et les tests fournissent des doublures.
 */

export type ModeOcr = 'mrz' | 'texte';

export interface OcrEngine {
  /**
   * Reconnaît le texte d'une image.
   * Le mode `mrz` restreint le jeu de caractères à `A-Z 0-9 <`.
   */
  reconnaitre(image: ImageData, mode: ModeOcr): Promise<string>;
  /** Libère les ressources (worker, WASM). */
  liberer(): Promise<void>;
}

export interface DatamatrixEngine {
  /** Décode les codes-barres 2D de l'image et renvoie leurs contenus texte. */
  decoder(image: ImageData): Promise<string[]>;
}
