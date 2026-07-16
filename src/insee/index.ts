import communes from './communes.json' with { type: 'json' };

export interface Commune {
  codeInsee: string;
  nom: string;
  departement: string;
}

const FORME_COG = /^(?:\d{2}|2A|2B)\d{3}$/;

/**
 * Résout un code officiel géographique INSEE (5 caractères) vers sa commune,
 * d'après le millésime COG embarqué (voir scripts/build-insee.ts).
 * Renvoie `undefined` pour un code inconnu (commune fusionnée, code erroné…).
 */
export function resolveCommune(codeInsee: string): Commune | undefined {
  const code = codeInsee.toUpperCase();
  if (!FORME_COG.test(code)) return undefined;
  const nom = (communes as Record<string, string>)[code];
  if (nom === undefined) return undefined;
  return {
    codeInsee: code,
    nom,
    departement:
      code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2),
  };
}
