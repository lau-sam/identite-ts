import type { DatamatrixOptions } from './engines/datamatrix';
import type { OcrOptions } from './engines/ocr';
import type { DatamatrixEngine, OcrEngine } from './engines/types';
import type { ImageInput } from './image/preprocess';
import type { Champ, Identite } from './models/index';
import { parseMrz } from './parsers/mrz';
import { parseNir } from './parsers/nir';
import { parse2ddoc } from './parsers/twoddoc';

export type TypeDocument = 'cni' | 'cni-2021' | 'passeport' | 'carte-vitale' | 'unknown';

export interface RawExtraction {
  payloadsDatamatrix?: string[];
  lignesMrz?: string[];
  texteOcr?: string;
  nir?: string;
}

export interface ExtractionResult {
  document: TypeDocument;
  data: Identite | null;
  /** 0 à 1, fondé sur les checksums et la nature de la source. */
  confidence: number;
  source: 'mrz' | '2ddoc' | 'nir' | null;
  raw: RawExtraction;
}

export interface ExtractOptions {
  /** Options du moteur OCR réel (tesseract.js). */
  ocr?: OcrOptions;
  /** Options du moteur Datamatrix réel (zxing-wasm). */
  datamatrix?: DatamatrixOptions;
  /**
   * Moteurs injectés. Un moteur fourni ici appartient à l'appelant
   * (jamais libéré par extractDocument) ; utile pour réutiliser un worker
   * OCR entre plusieurs captures, ou pour les tests.
   */
  engines?: { ocr?: OcrEngine; datamatrix?: DatamatrixEngine };
  /** Résout la commune de naissance d'un NIR via le référentiel INSEE (défaut : oui). */
  resoudreCommune?: boolean;
  /** Remplace le prétraitement image par défaut (tests, pipeline custom). */
  preparer?: (input: ImageInput) => Promise<ImageData>;
}

/**
 * Extrait les données d'identité d'une photo de document français.
 * Pipeline : Datamatrix 2D-DOC (rapide, signé) → MRZ (checksums) → NIR.
 *
 * Un document illisible ne jette jamais : résultat `unknown` avec `raw`
 * rempli pour diagnostic. Les moteurs lourds sont chargés paresseusement.
 */
export async function extractDocument(
  input: ImageInput,
  options: ExtractOptions = {},
): Promise<ExtractionResult> {
  const preparer = options.preparer ?? (await import('./image/preprocess')).preparerImage;
  const image = await preparer(input);
  const raw: RawExtraction = {};

  const parDatamatrix = await tenterDatamatrix(image, options, raw);
  if (parDatamatrix) return parDatamatrix;

  const ocrInjecte = options.engines?.ocr;
  const ocr = ocrInjecte ?? (await import('./engines/ocr')).creerOcrEngine(options.ocr);
  try {
    const parMrz = await tenterMrz(image, ocr, raw);
    if (parMrz) return parMrz;

    const parNir = await tenterNir(image, ocr, options, raw);
    if (parNir) return parNir;
  } finally {
    if (!ocrInjecte) await ocr.liberer();
  }

  return { document: 'unknown', data: null, confidence: 0, source: null, raw };
}

async function tenterDatamatrix(
  image: ImageData,
  options: ExtractOptions,
  raw: RawExtraction,
): Promise<ExtractionResult | undefined> {
  const engine =
    options.engines?.datamatrix ??
    (await import('./engines/datamatrix')).creerDatamatrixEngine(options.datamatrix);
  let payloads: string[];
  try {
    payloads = await engine.decoder(image);
  } catch {
    return undefined; // moteur indisponible : on continue avec l'OCR
  }
  if (payloads.length) raw.payloadsDatamatrix = payloads;

  for (const payload of payloads) {
    if (!payload.startsWith('DC')) continue;
    try {
      const doc = parse2ddoc(payload);
      const identite = doc.identite;
      if (!identite.nom && !identite.dateNaissance) continue;
      return {
        // Seul document d'identité porteur d'un 2D-DOC à ce jour : la CNI 2021.
        document: 'cni-2021',
        data: identite,
        confidence: 0.9,
        source: '2ddoc',
        raw,
      };
    } catch {
      // payload DC… mais malformé : on tente les sources suivantes
    }
  }
  return undefined;
}

async function tenterMrz(
  image: ImageData,
  ocr: OcrEngine,
  raw: RawExtraction,
): Promise<ExtractionResult | undefined> {
  // La binarisation élimine les fonds guillochés des documents sécurisés,
  // sans quoi l'OCR de la MRZ échoue (validé sur le spécimen CNI 2021).
  const texte = await ocr.reconnaitre(await copieBinarisee(image), 'mrz');
  raw.texteOcr = texte;
  const lignes = detecterMrz(texte);
  if (!lignes) return undefined;
  raw.lignesMrz = lignes;

  try {
    const mrz = parseMrz(lignes);
    const controles = Object.values(mrz.checksums);
    const valides = controles.filter(Boolean).length;
    return {
      document: mrz.document,
      data: mrz.identite,
      confidence: mrz.valide ? 0.95 : 0.7 * (valides / controles.length),
      source: 'mrz',
      raw,
    };
  } catch {
    return undefined;
  }
}

async function tenterNir(
  image: ImageData,
  ocr: OcrEngine,
  options: ExtractOptions,
  raw: RawExtraction,
): Promise<ExtractionResult | undefined> {
  const texte = await ocr.reconnaitre(image, 'texte');
  raw.texteOcr = [raw.texteOcr, texte].filter(Boolean).join('\n');
  const candidat = detecterNir(texte);
  if (!candidat) return undefined;

  try {
    const nir = parseNir(candidat);
    raw.nir = nir.nir;
    const fiable = nir.cleValide === true;

    const lieu = { ...nir.lieuNaissance } as Record<string, unknown>;
    delete lieu.type;
    if (options.resoudreCommune !== false && nir.lieuNaissance.codeInsee) {
      const { resolveCommune } = await import('./insee/index');
      const commune = resolveCommune(nir.lieuNaissance.codeInsee);
      if (commune) lieu.commune = commune.nom;
    }

    const data: Identite = {
      sexe: champNir(nir.sexe, fiable),
      dateNaissance: champNir(
        {
          annee: nir.naissance.anneeProbable,
          ...(nir.naissance.mois ? { mois: nir.naissance.mois } : {}),
        },
        fiable,
      ),
      lieuNaissance: champNir(lieu, fiable),
    };
    return {
      document: 'carte-vitale',
      data,
      confidence: fiable ? 0.85 : 0.5,
      source: 'nir',
      raw,
    };
  } catch {
    return undefined;
  }
}

function champNir<T>(valeur: T, checksumValide: boolean): Champ<T> {
  return { valeur, source: 'nir', checksumValide };
}

/** Copie binarisée (Otsu) de l'image, sans muter l'originale. */
async function copieBinarisee(image: ImageData): Promise<ImageData> {
  const { binariser } = await import('./image/preprocess');
  const data = new Uint8ClampedArray(image.data);
  const copie =
    typeof ImageData !== 'undefined'
      ? new ImageData(data, image.width, image.height)
      : ({ width: image.width, height: image.height, data } as ImageData);
  binariser(copie);
  return copie;
}

/**
 * Repère des lignes MRZ dans du texte OCR : lignes en `A-Z0-9<` (espaces
 * parasites retirés) groupées par forme connue — 2×44 (TD3), 2×36 (IDFRA),
 * 3×30 (TD1).
 */
export function detecterMrz(texte: string): string[] | undefined {
  const lignes = texte
    .split('\n')
    .map((l) => l.toUpperCase().replace(/\s+/g, ''))
    .filter((l) => l.length >= 30 && l.includes('<') && /^[A-Z0-9<]+$/.test(l));

  const formes: Array<{ longueur: number; nombre: number }> = [
    { longueur: 44, nombre: 2 },
    { longueur: 36, nombre: 2 },
    { longueur: 30, nombre: 3 },
  ];
  for (const { longueur, nombre } of formes) {
    const candidates = lignes.filter((l) => l.length === longueur);
    if (candidates.length >= nombre) return candidates.slice(0, nombre);
  }
  return undefined;
}

/** Repère un NIR (avec ou sans clé) dans du texte OCR. */
export function detecterNir(texte: string): string | undefined {
  const compact = texte.toUpperCase().replace(/[\s.-]/g, '');
  const avecCle = compact.match(/[12]\d{4}(?:\d{2}|2A|2B)\d{6}\d{2}/);
  if (avecCle) return avecCle[0];
  const sansCle = compact.match(/[12]\d{4}(?:\d{2}|2A|2B)\d{6}/);
  return sansCle?.[0];
}
