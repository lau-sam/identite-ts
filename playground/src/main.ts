import type { ExtractionResult } from 'identite-ts';
import { creerDatamatrixEngine, creerOcrEngine, decrireCodeBarre, extractDocument } from 'identite-ts';
import { type Passe, observer } from './passes';
import { pretraitements } from './pretraitement';
import { construireRapport, lireDimensions, lireOrientationExif } from './rapport';

// Le moteur OCR porte un worker : on le crée une fois et on le réutilise d'une analyse
// à l'autre, sinon chaque dépôt repaie le chargement du WASM.
let ocrReel: ReturnType<typeof creerOcrEngine> | undefined;

const zone = document.querySelector('#zone') as HTMLDivElement;
const fichier = document.querySelector('#fichier') as HTMLInputElement;
const statut = document.querySelector('#statut') as HTMLParagraphElement;
const resultat = document.querySelector('#resultat') as HTMLPreElement;
const apercu = document.querySelector('#apercu') as HTMLImageElement;
const diagnostic = document.querySelector('#diagnostic') as HTMLElement;
const diagnosticContenu = document.querySelector('#diagnostic-contenu') as HTMLPreElement;
const rapport = document.querySelector('#rapport') as HTMLElement;
const rapportContenu = document.querySelector('#rapport-contenu') as HTMLPreElement;
const rapportCopier = document.querySelector('#rapport-copier') as HTMLButtonElement;
const vignettes = document.querySelector('#vignettes') as HTMLElement;
const vignettesContenu = document.querySelector('#vignettes-contenu') as HTMLDivElement;

/** Montre ce que l'OCR reçoit réellement. Contient le document : jamais partagé. */
async function afficherPretraitements(f: File): Promise<void> {
  vignettesContenu.replaceChildren();
  for (const { legende, canvas } of await pretraitements(f)) {
    const figure = document.createElement('figure');
    const titre = document.createElement('figcaption');
    titre.textContent = legende;
    figure.append(canvas, titre);
    vignettesContenu.append(figure);
  }
  vignettes.style.display = 'block';
}

rapportCopier.addEventListener('click', () => {
  void navigator.clipboard.writeText(rapportContenu.textContent ?? '').then(() => {
    rapportCopier.textContent = 'Copié ✓';
    setTimeout(() => {
      rapportCopier.textContent = 'Copier le rapport';
    }, 2000);
  });
});

zone.addEventListener('click', () => fichier.click());
fichier.addEventListener('change', () => {
  const f = fichier.files?.[0];
  if (f) void analyser(f);
});

zone.addEventListener('dragover', (e) => {
  e.preventDefault();
  zone.classList.add('actif');
});
zone.addEventListener('dragleave', () => zone.classList.remove('actif'));
zone.addEventListener('drop', (e) => {
  e.preventDefault();
  zone.classList.remove('actif');
  const f = e.dataTransfer?.files[0];
  if (f) void analyser(f);
});

const LIBELLES: Record<ExtractionResult['document'], string> = {
  'carte-identite': "Carte d'identité",
  passeport: 'Passeport',
  'carte-vitale': 'Carte Vitale',
  inconnu: 'Document non reconnu',
};

/**
 * Libellé lisible du document. Le pays émetteur est affiché tel quel : le code
 * ICAO à trois lettres n'est pas toujours un code ISO (`D` pour l'Allemagne),
 * le traduire demanderait une table que le playground n'a pas à embarquer.
 */
function libelleDocument(extraction: ExtractionResult): string {
  const libelle = LIBELLES[extraction.document];
  return extraction.paysEmetteur ? `${libelle} (${extraction.paysEmetteur})` : libelle;
}

/**
 * Décrit les codes 2D que la bibliothèque n'a pas su interpréter. Le résumé
 * est dépourvu de donnée personnelle : il peut être joint à un rapport de bug
 * sur un format inconnu, ce que le contenu brut ne permet pas.
 */
function afficherDiagnostic(extraction: ExtractionResult): void {
  const inconnus = (extraction.raw.codesBarres ?? []).filter((c) => !c.texte.startsWith('DC'));
  if (inconnus.length === 0) return;
  diagnosticContenu.textContent = JSON.stringify(inconnus.map(decrireCodeBarre), null, 2);
  diagnostic.style.display = 'block';
}

async function analyser(f: File): Promise<void> {
  apercu.src = URL.createObjectURL(f);
  apercu.style.display = 'block';
  resultat.textContent = '';
  diagnostic.style.display = 'none';
  rapport.style.display = 'none';
  vignettes.style.display = 'none';
  statut.textContent = 'Analyse en cours… (le premier passage télécharge les moteurs OCR/WASM)';
  const debut = performance.now();
  try {
    const [dimensions, orientationExif] = await Promise.all([
      lireDimensions(f),
      lireOrientationExif(f),
      afficherPretraitements(f),
    ]);
    ocrReel ??= creerOcrEngine();
    const passes: Passe[] = [];
    const extraction = await extractDocument(f, {
      engines: { ocr: observer(ocrReel, passes), datamatrix: creerDatamatrixEngine() },
    });
    const dureeMs = performance.now() - debut;
    statut.textContent = `${libelleDocument(extraction)} — source : ${extraction.source ?? 'aucune'} — confiance : ${(extraction.confidence * 100).toFixed(0)} % — ${(dureeMs / 1000).toFixed(1)}s`;
    afficherDiagnostic(extraction);
    resultat.textContent = JSON.stringify(extraction, null, 2);
    rapportContenu.textContent = construireRapport({
      fichier: f,
      extraction,
      dureeMs,
      dimensions,
      orientationExif,
      passes,
    });
    rapport.style.display = 'block';
  } catch (erreur) {
    statut.textContent = `Erreur : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
}
