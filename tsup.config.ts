import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', svelte: 'src/svelte.ts', auto: 'src/auto.ts' },
  format: ['esm'], dts: true, splitting: true, clean: true, target: 'es2020', minify: false
});
