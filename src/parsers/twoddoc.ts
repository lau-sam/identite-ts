import type { Champ, DateISO, DatePartielle, Identite, Sexe } from '../models/index';

const GS = '\u001d';
const RS = '\u001e';
const US = '\u001f';

export interface TwoDDocHeader {
  version: number;
  /** Identifiant de l'autorité de certification (ex. FR01). */
  autoriteCertification: string;
  identifiantCertificat: string;
  /** Absente si le document n'est pas daté (FFFF). */
  dateEmission?: DateISO;
  dateSignature?: DateISO;
  typeDocument: string;
  /** Présent à partir de la version 03. */
  perimetre?: string;
  /** Pays émetteur ISO 3166-1 alpha-2, présent en version 04. */
  pays?: string;
}

export interface TwoDDocChamp {
  id: string;
  /** Absent si l'identifiant n'est pas dans le registre embarqué. */
  libelle?: string;
  valeur: string;
  /** `true` si le producteur a tronqué la valeur (terminateur RS). */
  tronque?: boolean;
}

export interface TwoDDocData {
  header: TwoDDocHeader;
  champs: TwoDDocChamp[];
  /** Champs du domaine identité mappés vers le modèle commun. */
  identite: Identite;
  /** Signature ANTS en base32, telle quelle. */
  signature?: string;
  /** La vérification cryptographique n'est pas implémentée (prévu post-v1). */
  signatureVerifiee: false;
  brut: string;
}

export class TwoDDocParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwoDDocParseError';
  }
}

interface DefinitionChamp {
  libelle: string;
  min: number;
  max: number;
}

/**
 * Registre des identifiants de données du domaine identité
 * (spécification ANTS 2D-Doc v3.1.8, section 7.5).
 * Un champ est de longueur fixe quand min === max.
 */
const REGISTRE: Record<string, DefinitionChamp> = {
  '60': { libelle: 'Liste des prénoms', min: 0, max: 60 },
  '61': { libelle: 'Prénom', min: 0, max: 20 },
  '62': { libelle: 'Nom patronymique', min: 0, max: 38 },
  '63': { libelle: "Nom d'usage", min: 0, max: 38 },
  '64': { libelle: "Nom d'épouse/époux", min: 0, max: 38 },
  '65': { libelle: "Type de pièce d'identité", min: 2, max: 2 },
  '66': { libelle: "Numéro de la pièce d'identité", min: 0, max: 20 },
  '67': { libelle: 'Nationalité', min: 2, max: 2 },
  '68': { libelle: 'Genre', min: 1, max: 1 },
  '69': { libelle: 'Date de naissance', min: 8, max: 8 },
  '6A': { libelle: 'Lieu de naissance', min: 0, max: 32 },
  '6B': { libelle: 'Département du bureau émetteur', min: 3, max: 3 },
  '6C': { libelle: 'Pays de naissance', min: 2, max: 2 },
  '6D': { libelle: 'Nom et prénom du père', min: 0, max: 60 },
  '6E': { libelle: 'Nom et prénom de la mère', min: 0, max: 60 },
  '6F': { libelle: 'Machine Readable Zone', min: 0, max: 90 },
  '6G': { libelle: 'Nom', min: 1, max: 38 },
  '6H': { libelle: 'Civilité', min: 1, max: 10 },
  '6I': { libelle: 'Pays émetteur', min: 2, max: 2 },
  '6J': { libelle: 'Type de document étranger', min: 1, max: 1 },
  '6K': { libelle: 'Numéro de la demande de document étranger', min: 19, max: 19 },
  '6L': { libelle: 'Date de dépôt de la demande', min: 8, max: 8 },
  '6M': { libelle: 'Catégorie du titre', min: 0, max: 40 },
  '6N': { libelle: 'Date de début de validité', min: 8, max: 8 },
  '6O': { libelle: 'Date de fin de validité', min: 8, max: 8 },
};

const TAILLE_ENTETE: Record<number, number> = { 1: 22, 2: 22, 3: 24, 4: 26 };

/**
 * Parse le contenu texte d'un Datamatrix 2D-Doc (encodage C40, versions 01 à 04) :
 * en-tête, zone de message (champs fixes et variables séparés par GS/RS) et
 * signature (après US). La signature est exposée brute, **non vérifiée**.
 * @throws {TwoDDocParseError} si le marqueur, la version ou la taille sont invalides.
 */
export function parse2ddoc(brut: string): TwoDDocData {
  if (!brut.startsWith('DC')) {
    throw new TwoDDocParseError('Marqueur 2D-Doc « DC » attendu');
  }
  const version = Number(brut.slice(2, 4));
  const taille = TAILLE_ENTETE[version];
  if (taille === undefined) {
    throw new TwoDDocParseError(`Version 2D-Doc non gérée : « ${brut.slice(2, 4)} »`);
  }
  if (brut.length < taille) {
    throw new TwoDDocParseError(`En-tête incomplet : ${brut.length} < ${taille} caractères`);
  }

  const header: TwoDDocHeader = {
    version,
    autoriteCertification: brut.slice(4, 8),
    identifiantCertificat: brut.slice(8, 12),
    ...dateEntete('dateEmission', brut.slice(12, 16)),
    ...dateEntete('dateSignature', brut.slice(16, 20)),
    typeDocument: brut.slice(20, 22),
    ...(version >= 3 ? { perimetre: brut.slice(22, 24) } : {}),
    ...(version >= 4 ? { pays: brut.slice(24, 26) } : {}),
  };

  const finMessage = brut.indexOf(US, taille);
  const message = finMessage === -1 ? brut.slice(taille) : brut.slice(taille, finMessage);
  const signature = finMessage === -1 ? undefined : brut.slice(finMessage + 1);

  const champs = parseMessage(message);

  return {
    header,
    champs,
    identite: mapIdentite(champs),
    ...(signature !== undefined && signature !== '' ? { signature } : {}),
    signatureVerifiee: false,
    brut,
  };
}

function parseMessage(message: string): TwoDDocChamp[] {
  const champs: TwoDDocChamp[] = [];
  let i = 0;
  while (i < message.length) {
    const id = message.slice(i, i + 2);
    if (id.length < 2) break;
    i += 2;
    const def = REGISTRE[id];
    if (def && def.min === def.max) {
      champs.push({ id, libelle: def.libelle, valeur: message.slice(i, i + def.max) });
      i += def.max;
      continue;
    }
    // Champ variable : la valeur court jusqu'au séparateur (GS fin, RS troncature)
    // ou jusqu'à la fin du message pour le dernier champ.
    let fin = i;
    while (fin < message.length && message[fin] !== GS && message[fin] !== RS) fin++;
    const tronque = message[fin] === RS;
    champs.push({
      id,
      ...(def ? { libelle: def.libelle } : {}),
      valeur: message.slice(i, fin),
      ...(tronque ? { tronque } : {}),
    });
    i = fin < message.length ? fin + 1 : fin;
  }
  return champs;
}

function mapIdentite(champs: TwoDDocChamp[]): Identite {
  const valeur = (id: string): string | undefined => {
    const v = champs.find((c) => c.id === id)?.valeur;
    return v ? v : undefined;
  };

  const nom = valeur('62') ?? valeur('6G') ?? valeur('63') ?? valeur('64');
  const listePrenoms = valeur('60');
  const prenoms = listePrenoms
    ? listePrenoms
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean)
    : valeur('61')
      ? [valeur('61') as string]
      : undefined;
  const genre = valeur('68');
  const naissance = valeur('69') ? dateJjMmAaaa(valeur('69') as string) : undefined;
  const commune = valeur('6A');
  const nationalite = valeur('67');
  const numeroDocument = valeur('66');
  const expiration = valeur('6O') ? dateJjMmAaaa(valeur('6O') as string) : undefined;

  return {
    ...(nom ? { nom: champ2ddoc(nom) } : {}),
    ...(prenoms?.length ? { prenoms: champ2ddoc(prenoms) } : {}),
    ...(genre === 'M' || genre === 'F' ? { sexe: champ2ddoc(genre as Sexe) } : {}),
    ...(naissance ? { dateNaissance: champ2ddoc(naissance) } : {}),
    ...(commune ? { lieuNaissance: champ2ddoc({ commune }) } : {}),
    // La spec 2D-Doc encode la nationalité en ISO 3166-1 alpha-2 ; le modèle
    // commun utilise l'alpha-3 (aligné MRZ). Seul FR est converti, les autres
    // codes sont laissés tels quels.
    ...(nationalite ? { nationalite: champ2ddoc(nationalite === 'FR' ? 'FRA' : nationalite) } : {}),
    ...(numeroDocument ? { numeroDocument: champ2ddoc(numeroDocument) } : {}),
    ...(typeof expiration === 'string' ? { dateExpiration: champ2ddoc(expiration) } : {}),
  };
}

function champ2ddoc<T>(valeur: T): Champ<T> {
  return { valeur, source: '2ddoc' };
}

/** Convertit `JJMMAAAA` (JJ ou MM à 00 = inconnu) en date ISO ou partielle. */
function dateJjMmAaaa(v: string): DateISO | DatePartielle {
  const jj = v.slice(0, 2);
  const mm = v.slice(2, 4);
  const annee = Number(v.slice(4));
  if (jj === '00' || mm === '00') {
    return { annee, ...(mm !== '00' ? { mois: Number(mm) } : {}) };
  }
  return `${v.slice(4)}-${mm}-${jj}`;
}

/** Date d'en-tête : nombre de jours depuis le 01/01/2000 en hexadécimal. */
function dateEntete(
  cle: 'dateEmission' | 'dateSignature',
  hex: string,
): Partial<Pick<TwoDDocHeader, 'dateEmission' | 'dateSignature'>> {
  if (hex === 'FFFF' || !/^[0-9A-F]{4}$/.test(hex)) return {};
  const date = new Date(Date.UTC(2000, 0, 1) + Number.parseInt(hex, 16) * 86_400_000);
  return { [cle]: date.toISOString().slice(0, 10) };
}
