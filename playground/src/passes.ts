import type { ModeOcr, OcrEngine } from 'identite-ts';
import { detecterMrz, detecterNir } from 'identite-ts';

/**
 * Trace des passes OCR.
 *
 * `extractDocument` enchaîne plusieurs passes — image brute, seuil global, seuil
 * adaptatif — et ne rend que le résultat final : impossible de savoir, depuis le
 * dehors, laquelle a abouti. Or c'est justement ce qu'un diagnostic doit dire, sinon
 * on ne sait pas si un prétraitement sert à quelque chose.
 *
 * On enveloppe donc le moteur réel pour observer chaque appel. Rien n'est modifié :
 * l'image et le texte transitent inchangés, on n'en retient que des mesures.
 */

export interface Passe {
  numero: number;
  mode: ModeOcr;
  binarisee: boolean;
  dimensions: string;
  caracteres: number;
  aTrouve: 'mrz' | 'nir' | null;
}

/** Une image est tenue pour binarisée si sa luminance ne prend que les valeurs 0 et 255. */
function estBinarisee(image: ImageData): boolean {
  for (let i = 0; i < image.data.length; i += 4) {
    const v = image.data[i];
    if (v !== 0 && v !== 255) return false;
  }
  return true;
}

export function observer(reel: OcrEngine, passes: Passe[]): OcrEngine {
  return {
    async reconnaitre(image: ImageData, mode: ModeOcr): Promise<string> {
      const texte = await reel.reconnaitre(image, mode);
      passes.push({
        numero: passes.length + 1,
        mode,
        binarisee: estBinarisee(image),
        dimensions: `${image.width}×${image.height}`,
        caracteres: texte.length,
        aTrouve: detecterMrz(texte) ? 'mrz' : detecterNir(texte) ? 'nir' : null,
      });
      return texte;
    },
    liberer: () => reel.liberer(),
  };
}

export function decrirePasses(passes: Passe[]): string {
  if (passes.length === 0) return '  (aucune passe OCR — le code 2D a suffi)';
  return passes
    .map(
      (p) =>
        `  [${p.numero}] mode=${p.mode} image=${p.dimensions} ` +
        `${p.binarisee ? 'binarisée' : 'brute    '} ` +
        `texte=${String(p.caracteres).padStart(6)} car. ` +
        `trouvé=${p.aTrouve ?? '—'}`,
    )
    .join('\n');
}
