import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/client.ts',
    'src/server.ts',
    'src/transport.ts',
    'src/in-memory.ts',
    'src/stdio.ts',
    'src/sse.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: false,
  splitting: false,
  treeshake: true,
});
