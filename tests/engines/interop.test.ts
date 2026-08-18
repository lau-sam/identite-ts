import { describe, expect, it } from 'vitest';
import { resoudreExport } from '../../src/engines/interop';

describe('resoudreExport', () => {
  const createWorker = () => 'worker';

  it('trouve un export nommé, à la racine du namespace', () => {
    expect(resoudreExport({ createWorker }, 'createWorker')).toBe(createWorker);
  });

  it('retombe sur « default » quand un bundler y a rangé le CommonJS', () => {
    // Forme rendue par Rollup/Vite pour un paquet CJS sans champ `exports` : c'est le cas de
    // tesseract.js, et c'est ce qui cassait la lecture une fois la lib empaquetée.
    expect(resoudreExport({ default: { createWorker } }, 'createWorker')).toBe(createWorker);
  });

  it('préfère la racine au « default » quand les deux existent', () => {
    const racine = () => 'racine';
    expect(
      resoudreExport({ createWorker: racine, default: { createWorker } }, 'createWorker'),
    ).toBe(racine);
  });

  it('échoue avec un message qui nomme l’export manquant', () => {
    expect(() => resoudreExport({}, 'createWorker')).toThrow(/createWorker/);
    expect(() => resoudreExport(undefined, 'createWorker')).toThrow(/createWorker/);
  });
});
