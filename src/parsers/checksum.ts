/**
 * Chiffre de contrôle ICAO 9303 : poids 7-3-1 cycliques, modulo 10.
 * Chiffres = valeur faciale, A-Z = 10-35, `<` = 0.
 */
export function chiffreControleIcao(champ: string): number {
  const poids = [7, 3, 1] as const;
  let somme = 0;
  for (let i = 0; i < champ.length; i++) {
    const c = champ.charCodeAt(i);
    let valeur: number;
    if (c >= 48 && c <= 57) {
      valeur = c - 48; // 0-9
    } else if (c >= 65 && c <= 90) {
      valeur = c - 55; // A=10 … Z=35
    } else if (champ[i] === '<') {
      valeur = 0;
    } else {
      throw new Error(`Caractère MRZ invalide : « ${champ[i]} »`);
    }
    somme += valeur * (poids[i % 3] as number);
  }
  return somme % 10;
}

/** Vérifie qu'un chiffre de contrôle correspond au champ couvert. */
export function checksumIcaoValide(champ: string, controle: string): boolean {
  if (!/^\d$/.test(controle)) return false;
  return chiffreControleIcao(champ) === Number(controle);
}
