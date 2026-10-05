// 구버전(하단 면·스위치 필드 없음) 임시저장이 그대로 열리는지: IndexedDB에 구 형식 레코드를 직접 넣고 불러오기
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
// 구 형식: schemaVersion 없음, faces 에 뚜껑 5면만, useBase 필드 없음 (Draft = OpenedProject + savedAt)
await p.evaluate(async () => {
  const mk = (c) => new Promise((r) => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 64, 32); cv.toBlob(r, 'image/png'); });
  const st = (o = {}) => ({ fit: 'contain', rotationDeg: 0, flipX: false, flipY: false, scale: 1, offsetX: 0, offsetY: 0, ...o });
  const faces = {};
  for (const [id, c] of [['lid_top', '#d62828'], ['lid_front', '#1e64dc'], ['lid_back', '#1ea046'], ['lid_left', '#00a0aa'], ['lid_right', '#8232be']]) faces[id] = { state: st(id === 'lid_top' ? { rotationDeg: 180, scale: 1.2 } : {}), blob: await mk(c), name: id + '.png' };
  const draft = { savedAt: Date.now() - 86400000, lidLiftMm: 80, colors: { face: '#ffffff', lid: '#e5e2dd', base: '#efece7' }, background: 'white', faces };
  await new Promise((res, rej) => { const r = indexedDB.open('sabari-mockup', 1); r.onupgradeneeded = () => r.result.createObjectStore('drafts'); r.onsuccess = () => { const t = r.result.transaction('drafts', 'readwrite'); t.objectStore('drafts').put(draft, 'current'); t.oncomplete = () => { r.result.close(); res(); }; t.onerror = rej; }; r.onerror = rej; });
});
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
const R = { notice: await p.textContent('#draftToast'), /* 작업 19: 상단 띠 대신 3D 화면 안 알림 */ loadEnabled: !(await p.isDisabled('#btnDraftLoad')) };
await p.click('#btnDraftLoad'); await p.waitForFunction(() => ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'].every((id) => window.__sabari.faces[id].img), null, { timeout: 8000 });
await p.waitForTimeout(300);
R.after = await p.evaluate(() => ({ switchOn: document.getElementById('useBase').checked, tabsVisible: !document.getElementById('faceTabs').hidden, lid: ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'].filter((id) => window.__sabari.faces[id].img).length, base: ['base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'].filter((id) => window.__sabari.faces[id].img).length, top: { ...window.__sabari.faces.lid_top.state }, lift: window.__sabari.viewer.getLiftMm(), list: [...document.querySelectorAll('#faceList button')].map((x) => x.dataset.face) }));
R.message = await p.textContent('#msgText');
// 이어서 하단을 켜고 쓰는 것도 정상인지
await p.check('#useBase'); R.then_switch_on = { tabs: await p.isVisible('#faceTabs'), counts: await p.evaluate(() => [document.getElementById('tab_lid').textContent, document.getElementById('tab_base').textContent]) };
R.errors = errs;
console.log(JSON.stringify(R)); await b.close();
