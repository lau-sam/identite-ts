import type { DatamatrixEngine } from './types';

export interface DatamatrixOptions {
  /**
   * URL de base pour auto-héberger le module WASM de zxing-wasm.
   * Par défaut, le binaire est chargé depuis le CDN jsDelivr.
   */
  wasmBaseUrl?: string;
}

/**
 * Moteur de décodage Datamatrix/QR fondé sur zxing-wasm (exécution locale).
 * `textMode: 'Plain'` préserve les caractères de contrôle (GS/RS/US)
 * indispensables au découpage des champs 2D-DOC.
 */
export function creerDatamatrixEngine(options: DatamatrixOptions = {}): DatamatrixEngine {
  return {
    async decoder(image: ImageData): Promise<string[]> {
      const zxing = await import('zxing-wasm/reader');
      if (options.wasmBaseUrl) {
        const base = options.wasmBaseUrl.replace(/\/$/, '');
        zxing.prepareZXingModule({
          overrides: { locateFile: (fichier: string) => `${base}/${fichier}` },
        });
      }
      const resultats = await zxing.readBarcodes(image, {
        formats: ['DataMatrix', 'QRCode'],
        tryHarder: true,
        textMode: 'Plain',
      });
      return resultats.filter((r) => r.isValid).map((r) => r.text);
    },
  };
}
