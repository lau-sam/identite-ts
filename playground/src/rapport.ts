import type { ExtractionResult } from 'identite-ts';
import { decrirePasses, type Passe } from './passes';
import { decrireReparation } from './reparation';

/**
 * Rapport de diagnostic destiné à être collé dans une issue ou envoyé à un tiers.
 *
 * Contrainte tenue par tout ce module : aucune donnée du porteur n'en sort. On ne
 * publie que des formes — compteurs, longueurs, présence de motifs — et un gabarit
 * du texte OCR où chaque lettre est réduite à `A` et chaque chiffre à `9`. Cela
 * suffit à juger si l'OCR a vu quelque chose, sans jamais dire quoi.
 */

/** Champs d'`Identite`, dans l'ordre où ils intéressent un diagnostic. */
const CHAMPS_IDENTITE = [
  'nom',
  'prenoms',
  'sexe',
  'dateNaissance',
  'lieuNaissance',
  'nationalite',
  'numeroDocument',
  'dateExpiration',
] as const;

/**
 * Réduit un texte à sa forme : lettres en `A`, chiffres en `9`, le reste conservé.
 * Un NIR devient `9 99 99 99 999 999 99`, un nom `AAAAAA` — la structure reste
 * lisible, la valeur disparaît. Les accents comptent comme des lettres.
 */
export function anonymiser(texte: string): string {
  return texte.replace(/\p{L}/gu, 'A').replace(/\d/g, '9');
}

/**
 * Orientation EXIF (tag 0x0112) d'un JPEG. Une photo prise en portrait au
 * téléphone arrive souvent en paysage avec une orientation 6 ou 8 : si le
 * décodeur ne l'applique pas, la MRZ n'est plus en bas et le rognage la manque.
 * Renvoie `undefined` si le fichier n'est pas un JPEG ou ne porte pas le tag.
 */
export async function lireOrientationExif(f: File): Promise<number | undefined> {
  const buffer = await f.slice(0, 128 * 1024).arrayBuffer();
  const vue = new DataView(buffer);
  if (vue.byteLength < 4 || vue.getUint16(0) !== 0xffd8) return undefined; // pas un JPEG

  let position = 2;
  while (position + 4 < vue.byteLength) {
    if (vue.getUint8(position) !== 0xff) break;
    const marqueur = vue.getUint8(position + 1);
    const taille = vue.getUint16(position + 2);
    if (marqueur === 0xe1) {
      // APP1 : « Exif\0\0 » puis en-tête TIFF
      const tiff = position + 10;
      if (tiff + 8 > vue.byteLength) return undefined;
      const petitBoutiste = vue.getUint16(tiff) === 0x4949;
      const offsetIfd = vue.getUint32(tiff + 4, petitBoutiste);
      const ifd = tiff + offsetIfd;
      if (ifd + 2 > vue.byteLength) return undefined;
      const nombreEntrees = vue.getUint16(ifd, petitBoutiste);
      for (let i = 0; i < nombreEntrees; i++) {
        const entree = ifd + 2 + i * 12;
        if (entree + 12 > vue.byteLength) return undefined;
        if (vue.getUint16(entree, petitBoutiste) === 0x0112) {
          return vue.getUint16(entree + 8, petitBoutiste);
        }
      }
      return undefined;
    }
    if (marqueur === 0xda) break; // début des données compressées
    position += 2 + taille;
  }
  return undefined;
}

/** Dimensions de l'image telle que le navigateur la décode. */
export async function lireDimensions(f: File): Promise<{ largeur: number; hauteur: number }> {
  const bitmap = await createImageBitmap(f);
  const dimensions = { largeur: bitmap.width, hauteur: bitmap.height };
  bitmap.close();
  return dimensions;
}

function pourcentage(part: number, total: number): string {
  return total === 0 ? '0 %' : `${Math.round((part / total) * 100)} %`;
}

/** Motifs dont la présence, seule, oriente le diagnostic. */
function motifs(texte: string): string[] {
  const trouves: string[] = [];
  if (/<</.test(texte)) trouves.push("chevrons MRZ '<<'");
  if (/[A-Z0-9<]{30}/.test(texte)) trouves.push('ligne de 30 caractères (TD1)');
  if (/[A-Z0-9<]{36}/.test(texte)) trouves.push('ligne de 36 caractères (TD2/IDFRA)');
  if (/[A-Z0-9<]{44}/.test(texte)) trouves.push('ligne de 44 caractères (TD3)');
  if (/\bDC\d{2}/.test(texte)) trouves.push("en-tête 2D-DOC 'DC'");
  if (/[12]\D{0,3}\d{2}\D{0,3}\d{2}/.test(texte)) trouves.push('début de NIR plausible');
  const suites = texte.match(/\d[\d\s.-]{11,20}\d/g) ?? [];
  if (suites.length > 0) trouves.push(`${suites.length} suite(s) de 13 à 20 chiffres`);
  return trouves;
}

export interface ContexteRapport {
  fichier: File;
  extraction: ExtractionResult;
  dureeMs: number;
  dimensions: { largeur: number; hauteur: number };
  orientationExif?: number;
  passes?: Passe[];
}

export function construireRapport(ctx: ContexteRapport): string {
  const { fichier, extraction, dureeMs, dimensions, orientationExif, passes } = ctx;
  const { raw } = extraction;
  const lignes: string[] = [];
  const ajouter = (s = '') => lignes.push(s);

  ajouter('=== RAPPORT DE DIAGNOSTIC identite-ts ===');
  ajouter("Aucune donnée du porteur n'apparaît ci-dessous : uniquement des formes.");
  ajouter();

  ajouter('--- Fichier ---');
  ajouter(`type MIME       : ${fichier.type || 'inconnu'}`);
  ajouter(`taille          : ${(fichier.size / 1024 / 1024).toFixed(2)} Mo`);
  ajouter(`dimensions      : ${dimensions.largeur} × ${dimensions.hauteur}`);
  ajouter(
    `orientation EXIF: ${orientationExif ?? 'absente'}${
      orientationExif && orientationExif > 1 ? '  ⚠ image pivotée par métadonnée' : ''
    }`,
  );
  ajouter();

  if (passes) {
    ajouter('--- Passes OCR (dans l’ordre) ---');
    ajouter(decrirePasses(passes));
    ajouter();
  }

  const codes = raw.codesBarres ?? [];
  ajouter('--- Étape 1 : codes 2D (zxing) ---');
  ajouter(`codes détectés  : ${codes.length}`);
  for (const [i, code] of codes.entries()) {
    ajouter(
      `  [${i}] format=${code.format} longueur=${code.texte.length} ` +
        `préfixe=${JSON.stringify(code.texte.slice(0, 4))} ` +
        `séparateurs GS/RS/US=${/[\x1d\x1e\x1f]/.test(code.texte) ? 'oui' : 'non'}`,
    );
  }
  ajouter();

  const mrz = raw.lignesMrz ?? [];
  ajouter('--- Étape 2 : MRZ (OCR) ---');
  ajouter(`lignes retenues : ${mrz.length}`);
  if (mrz.length > 0) {
    ajouter(`longueurs       : ${mrz.map((l) => l.length).join(', ')}`);
    ajouter('gabarit         :');
    for (const l of mrz) ajouter(`  ${anonymiser(l)}`);
    ajouter('réparabilité    :');
    ajouter(decrireReparation(mrz));
  }
  ajouter();

  ajouter('--- Étape 3 : NIR ---');
  ajouter(`NIR détecté     : ${raw.nir ? `oui (${raw.nir.replace(/[\s.-]/g, '').length} car.)` : 'non'}`);
  ajouter();

  const texte = raw.texteOcr ?? '';
  const lignesOcr = texte.split('\n').filter((l) => l.trim().length > 0);
  const chiffres = (texte.match(/\d/g) ?? []).length;
  ajouter('--- Texte OCR brut ---');
  ajouter(`longueur        : ${texte.length} caractères`);
  ajouter(`lignes non vides: ${lignesOcr.length}`);
  ajouter(`part de chiffres: ${pourcentage(chiffres, texte.length)}`);
  const reperes = motifs(texte);
  ajouter(`motifs          : ${reperes.length > 0 ? reperes.join(' · ') : 'aucun'}`);
  ajouter();
  ajouter('Gabarit du texte reconnu (A = lettre, 9 = chiffre) — 40 premières lignes :');
  if (lignesOcr.length === 0) {
    ajouter('  (vide — l’OCR n’a rien reconnu)');
  } else {
    for (const l of lignesOcr.slice(0, 40)) ajouter(`  ${anonymiser(l.trimEnd())}`);
    if (lignesOcr.length > 40) ajouter(`  … ${lignesOcr.length - 40} ligne(s) de plus`);
  }
  ajouter();

  ajouter('--- Résultat ---');
  ajouter(`document        : ${extraction.document}`);
  ajouter(`pays émetteur   : ${extraction.paysEmetteur ?? '—'}`);
  ajouter(`source          : ${extraction.source ?? 'aucune'}`);
  ajouter(`confiance       : ${(extraction.confidence * 100).toFixed(0)} %`);
  const remplis = CHAMPS_IDENTITE.filter((c) => extraction.data?.[c] !== undefined);
  ajouter(`champs remplis  : ${remplis.length > 0 ? remplis.join(', ') : 'aucun'}`);
  const checksums = CHAMPS_IDENTITE.map((c) => {
    const champ = extraction.data?.[c];
    return champ && champ.checksumValide !== undefined ? `${c}=${champ.checksumValide}` : undefined;
  }).filter(Boolean);
  ajouter(`checksums       : ${checksums.length > 0 ? checksums.join(', ') : '—'}`);
  ajouter(`durée totale    : ${(dureeMs / 1000).toFixed(1)} s`);

  return lignes.join('\n');
}
