<div align="center">

# identite-ts 🇫🇷

**Une photo de CNI, passeport ou carte Vitale → un JSON typé. 100 % dans le navigateur.**

[![CI](https://github.com/lau-sam/identite-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/lau-sam/identite-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/identite-ts)](https://www.npmjs.com/package/identite-ts)
[![licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](./LICENSE)

<img src="docs/demo.gif" alt="Démo : une photo de document d'identité français est déposée dans le navigateur et ressort en JSON structuré" width="720" />

</div>

## 🚀 L'objectif

Remplir des formulaires d'identité (nom, prénoms, date de naissance…) est fastidieux et source d'erreurs. `identite-ts` résout ce problème : l'utilisateur photographie son document, votre application reçoit un objet JSON typé — sans qu'aucune donnée ne quitte son navigateur.

## ⚡ Essayer en 2 minutes

```bash
git clone https://github.com/lau-sam/identite-ts && cd identite-ts
npm install && cd playground && npm install && npm run dev
```

Pas de document sous la main ? Testez avec les **spécimens officiels** (documents fictifs publiés pour ce genre d'usage) :

| Document | Spécimen | Ce que l'outil extrait |
|---|---|---|
| CNI 2021 (verso) | [Wikimedia Commons — carte MARTIN Maëlys](https://commons.wikimedia.org/wiki/File:Carte_identit%C3%A9_%C3%A9lectronique_fran%C3%A7aise_(2021,_verso).png) | MRZ complète, checksums 100 % valides |
| Carte Vitale | [Wikipédia — Carte Vitale](https://fr.wikipedia.org/wiki/Carte_Vitale) | NIR + clé, sexe, naissance, département |
| Passeport | [ICAO Doc 9303 partie 4, annexe A](https://www.icao.int/publications/doc-series/doc-9303) (spécimen « Utopia ») | MRZ TD3, identité complète |

Vérifié sur ces spécimens : la CNI 2021 ressort avec **tous les checksums valides**, la carte Vitale avec **clé NIR validée** et lieu de naissance résolu.

- **100 % côté client** : aucune donnée ne quitte le navigateur (RGPD par construction).
- **Fondé sur les codes, pas seulement l'OCR** : MRZ (checksums ICAO 9303), NIR (clé 97), 2D-DOC ANTS — parsing déterministe et validable.
- **TypeScript first** : modèles typés, chaque champ porte sa provenance et la validité de son checksum.
- **Indépendant du framework** : une fonction asynchrone, zéro dépendance UI.
- **Léger par défaut** : les moteurs lourds (OCR ~2 Mo, Datamatrix ~1 Mo) sont chargés à la volée uniquement quand nécessaire ; les parseurs purs pèsent quelques Ko.

## Installation

```bash
npm install identite-ts
```

## Usage

### Tout-en-un : photo → JSON

```ts
import { extractDocument } from 'identite-ts';

const resultat = await extractDocument(fichierPhoto); // File, Blob, HTMLImageElement ou ImageData

if (resultat.document !== 'unknown') {
  console.log(resultat.data?.nom?.valeur);           // 'MARTIN'
  console.log(resultat.data?.dateNaissance?.valeur); // '1990-07-13'
  console.log(resultat.confidence);                  // 0.95
  console.log(resultat.source);                      // 'mrz' | '2ddoc' | 'nir'
}
```

Pipeline de détection : **2D-DOC** (Datamatrix signé de la CNI 2021) → **MRZ** (CNI ancienne 2×36, CNI 2021 3×30, passeport 2×44) → **NIR** (carte Vitale). Un document illisible ne jette jamais : `document: 'unknown'` avec la zone `raw` remplie pour diagnostic.

### Parseurs purs (sans OCR, quelques Ko)

Utilisables aussi côté serveur (Node ≥ 20) :

```ts
import { parseMrz, parseNir, parse2ddoc } from 'identite-ts';

const mrz = parseMrz([
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
]);
mrz.identite.nom?.valeur;  // 'ERIKSSON'
mrz.valide;                // true — tous les checksums ICAO passent

const nir = parseNir('2 69 05 49 588 157 80');
nir.sexe;                  // 'F'
nir.naissance;             // { annee2: 69, anneeProbable: 1969, mois: 5 }
nir.lieuNaissance;         // { type: 'metropole', departement: '49', codeInsee: '49588' }
nir.cleValide;             // true
```

### Lieu de naissance en clair (référentiel INSEE)

```ts
import { resolveCommune } from 'identite-ts/insee'; // chunk séparé (~280 Ko gzip)

resolveCommune('75056'); // { codeInsee: '75056', nom: 'Paris', departement: '75' }
resolveCommune('49588'); // undefined — commune fusionnée, absente du millésime courant
```

`extractDocument` fait cette résolution automatiquement pour les cartes Vitale (désactivable avec `resoudreCommune: false`).

### Chaque champ connaît sa fiabilité

```ts
interface Champ<T> {
  valeur: T;
  source: 'mrz' | '2ddoc' | 'nir' | 'insee';
  checksumValide?: boolean; // présent si la source porte un checksum
}
```

Votre formulaire peut ainsi pré-remplir en vert ce qui est validé par checksum et en orange ce qui vient d'un OCR brut.

## Données extraites par document

| Document | Source | Données |
|---|---|---|
| CNI (ancienne) | MRZ 2×36 | nom, prénoms, sexe, date de naissance, n° de carte |
| CNI 2021 | 2D-DOC ou MRZ 3×30 | + nationalité, date d'expiration |
| Passeport | MRZ 2×44 | nom, prénoms, sexe, date de naissance, nationalité, n°, expiration |
| Carte Vitale | NIR | sexe, année + mois de naissance, lieu de naissance (via INSEE) |

## Limites connues

- **L'adresse n'existe dans aucun code optique.** Elle n'est présente que dans la puce NFC (hors périmètre) ou imprimée au dos de l'ancienne CNI (souvent périmée).
- Le NIR ne donne que l'année et le mois de naissance, jamais le jour ; le siècle est déduit (`anneeProbable`).
- La qualité de l'OCR dépend de la photo : privilégiez un cadrage net de la zone MRZ.
- Le référentiel INSEE embarqué couvre le millésime courant : une commune fusionnée référencée par un vieux NIR peut ne pas être résolue.
- Par défaut, tesseract.js et zxing-wasm téléchargent leurs assets (WASM, modèles de langue) depuis un CDN public au premier usage. Les données de l'utilisateur ne quittent jamais le navigateur, mais pour un déploiement air-gapped ou strictement auto-hébergé, servez ces assets vous-même via les options `ocr.langPath`/`ocr.workerPath`/`ocr.corePath` et `datamatrix.wasmBaseUrl`.

## Feuille de route

- [ ] Vérification cryptographique de la signature 2D-DOC (ECDSA, certificats ANTS — [spécifications officielles](https://ants.gouv.fr/nos-missions/les-solutions-numeriques/2d-doc))
- [ ] Lecture de la puce NFC (port de [cnie-python-tools](https://github.com/hufon/cnie-python-tools), WebNFC)
- [ ] OCR des zones visuelles complémentaires (lieu de naissance CNI/passeport)
- [ ] Référentiel INSEE historisé (communes fusionnées)

## Développement

```bash
npm install
npm test              # vitest
npm run build         # tsup → dist/
node scripts/build-insee.ts   # régénère le référentiel des communes

cd playground && npm install && npm run dev   # démo locale
```

## Licence et auteur

[MIT](./LICENSE). Développé par [Coderkaine](https://www.coderkaine.com).
