import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  fixedExtension: true,
  dts: true,
  platform: 'node',
  target: 'node24',
  clean: true,
});
