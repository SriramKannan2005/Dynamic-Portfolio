#!/usr/bin/env node
/**
 * Scans the built dist/ folder for secrets. Run after `npm run build`:
 *   npm run check:secrets
 * - "AIza..." keys: the ONLY one allowed is the public Firebase web API key
 *   (VITE_FIREBASE_API_KEY). Any other AIza key (e.g. a Gemini key) fails.
 * - Apps Script URLs, server-only env var names and private keys must not appear.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = 'dist';
if (!existsSync(root)) { console.error('dist/ not found: run npm run build first'); process.exit(1); }

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}
const env = { ...loadEnv('.env'), ...loadEnv('.env.local'), ...process.env };
const allowedFirebaseKey = env.VITE_FIREBASE_API_KEY || '';
const serverSecrets = ['GEMINI_API_KEY', 'SEND_EMAIL_URL', 'SHEETS_SYNC_URL', 'SHEETS_VIEW_URL'].map((k) => env[k]).filter((v) => v && v.length > 8);

const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.txt', '.xml', '.svg', '.map', '.webmanifest']);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p); else if (TEXT.has(extname(p))) files.push(p);
  }
})(root);

const checks = [
  { name: 'AIza (Google API key)', re: /AIza[0-9A-Za-z_-]{35}/g, allow: (m) => m === allowedFirebaseKey },
  { name: 'script.google.com/macros', re: /script\.google\.com\/macros/g },
  { name: 'docs.google.com/spreadsheets', re: /docs\.google\.com\/spreadsheets/g },
  { name: 'server env var names', re: /\b(GEMINI_API_KEY|SEND_EMAIL_URL|SHEETS_SYNC_URL|SHEETS_VIEW_URL|ADMIN_UIDS(?!")|GOOGLE_APPLICATION_CREDENTIALS)\b/g },
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'generativelanguage endpoint', re: /generativelanguage\.googleapis\.com/g },
];

let failed = 0;
const report = [];
for (const c of checks) {
  const hits = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(c.re)) if (!(c.allow && c.allow(m[0]))) hits.push(`${f}`);
  }
  const allowedNote = c.allow ? ` (public Firebase web key ${files.some((f) => allowedFirebaseKey && readFileSync(f, 'utf8').includes(allowedFirebaseKey)) ? 'present, expected' : 'not present'})` : '';
  report.push(`${hits.length ? 'FAIL' : 'ok  '}  ${c.name}: ${hits.length} disallowed hit(s)${allowedNote}${hits.length ? ' -> ' + [...new Set(hits)].join(', ') : ''}`);
  failed += hits.length;
}
for (const v of serverSecrets) {
  const leaked = files.filter((f) => readFileSync(f, 'utf8').includes(v));
  report.push(`${leaked.length ? 'FAIL' : 'ok  '}  value of a server-only env var: ${leaked.length} file(s)`);
  failed += leaked.length;
}
console.log(`Scanned ${files.length} text files in dist/\n` + report.join('\n'));
process.exit(failed ? 1 : 0);
