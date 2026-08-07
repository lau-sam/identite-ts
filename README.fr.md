<div align="center">

# identite-ts

**Une photo de document d'identité → un JSON typé. 100 % dans le navigateur.**

[English](https://github.com/lau-sam/identite-ts/blob/main/README.md) · **Français**

[![CI](https://github.com/lau-sam/identite-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/lau-sam/identite-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/identite-ts)](https://www.npmjs.com/package/identite-ts)
[![licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](./LICENSE)

<img src="docs/demo.gif" alt="Démo : une photo de document d'identité est déposée dans le navigateur et ressort en JSON structuré" width="720" />

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

if (resultat.document !== 'inconnu') {
  console.log(resultat.data?.nom?.valeur);           // 'MARTIN'
  console.log(resultat.data?.dateNaissance?.valeur); // '1990-07-13'
  console.log(resultat.document);                    // 'carte-identite' | 'passeport' | 'carte-vitale'
  console.log(resultat.paysEmetteur);                // 'FRA' — État émetteur, ≠ nationalité du titulaire
  console.log(resultat.confidence);                  // 0.95
  console.log(resultat.source);                      // 'mrz' | '2ddoc' | 'nir'
}
```

Pipeline de détection : **2D-DOC** (Datamatrix signé de la CNI 2021) → **MRZ** (2×36, 3×30, 2×44) → **NIR** (carte Vitale). Un document illisible ne jette jamais : `document: 'inconnu'` avec la zone `raw` remplie pour diagnostic.

La forme 2×36 est ambiguë : elle est partagée par le TD2 de l'ICAO et par l'ancienne CNI française, dont les dispositions sont incompatibles. Les deux lectures sont tentées et celle dont les checksums tombent juste l'emporte.

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

### Codes 2D non interprétés

Tous les Datamatrix et QR lus sur l'image sont exposés dans `raw.codesBarres`, avec leur format. Seul le 2D-DOC est interprété : les autres charges utiles sont restituées telles quelles, sans être comprises.

C'est le cas du QR gravé au verso du permis de conduire suisse, dont le contenu n'a pas de spécification publique. La bibliothèque ne devine pas : elle ne renseigne `data` que depuis une source validée par un code de contrôle.

Pour signaler un format inconnu sans publier les données d'un document réel :

```ts
import { decrireCodeBarre } from 'identite-ts';

const inconnus = (resultat.raw.codesBarres ?? []).filter((c) => !c.texte.startsWith('DC'));
console.log(inconnus.map(decrireCodeBarre));
// [{ format: 'QRCode', longueur: 214, alphabet: 'base64url', prefixe: 'CH01', separateurs: [] }]
```

Cette description est faite pour être collée dans une issue : elle ne contient ni nom, ni date, ni numéro. Seul le préfixe en est un extrait littéral — les formats connus y placent un marqueur structurel, mais relisez-le avant publication.

### Chaque champ connaît sa fiabilité

```ts
interface Champ<T> {
  valeur: T;
  source: 'mrz' | '2ddoc' | 'nir' | 'insee' | 'ocr';
  checksumValide?: boolean; // présent si la source porte un checksum
}
```

Votre formulaire peut ainsi pré-remplir en vert ce qui est validé par checksum et en orange ce qui vient d'un OCR brut.

## Données extraites par document

| Document | Source | Données |
|---|---|---|
| CNI française (ancienne) | MRZ 2×36 (IDFRA) | nom, prénoms, sexe, date de naissance, n° de carte |
| CNI française 2021 | 2D-DOC ou MRZ 3×30 | + nationalité, date d'expiration |
| Carte d'identité étrangère | MRZ 3×30 (TD1) | nom, prénoms, sexe, date de naissance, nationalité, n°, expiration |
| Titre de séjour, carte officielle | MRZ 2×36 (TD2) | nom, prénoms, sexe, date de naissance, nationalité, n°, expiration |
| Passeport | MRZ 2×44 (TD3) | nom, prénoms, sexe, date de naissance, nationalité, n°, expiration |
| Carte Vitale | NIR + OCR | sexe, année + mois de naissance, lieu de naissance (via INSEE) ; nom et prénoms lus en OCR (sans checksum) |

## Pays et formats couverts

**La couverture se fait par format, pas par pays.** Trois des cinq formats lus sont des normes internationales : tout État qui s'y conforme est lu, sans qu'une seule ligne de code lui soit consacrée.

### Formats internationaux — tout État émetteur

| Format | Forme | Documents | Portée |
|---|---|---|---|
| **TD3** | 2 lignes × 44 | Passeports | Tout État conforme à l'[ICAO 9303](https://www.icao.int/publications/doc-series/doc-9303) |
| **TD1** | 3 lignes × 30 | Cartes d'identité, titres de séjour | idem |
| **TD2** | 2 lignes × 36 | Titres de séjour, cartes officielles de voyage | idem |

Ces trois dispositions sont normalisées : le lecteur ne connaît aucune particularité nationale. Il lit une structure, vérifie les checksums, et expose l'État émetteur brut. Une carte suisse, allemande, italienne ou brésilienne conforme est donc lue sans travail supplémentaire.

Le TD2 couvre notamment les **titres de séjour européens** : le [règlement (CE) 1030/2002](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32002R1030) impose une zone de lecture conforme aux normes de l'OACI sans fixer le format — TD1 et TD2 sont l'un comme l'autre valides, et tous deux sont lus.

`extractDocument` et `parseMrz` distinguent deux informations trop souvent confondues :

```ts
mrz.paysEmetteur            // 'CHE' — État qui a délivré le document
mrz.identite.nationalite    // 'FRA' — nationalité du titulaire
mrz.codeDocument            // 'ID'  — code brut de la MRZ
mrz.categorie               // 'carte-identite' | 'passeport' | 'inconnu'
```

`categorie` ne se déduit que du **premier** caractère du code document (`P` passeport, `A`/`C`/`I` autre document officiel). Le second caractère n'a jamais été normalisé — l'ICAO ne l'uniformise qu'à partir de la 9ᵉ édition de la spécification — il est donc exposé brut dans `codeDocument` sans être interprété.

### Formats nationaux — France uniquement

| Format | Documents | Un équivalent chez vous ? |
|---|---|---|
| **2D-DOC** (ANTS) | CNI 2021, justificatifs | Plusieurs États ont leur propre code 2D signé. Le parseur est structurellement réutilisable. |
| **NIR** (clé 97) | Carte Vitale | Tout numéro national porteur d'une clé de contrôle se parse selon le même principe. |
| **IDFRA** | Ancienne CNI (avant 2021) | Les dispositions nationales antérieures à l'ICAO existent ailleurs aussi. |

### Vérifié sur spécimen

Ce tableau est distinct des deux précédents : il ne dit pas ce qui est *lisible*, mais ce qu'une suite de tests couvre **réellement** aujourd'hui.

| État | Documents | Formats | Spécimen |
|---|---|---|---|
| 🇫🇷 France | CNI 2021, ancienne CNI, passeport, carte Vitale | TD1, IDFRA, TD3, 2D-DOC, NIR | MARTIN, LOISEAU, spécimens ANTS |
| 🇨🇭 Suisse | Carte d'identité | TD1 | MUSTER Hans Peter (fictif) |
| 🇩🇪 Allemagne | Passeport | TD3 | Erika Mustermann — code pays `D<<` |
| 🌐 « Utopia » | Passeport, titre de séjour | TD3, TD2 | ICAO 9303, parties 4 et 6 |

**Votre pays n'y figure pas ? Cela ne signifie pas qu'il n'est pas lu** — seulement que personne ne l'a encore vérifié. C'est la contribution la plus utile au projet, et elle ne demande pas d'écrire de code : [ouvrez une issue « format d'un pays »](https://github.com/lau-sam/identite-ts/issues/new?template=country-format.yml).

> [!CAUTION]
> **Ne joignez jamais la photo ni les données d'un document réel** dans une issue : elle est publique, indexée par les moteurs de recherche, et son historique reste consultable après suppression. Utilisez un spécimen officiel public, une MRZ fictive aux checksums recalculés, ou la sortie de `decrireCodeBarre` — conçue pour ne rien divulguer.

## Pourquoi pas un LLM ?

Parce que lire un document d'identité est un problème **normalisé**, pas un problème de compréhension. Une MRZ, un 2D-DOC, un NIR sont des grammaires fixes munies de codes de contrôle.

- **Déterminisme** : mêmes octets en entrée, même sortie — indéfiniment. Aucune variation entre deux exécutions, aucune dérive entre deux versions de modèle.
- **Vérifiabilité** : un checksum ICAO se vérifie ; une hallucination, non. Chaque champ porte `checksumValide`, donc vous savez ce qui est *prouvé* et ce qui est *deviné*.
- **Rien ne sort du navigateur** : aucun appel réseau, donc aucune pièce d'identité transmise à un tiers.
- **Coût et latence** : quelques Ko de parseurs, aucun coût par photo, aucun aller-retour réseau.

**Où un LLM reste meilleur** : texte libre non normalisé, mise en page inconnue, écriture manuscrite, alphabets non latins hors MRZ. Ce n'est pas ce dont il s'agit ici.

## Limites connues

- **L'adresse n'existe dans aucun code optique.** Elle n'est présente que dans la puce NFC (hors périmètre) ou imprimée au dos de l'ancienne CNI (souvent périmée).
- Le NIR ne donne que l'année et le mois de naissance, jamais le jour ; le siècle est déduit (`anneeProbable`).
- La qualité de l'OCR dépend de la photo : privilégiez un cadrage net de la zone MRZ.
- Le référentiel INSEE embarqué couvre le millésime courant : une commune fusionnée référencée par un vieux NIR peut ne pas être résolue.
- Par défaut, tesseract.js et zxing-wasm téléchargent leurs assets (WASM, modèles de langue) depuis un CDN public au premier usage. Les données de l'utilisateur ne quittent jamais le navigateur, mais pour un déploiement air-gapped ou strictement auto-hébergé, servez ces assets vous-même via les options `ocr.langPath`/`ocr.workerPath`/`ocr.corePath` et `datamatrix.wasmBaseUrl`.

## Jeux de données publics

Les spécimens listés plus haut servent à essayer la bibliothèque à la main. Pour la **mesurer** — taux de lecture MRZ, précision de localisation, régressions — il faut des jeux annotés. Ceux-ci sont publics, et leur licence a été relue sur la source primaire (`license.txt` du dépôt officiel ou fiche Zenodo) :

| Jeu | Ce qu'il apporte ici | Licence |
|---|---|---|
| [DocXPand-25k](https://github.com/QuickSign/docxpand) ([arXiv:2407.20662](https://arxiv.org/abs/2407.20662)) | 24 994 images de documents fictifs incrustés sur fonds réels, MRZ TD1/TD2/TD3 et champs annotés — localisation, OCR, MRZ | CC BY-NC-SA 4.0 (**non commercial**) |
| MIDV-500 et MIDV-2020 (`ftp://smartengines.com/midv-500/`) | Documents filmés en conditions dégradées : reflets, flou, cadrage partiel — la matière du chantier localisation/rectification | CC BY-SA 2.5 |
| [MIDV-Holo](https://github.com/SmartEngines/midv-holo) | Originaux et attaques par présentation, hologrammes annotés — détection de fraude | CC BY-SA 2.5 |
| [DLC-2021](https://zenodo.org/records/6466770) | Recaptures d'écran, photocopies, documents sans lamination — document rejoué | CC BY-SA 2.5 |
| [SmartDoc 2015](https://zenodo.org/records/1230218) | Documents A4 filmés au smartphone : pas des pièces d'identité, mais la référence pour la localisation en vidéo | CC BY 4.0 |

**Aucun de ces jeux n'est redistribué ici, et aucun n'entrera dans ce dépôt ni dans le paquet npm.** Le projet est sous licence MIT, qui autorise l'usage commercial : y commiter des images sous CC BY-NC-SA ou CC BY-SA reviendrait à leur accorder des droits que leurs auteurs n'ont pas donnés. Les utiliser localement pour évaluer est en revanche sans difficulté. Deux pièges à connaître : le partage à l'identique se propage à tout jeu dérivé ou augmenté que l'on publierait, et la licence affichée sur une page arXiv couvre l'article, jamais les données.

## Contribuer

Les contributions sont bienvenues, de n'importe quel pays. Les plus utiles, dans l'ordre :

1. **Signaler un format mal lu ou absent pour votre pays** — [issue « format d'un pays »](https://github.com/lau-sam/identite-ts/issues/new?template=country-format.yml). Aucun code requis. Le lien vers un spécimen officiel public suffit à rendre le sujet traitable.
2. **Ajouter un test sur un spécimen public** de votre pays : c'est ce qui fait passer un format de « probablement lu » à « vérifié ».
3. **Implémenter un format national** (code 2D signé, numéro à clé de contrôle) sur le modèle de `src/parsers/`.

Deux règles fermes :

- **Aucune donnée de document réel** dans une issue, une PR ou un test. Spécimens publics ou données fictives aux checksums recalculés, uniquement.
- **On ne devine pas.** Un champ n'est renseigné que depuis une source validée par un code de contrôle ou explicitement marquée `source: 'ocr'`. Un format sans spécification publique est exposé brut, jamais interprété.

## Feuille de route

- [ ] **Localisation et rectification du document** : détecter le quadrilatère de la carte dans la photo, corriger la perspective, normaliser au format ID-1. Lève la contrainte de cadrage décrite dans les limites ci-dessus.
- [ ] **Détection de fraude** : repérer un document rejoué (photo d'écran, photocopie, capture), altéré ou incohérent — à commencer par les indices vérifiables sans référentiel (cohérence MRZ ↔ zone visuelle, checksums, dates impossibles).
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
