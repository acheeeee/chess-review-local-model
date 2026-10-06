import { readFileSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const engineDir = resolve('node_modules/stockfish/bin');
const engineFiles = new Map([
  ['/stockfish-19-lite-single.js', 'stockfish-19-lite-single.js'],
  ['/stockfish-19-lite-single.wasm', 'stockfish-19-lite-single.wasm'],
]);

// The engine is kept in node_modules during development and emitted next to the
// app at build time. It never makes a network request once the app is running.
function localStockfish() {
  return {
    name: 'local-stockfish',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = engineFiles.get(request.url?.split('?')[0]);
        if (!file) return next();
        response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        createReadStream(resolve(engineDir, file)).pipe(response);
      });
    },
    generateBundle() {
      for (const file of engineFiles.values()) {
        this.emitFile({ type: 'asset', fileName: file, source: readFileSync(resolve(engineDir, file)) });
      }
    },
  };
}

export default defineConfig({ plugins: [localStockfish()] });
