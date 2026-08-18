import type { DatamatrixOptions } from './engines/datamatrix';
import type { OcrOptions } from './engines/ocr';
import type { CodeBarre, DatamatrixEngine, OcrEngine } from './engines/types';
import type { ImageInput } from './image/preprocess';
import type { Champ, Identite } from './models/index';
import { type CategorieDocument, type MrzResult, parseMrz } from './parsers/mrz';
import { parseNir } from './parsers/nir';
import { parse2ddoc } from './parsers/twoddoc';

export type TypeDocument = CategorieDocument | 'carte-vitale';

export interface RawExtraction {
  /** Symboles 2D lus sur l'image. Seul le 2D-DOC y est interprété. */
  codesBarres?: CodeBarre[];
  lignesMrz?: string[];
  texteOcr?: string;
  nir?: string;
}

export interface ExtractionResult {
  document: TypeDocument;
  /**
   * État émetteur, code ICAO à trois lettres, quand la source le porte.
   * Distinct de la nationalité du titulaire (`data.nationalite`).
   */
  paysEmetteur?: string;
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
 * Extrait les données d'identité d'une photo de document d'identité.
 * Pipeline : Datamatrix 2D-DOC (rapide, signé) → MRZ (checksums) → NIR.
 *
 * Un document illisible ne jette jamais : résultat `inconnu` avec `raw`
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

  return { document: 'inconnu', data: null, confidence: 0, source: null, raw };
}

async function tenterDatamatrix(
  image: ImageData,
  options: ExtractOptions,
  raw: RawExtraction,
): Promise<ExtractionResult | undefined> {
  const engine =
    options.engines?.datamatrix ??
    (await import('./engines/datamatrix')).creerDatamatrixEngine(options.datamatrix);
  let codes: CodeBarre[];
  try {
    codes = await engine.decoder(image);
  } catch {
    return undefined; // moteur indisponible : on continue avec l'OCR
  }
  if (codes.length) raw.codesBarres = codes;

  for (const { texte } of codes) {
    if (!texte.startsWith('DC')) continue;
    try {
      const doc = parse2ddoc(texte);
      const identite = doc.identite;
      if (!identite.nom && !identite.dateNaissance) continue;
      return {
        // Seul document d'identité porteur d'un 2D-DOC à ce jour : la CNI 2021.
        document: 'carte-identite',
        paysEmetteur: 'FRA',
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
  // Deuxième passe sur la bande basse : la MRZ y est toujours, et l'OCR
  // décroche souvent sur la carte entière (photo, adresse, décor). Troisième
  // passe en seuillage adaptatif, pour les fonds inégaux qu'un seuil global ne
  // sépare pas — sur la bande basse seulement, la MRZ n'est jamais ailleurs.
  const passes: Array<{ fraction: number; methode: 'otsu' | 'sauvola' }> = [
    { fraction: 1, methode: 'otsu' },
    { fraction: 0.45, methode: 'otsu' },
    { fraction: 0.45, methode: 'sauvola' },
  ];

  // Une passe peut rendre une MRZ qui se parse mais dont les checksums tombent faux :
  // l'OCR a confondu un caractère. S'arrêter là fige une lecture fautive — constaté sur
  // une CNI réelle, bloquée à 47 % de confiance avec nom et prénoms marqués suspects.
  // On retient donc la meilleure passe, sans dépenser les suivantes quand tout est déjà
  // valide : une lecture parfaite coûte toujours une seule passe.
  let meilleur: { resultat: ExtractionResult; lignes: string[]; score: number } | undefined;

  for (const { fraction, methode } of passes) {
    const texte = await ocr.reconnaitre(await copieBinarisee(image, fraction, methode), 'mrz');
    raw.texteOcr = [raw.texteOcr, texte].filter(Boolean).join('\n');
    const lignes = detecterMrz(texte);
    if (!lignes) continue;
    raw.lignesMrz = lignes;

    try {
      const mrz = parseMrz(lignes);
      const controles = Object.values(mrz.checksums);
      const score =
        controles.length === 0 ? 0 : controles.filter(Boolean).length / controles.length;
      if (!meilleur || score > meilleur.score) {
        meilleur = {
          resultat: {
            document: mrz.categorie,
            paysEmetteur: mrz.paysEmetteur,
            data: mrz.identite,
            confidence: mrz.valide ? 0.95 : 0.7 * score,
            source: 'mrz',
            raw,
          },
          lignes,
          score,
        };
      }
      if (mrz.valide) break;
    } catch {
      // forme finalement invalide : passe suivante
    }
  }

  if (!meilleur) return undefined;
  raw.lignesMrz = meilleur.lignes;
  return meilleur.resultat;
}

async function tenterNir(
  image: ImageData,
  ocr: OcrEngine,
  options: ExtractOptions,
  raw: RawExtraction,
): Promise<ExtractionResult | undefined> {
  // Deux passes, comme pour la MRZ. La carte Vitale porte un fond coloré parcouru d'une
  // trame de sécurité : sur l'image telle quelle, l'OCR lit la trame et rend du bruit,
  // alors que le NIR y est imprimé en clair. Le seuillage adaptatif le dégage.
  //
  // Sauvola et non Otsu : le seuil unique d'Otsu range la trame et le chiffre du même
  // côté, et le numéro disparaît — constaté sur une carte réelle. L'ordre n'est pas
  // indifférent non plus : l'image brute passe d'abord, car tout seuillage peut à
  // l'inverse effacer un texte fin — c'est un rattrapage, pas un remplacement.
  const variantes: Array<() => Promise<ImageData>> = [
    async () => image,
    () => copieBinarisee(image, 1, 'sauvola'),
  ];
  for (const variante of variantes) {
    const texte = await ocr.reconnaitre(await variante(), 'texte');
    raw.texteOcr = [raw.texteOcr, texte].filter(Boolean).join('\n');
    const candidat = detecterNir(texte);
    if (!candidat) continue;
    const resultat = await construireVitale(candidat, texte, options, raw);
    if (resultat) return resultat;
  }
  return undefined;
}

/** Bâtit le résultat « carte vitale » à partir d'un NIR candidat, ou rien s'il est mal formé. */
async function construireVitale(
  candidat: string,
  texte: string,
  options: ExtractOptions,
  raw: RawExtraction,
): Promise<ExtractionResult | undefined> {
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

    const identiteVisuelle = detecterNomVitale(texte, nir.nir);
    const data: Identite = {
      ...(identiteVisuelle ? { nom: { valeur: identiteVisuelle.nom, source: 'ocr' } } : {}),
      ...(identiteVisuelle?.prenoms.length
        ? { prenoms: { valeur: identiteVisuelle.prenoms, source: 'ocr' } }
        : {}),
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
      paysEmetteur: 'FRA',
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

/**
 * Copie binarisée (Otsu) de l'image, sans muter l'originale, optionnellement
 * réduite à sa bande basse (`fraction` < 1).
 */
async function copieBinarisee(
  image: ImageData,
  fraction: number,
  methode: 'otsu' | 'sauvola' = 'otsu',
): Promise<ImageData> {
  const { binariser, binariserAdaptatif, niveauxDeGris, rognerBas } = await import(
    './image/preprocess'
  );
  const zone = fraction < 1 ? rognerBas(image, fraction) : image;
  const data = new Uint8ClampedArray(zone.data);
  const copie =
    typeof ImageData !== 'undefined'
      ? new ImageData(data, zone.width, zone.height)
      : ({ width: zone.width, height: zone.height, data } as ImageData);
  niveauxDeGris(copie); // l'image préparée reste en couleur
  if (methode === 'sauvola') binariserAdaptatif(copie);
  else binariser(copie);
  return copie;
}

/**
 * Tolérance de caractères parasites (décor lu par l'OCR) autour d'une ligne MRZ.
 * Sur une photo réelle, le bord de la carte et le fond partent volontiers en caractères :
 * des lignes à 42 signes pour 36 attendus ont été mesurées sur une CNI. Élargir ne dégrade
 * pas la justesse — toutes les fenêtres sont essayées et seule celle qui valide au moins un
 * checksum est retenue ; cela évite en revanche d'écarter d'emblée la meilleure passe.
 */
const PARASITES_MAX = 8;

/**
 * Variante d'une ligne MRZ dont les parasites isolés du remplissage sont rendus au `<`.
 *
 * Un `<` mal binarisé se lit volontiers comme une lettre. Isolée au milieu du remplissage
 * (`<S<`), elle s'accroche au nom : « …EN » devient « …ENS », et le composite tombe faux.
 * La variante n'est proposée qu'en concurrence des autres : elle ne l'emporte que si un
 * checksum la valide, jamais par simple préférence. C'est de la correction prouvée, pas
 * de la réécriture au jugé.
 */
function sansParasiteIsole(ligne: string): string {
  return ligne.replace(/(?<=<)[A-Z0-9](?=<)/g, '<');
}

/**
 * Repère des lignes MRZ dans du texte OCR : lignes en `A-Z0-9<` (espaces
 * parasites retirés) groupées par forme connue — 2×44 (TD3), 2×36 (IDFRA),
 * 3×30 (TD1). Les lignes légèrement trop longues (décor lu comme caractère)
 * sont fenêtrées : la combinaison maximisant les checksums valides gagne.
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
    const candidates = lignes.filter(
      (l) => l.length >= longueur && l.length <= longueur + PARASITES_MAX,
    );
    if (candidates.length < nombre) continue;
    const meilleure = meilleureCombinaison(candidates.slice(0, nombre), longueur);
    if (meilleure) return meilleure;
  }
  return undefined;
}

/**
 * Essaie toutes les fenêtres de la longueur cible dans chaque ligne candidate
 * et retient la combinaison dont le plus de checksums MRZ passent.
 */
function meilleureCombinaison(candidates: string[], longueur: number): string[] | undefined {
  const fenetresParLigne = candidates.map((ligne) => {
    const fenetres = new Set<string>();
    for (let debut = 0; debut + longueur <= ligne.length; debut++) {
      const fenetre = ligne.slice(debut, debut + longueur);
      fenetres.add(fenetre);
      fenetres.add(sansParasiteIsole(fenetre));
    }
    return [...fenetres];
  });

  let meilleur: { lignes: string[]; score: number } | undefined;
  for (const combo of produitCartesien(fenetresParLigne)) {
    try {
      const mrz = parseMrz(combo);
      const valides = Object.values(mrz.checksums).filter((v) => v === true).length;
      // La zone nom n'a pas de checksum : les chiffres y sont forcément des
      // parasites OCR. Une fenêtre sans date de naissance ou sans sexe est
      // presque toujours décalée : pénalités pour départager.
      // L'en-tête, lui non plus, n'est couvert par aucun checksum en TD2 et
      // TD3 : sans cette pénalité, une fenêtre décalée d'un caractère sur la
      // ligne du nom passe pour parfaitement valide.
      // La pénalité de forme dépasse le poids d'un checksum, et c'est voulu : mieux
      // vaut une lecture honnêtement marquée suspecte qu'un nom faux certifié valide.
      const score =
        valides * 1000 -
        (remplissageNomConforme(mrz.format, combo) ? 0 : 1500) -
        (mrz.identite.dateNaissance ? 0 : 400) -
        (enteteConforme(combo) ? 0 : 300) -
        (mrz.identite.sexe ? 0 : 150) -
        chiffresZoneNom(mrz.format, combo);
      if (!meilleur || score > meilleur.score) meilleur = { lignes: combo, score };
    } catch {
      // combinaison sans forme valide : ignorée
    }
  }
  return meilleur && meilleur.score >= 1000 ? meilleur.lignes : undefined;
}

/**
 * Toute MRZ s'ouvre sur un code document (une lettre, éventuellement suivie
 * d'une seconde ou d'un chevron) puis sur l'État émetteur. Ce dernier commence
 * toujours par une lettre, mais peut être plus court que trois caractères et
 * complété par des chevrons — l'Allemagne s'écrit `D<<`.
 */
function enteteConforme(lignes: string[]): boolean {
  return /^[A-Z][A-Z<][A-Z][A-Z<]{2}/.test(lignes[0] as string);
}

/** Zone porteuse du nom et des prénoms, selon le format. */
function zoneNom(format: MrzResult['format'], lignes: string[]): string {
  if (format === 'td1') return lignes[2] as string;
  if (format === 'td3' || format === 'td2') return (lignes[0] as string).slice(5);
  return (lignes[0] as string).slice(5, 30);
}

/**
 * Vrai si la zone nom a la forme canonique : des mots séparés par un ou deux `<`,
 * puis du remplissage. Une lettre qui réapparaît *après* le remplissage n'est jamais
 * un nom — c'est du décor lu par l'OCR.
 *
 * Ce contrôle est structurel, et il est indispensable. Le composite ne vaut qu'un
 * chiffre : parmi les centaines de fenêtres et variantes essayées, il s'en trouve
 * toujours une pour le satisfaire par hasard, avec un nom faux à la clé. Mesuré sur
 * une carte de test : « LOISEAU S C C » certifié à 95 %. La forme de la zone, elle,
 * ne se satisfait pas au hasard.
 */
function remplissageNomConforme(format: MrzResult['format'], lignes: string[]): boolean {
  return /^[A-Z]+(?:<{1,2}[A-Z]+)*<*$/.test(zoneNom(format, lignes));
}

function chiffresZoneNom(format: MrzResult['format'], lignes: string[]): number {
  const zone =
    format === 'td1'
      ? (lignes[2] as string)
      : format === 'td3' || format === 'td2'
        ? (lignes[0] as string).slice(5)
        : (lignes[0] as string).slice(5, 30);
  return (zone.match(/\d/g) ?? []).length;
}

function* produitCartesien(listes: string[][]): Generator<string[]> {
  if (listes.length === 0) {
    yield [];
    return;
  }
  const [tete, ...reste] = listes as [string[], ...string[][]];
  for (const valeur of tete) {
    for (const suite of produitCartesien(reste)) {
      yield [valeur, ...suite];
    }
  }
}

/** Mots imprimés sur la carte Vitale qui ne sont jamais un nom. */
const MOTS_VITALE = new Set([
  'VITALE',
  'CARTE',
  'ASSURANCE',
  'MALADIE',
  'SPECIMEN',
  'EMISE',
  'CPAM',
  'SECURITE',
  'SOCIALE',
]);

/**
 * Lit le nom et le prénom imprimés au-dessus du NIR sur une carte Vitale.
 * Pur OCR sans code de contrôle : best-effort, source `ocr`.
 * Deux lignes : la plus haute porte le(s) prénom(s), la plus basse le nom.
 * Une seule ligne : le dernier mot est traité comme le nom.
 */
function detecterNomVitale(
  texte: string,
  nir: string,
): { nom: string; prenoms: string[] } | undefined {
  const lignes = texte.split('\n').map((l) => l.trim());
  const indexNir = lignes.findIndex((l) => l.replace(/[\s.-]/g, '').includes(nir.slice(0, 9)));
  if (indexNir <= 0) return undefined;

  const candidates: string[] = [];
  for (let i = indexNir - 1; i >= 0 && candidates.length < 2; i--) {
    const ligne = lignes[i] as string;
    if (ligne === '') continue;
    const mots = ligne.split(/\s+/);
    const estNom =
      /^[A-Z\u00C0-\u00DE' -]{2,}$/.test(ligne) && !mots.some((m) => MOTS_VITALE.has(m));
    if (!estNom) break;
    candidates.unshift(ligne);
  }
  if (candidates.length === 0) return undefined;

  if (candidates.length === 2) {
    const [lignePrenoms, ligneNom] = candidates as [string, string];
    return { nom: ligneNom, prenoms: lignePrenoms.split(/\s+/) };
  }
  const mots = (candidates[0] as string).split(/\s+/);
  if (mots.length < 2) return { nom: mots[0] as string, prenoms: [] };
  return { nom: mots[mots.length - 1] as string, prenoms: mots.slice(0, -1) };
}

/** Repère un NIR (avec ou sans clé) dans du texte OCR. */
export function detecterNir(texte: string): string | undefined {
  const compact = texte.toUpperCase().replace(/[\s.-]/g, '');
  const avecCle = compact.match(/[12]\d{4}(?:\d{2}|2A|2B)\d{6}\d{2}/);
  if (avecCle) return avecCle[0];
  const sansCle = compact.match(/[12]\d{4}(?:\d{2}|2A|2B)\d{6}/);
  return sansCle?.[0];
}
