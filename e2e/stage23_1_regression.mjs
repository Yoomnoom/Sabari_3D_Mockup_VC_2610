import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'verification', 'stage23-1', 'regression');
fs.mkdirSync(out, { recursive: true });
const scripts = [
  'base10', 'bleed_id', 'closed_click', 'collapse', 'colors', 'dieline', 'dims', 'draft', 'iso_faces', 'legacy_draft',
  'mouse', 'movemode', 'ratio', 'run', 'scroll_fix', 'sharp', 'shortcuts', 'shot_panel', 'space_repro', 'viewkeep',
];
const rows = [];
for (const name of scripts) {
  const started = performance.now();
  const r = spawnSync(process.execPath, [path.join(root, 'e2e', `${name}.mjs`)], {
    cwd: root, env: { ...process.env, SABARI_URL: process.env.SABARI_URL ?? 'http://127.0.0.1:8874/' }, encoding: 'utf8', timeout: 180_000,
  });
  fs.writeFileSync(path.join(out, `${name}.log`), `${r.stdout ?? ''}${r.stderr ?? ''}`);
  const row = { script: name, exit: r.status ?? 'timeout', seconds: +((performance.now() - started) / 1000).toFixed(1) };
  rows.push(row); console.log(`${name}: ${row.exit}`);
}
fs.writeFileSync(path.join(out, 'runs.json'), JSON.stringify(rows, null, 2));
process.exit(rows.some(r => r.exit !== 0) ? 1 : 0);
