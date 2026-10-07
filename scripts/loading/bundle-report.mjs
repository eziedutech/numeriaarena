// What the game's main code is made of: builds codes/xrclient into a
// throwaway folder with a plugin that writes, for every chunk, the bytes each
// package or source folder adds. For planning the split of the main file.
//
//   cd codes/xrclient && NODE_ENV=production node ../../scripts/loading/bundle-report.mjs
//
// Writes ../../scripts/loading/bundle-report.txt.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { build } from '../../codes/xrclient/node_modules/vite/dist/node/index.js';

const OUT = resolve('../../scripts/loading/bundle-report.txt');

function group(id) {
  const clean = id.replace(/\\/g, '/').replace(/^\0/, '').split('?')[0];
  const nm = clean.lastIndexOf('/node_modules/');
  if (nm >= 0) {
    const parts = clean.slice(nm + 14).split('/');
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const src = clean.indexOf('/xrclient/src/');
  if (src >= 0) {
    const rest = clean.slice(src + 14).split('/');
    return rest.length > 1 ? `src/${rest[0]}/` : `src/${rest[0]}`;
  }
  const content = clean.indexOf('/codes/content/');
  if (content >= 0) return `content/${clean.slice(content + 15).split('/')[0]}`;
  return clean.slice(-60);
}

const report = {
  name: 'numeria-bundle-report',
  generateBundle(_o, bundle) {
    const lines = [];
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk' || chunk.code.length < 100_000) continue;
      const by = new Map();
      for (const [id, m] of Object.entries(chunk.modules)) by.set(group(id), (by.get(group(id)) ?? 0) + m.renderedLength);
      lines.push(`${chunk.fileName} ${chunk.code.length} bytes${chunk.isEntry ? ' (entry)' : ''}`);
      for (const [g, n] of [...by].sort((a, b) => b[1] - a[1])) if (n >= 10_000) lines.push(`  ${String(n).padStart(9)}  ${g}`);
    }
    writeFileSync(OUT, `${lines.join('\n')}\n`);
  },
};

await build({ logLevel: 'warn', plugins: [report], build: { outDir: resolve('../../scripts/loading/.dist'), emptyOutDir: true, sourcemap: false } });
console.log(`written ${OUT}`);
