# Changelog

## 0.4.0 — à paraître

Lecture des codes 2D non interprétés ([#3](https://github.com/lau-sam/identite-ts/issues/3)).
Les QR étaient déjà décodés, mais rien ne distinguait leur format de celui d'un
Datamatrix, et leur contenu ne pouvait pas être signalé sans divulguer les
données du document lu.

### Changements incompatibles

- `RawExtraction.payloadsDatamatrix` (`string[]`) devient `codesBarres`
  (`CodeBarre[]`), chaque entrée portant son `format` et son `texte`.
- `DatamatrixEngine.decoder` renvoie ces mêmes `CodeBarre[]` au lieu de
  `string[]` — sans effet, sauf pour un moteur injecté par l'appelant.

### Documentation

- Le README passe en **anglais** ; la version française devient `README.fr.md`, avec un
  sélecteur de langue dans les deux. La bibliothèque lit des formats internationaux
  (ICAO 9303) : un README uniquement francophone en masquait la portée.
- Nouvelle section « pays et formats couverts », qui sépare trois choses jusque-là
  confondues : les formats internationaux (tout État émetteur), les formats propres
  à la France (2D-DOC, NIR, IDFRA) et la liste des documents réellement **vérifiés
  par un test** (FRA, CHE, DEU, spécimens ICAO).
- Formulaire d'issue `country-format.yml` pour signaler un format mal lu dans un pays
  donné, avec interdiction explicite de joindre les données d'un document réel.
- La description npm passe en anglais et les mots-clés couvrent les formats ICAO.

### Ajouts

- `decrireCodeBarre` : résume un code 2D en métadonnées non identifiantes
  (format, longueur, famille de caractères, préfixe, séparateurs de contrôle),
  destinées à être jointes à un rapport de bug sur un format non documenté.
- Le playground affiche cette description pour tout code qu'il ne sait pas
  interpréter, en rappelant que le résultat complet contient les données du
  porteur et n'a pas à être publié.

## 0.3.0 — 2026-08-07

Lecture des titres de séjour ([#2](https://github.com/lau-sam/identite-ts/issues/2)) et
correction de deux lectures silencieusement fausses.

### Corrections

- **Une MRZ TD2 était lue avec la disposition de l'ancienne CNI française.** Les
  deux formats partagent la forme 2×36, et tout document de cette taille était
  confié au parseur français : nom et prénoms fusionnés, date lue comme prénom,
  et nationalité `FRA` affirmée sur un document étranger. Les deux dispositions
  sont désormais essayées, celle dont les checksums tombent juste l'emporte.
- **Une fenêtre OCR décalée d'un caractère sur la ligne du nom pouvait être
  déclarée valide.** En TD2 comme en TD3, aucun checksum ne couvre cette ligne :
  un parasite lu en tête décalait le nom (`OERIKSSON` pour `ERIKSSON`) et
  l'État émetteur (`UT` pour `UTO`) sans que `valide` passe à `false`. Le
  fenêtrage vérifie maintenant que l'en-tête a la forme d'un code document
  suivi d'un État émetteur.

### Ajouts

- `parseMrz` lit le format **TD2** (2×36, ICAO 9303 partie 6) : titres de
  séjour et cartes officielles de voyage. Le règlement (CE) 1030/2002 laisse
  les États choisir entre TD1 et TD2 pour les titres de séjour européens ;
  les deux sont désormais couverts.
- `MrzFormat` accueille la valeur `'td2'` — sans incidence, sauf pour un
  appelant qui énumérerait exhaustivement les formats.

## 0.2.0 — 2026-08-06

Lecture des documents non français ([#1](https://github.com/lau-sam/identite-ts/issues/1)).
Les formats TD1 et TD3 sont normalisés par l'ICAO 9303 : le parseur ne dépendait
en fait d'aucune particularité française, mais il étiquetait tout document TD1
comme une CNI 2021 et n'exposait jamais l'État émetteur.

### Changements incompatibles

- `MrzResult.document` disparaît au profit de `categorie`
  (`'carte-identite' | 'passeport' | 'inconnu'`) : la génération du document
  se lit désormais dans `format` (`'td1' | 'td3' | 'idfra'`) et l'État émetteur
  dans `paysEmetteur`, sans information dupliquée.
- `TypeDocument` suit la même refonte : `'cni'` et `'cni-2021'` deviennent
  `'carte-identite'`, `'unknown'` devient `'inconnu'`.

Migration : `resultat.document === 'cni-2021'` s'écrit désormais
`resultat.document === 'carte-identite' && resultat.paysEmetteur === 'FRA'`.

### Ajouts

- `MrzResult.paysEmetteur` et `ExtractionResult.paysEmetteur` : État émetteur
  (code ICAO à trois lettres), distinct de la nationalité du titulaire.
- `MrzResult.codeDocument` : code document brut de la MRZ. Son second caractère
  étant laissé à la discrétion de l'État émetteur, il n'est jamais interprété —
  seul le premier caractère détermine `categorie`.

## 0.1.1 — 2026-07-17

Aucun changement fonctionnel : première publication via la CI GitHub Actions
(trusted publishing OIDC, provenance npm activée).

## 0.1.0 — 2026-07-17

Première version.

- `extractDocument` : photo → JSON typé (pipeline 2D-DOC → MRZ → NIR, moteurs
  chargés paresseusement, jamais de throw sur document illisible).
- `parseMrz` : MRZ TD1 (CNI 2021), TD3 (passeport) et IDFRA (ancienne CNI),
  checksums ICAO 9303 vérifiés champ par champ.
- `parseNir` : NIR/carte Vitale — sexe, année et mois de naissance, lieu de
  naissance (métropole, Corse, outre-mer, étranger), clé 97 validée.
- `parse2ddoc` : 2D-DOC ANTS versions 01 à 04, registre des champs identité,
  signature exposée brute (vérification cryptographique prévue plus tard).
- `identite-ts/insee` : `resolveCommune`, référentiel des communes embarqué
  (chunk séparé), régénérable via `scripts/build-insee.ts`.
- OCR robuste aux documents réels, validé sur les spécimens officiels :
  binarisation d'Otsu contre les fonds guillochés, seconde passe sur la bande
  basse de l'image, fenêtrage des lignes MRZ bruitées départagé par checksums,
  dates MRZ strictement numériques.
- Carte Vitale : lecture OCR du nom et des prénoms imprimés (`source: 'ocr'`,
  sans garantie de checksum).
- Moteurs OCR (tesseract.js) et Datamatrix (zxing-wasm) auto-hébergeables.
- Playground Vite de démonstration et outil `scripts/analyse-image.ts`.
