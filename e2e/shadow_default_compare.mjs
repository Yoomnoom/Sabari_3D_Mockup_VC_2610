// 작업 10: 이전 기본값(35°, 55°)과 새 기본값(225°, 65°)의 그림자가 박스 실루엣 밖으로 보이는 픽셀 수·비율 비교 + 전후 스크린샷(합성 면 이미지로 만든 것만).
// 실행: SABARI_URL=<주소> STAGE_OUT=verification/shadow-default node e2e/shadow_default_compare.mjs
import { OUT, assert, fs, path, start } from './stage24_common.mjs';
const { p, finish, rec, colorFaces } = await start();
await colorFaces(); // 면별 합성 색 이미지(시안 아님)
await p.setViewportSize({ width: 1000, height: 640 }); await p.waitForTimeout(400);
await p.evaluate(() => { document.getElementById('dLight').open = true; });
await p.evaluate(() => {
  const V = window.__sabari.viewer; const snaps = {}; window.__snaps = snaps;
  window.__cap = async (name) => { const r = await V.screenshotScaled('white', 1); const bm = await createImageBitmap(r.blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); bm.close(); snaps[name] = g.getImageData(0, 0, c.width, c.height); };
  // 박스 실루엣 밖에서 그림자 때문에 바뀐 픽셀 수 = 가려지지 않고 보이는 그림자
  window.__vis = (on, off) => { const A = snaps[on], B = snaps[off], m = V.debugIdMap(); let outside = 0, inside = 0; for (let i = 0; i < A.width * A.height; i++) { if (Math.abs(A.data[i * 4] - B.data[i * 4]) > 3) { if (m.data[i * 4]) inside++; else outside++; } } return { visibleOutsideBox: outside, onBoxEdge: inside }; };
});
const set = (o) => p.evaluate((o) => { const V = window.__sabari.viewer; V.setFloorShadow({ ...V.getFloorShadow(), ...o }); }, o);
const go = async (v) => { if (v === 'iso') await p.evaluate(() => window.__sabari.viewer.setView('iso')); else if (v === 'top') await p.click('[data-view=top]'); else await p.click(`.vp-fixed[data-side=${v}]`); await p.waitForTimeout(200); };
const shot = (n) => p.locator('#viewport canvas').screenshot({ path: path.join(OUT, n) });
const table = {};
const defaults = await p.evaluate(() => { document.getElementById('shadowToggle').click(); const V = window.__sabari.viewer; const s = V.getFloorShadow(); document.getElementById('shadowToggle').click(); return s; });
rec('default_after_change', defaults); assert(defaults.az === 225 && defaults.el === 65);
const sets = { before: { az: 35, el: 55 }, after: { az: 225, el: 65 } };
for (const v of ['iso', 'left', 'right', 'top']) {
  await go(v); await set({ on: false }); await p.waitForTimeout(150); await p.evaluate(() => window.__cap('off'));
  table[v] = {};
  for (const [k, a] of Object.entries(sets)) {
    await set({ on: true, strength: 0.4, soft: 0.5, ...a }); await p.waitForTimeout(200); await p.evaluate(() => window.__cap('on'));
    table[v][k] = await p.evaluate(() => window.__vis('on', 'off'));
    if (v !== 'top') await shot(`shadow_${k}_${v}.png`);
  }
}
const topRef = { before: table.top.before.visibleOutsideBox, after: table.top.after.visibleOutsideBox };
for (const v of ['iso', 'left', 'right']) for (const k of ['before', 'after']) table[v][k].ratioVsTopDown = +(table[v][k].visibleOutsideBox / topRef[k]).toFixed(3);
rec('visible_shadow_table', table);
// 새 기본값은 이전보다 세 구도 모두에서 가려지지 않는 그림자 비율이 높아야 한다
for (const v of ['iso', 'left', 'right']) assert(table[v].after.ratioVsTopDown > table[v].before.ratioVsTopDown, `${v}: 비율 개선`);
for (const v of ['iso', 'left', 'right']) assert(table[v].after.visibleOutsideBox > table[v].before.visibleOutsideBox, `${v}: 절대 픽셀 증가`);
// 기본값 복원 버튼도 같은 값
await p.evaluate(() => document.getElementById('shadowToggle').getAttribute('aria-pressed') === 'false' && document.getElementById('shadowToggle').click());
await p.fill('#shAzN', '10'); await p.locator('#shAzN').dispatchEvent('change'); await p.click('#shDefault');
const restored = await p.evaluate(() => window.__sabari.viewer.getFloorShadow()); rec('restore_button', restored); assert(restored.az === 225 && restored.el === 65 && restored.strength === 0.4 && restored.soft === 0.5);
await finish('shadow_default_compare.json');
