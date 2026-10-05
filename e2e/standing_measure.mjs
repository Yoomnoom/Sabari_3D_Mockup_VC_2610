// 작업 6: 세운 3/4 시점 탐색·측정. 면별 고유 색 이미지 + debugIdMap으로 면 픽셀·경계상자를 측정한다.
import http from 'node:http';
import { OUT, ROOT, assert, fs, path, start } from './stage24_common.mjs';
const DIST = process.env.DIST;
const srv = http.createServer((req, res) => { const f = path.join(DIST, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(f)] ?? 'application/octet-stream'); res.end(fs.readFileSync(f)); }).listen(8877);
const { p, finish, rec, colorFaces } = await start();
await colorFaces();
const place = (az, el, fov, k, side) => p.evaluate(({ az, el, fov, k, side }) => {
  const v = window.__sabari.viewer; v.camera.fov = fov; v.camera.updateProjectionMatrix(); v.setBoxQuatRaw([0.5, 0.5, 0.5, 0.5]);
  const b = v.bounds(), c = b.getCenter(new v.camera.position.constructor()), fit = v.getFitDistance();
  const a = (side === 'left' ? -1 : 1) * az * Math.PI / 180, e = el * Math.PI / 180;
  v.setCameraRaw([c.x + Math.sin(a) * Math.cos(e) * fit * k, c.y + Math.sin(e) * fit * k, c.z + Math.cos(a) * Math.cos(e) * fit * k], [c.x, c.y, c.z]);
}, { az, el, fov, k, side });
const stats = () => p.evaluate(() => { const { w, h, data, names } = window.__sabari.viewer.debugIdMap(); const s = {}; let border = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const id = data[(y * w + x) * 4]; if (!id) continue; const n = names[id - 1]; const o = (s[n] ??= { n: 0, x0: 1e9, x1: -1, y0: 1e9, y1: -1 }); o.n++; o.x0 = Math.min(o.x0, x); o.x1 = Math.max(o.x1, x); o.y0 = Math.min(o.y0, y); o.y1 = Math.max(o.y1, y); if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++; } return { w, h, s, border }; });
const metrics = (side) => p.evaluate((side) => {
  const v = window.__sabari.viewer, narrowId = side === 'left' ? 'lid_back' : 'lid_front';
  const ext = (id) => { const c = v.faceCorners(id); const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]); return { c, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
  const big = ext('lid_top'), nar = ext(narrowId);
  const H = document.querySelector('#viewport canvas').clientHeight, W = document.querySelector('#viewport canvas').clientWidth;
  // 큰 면 네 꼭짓점: 화면 x 기준으로 먼 쪽/가까운 쪽 가장자리 높이, 윗변 기울기
  const cs = big.c.slice().sort((a, b) => a[0] - b[0]); const L = cs.slice(0, 2).sort((a, b) => a[1] - b[1]), R = cs.slice(2).sort((a, b) => a[1] - b[1]);
  const hL = L[1][1] - L[0][1], hR = R[1][1] - R[0][1];
  const topSlopeDeg = Math.atan2(R[0][1] - L[0][1], R[0][0] - L[0][0]) * 180 / Math.PI;
  const { w, h, data, names } = v.debugIdMap(); const cnt = {}; let border = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const id = data[(y * w + x) * 4]; if (!id) continue; const n = names[id - 1]; cnt[n] = (cnt[n] ?? 0) + 1; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++; }
  const all = [big, nar]; const x0 = Math.min(...all.map((e) => e.x0)), x1 = Math.max(...all.map((e) => e.x1)), y0 = Math.min(...all.map((e) => e.y0)), y1 = Math.max(...all.map((e) => e.y1));
  const topExpose = (cnt.lid_left ?? 0) + (cnt.lid_right ?? 0) + (cnt.base_left ?? 0) + (cnt.base_right ?? 0);
  return { ratio: (nar.x1 - nar.x0) / (big.x1 - big.x0), narrowPx: Math.round(nar.x1 - nar.x0), bigPx: Math.round(big.x1 - big.x0), topExposePx: topExpose, bigPixels: cnt.lid_top ?? 0, narrowPixels: cnt[narrowId] ?? 0, marginPx: Math.round(Math.min(x0, W - x1, y0, H - y1)), clipped: border, topSlopeDeg: +topSlopeDeg.toFixed(2), farNearHeightRatio: +(Math.min(hL, hR) / Math.max(hL, hR)).toFixed(4), dist: v.camera.position.distanceTo(v.controls.target) };
}, side);
const rows = [];
for (const fov of [22, 26, 30]) for (const el of [0, 1, 2, 3, 4]) for (let az = 24; az <= 38; az += 2) {
  const r = {};
  for (const side of ['left', 'right']) { await place(az, el, fov, 1, side); await p.waitForTimeout(40); r[side] = await metrics(side); }
  rows.push({ az, el, fov, ...r });
}
fs.writeFileSync(path.join(process.env.SCRATCH, 'sweep.json'), JSON.stringify(rows));
const f = (r, s) => `${r.az}/${r.el}/${r.fov} ${s[0]} ratio=${r[s].ratio.toFixed(3)} top=${r[s].topExposePx} mar=${r[s].marginPx} clip=${r[s].clipped} slope=${r[s].topSlopeDeg} fn=${r[s].farNearHeightRatio}`;
for (const r of rows) if (r.left.ratio >= 0.17 && r.left.ratio <= 0.2 && r.left.clipped === 0) console.log(f(r, 'left'));
await finish('standing_sweep.json'); srv.close();
