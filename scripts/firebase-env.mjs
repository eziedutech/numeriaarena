// Turns the Firebase web config pasted from the console (credentials/firebase-web.json,
// a JS snippet) into .env.local for Vite in codes/xrclient and codes/frontrouter.
// All of these files stay out of git.
// Usage: node scripts/firebase-env.mjs   (prints the project id only)
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const src = readFileSync(new URL('credentials/firebase-web.json', root), 'utf8');
const fields = { apiKey: 'API_KEY', authDomain: 'AUTH_DOMAIN', projectId: 'PROJECT_ID', appId: 'APP_ID' };
const lines = [];
const found = {};
for (const [key, env] of Object.entries(fields)) {
  const m = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`).exec(src);
  if (!m) {
    console.error(`missing ${key} in credentials/firebase-web.json`);
    process.exit(1);
  }
  found[key] = m[1];
  lines.push(`VITE_FIREBASE_${env}=${m[1]}`);
}
// The game and the web pages (teacher sign-in, admin) use the same project.
for (const app of ['xrclient', 'frontrouter']) {
  writeFileSync(new URL(`codes/${app}/.env.local`, root), `${lines.join('\n')}\n`);
}
console.log(found.projectId);
