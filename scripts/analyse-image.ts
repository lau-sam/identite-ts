/**
 * Analyse une image de document en Node (sans navigateur) : Datamatrix via
 * zxing-wasm puis OCR via tesseract.js, et passe les résultats aux parseurs.
 * Outil de développement pour valider des spécimens avant la démo.
 *
 * Usage : node scripts/analyse-image.ts <image> [image…]
 */
import { readFile } from 'node:fs/promises';
// Importe le build (npm run build) : Node ne résout pas les imports TS sans extension.
import { detecterMrz, detecterNir, parse2ddoc, parseMrz, parseNir } from '../dist/index.js';

const fichiers = process.argv.slice(2);
if (!fichiers.length) {
  console.error('Usage : node scripts/analyse-image.ts <image> [image…]');
  process.exit(1);
}

for (const fichier of fichiers) {
  console.log(`\n━━━ ${fichier} ━━━`);
  const octets = new Uint8Array(await readFile(fichier));

  // 1. Datamatrix / QR
  try {
    const { readBarcodes } = await import('zxing-wasm/reader');
    const codes = await readBarcodes(octets, {
      formats: ['DataMatrix', 'QRCode'],
      tryHarder: true,
      textMode: 'Plain',
    });
    for (const code of codes.filter((c) => c.isValid)) {
      console.log(`• ${code.format} détecté (${code.text.length} car.)`);
      if (code.text.startsWith('DC')) {
        const doc = parse2ddoc(code.text);
        console.log('  2D-DOC :', JSON.stringify(doc.identite));
      }
    }
    if (!codes.some((c) => c.isValid)) console.log('• aucun Datamatrix/QR');
  } catch (e) {
    console.log('• zxing :', (e as Error).message);
  }

  // 2. OCR MRZ
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('fra');
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
      preserve_interword_spaces: '1',
    });
    const mrzTexte = (await worker.recognize(fichier)).data.text;
    const lignes = detecterMrz(mrzTexte);
    if (lignes) {
      console.log('• MRZ détectée :', lignes);
      const mrz = parseMrz(lignes);
      console.log(`  ${mrz.document} — valide=${mrz.valide} :`, JSON.stringify(mrz.identite));
    } else {
      console.log('• pas de MRZ');
    }

    // 3. OCR généraliste → NIR
    await worker.setParameters({ tessedit_char_whitelist: '' });
    const texte = (await worker.recognize(fichier)).data.text;
    const nirCandidat = detecterNir(texte);
    if (nirCandidat) {
      const nir = parseNir(nirCandidat);
      console.log(`• NIR détecté : ${nir.nir} (clé valide : ${nir.cleValide ?? 'absente'})`);
      console.log(
        '  ',
        JSON.stringify({ sexe: nir.sexe, naissance: nir.naissance, lieu: nir.lieuNaissance }),
      );
    } else {
      console.log('• pas de NIR');
    }
    await worker.terminate();
  } catch (e) {
    console.log('• tesseract :', (e as Error).message);
  }
}
