import type { Lieu, Sexe } from '../models/index';

export type TypeLieuNir = 'metropole' | 'dom' | 'etranger';

export interface NirNaissance {
  /** Année sur 2 chiffres telle qu'inscrite dans le NIR. */
  annee2: number;
  /**
   * Année sur 4 chiffres la plus probable (pivot : une année « future »
   * est ramenée au XXe siècle). Le NIR seul ne lève pas l'ambiguïté de siècle.
   */
  anneeProbable: number;
  /** 1-12, absent pour les pseudo-mois (naissance à date incomplète). */
  mois?: number;
}

export interface NirInfo {
  /** NIR normalisé, 13 caractères (peut contenir 2A/2B pour la Corse). */
  nir: string;
  cle?: string;
  /** Absent si la clé n'a pas été fournie. */
  cleValide?: boolean;
  sexe: Sexe;
  naissance: NirNaissance;
  lieuNaissance: Lieu & { type: TypeLieuNir };
  /** Numéro d'ordre dans le mois et la commune de naissance. */
  ordre: string;
}

export class NirParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NirParseError';
  }
}

const FORME_NIR = /^[12]\d{4}(?:\d{2}|2A|2B)\d{6}(?:\d{2})?$/;

/**
 * Parse un NIR (numéro de sécurité sociale, carte Vitale) : 13 caractères
 * plus une clé optionnelle de 2 chiffres. Espaces et points sont tolérés.
 *
 * La clé est vérifiée par `97 - (NIR mod 97)` avec la substitution
 * Corse (2A→19, 2B→18). Une clé fausse ne fait pas échouer le parsing :
 * elle est reportée dans `cleValide`.
 * @throws {NirParseError} si la forme est invalide.
 */
export function parseNir(brut: string): NirInfo {
  const normalise = brut.toUpperCase().replace(/[\s.-]/g, '');
  if (!FORME_NIR.test(normalise)) {
    throw new NirParseError(`NIR de forme invalide : « ${brut} »`);
  }
  const nir = normalise.slice(0, 13);
  const cle = normalise.length === 15 ? normalise.slice(13) : undefined;

  const sexe: Sexe = nir[0] === '1' ? 'M' : 'F';
  const annee2 = Number(nir.slice(1, 3));
  const moisBrut = Number(nir.slice(3, 5));
  const anneeCourante = new Date().getFullYear();
  const anneeProbable = 2000 + annee2 > anneeCourante ? 1900 + annee2 : 2000 + annee2;

  return {
    nir,
    ...(cle !== undefined ? { cle, cleValide: cleNir(nir) === cle } : {}),
    sexe,
    naissance: {
      annee2,
      anneeProbable,
      ...(moisBrut >= 1 && moisBrut <= 12 ? { mois: moisBrut } : {}),
    },
    lieuNaissance: lieuNir(nir),
    ordre: nir.slice(10),
  };
}

/** Calcule la clé de contrôle d'un NIR de 13 caractères. */
export function cleNir(nir: string): string {
  // La Corse remplace 2A/2B par 19/18 pour le calcul.
  const numerique = nir.replace('2A', '19').replace('2B', '18');
  const reste = Number(BigInt(numerique) % 97n);
  return String(97 - reste).padStart(2, '0');
}

function lieuNir(nir: string): Lieu & { type: TypeLieuNir } {
  const dept2 = nir.slice(5, 7);
  if (dept2 === '99') {
    return { type: 'etranger', paysEtranger: true, codePaysInsee: nir.slice(7, 10) };
  }
  if (dept2 === '97' || dept2 === '98') {
    const departement = nir.slice(5, 8);
    return { type: 'dom', departement, codeInsee: nir.slice(5, 10) };
  }
  return { type: 'metropole', departement: dept2, codeInsee: nir.slice(5, 10) };
}
