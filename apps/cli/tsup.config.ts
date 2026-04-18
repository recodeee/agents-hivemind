import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: false,
  minify: false,
  banner: { js: '#!/usr/bin/env node' },
  noExternal: [/^@cavemem\//],
  define: { __CAVEMEM_VERSION__: JSON.stringify(version) },
});
