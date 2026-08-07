import type { CodeBarre } from './engines/types';

/** Familles de caractères observées dans une charge utile. */
export type AlphabetCodeBarre =
  | 'numerique'
  | 'hexadecimal'
  | 'base64url'
  | 'ascii-imprimable'
  | 'binaire';

/**
 * Description d'un code-barres destinée à être partagée publiquement, par
 * exemple dans un rapport de bug, sans divulguer les données du porteur.
 */
export interface DescriptionCodeBarre {
  format: string;
  longueur: number;
  alphabet: AlphabetCodeBarre;
  /**
   * Quatre premiers caractères imprimables. Seul extrait littéral de la
   * description : les formats connus commencent par un marqueur structurel
   * (`DC` pour le 2D-DOC), pas par une donnée personnelle. À relire tout de
   * même avant publication, aucun format n'étant garanti.
   */
  prefixe: string;
  /** Caractères de contrôle présents, notés `U+XXXX` et triés. */
  separateurs: string[];
}

const ALPHABETS: Array<{ nom: AlphabetCodeBarre; motif: RegExp }> = [
  { nom: 'numerique', motif: /^[0-9]+$/ },
  { nom: 'hexadecimal', motif: /^[0-9A-Fa-f]+$/ },
  { nom: 'base64url', motif: /^[A-Za-z0-9\-_=]+$/ },
  { nom: 'ascii-imprimable', motif: /^[\x20-\x7E]+$/ },
];

/**
 * Résume un code-barres en métadonnées non identifiantes : de quoi comprendre
 * la structure d'un format non documenté — le QR du permis de conduire suisse,
 * par exemple — et en discuter dans une issue publique sans y publier le
 * contenu d'un document réel.
 */
export function decrireCodeBarre({ format, texte }: CodeBarre): DescriptionCodeBarre {
  return {
    format,
    longueur: texte.length,
    alphabet: ALPHABETS.find(({ motif }) => motif.test(texte))?.nom ?? 'binaire',
    prefixe: [...texte].filter(estImprimable).slice(0, 4).join(''),
    separateurs: [...new Set([...texte].filter((c) => !estImprimable(c)))].map(noterUnicode).sort(),
  };
}

function estImprimable(caractere: string): boolean {
  const code = caractere.codePointAt(0) ?? 0;
  return code >= 0x20 && code !== 0x7f;
}

function noterUnicode(caractere: string): string {
  const code = (caractere.codePointAt(0) ?? 0).toString(16).toUpperCase();
  return `U+${code.padStart(4, '0')}`;
}
