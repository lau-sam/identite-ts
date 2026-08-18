import { parseMrz } from 'identite-ts';

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

function score(lignes: string[]): { valides: number; total: number } | undefined {
  try {
    const mrz = parseMrz(lignes);
    const controles = Object.values(mrz.checksums);
    return { valides: controles.filter(Boolean).length, total: controles.length };
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

  let meilleur: { valides: number; zone: string; nombre: number } | undefined;
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i] as string;
    for (let p = 0; p < ligne.length; p++) {
      for (const c of ALPHABET) {
        if (c === ligne[p]) continue;
        const mutees = [...lignes];
        mutees[i] = ligne.slice(0, p) + c + ligne.slice(p + 1);
        const s = score(mutees);
        if (!s) continue;
        if (!meilleur || s.valides > meilleur.valides) {
          meilleur = { valides: s.valides, zone: zone(format, i, p), nombre: 1 };
        }
      }
    }
  }

  if (!meilleur || meilleur.valides <= initial.valides) {
    sortie.push('  correction à 1 caractère     : sans effet');
    sortie.push('  → plusieurs caractères sont faux : c’est la qualité de l’image qui limite,');
    sortie.push('    pas le parseur.');
    return sortie.join('\n');
  }

  sortie.push(
    `  correction à 1 caractère     : ${meilleur.valides}/${initial.total} checksums ` +
      `(${meilleur.zone})`,
  );
  if (meilleur.valides === initial.total) {
    sortie.push('  → un seul caractère mal lu : la lecture est réparable et prouvable.');
  }
  return sortie.join('\n');
}
