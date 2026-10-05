// UI 동일 기능 대조: tools/ui_inventory_before.json(개편 전)의 모든 항목이 새 UI에도 있는지 확인한다.
// 항목 = id가 있으면 id, 없으면 (태그, 텍스트/aria-label/title). 텍스트는 새 UI의 어떤 요소의 텍스트·aria-label·title·placeholder에 있어도 인정한다.
// 의도적으로 옮기거나 합친 항목은 tools/ui_mapping.json 에 새 위치와 이유를 적는다(적히지 않은 사라짐이 있으면 실패).
// 사용: SABARI_URL=<주소> node e2e/ui_parity.mjs [출력 json]
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectStates, norm } from './ui_inventory.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'ui_inventory_before.json'), 'utf-8'));
const mapping = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'ui_mapping.json'), 'utf-8'));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
const bin = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, 1200, 900); g.strokeStyle = '#555'; for (let x = 0; x < 1200; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 900); g.stroke(); } for (let y = 0; y < 900; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(1200, y); g.stroke(); } return c.toDataURL('image/png').split(',')[1]; });
const dl = path.join(os.tmpdir(), 'sabari_synth_dieline.png'); fs.writeFileSync(dl, Buffer.from(bin, 'base64'));
const items = await collectStates(p, { glb: path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb'), dieline: dl });
await b.close();

const ids = new Set(items.filter((i) => i.id).map((i) => i.id));
const strings = new Set();
for (const i of items) for (const k of ['text', 'aria-label', 'title', 'placeholder']) if (i[k]) strings.add(norm(i[k]));
const missing = [], moved = [], textChanged = [];
for (const it of before.items) {
  const label = it.id ? `#${it.id}` : `${it.tag}|${it.text ?? it['aria-label'] ?? it.title ?? ''}`;
  const texts = ['text', 'aria-label', 'title', 'placeholder'].map((k) => it[k]).filter(Boolean).map(norm);
  if (it.id) {
    if (!ids.has(it.id)) { const m = mapping.ids[it.id]; if (m) moved.push({ item: label, ...m }); else missing.push({ item: label, text: texts[0] ?? null }); continue; }
    // id는 있는데 텍스트가 바뀐 경우: 텍스트가 새 UI 어딘가에 있거나 매핑이 있어야 한다
    for (const t of texts) if (!strings.has(t) && !mapping.texts[t]) textChanged.push({ item: label, text: t });
    continue;
  }
  for (const t of texts.slice(0, 1)) {
    if (strings.has(t)) continue;
    const m = mapping.texts[t];
    if (m) moved.push({ item: label, text: t, ...(typeof m === 'string' ? { to: m } : m) }); else missing.push({ item: label, text: t });
  }
}
const out = { beforeCount: before.count, afterCount: items.length, afterIds: ids.size, beforeIds: before.items.filter((i) => i.id).length, missing, textChanged, mappedCount: moved.length, mapped: moved };
fs.writeFileSync(process.argv[2] ?? path.join(ROOT, 'verification', 'ui12', 'ui_parity.json'), JSON.stringify(out, null, 1));
console.log(`before ${before.count} / after ${items.length}, 매핑으로 설명된 이동·통합 ${moved.length}, 사라짐 ${missing.length}, 텍스트 변경(미설명) ${textChanged.length}`);
for (const m of missing.slice(0, 40)) console.log('  사라짐:', m.item, m.text ?? '');
for (const m of textChanged.slice(0, 20)) console.log('  텍스트 변경:', m.item, m.text);
if (missing.length || textChanged.length) process.exit(1);
