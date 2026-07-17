# Changelog

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
