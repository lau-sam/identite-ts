<div align="center">

# identite-ts

**A photo of an identity document → typed JSON. 100 % in the browser.**

**English** · [Français](https://github.com/lau-sam/identite-ts/blob/main/README.fr.md)

[![CI](https://github.com/lau-sam/identite-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/lau-sam/identite-ts/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/identite-ts)](https://www.npmjs.com/package/identite-ts)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

<img src="docs/demo.gif" alt="Demo: a photo of an identity document is dropped into the browser and comes back as structured JSON" width="720" />

</div>

## 🚀 The goal

Filling in identity forms (surname, given names, date of birth…) is tedious and error-prone. `identite-ts` solves it: the user photographs their document, your application receives a typed JSON object — and no data ever leaves their browser.

Reading is **standards-based, not country-based**: the ICAO 9303 machine-readable zones (TD1, TD2, TD3) are read for **any issuing state**. French-specific formats (2D-DOC, NIR) are supported on top of that. See [Countries and formats covered](#countries-and-formats-covered).

## ⚡ Try it in 2 minutes

```bash
git clone https://github.com/lau-sam/identite-ts && cd identite-ts
npm install && cd playground && npm install && npm run dev
```

No document at hand? Use **official specimens** — fictitious documents published for exactly this purpose:

| Document | Specimen | What the library extracts |
|---|---|---|
| French ID card 2021 (back) | [Wikimedia Commons — MARTIN Maëlys card](https://commons.wikimedia.org/wiki/File:Carte_identit%C3%A9_%C3%A9lectronique_fran%C3%A7aise_(2021,_verso).png) | Full MRZ, 100 % valid checksums |
| French health card (Vitale) | [Wikipédia — Carte Vitale](https://fr.wikipedia.org/wiki/Carte_Vitale) | NIR + check key, sex, birth, department |
| Passport | [ICAO Doc 9303 part 4, annex A](https://www.icao.int/publications/doc-series/doc-9303) ("Utopia" specimen) | TD3 MRZ, full identity |

Verified on these specimens: the 2021 ID card comes out with **all checksums valid**, the health card with a **validated NIR key** and a resolved place of birth.

- **100 % client-side**: no data leaves the browser (GDPR by construction).
- **Code-based, not OCR-only**: MRZ (ICAO 9303 checksums), NIR (mod-97 key), ANTS 2D-DOC — deterministic, verifiable parsing.
- **TypeScript first**: typed models; every field carries its provenance and its checksum status.
- **Framework-agnostic**: one async function, zero UI dependencies.
- **Light by default**: heavy engines (OCR ~2 MB, Datamatrix ~1 MB) load lazily, only when needed; the pure parsers weigh a few KB.

## A note on language

The library was written in French and its **public API uses French identifiers**. They will not be renamed before a 1.0 release, so here is the mapping you need:

| API | Meaning | API | Meaning |
|---|---|---|---|
| `identite` | identity | `paysEmetteur` | issuing state |
| `nom` | surname | `prenoms` | given names |
| `dateNaissance` | date of birth | `dateExpiration` | expiry date |
| `lieuNaissance` | place of birth | `nationalite` | nationality |
| `sexe` | sex | `numeroDocument` | document number |
| `valeur` | value | `valide` | valid |
| `checksumValide` | checksum valid | `categorie` | category |
| `codeDocument` | document code | `codesBarres` | barcodes |
| `brut` | raw | `inconnu` | unknown |
| `cleValide` | check key valid | `resoudreCommune` | resolve municipality |

## Installation

```bash
npm install identite-ts
```

## Usage

### All-in-one: photo → JSON

```ts
import { extractDocument } from 'identite-ts';

const result = await extractDocument(photoFile); // File, Blob, HTMLImageElement or ImageData

if (result.document !== 'inconnu') {
  console.log(result.data?.nom?.valeur);           // 'MARTIN'
  console.log(result.data?.dateNaissance?.valeur); // '1990-07-13'
  console.log(result.document);                    // 'carte-identite' | 'passeport' | 'carte-vitale'
  console.log(result.paysEmetteur);                // 'FRA' — issuing state, ≠ holder's nationality
  console.log(result.confidence);                  // 0.95
  console.log(result.source);                      // 'mrz' | '2ddoc' | 'nir'
}
```

Detection pipeline: **2D-DOC** (the signed Datamatrix on the 2021 French ID card) → **MRZ** (2×36, 3×30, 2×44) → **NIR** (French health card). An unreadable document never throws: you get `document: 'inconnu'` with the `raw` section filled in for diagnosis.

The 2×36 shape is ambiguous: it is shared by the ICAO TD2 and by the pre-2021 French ID card, whose layouts are incompatible. Both readings are attempted and the one whose checksums pass wins.

### Pure parsers (no OCR, a few KB)

Also usable server-side (Node ≥ 20):

```ts
import { parseMrz, parseNir, parse2ddoc } from 'identite-ts';

const mrz = parseMrz([
  'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<',
  'L898902C36UTO7408122F1204159ZE184226B<<<<<10',
]);
mrz.identite.nom?.valeur;  // 'ERIKSSON'
mrz.valide;                // true — every ICAO checksum passes

const nir = parseNir('2 69 05 49 588 157 80');
nir.sexe;                  // 'F'
nir.naissance;             // { annee2: 69, anneeProbable: 1969, mois: 5 }
nir.lieuNaissance;         // { type: 'metropole', departement: '49', codeInsee: '49588' }
nir.cleValide;             // true
```

### Place of birth in plain text (INSEE registry)

```ts
import { resolveCommune } from 'identite-ts/insee'; // separate chunk (~280 KB gzip)

resolveCommune('75056'); // { codeInsee: '75056', nom: 'Paris', departement: '75' }
resolveCommune('49588'); // undefined — merged municipality, absent from the current edition
```

`extractDocument` performs this lookup automatically for health cards (disable with `resoudreCommune: false`).

### Uninterpreted 2D codes

Every Datamatrix and QR code found in the image is exposed in `raw.codesBarres`, along with its format. Only 2D-DOC is interpreted: other payloads are returned verbatim, without being understood.

That is the case for the QR code engraved on the back of the Swiss driving licence, whose content has no public specification. The library does not guess: it only fills `data` from a source validated by a check code.

To report an unknown format without publishing data from a real document:

```ts
import { decrireCodeBarre } from 'identite-ts';

const unknown = (result.raw.codesBarres ?? []).filter((c) => !c.texte.startsWith('DC'));
console.log(unknown.map(decrireCodeBarre));
// [{ format: 'QRCode', longueur: 214, alphabet: 'base64url', prefixe: 'CH01', separateurs: [] }]
```

This description is meant to be pasted into an issue: it contains no name, no date, no number. Only the prefix is a literal excerpt — known formats put a structural marker there — but read it before publishing.

### Every field knows how reliable it is

```ts
interface Champ<T> {
  valeur: T;                // value
  source: 'mrz' | '2ddoc' | 'nir' | 'insee' | 'ocr';
  checksumValide?: boolean; // present when the source carries a checksum
}
```

Your form can therefore pre-fill in green what a checksum validates, and in amber what comes from raw OCR.

## Data extracted per document

| Document | Source | Data |
|---|---|---|
| French ID card (pre-2021) | MRZ 2×36 (IDFRA) | surname, given names, sex, date of birth, card number |
| French ID card 2021 | 2D-DOC or MRZ 3×30 | + nationality, expiry date |
| Non-French ID card | MRZ 3×30 (TD1) | surname, given names, sex, date of birth, nationality, number, expiry |
| Residence permit, official card | MRZ 2×36 (TD2) | surname, given names, sex, date of birth, nationality, number, expiry |
| Passport | MRZ 2×44 (TD3) | surname, given names, sex, date of birth, nationality, number, expiry |
| French health card (Vitale) | NIR + OCR | sex, year + month of birth, place of birth (via INSEE); surname and given names read by OCR (no checksum) |

## Countries and formats covered

**Coverage is per format, not per country.** Three of the five formats read are international standards: any state that conforms is read, without a single line of code dedicated to it.

### International formats — every issuing state

| Format | Shape | Documents | Scope |
|---|---|---|---|
| **TD3** | 2 lines × 44 | Passports | Any state conforming to [ICAO 9303](https://www.icao.int/publications/doc-series/doc-9303) |
| **TD1** | 3 lines × 30 | ID cards, residence permits | same |
| **TD2** | 2 lines × 36 | Residence permits, official travel cards | same |

These three layouts are standardised, so the reader knows no national particularity whatsoever. It reads a structure, verifies the checksums, and exposes the issuing state verbatim. A conforming Swiss, German, Italian or Brazilian card is therefore read with no additional work.

TD2 notably covers **European residence permits**: [Regulation (EC) 1030/2002](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32002R1030) requires a machine-readable zone conforming to ICAO standards without fixing the format — TD1 and TD2 are both valid, and both are read.

`extractDocument` and `parseMrz` distinguish two things that are too often conflated:

```ts
mrz.paysEmetteur            // 'CHE' — state that issued the document
mrz.identite.nationalite    // 'FRA' — holder's nationality
mrz.codeDocument            // 'ID'  — raw code from the MRZ
mrz.categorie               // 'carte-identite' | 'passeport' | 'inconnu'
```

`categorie` is derived from the **first** character of the document code only (`P` passport, `A`/`C`/`I` other official document). The second character has never been standardised — ICAO only harmonises it from the 9th edition of the specification onwards — so it is exposed verbatim in `codeDocument` and never interpreted.

### National formats — France only

| Format | Documents | An equivalent where you live? |
|---|---|---|
| **2D-DOC** (ANTS) | 2021 ID card, official certificates | Several states have their own signed 2D code. The parser is structurally reusable. |
| **NIR** (mod-97 key) | Health card (Vitale) | Any national number carrying a check key parses on the same principle. |
| **IDFRA** | Pre-2021 French ID card | Pre-ICAO national layouts exist elsewhere too. |

### Verified against a specimen

This table is distinct from the two above: it does not state what is *readable*, but what a test suite actually covers **today**.

| State | Documents | Formats | Specimen |
|---|---|---|---|
| 🇫🇷 France | 2021 ID card, pre-2021 ID card, passport, health card | TD1, IDFRA, TD3, 2D-DOC, NIR | MARTIN, LOISEAU, ANTS specimens |
| 🇨🇭 Switzerland | ID card | TD1 | MUSTER Hans Peter (fictitious) |
| 🇩🇪 Germany | Passport | TD3 | Erika Mustermann — country code `D<<` |
| 🌐 "Utopia" | Passport, residence permit | TD3, TD2 | ICAO 9303, parts 4 and 6 |

**Your country is missing? That does not mean it is unreadable** — only that nobody has verified it yet. This is the single most useful contribution to the project, and it requires writing no code: [open a "country format" issue](https://github.com/lau-sam/identite-ts/issues/new?template=country-format.yml).

> [!CAUTION]
> **Never attach the photo or the data of a real document** to an issue: issues are public, indexed by search engines, and their history stays readable after deletion. Use a public official specimen, a fictitious MRZ with recomputed checksums, or the output of `decrireCodeBarre` — designed to disclose nothing.

## Why not an LLM?

Because reading an identity document is a **standardised** problem, not a comprehension problem. An MRZ, a 2D-DOC, a NIR are fixed grammars equipped with check codes.

- **Determinism**: same bytes in, same output — indefinitely. No variation between two runs, no drift between two model versions.
- **Verifiability**: an ICAO checksum can be verified; a hallucination cannot. Every field carries `checksumValide`, so you know what is *proven* and what is *guessed*.
- **Nothing leaves the browser**: no network call, therefore no identity document handed to a third party.
- **Cost and latency**: a few KB of parsers, no per-photo cost, no round trip.

**Where an LLM is still better**: unstructured free text, unknown layouts, handwriting, non-Latin scripts outside the MRZ. That is not what this is.

## Known limitations

- **The address exists in no optical code.** It is only in the NFC chip (out of scope) or printed on the back of the pre-2021 ID card (often expired).
- The NIR only gives the year and month of birth, never the day; the century is inferred (`anneeProbable`).
- OCR quality depends on the photo: aim for a sharp, well-framed shot of the MRZ.
- The bundled INSEE registry covers the current edition: a merged municipality referenced by an old NIR may not resolve.
- By default, tesseract.js and zxing-wasm fetch their assets (WASM, language models) from a public CDN on first use. User data never leaves the browser, but for an air-gapped or strictly self-hosted deployment, serve those assets yourself via the `ocr.langPath`/`ocr.workerPath`/`ocr.corePath` and `datamatrix.wasmBaseUrl` options.

## Public datasets

The specimens listed above are for trying the library by hand. To **measure** it — MRZ read rate, localisation accuracy, regressions — annotated datasets are needed. These are public, and each licence was checked against the primary source (`license.txt` in the official repository, or the Zenodo record):

| Dataset | What it brings here | Licence |
|---|---|---|
| [DocXPand-25k](https://github.com/QuickSign/docxpand) ([arXiv:2407.20662](https://arxiv.org/abs/2407.20662)) | 24,994 images of fictitious documents composited onto real backgrounds, with annotated TD1/TD2/TD3 MRZs and fields — localisation, OCR, MRZ | CC BY-NC-SA 4.0 (**non-commercial**) |
| MIDV-500 and MIDV-2020 (`ftp://smartengines.com/midv-500/`) | Documents filmed in degraded conditions: glare, blur, partial framing — the raw material for the localisation/rectification work | CC BY-SA 2.5 |
| [MIDV-Holo](https://github.com/SmartEngines/midv-holo) | Originals and presentation attacks, annotated holograms — fraud detection | CC BY-SA 2.5 |
| [DLC-2021](https://zenodo.org/records/6466770) | Screen recaptures, photocopies, unlaminated documents — replayed documents | CC BY-SA 2.5 |
| [SmartDoc 2015](https://zenodo.org/records/1230218) | A4 documents filmed on a smartphone: not identity documents, but the reference for localisation in video | CC BY 4.0 |

**None of these datasets is redistributed here, and none will ever enter this repository or the npm package.** The project is MIT licensed, which permits commercial use: committing CC BY-NC-SA or CC BY-SA images would grant rights their authors never gave. Using them locally for evaluation is, by contrast, unproblematic. Two traps worth knowing: share-alike propagates to any derived or augmented dataset you publish, and the licence displayed on an arXiv page covers the paper, never the data.

## Contributing

Contributions are welcome, from any country. The most useful ones, in order:

1. **Report a format that is misread or missing for your country** — [country format issue](https://github.com/lau-sam/identite-ts/issues/new?template=country-format.yml). No code required. A link to a public official specimen is enough to make the problem tractable.
2. **Add a test against a public specimen** from your country: that is what moves a format from "probably read" to "verified".
3. **Implement a national format** (signed 2D code, number with a check key) following the pattern in `src/parsers/`.

Two firm rules:

- **No real document data** in an issue, a pull request or a test. Public specimens or fictitious data with recomputed checksums, only.
- **Never guess.** A field is filled only from a source validated by a check code, or explicitly marked `source: 'ocr'`. A format with no public specification is exposed raw, never interpreted.

## Roadmap

- [ ] **Document localisation and rectification**: detect the card's quadrilateral in the photo, correct perspective, normalise to ID-1. Lifts the framing constraint described in the limitations above.
- [ ] **Fraud detection**: spot a replayed document (screen photo, photocopy, capture), an altered one, or an inconsistent one — starting with clues verifiable without any registry (MRZ ↔ visual zone consistency, checksums, impossible dates).
- [ ] Cryptographic verification of the 2D-DOC signature (ECDSA, ANTS certificates — [official specifications](https://ants.gouv.fr/nos-missions/les-solutions-numeriques/2d-doc))
- [ ] NFC chip reading (port of [cnie-python-tools](https://github.com/hufon/cnie-python-tools), WebNFC)
- [ ] OCR of complementary visual zones (place of birth on ID card / passport)
- [ ] Historicised INSEE registry (merged municipalities)

## Development

```bash
npm install
npm test              # vitest
npm run build         # tsup → dist/
node scripts/build-insee.ts   # regenerates the municipality registry

cd playground && npm install && npm run dev   # local demo
```

## Licence and author

[MIT](./LICENSE). Built by [Coderkaine](https://www.coderkaine.com).
