/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig, type Plugin } from 'vite';

/**
 * Production builds only: the loading screen in index.html fetches the
 * game's code itself, counting the bytes against the real size written here,
 * so it can show an honest percentage; then it starts the code from the
 * browser cache. The module script tag becomes `window.NUMERIA_BOOT`.
 */
function bootProgress(): Plugin {
  return {
    name: 'numeria-boot-progress',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      const entry = files.find((f) => f.type === 'chunk' && f.isEntry);
      const html = files.find((f) => f.type === 'asset' && f.fileName === 'index.html');
      if (!entry || entry.type !== 'chunk' || !html || html.type !== 'asset') return;
      const page = String(html.source);
      const tag = /<script type="module" crossorigin src="([^"]+)"><\/script>/.exec(page);
      if (!tag || !tag[1].endsWith(entry.fileName)) {
        this.warn('the module script tag was not found; the loading screen shows no percentage');
        return;
      }
      const boot = { src: tag[1], bytes: Buffer.byteLength(entry.code, 'utf8') };
      html.source = page.replace(tag[0], `<script>window.NUMERIA_BOOT = ${JSON.stringify(boot)};</script>`);
    },
  };
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? filesUnder(dir, `${prefix}${d.name}/`) : [`${prefix}${d.name}`],
  );
}

/**
 * Production builds only: sw.js, a service worker that keeps the whole game
 * on the device after the first visit, so practice and robot races open and
 * play without a network (scripts/offline-worker.js holds its code; the list
 * of files and a version made from them are written in front of it here).
 */
function offlineWorker(): Plugin {
  return {
    name: 'numeria-offline-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Names in the bundle carry a content hash; public files are taken with their sizes.
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const pub = filesUnder('public').map((f) => ({ f, size: statSync(join('public', f)).size }));
      const version = createHash('sha256')
        .update(JSON.stringify([built.sort(), pub]))
        .digest('hex')
        .slice(0, 12);
      const files = ['./', ...built.map((f) => `./${f}`), ...pub.map((p) => `./${p.f}`)];
      const code = readFileSync('scripts/offline-worker.js', 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const VERSION = ${JSON.stringify(version)};\nconst FILES = ${JSON.stringify(files)};\n${code}`,
      });
    },
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), bootProgress(), offlineWorker()],
  server: {
    host: '0.0.0.0',
    port: 3322,
    strictPort: true,
    open: false,
    // Shared content (templates, skills) lives beside the app in codes/content.
    fs: { allow: ['.', '../content'] },
    // The API (codes/backrust/server) runs beside it; same paths as production.
    proxy: { '/api': 'http://localhost:3321' },
  },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (three@0.185 vs app super-three@0.181). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
