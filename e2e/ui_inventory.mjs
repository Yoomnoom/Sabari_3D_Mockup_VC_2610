// UI 컨트롤 목록 추출기: 앱을 여러 상태(기본, 하단 사용, 축 잠금, 비율 알림, 외부 GLB, 칼선 분할 대화상자)로 만들고
// 문서의 모든 요소에서 id·태그·고유 텍스트·aria-label·title·placeholder·option을 모은다(숨김 요소 포함).
// 사용: SABARI_URL=<주소> node e2e/ui_inventory.mjs <출력 json 경로>   (tools/ui_inventory_before.json = 개편 전, 새 UI는 e2e/ui_parity.mjs가 같은 함수를 쓴다)
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const norm = (t) => (t ?? '').replace(/\s+/g, ' ').trim();

/** 페이지 안에서 실행: 현재 DOM의 항목 목록 */
export const collectInPage = () => {
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'svg', 'path', 'canvas', 'img', 'br'].includes(tag)) continue;
    const text = own(el);
    const attrs = {};
    for (const a of ['aria-label', 'title', 'placeholder']) { const v = el.getAttribute(a); if (v) attrs[a] = v.replace(/\s+/g, ' ').trim(); }
    if (tag === 'input' && (el.type === 'range' || el.type === 'number')) attrs.range = `${el.min}~${el.max}/${el.step}`;
    if (tag === 'option') attrs.value = el.value;
    if (!el.id && !text && !Object.keys(attrs).length) continue;
    out.push({ id: el.id || null, tag, type: el.type || null, text: text || null, ...attrs, className: typeof el.className === 'string' ? el.className.slice(0, 60) : '' });
  }
  return out;
};

export async function collectStates(p, fixtures) {
  const all = new Map(); // key -> item (+ states)
  const add = (state, items) => { for (const it of items) { const key = it.id ? `#${it.id}` : `${it.tag}|${it.text ?? ''}|${it['aria-label'] ?? ''}|${it.title ?? ''}`; const prev = all.get(key); if (prev) prev.states.push(state); else all.set(key, { ...it, states: [state] }); } };
  const snap = async (state) => add(state, await p.evaluate(collectInPage));
  await snap('default');
  const goTab = async (name) => { const id = '#tab' + name[0].toUpperCase() + name.slice(1); if (await p.locator(id).count()) await p.click(id); }; // 새 UI의 작업 탭(옛 UI에는 없음)
  // 하단 몸통 사용
  await goTab('design');
  if (await p.locator('#useBase').count()) { if (!(await p.isChecked('#useBase'))) await p.check('#useBase'); await snap('use-base'); if (await p.locator('#tab_base').count()) { await p.click('#tab_base'); await snap('use-base-faces'); await p.click('#tab_lid'); } await p.uncheck('#useBase'); }
  // 축 잠금
  await goTab('view');
  if (await p.locator('#lockToggle').count()) { await p.click('#lockToggle'); await snap('lock-on'); await p.click('#lockToggle'); }
  // 비율 알림: 가로를 크게 바꿔 비율 변경 배너를 띄운다
  try { await p.evaluate(() => { const s = window.__sabari; const pr = s.getParams(); pr.baseW = Math.round(pr.baseW * 1.3); s.applyParams(pr); }); await p.waitForTimeout(300); await snap('ratio-changed'); await p.evaluate(() => { const s = window.__sabari; s.applyParams(s.getBaseline()); }); } catch { /* 앱이 없는 경우 건너뜀 */ }
  // 외부 GLB
  if (fixtures?.glb && await p.locator('#fileGlb').count()) { await p.setInputFiles('#fileGlb', fixtures.glb); await p.waitForTimeout(800); await snap('external-glb'); if (await p.locator('#btnExtGlbBack').count()) await p.click('#btnExtGlbBack'); await p.waitForTimeout(300); }
  // 칼선 분할 대화상자(합성 칼선 이미지)
  await goTab('design');
  if (fixtures?.dieline && await p.locator('#fileDieline').count()) { await p.setInputFiles('#fileDieline', fixtures.dieline); await p.waitForTimeout(1200); await snap('split-dialog'); if (await p.locator('#btnSplitCancel').count()) await p.click('#btnSplitCancel'); await p.waitForTimeout(300); }
  return [...all.values()];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
  // 합성 칼선 이미지(격자, 시안 아님)를 페이지에서 만들어 임시 파일로 쓴다
  const os = await import('node:os');
  const b64 = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#ddd'; g.fillRect(0, 0, 1200, 900); g.strokeStyle = '#555'; for (let x = 0; x < 1200; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 900); g.stroke(); } for (let y = 0; y < 900; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(1200, y); g.stroke(); } return c.toDataURL('image/png').split(',')[1]; });
  const dl = path.join(os.tmpdir(), 'sabari_synth_dieline.png'); fs.writeFileSync(dl, Buffer.from(b64, 'base64'));
  const fx = { glb: path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb'), dieline: dl };
  for (const k of Object.keys(fx)) if (!fs.existsSync(fx[k])) delete fx[k];
  const items = await collectStates(p, fx);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generatedFor: 'ui-inventory', fixturesUsed: Object.keys(fx), count: items.length, items }, null, 1));
  console.log('items', items.length, 'fixtures', Object.keys(fx).join(','));
  await b.close();
}
