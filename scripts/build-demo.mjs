import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const r = await build({
  stdin: { contents: `import { play, configure, themes, builtinSounds } from './src/index.ts'; import { autoBind } from './src/auto.ts'; autoBind(); window.Tactus = { play, configure, themes, builtinSounds };`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', minify: true, write: false,
});
const html = readFileSync('demo/demo.src.html', 'utf8').replace('<script>', `<script>${r.outputFiles[0].text}</script><script>`);
writeFileSync('demo/index.html', html);
console.log('demo/index.html', (html.length / 1024).toFixed(1) + ' KB');
