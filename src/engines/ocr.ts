import type { ModeOcr, OcrEngine } from './types';

export interface OcrOptions {
  /** Langues tesseract (défaut : `fra`). */
  langues?: string;
  /**
   * Chemins de self-hosting des assets tesseract.js. Par défaut, tesseract.js
   * télécharge worker/core/traineddata depuis un CDN public : pour un
   * déploiement 100 % auto-hébergé, servez ces fichiers vous-même.
   */
  langPath?: string;
  workerPath?: string;
  corePath?: string;
}

const CHARSET_MRZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

/** tesseract.js 7 n'accepte plus ImageData directement. */
function versCanvas(image: ImageData): OffscreenCanvas {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2d indisponible');
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Moteur OCR fondé sur tesseract.js (WASM, exécution locale au navigateur).
 * Le worker est créé au premier appel et réutilisé ensuite.
 */
export function creerOcrEngine(options: OcrOptions = {}): OcrEngine {
  let worker: import('tesseract.js').Worker | undefined;

  async function obtenirWorker(): Promise<import('tesseract.js').Worker> {
    if (worker) return worker;
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker(options.langues ?? 'fra', undefined, {
      ...(options.langPath ? { langPath: options.langPath } : {}),
      ...(options.workerPath ? { workerPath: options.workerPath } : {}),
      ...(options.corePath ? { corePath: options.corePath } : {}),
    });
    return worker;
  }

  return {
    async reconnaitre(image: ImageData, mode: ModeOcr): Promise<string> {
      const w = await obtenirWorker();
      await w.setParameters({
        tessedit_char_whitelist: mode === 'mrz' ? CHARSET_MRZ : '',
        preserve_interword_spaces: '1',
      });
      const resultat = await w.recognize(versCanvas(image));
      return resultat.data.text;
    },

    async liberer(): Promise<void> {
      if (!worker) return;
      await worker.terminate();
      worker = undefined;
    },
  };
}
