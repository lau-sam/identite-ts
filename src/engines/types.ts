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

/** Symbole 2D lu sur l'image, avec son contenu tel quel. */
export interface CodeBarre {
  /** Format du symbole, tel que nommé par zxing (`DataMatrix`, `QRCode`…). */
  format: string;
  /**
   * Contenu brut. Seul le 2D-DOC est interprété par la bibliothèque ; les
   * autres charges utiles sont exposées sans être comprises.
   */
  texte: string;
}

export interface DatamatrixEngine {
  /** Décode les codes-barres 2D de l'image (Datamatrix et QR). */
  decoder(image: ImageData): Promise<CodeBarre[]>;
}
