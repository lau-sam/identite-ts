import { extractDocument } from 'identite-ts';

const zone = document.querySelector('#zone') as HTMLDivElement;
const fichier = document.querySelector('#fichier') as HTMLInputElement;
const statut = document.querySelector('#statut') as HTMLParagraphElement;
const resultat = document.querySelector('#resultat') as HTMLPreElement;
const apercu = document.querySelector('#apercu') as HTMLImageElement;

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

async function analyser(f: File): Promise<void> {
  apercu.src = URL.createObjectURL(f);
  apercu.style.display = 'block';
  resultat.textContent = '';
  statut.textContent = 'Analyse en cours… (le premier passage télécharge les moteurs OCR/WASM)';
  const debut = performance.now();
  try {
    const extraction = await extractDocument(f);
    const duree = ((performance.now() - debut) / 1000).toFixed(1);
    statut.textContent = `Document : ${extraction.document} — source : ${extraction.source ?? 'aucune'} — confiance : ${(extraction.confidence * 100).toFixed(0)} % — ${duree}s`;
    resultat.textContent = JSON.stringify(extraction, null, 2);
  } catch (erreur) {
    statut.textContent = `Erreur : ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
}
