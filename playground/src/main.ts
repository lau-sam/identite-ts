import type { ExtractionResult } from 'identite-ts';
import { decrireCodeBarre, extractDocument } from 'identite-ts';

const zone = document.querySelector('#zone') as HTMLDivElement;
const fichier = document.querySelector('#fichier') as HTMLInputElement;
const statut = document.querySelector('#statut') as HTMLParagraphElement;
const resultat = document.querySelector('#resultat') as HTMLPreElement;
const apercu = document.querySelector('#apercu') as HTMLImageElement;
const diagnostic = document.querySelector('#diagnostic') as HTMLElement;
const diagnosticContenu = document.querySelector('#diagnostic-contenu') as HTMLPreElement;

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
  statut.textContent = 'Analyse en cours… (le premier passage télécharge les moteurs OCR/WASM)';
  const debut = performance.now();
  try {
    const extraction = await extractDocument(f);
    const duree = ((performance.now() - debut) / 1000).toFixed(1);
    statut.textContent = `${libelleDocument(extraction)} — source : ${extraction.source ?? 'aucune'} — confiance : ${(extraction.confidence * 100).toFixed(0)} % — ${duree}s`;
    afficherDiagnostic(extraction);
    resultat.textContent = JSON.stringify(extraction, null, 2);
  } catch (erreur) {
    statut.textContent = `Erreur : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
}
