// 작업 10: 기본 빛 방향 탐색. 3/4 시점(iso)·세운 3/4 왼쪽/오른쪽에서 "박스 밖으로 보이는 그림자 픽셀"을 빛 좌우·높이 격자로 잰다.
// 비교 기준(가려지지 않는 비율) = 같은 그림자를 위에서 본(top) 화면의 박스 밖 그림자 픽셀 대비 비율.
// 실행: SABARI_URL=<주소> STAGE_OUT=verification-private/floor-shadow node e2e/shadow_default_sweep.mjs
import { OUT, fs, path, start } from './stage24_common.mjs';
const { p, finish, rec, colorFaces } = await start();
await colorFaces(); await p.setViewportSize({ width: 1000, height: 640 }); await p.waitForTimeout(400); // 메모리 절약을 위해 작은 창에서 측정
await p.evaluate(() => {
  const V = window.__sabari.viewer; const snaps = {}; window.__snaps = snaps;
  window.__cap = async (name) => { const r = await V.screenshotScaled('white', 1); const bm = await createImageBitmap(r.blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); bm.close(); snaps[name] = g.getImageData(0, 0, c.width, c.height); };
  // 박스 실루엣(ID 지도) 대비 그림자: 그림자 픽셀 수·무게중심, 박스 무게중심
  window.__mask0 = () => { const m = V.debugIdMap(); let bx = 0, by = 0, bn = 0; for (let i = 0; i < m.w * m.h; i++) if (m.data[i * 4]) { bx += i % m.w; by += (i / m.w) | 0; bn++; } snaps.__b = { bx: bx / bn, by: by / bn }; };
  window.__stat = (on, off) => { const A = snaps[on], B = snaps[off], k = snaps.__b; let n = 0, sx = 0, sy = 0; for (let i = 0; i < A.width * A.height; i++) { if (Math.abs(A.data[i * 4] - B.data[i * 4]) > 3) { n++; sx += i % A.width; sy += (i / A.width) | 0; } } return { px: n, dx: n ? sx / n - k.bx : null, dy: n ? sy / n - k.by : null }; };
});
const setSh = (o) => p.evaluate((o) => { const V = window.__sabari.viewer; V.setFloorShadow({ ...V.getFloorShadow(), ...o }); }, o);
const goto = async (v) => { if (v === 'iso') await p.evaluate(() => window.__sabari.viewer.setView('iso')); else if (v === 'top') await p.click('[data-view=top]'); else await p.click(`.vp-fixed[data-side=${v}]`); await p.waitForTimeout(120); };
const views = (process.env.VIEWS ?? 'iso,left,right,top').split(','); // 렌더러 메모리 때문에 시점별로 나눠 실행한다
const [a0, a1] = (process.env.AZR ?? '0-345').split('-').map(Number); const AZ = []; for (let a = a0; a <= a1; a += 15) AZ.push(a); // 방위각 범위도 나눠 실행(렌더러 메모리)
const EL = [35, 50, 65];
const base = {}, rows = [];
for (const v of views) { await goto(v); await setSh({ on: false }); await p.evaluate(() => 0); await new Promise((r) => setTimeout(r, 120)); await p.evaluate(() => window.__cap('off')); await p.evaluate(() => window.__mask0()); base[v] = true; for (const az of AZ) for (const el of EL) {
  // 같은 시점을 한 번에 훑기 위해 시점별로 바깥 루프를 돌린다
  await setSh({ on: true, strength: 0.6, soft: 0.5, az, el }); await new Promise((r) => setTimeout(r, 60));
  await p.evaluate(() => window.__cap('on')); const s = await p.evaluate(() => window.__stat('on', 'off'));
  rows.push({ view: v, az, el, ...s }); if (rows.length % 20 === 0) console.log('rows', rows.length);
} }
fs.writeFileSync(path.join(OUT, `shadow_default_sweep_${views.join('_')}_${a0}.json`), JSON.stringify(rows));
rec('rows', rows.length);
await finish('shadow_default_sweep_done.json');
