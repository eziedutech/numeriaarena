// Enters XR in the managed emulator window and seats the head in front of the book.
// Usage (dev server must be up): node scripts/emulator/seat.mjs
import * as d from './drive.mjs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
const cli = (...a) => execFileSync(`${homedir()}/.bun/bin/bun.exe`, ['x', 'iwsdk', ...a], { cwd: new URL('../../codes/xrclient/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
cli('xr', 'enter');
await new Promise((r) => setTimeout(r, 5000));
cli('xr', 'set-input-mode', '--input-json', '{"mode":"hand"}');
await new Promise((r) => setTimeout(r, 1500));
d.desk();
cli('xr', 'set-transform', '--input-json', JSON.stringify({ device: 'headset', position: d.w(0, 0.42, 0.45) }));
cli('xr', 'look-at', '--input-json', JSON.stringify({ device: 'headset', target: d.w(0, 0.06, 0) }));
d.tip(0.15, 0.12, 0.3);
console.log('seated in front of the book');
