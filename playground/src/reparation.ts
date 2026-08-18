import { type MrzResult, parseMrz } from 'identite-ts';

/**
 * Recherche exhaustive d'une correction de la MRZ lue.
 *
 * Quand les checksums tombent faux, une question commande tout le reste : le défaut
 * tient-il à **un seul** caractère mal lu, ou à plusieurs ? Dans le premier cas la
 * lecture est réparable et la correction se prouve par le checksum ; dans le second,
 * c'est l'image qu'il faut améliorer, pas le parseur.
 *
 * On essaie donc, position par position, chaque caractère de l'alphabet MRZ, et on
 * regarde combien de contrôles passent. Le rapport ne cite que des **zones** — jamais
 * une valeur, jamais un caractère du document.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

/**
 * Zone porteuse du nom, et forme canonique attendue : des mots séparés par un ou deux
 * `<`, puis du remplissage. Sans ce filtre, la recherche ci-dessous ne vaut rien : elle
 * essaie plus d'un millier de variantes jugées sur un checksum à un chiffre, donc une
 * centaine d'entre elles le satisfont par pur hasard, avec un nom absurde.
 */
function formeNomPlausible(mrz: MrzResult, lignes: string[]): boolean {
  const zone =
    mrz.format === 'td1'
      ? (lignes[2] as string)
      : mrz.format === 'td3' || mrz.format === 'td2'
        ? (lignes[0] as string).slice(5)
        : (lignes[0] as string).slice(5, 30);
  return /^[A-Z]+(?:<{1,2}[A-Z]+)*<*$/.test(zone);
}

function score(
  lignes: string[],
): { valides: number; total: number; plausible: boolean } | undefined {
  try {
    const mrz = parseMrz(lignes);
    const controles = Object.values(mrz.checksums);
    return {
      valides: controles.filter(Boolean).length,
      total: controles.length,
      plausible: formeNomPlausible(mrz, lignes),
    };
  } catch {
    return undefined;
  }
}

/** Nomme la zone d'une position, pour situer le défaut sans rien révéler. */
function zone(format: string, ligne: number, position: number): string {
  if (format === 'idfra') {
    if (ligne === 0) {
      if (position < 5) return 'ligne 1 / en-tête';
      if (position < 30) return 'ligne 1 / nom';
      return 'ligne 1 / code émetteur';
    }
    if (position < 12) return 'ligne 2 / n° de document';
    if (position === 12) return 'ligne 2 / clé du n° de document';
    if (position < 27) return 'ligne 2 / prénoms';
    if (position < 33) return 'ligne 2 / date de naissance';
    if (position === 33) return 'ligne 2 / clé de la date';
    if (position === 34) return 'ligne 2 / sexe';
    return 'ligne 2 / clé composite';
  }
  return `ligne ${ligne + 1} / position ${position}`;
}

export function decrireReparation(lignes: string[] | undefined): string {
  if (!lignes || lignes.length === 0) return '  (aucune MRZ retenue)';

  const initial = score(lignes);
  if (!initial) return '  (les lignes retenues ne se parsent pas)';

  let format = '?';
  try {
    format = parseMrz(lignes).format;
  } catch {
    /* format inconnu : les libellés de zone resteront génériques */
  }

  const sortie: string[] = [
    `  tel quel                    : ${initial.valides}/${initial.total} checksums`,
  ];
  if (initial.valides === initial.total) {
    sortie.push('  rien à réparer.');
    return sortie.join('\n');
  }

  let meilleur: { valides: number; zone: string } | undefined;
  let solutionsCompletes = 0;
  let solutionsFantaisistes = 0;

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i] as string;
    for (let p = 0; p < ligne.length; p++) {
      for (const c of ALPHABET) {
        if (c === ligne[p]) continue;
        const mutees = [...lignes];
        mutees[i] = ligne.slice(0, p) + c + ligne.slice(p + 1);
        const s = score(mutees);
        if (!s || s.valides <= initial.valides) continue;
        // Une variante qui valide les checksums mais laisse un nom informe n'est pas une
        // réparation : c'est le hasard qui a satisfait un contrôle à un chiffre.
        if (!s.plausible) {
          solutionsFantaisistes++;
          continue;
        }
        if (s.valides === s.total) solutionsCompletes++;
        if (!meilleur || s.valides > meilleur.valides) {
          meilleur = { valides: s.valides, zone: zone(format, i, p) };
        }
      }
    }
  }

  if (solutionsFantaisistes > 0) {
    sortie.push(
      `  variantes écartées (nom informe) : ${solutionsFantaisistes} — ` +
        'checksum satisfait au hasard',
    );
  }

  if (!meilleur) {
    sortie.push('  correction à 1 caractère     : aucune, forme du nom respectée');
    sortie.push('  → plusieurs caractères sont faux : c’est la qualité de l’image qui limite,');
    sortie.push('    pas le parseur.');
    return sortie.join('\n');
  }

  sortie.push(
    `  correction à 1 caractère     : ${meilleur.valides}/${initial.total} checksums ` +
      `(${meilleur.zone}, ${solutionsCompletes} solution(s) complète(s))`,
  );
  if (meilleur.valides === initial.total && solutionsCompletes === 1) {
    sortie.push('  → une seule solution : la réparation est prouvée.');
  } else if (meilleur.valides === initial.total) {
    sortie.push('  → plusieurs solutions : aucune n’est prouvée, elles se contredisent.');
  }
  return sortie.join('\n');
}
