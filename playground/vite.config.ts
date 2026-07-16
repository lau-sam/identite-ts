import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Le playground consomme directement les sources de la bibliothèque :
// toute modification dans ../src est visible à chaud.
export default defineConfig({
  resolve: {
    alias: {
      'identite-ts/insee': fileURLToPath(new URL('../src/insee/index.ts', import.meta.url)),
      'identite-ts': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
});
