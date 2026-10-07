/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

/** The hand reader's runtime for the smartboard camera (src/board/camera.ts), with and without SIMD. */
const CAMERA_WASM = 'node_modules/@mediapipe/tasks-vision/wasm';
const CAMERA_FILES = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'];

/**
 * camera/wasm/ beside the game, from the installed package rather than kept
 * in the repository: served by the dev server, written into the build. Like
 * the model in public/camera/, it is left out of the offline worker's list,
 * so only a board that turns the camera on fetches it (and then keeps it).
 */
function cameraFiles(): Plugin {
  return {
    name: 'numeria-camera-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = /\/camera\/wasm\/([^/?]+)/.exec(req.url ?? '')?.[1];
        if (!name || !CAMERA_FILES.includes(name)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(join(CAMERA_WASM, name)));
      });
    },
    generateBundle() {
      for (const name of CAMERA_FILES) this.emitFile({ type: 'asset', fileName: `camera/wasm/${name}`, source: readFileSync(join(CAMERA_WASM, name)) });
    },
  };
}

/** Kept for the camera only, never fetched ahead. */
const notKept = (f: string) => !f.startsWith('camera/');

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
      // Each file with a hash of its content, so a new build's worker can keep
      // the unchanged ones from the last build instead of fetching them again.
      const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 16);
      const built = Object.values(bundle)
        .filter((f) => !f.fileName.endsWith('.map') && notKept(f.fileName))
        .map((f): [string, string] => [`./${f.fileName}`, hash(f.type === 'chunk' ? f.code : f.source)]);
      const pub = filesUnder('public')
        .filter(notKept)
        .map((f): [string, string] => [`./${f}`, hash(readFileSync(join('public', f)))]);
      const listed = [...built, ...pub].sort(([a], [b]) => (a < b ? -1 : 1));
      const version = hash(JSON.stringify(listed)).slice(0, 12);
      // The page has no hash: it is always asked of the network.
      const files = [['./', null], ...listed];
      const code = readFileSync('scripts/offline-worker.js', 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const VERSION = ${JSON.stringify(version)};\nconst FILES = ${JSON.stringify(files)};\n${code}`,
      });
    },
  };
}

/** Where the icon package's icons live, one file each. */
const ICONS = 'node_modules/@pmndrs/uikit-lucide/dist';

/**
 * The icon package is pointed at src/ui-icons.ts, which keeps only the icons
 * the panels use (it explains why). A panel naming an icon that file lacks
 * would show nothing, so the build stops instead, naming it.
 */
function onlyUsedIcons(): Plugin {
  return {
    name: 'numeria-only-used-icons',
    buildStart() {
      const kept = readFileSync('src/ui-icons.ts', 'utf8');
      for (const panel of filesUnder('public/ui').filter((f) => f.endsWith('.uikitml'))) {
        const tags = readFileSync(join('public/ui', panel), 'utf8').matchAll(/<([A-Z][A-Za-z0-9]*)/g);
        for (const [, tag] of tags) {
          if (existsSync(join(ICONS, `${tag}.js`)) && !kept.includes(`/${tag}.js'`)) {
            this.error(`public/ui/${panel} uses the icon ${tag}: add it to src/ui-icons.ts`);
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [iwsdkDev(), onlyUsedIcons(), cameraFiles(), bootProgress(), offlineWorker()],
  server: {
    host: '0.0.0.0',
    port: 3322,
    strictPort: true,
    open: false,
    // Shared content (templates, skills) lives beside the app in codes/content.
    fs: { allow: ['.', '../content'] },
    // The API (codes/backrust/server) runs beside it; same paths as production.
    proxy: { '/api': { target: 'http://localhost:3321', ws: true } },
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
    alias: [{ find: /^@pmndrs\/uikit-lucide$/, replacement: resolve('src/ui-icons.ts') }],
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
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
