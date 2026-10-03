// 모든 e2e 스크립트를 하나씩 실행해 통과/실패 표를 만든다. 사용: node e2e/run_all.mjs [표파일명] [제외할 이름...]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? 'e2e_table.json';
const skip = new Set(['run_all', 'unity_common', 'validate_glb', 'shot_panel', ...process.argv.slice(3)]);
const names = fs.readdirSync(path.join(root, 'e2e')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).filter((n) => !skip.has(n)).sort();
const rows = [];
for (const n of names) {
  const t0 = Date.now();
  const r = spawnSync('node', [path.join(root, 'e2e', `${n}.mjs`)], { cwd: root, encoding: 'utf8', timeout: 400000, env: { ...process.env, SABARI_URL: process.env.SABARI_URL ?? 'http://127.0.0.1:8766/' }, maxBuffer: 64 * 1024 * 1024 });
  const err = (r.stderr || '').trim();
  const bad = r.status !== 0 || /Error|Timeout/.test(err);
  rows.push({ script: n, exit: r.status, pass: !bad, sec: Math.round((Date.now() - t0) / 1000), note: bad ? (err || String(r.error ?? '')).split('\n').slice(0, 3).join(' | ').slice(0, 300) : '' });
  console.log(n, bad ? 'FAIL' : 'ok', rows.at(-1).note);
}
fs.writeFileSync(path.join(root, 'verification', out), JSON.stringify(rows, null, 2));
