import type { Champ, DateISO, Identite, Sexe } from '../models/index';
import { checksumIcaoValide } from './checksum';

/** Un checksum de date n'a de sens que sur une zone entièrement numérique. */
function checksumDate(champ: string, controle: string): boolean {
  return /^\d{6}$/.test(champ) && checksumIcaoValide(champ, controle);
}

export type MrzFormat = 'td1' | 'td3' | 'idfra';

/**
 * Nature du document, déduite du seul premier caractère du code document
 * (ICAO 9303 : `P` passeport, `A`/`C`/`I` autre document de voyage officiel).
 * Le second caractère est laissé à la discrétion de l'État émetteur et n'est
 * donc jamais interprété : `codeDocument` l'expose brut.
 */
export type CategorieDocument = 'carte-identite' | 'passeport' | 'inconnu';

export interface MrzChecksums {
  numeroDocument?: boolean;
  dateNaissance: boolean;
  dateExpiration?: boolean;
  composite: boolean;
}

export interface MrzResult {
  format: MrzFormat;
  categorie: CategorieDocument;
  /** Code document brut, chevrons retirés (`ID`, `P`, `IP`…). */
  codeDocument: string;
  /** État émetteur, code ICAO à trois lettres. Distinct de la nationalité. */
  paysEmetteur: string;
  identite: Identite;
  checksums: MrzChecksums;
  /** `true` si tous les checksums présents sont valides. */
  valide: boolean;
  /** Lignes MRZ normalisées telles que parsées. */
  brut: string[];
}

export class MrzParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MrzParseError';
  }
}

/**
 * Parse une MRZ française ou ICAO :
 * - TD3 (2×44) : passeport
 * - TD1 (3×30) : carte d'identité 2021
 * - IDFRA (2×36) : ancienne carte nationale d'identité
 *
 * Les checksums invalides ne font pas échouer le parsing : ils sont
 * reportés dans `checksums` et sur chaque champ (`checksumValide`).
 * @throws {MrzParseError} si la forme (nombre/longueur de lignes) est inconnue.
 */
export function parseMrz(lines: string[]): MrzResult {
  const l = lines.map((ligne) => ligne.trim().toUpperCase());
  if (l.length === 3 && l.every((x) => x.length === 30)) return parseTd1(l);
  if (l.length === 2 && l.every((x) => x.length === 44)) return parseTd3(l);
  if (l.length === 2 && l.every((x) => x.length === 36)) return parseIdFra(l);
  throw new MrzParseError(
    `Forme MRZ inconnue : ${l.length} ligne(s) de longueur [${l.map((x) => x.length).join(', ')}]`,
  );
}

function parseTd3(l: [string, string] | string[]): MrzResult {
  const [l1, l2] = l as [string, string];
  const numeroDocument = nettoyer(l2.slice(0, 9));
  const checksums: MrzChecksums = {
    numeroDocument: checksumIcaoValide(l2.slice(0, 9), l2[9] as string),
    dateNaissance: checksumDate(l2.slice(13, 19), l2[19] as string),
    dateExpiration: checksumDate(l2.slice(21, 27), l2[27] as string),
    composite: checksumIcaoValide(
      l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43),
      l2[43] as string,
    ),
  };
  const { nom, prenoms } = parseNoms(l1.slice(5), '<<', '<');
  const identite: Identite = {
    ...(nom ? { nom: champMrz(nom, checksums.composite) } : {}),
    ...(prenoms.length ? { prenoms: champMrz(prenoms, checksums.composite) } : {}),
    ...champSexe(l2[20] as string),
    ...champDate('dateNaissance', dateMrz(l2.slice(13, 19), 'naissance'), checksums.dateNaissance),
    nationalite: champMrz(nettoyer(l2.slice(10, 13)), checksums.composite),
    numeroDocument: champMrz(numeroDocument, checksums.numeroDocument as boolean),
    ...champDate(
      'dateExpiration',
      dateMrz(l2.slice(21, 27), 'expiration'),
      checksums.dateExpiration as boolean,
    ),
  };
  return resultat('td3', identite, checksums, l as string[]);
}

function parseTd1(l: string[]): MrzResult {
  const [l1, l2, l3] = l as [string, string, string];
  const checksums: MrzChecksums = {
    numeroDocument: checksumIcaoValide(l1.slice(5, 14), l1[14] as string),
    dateNaissance: checksumDate(l2.slice(0, 6), l2[6] as string),
    dateExpiration: checksumDate(l2.slice(8, 14), l2[14] as string),
    composite: checksumIcaoValide(
      l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29),
      l2[29] as string,
    ),
  };
  const { nom, prenoms } = parseNoms(l3, '<<', '<');
  const identite: Identite = {
    ...(nom ? { nom: champMrz(nom, checksums.composite) } : {}),
    ...(prenoms.length ? { prenoms: champMrz(prenoms, checksums.composite) } : {}),
    ...champSexe(l2[7] as string),
    ...champDate('dateNaissance', dateMrz(l2.slice(0, 6), 'naissance'), checksums.dateNaissance),
    nationalite: champMrz(nettoyer(l2.slice(15, 18)), checksums.composite),
    numeroDocument: champMrz(nettoyer(l1.slice(5, 14)), checksums.numeroDocument as boolean),
    ...champDate(
      'dateExpiration',
      dateMrz(l2.slice(8, 14), 'expiration'),
      checksums.dateExpiration as boolean,
    ),
  };
  return resultat('td1', identite, checksums, l);
}

/**
 * Ancienne CNI française (2 lignes de 36).
 * Ligne 1 : ID FRA + nom (25) + code émetteur (6).
 * Ligne 2 : n° de carte (12) + contrôle + prénoms (14, séparés par `<<`)
 *           + date de naissance (6) + contrôle + sexe + contrôle composite.
 */
function parseIdFra(l: string[]): MrzResult {
  const [l1, l2] = l as [string, string];
  if (!l1.startsWith('ID')) {
    throw new MrzParseError('Ligne 1 IDFRA attendue (préfixe ID)');
  }
  const checksums: MrzChecksums = {
    numeroDocument: checksumIcaoValide(l2.slice(0, 12), l2[12] as string),
    dateNaissance: checksumDate(l2.slice(27, 33), l2[33] as string),
    composite: checksumIcaoValide(l1 + l2.slice(0, 35), l2[35] as string),
  };
  const nom = nettoyer(l1.slice(5, 30));
  const prenoms = l2
    .slice(13, 27)
    .split('<<')
    .map((p) => nettoyer(p))
    .filter(Boolean);
  const identite: Identite = {
    ...(nom ? { nom: champMrz(nom, checksums.composite) } : {}),
    ...(prenoms.length ? { prenoms: champMrz(prenoms, checksums.composite) } : {}),
    ...champSexe(l2[34] as string),
    ...champDate('dateNaissance', dateMrz(l2.slice(27, 33), 'naissance'), checksums.dateNaissance),
    nationalite: champMrz('FRA', checksums.composite),
    numeroDocument: champMrz(l2.slice(0, 12), checksums.numeroDocument as boolean),
  };
  return resultat('idfra', identite, checksums, l);
}

/**
 * Assemble le résultat. Les trois formats partagent le même en-tête de
 * première ligne : code document (2) puis État émetteur (3).
 */
function resultat(
  format: MrzFormat,
  identite: Identite,
  checksums: MrzChecksums,
  brut: string[],
): MrzResult {
  const entete = brut[0] as string;
  const codeDocument = nettoyer(entete.slice(0, 2));
  const valide = Object.values(checksums).every((v) => v !== false);
  return {
    format,
    categorie: categoriser(codeDocument),
    codeDocument,
    paysEmetteur: nettoyer(entete.slice(2, 5)),
    identite,
    checksums,
    valide,
    brut,
  };
}

function categoriser(codeDocument: string): CategorieDocument {
  const premier = codeDocument[0];
  if (premier === 'P') return 'passeport';
  if (premier === 'A' || premier === 'C' || premier === 'I') return 'carte-identite';
  return 'inconnu';
}

function champMrz<T>(valeur: T, checksumValide: boolean): Champ<T> {
  return { valeur, source: 'mrz', checksumValide };
}

function champDate(
  cle: 'dateNaissance' | 'dateExpiration',
  valeur: DateISO | undefined,
  checksumValide: boolean,
): Partial<Identite> {
  return valeur === undefined ? {} : { [cle]: champMrz(valeur, checksumValide) };
}

function champSexe(c: string): Pick<Identite, 'sexe'> {
  if (c !== 'M' && c !== 'F') return {};
  return { sexe: { valeur: c as Sexe, source: 'mrz' } };
}

function parseNoms(
  zone: string,
  separateurNomPrenoms: string,
  separateurComposants: string,
): { nom: string; prenoms: string[] } {
  const [nomBrut = '', prenomsBrut = ''] = zone.split(separateurNomPrenoms, 2);
  return {
    nom: nettoyer(nomBrut),
    prenoms: prenomsBrut
      .split(separateurComposants)
      .map((p) => nettoyer(p))
      .filter(Boolean),
  };
}

/** Remplace les chevrons de remplissage par des espaces et élague. */
function nettoyer(brut: string): string {
  return brut.replaceAll('<', ' ').trim().replace(/\s+/g, ' ');
}

/**
 * Convertit `YYMMDD` en date ISO. Pivot de siècle :
 * - naissance : années > année courante → 19xx (personne déjà née) ;
 * - expiration : toujours 20xx (aucun document du XXe siècle encore valide).
 */
function dateMrz(yymmdd: string, type: 'naissance' | 'expiration'): DateISO | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = Number(yymmdd.slice(0, 2));
  const anneeCourante = new Date().getFullYear() % 100;
  const siecle = type === 'expiration' ? 20 : yy > anneeCourante ? 19 : 20;
  return `${siecle}${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}
