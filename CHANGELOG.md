# Changelog

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
