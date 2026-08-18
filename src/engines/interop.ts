/**
 * Résolution d'un export à travers l'interopérabilité CommonJS / ESM.
 *
 * `tesseract.js` est publié en CommonJS pur — `"type": "commonjs"`, pas de champ `exports` —
 * et cette bibliothèque l'atteint par `import()`. Selon qui assemble le code, le namespace
 * obtenu porte alors les exports à plat, ou bien les range sous `default` : Node applique sa
 * détection d'exports nommés, un bundler applique la sienne, et les deux ne s'accordent pas.
 *
 * Déstructurer directement (`const { createWorker } = await import(...)`) marche donc au banc
 * d'essai et échoue une fois la bibliothèque consommée depuis une application empaquetée, avec
 * un `createWorker is not a function` que rien ne rattache à sa cause. Constaté en production.
 */
export function resoudreExport<T>(module: unknown, nom: string): T {
  const namespace = module as Record<string, unknown> | null | undefined;
  const direct = namespace?.[nom];
  if (direct !== undefined) return direct as T;

  const parDefaut = (namespace?.default as Record<string, unknown> | undefined)?.[nom];
  if (parDefaut !== undefined) return parDefaut as T;

  throw new Error(
    `Export « ${nom} » introuvable : ni à la racine du module, ni sous « default ». ` +
      'Le paquet a probablement changé de forme (CommonJS / ESM).',
  );
}
