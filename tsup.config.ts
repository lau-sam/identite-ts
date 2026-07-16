import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'insee/index': 'src/insee/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // tesseract.js et zxing-wasm restent des dépendances externes,
  // chargées par import() dynamique uniquement quand extractDocument tourne.
  external: ['tesseract.js', 'zxing-wasm'],
});
