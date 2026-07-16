/**
 * Génère src/insee/communes.json depuis l'API découpage administratif
 * (geo.api.gouv.fr, millésime COG courant).
 *
 * Usage : node scripts/build-insee.ts
 *
 * Limite connue : seules les communes du millésime courant sont incluses.
 * Les NIR anciens peuvent référencer des communes fusionnées/supprimées,
 * absentes de ce référentiel (resolveCommune renvoie alors undefined).
 */
import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://geo.api.gouv.fr/communes?fields=code,nom&format=json';
const CIBLE = new URL('../src/insee/communes.json', import.meta.url);

interface CommuneApi {
  code: string;
  nom: string;
}

const reponse = await fetch(SOURCE);
if (!reponse.ok) {
  throw new Error(`geo.api.gouv.fr a répondu ${reponse.status}`);
}
const communes = (await reponse.json()) as CommuneApi[];

const index: Record<string, string> = {};
for (const { code, nom } of communes) {
  index[code] = nom;
}

await writeFile(CIBLE, `${JSON.stringify(index)}\n`, 'utf8');
console.log(`${communes.length} communes écrites dans ${CIBLE.pathname}`);
