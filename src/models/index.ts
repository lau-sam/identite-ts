/** Provenance d'une donnée extraite. */
export type SourceDonnee = 'mrz' | '2ddoc' | 'nir' | 'insee';

/** Date complète au format ISO `YYYY-MM-DD`. */
export type DateISO = string;

/** Date incomplète (le NIR ne donne que l'année et le mois). */
export interface DatePartielle {
  annee: number;
  mois?: number;
}

export type Sexe = 'M' | 'F';

/**
 * Valeur extraite accompagnée de sa provenance, pour que l'application
 * consommatrice décide de la confiance à lui accorder.
 */
export interface Champ<T> {
  valeur: T;
  source: SourceDonnee;
  /** Présent uniquement si la source porte un checksum couvrant ce champ. */
  checksumValide?: boolean;
}

export interface Lieu {
  /** Code officiel géographique INSEE (5 caractères) si connu. */
  codeInsee?: string;
  commune?: string;
  departement?: string;
  /** Code pays INSEE pour une naissance à l'étranger (NIR en 99xxx). */
  codePaysInsee?: string;
  paysEtranger?: boolean;
}

/** Modèle commun à tous les documents. */
export interface Identite {
  nom?: Champ<string>;
  prenoms?: Champ<string[]>;
  sexe?: Champ<Sexe>;
  dateNaissance?: Champ<DateISO | DatePartielle>;
  lieuNaissance?: Champ<Lieu>;
  /** Code ISO 3166-1 alpha-3 (ex. FRA). */
  nationalite?: Champ<string>;
  numeroDocument?: Champ<string>;
  dateExpiration?: Champ<DateISO>;
}
