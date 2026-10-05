// 작업 6 검증: 세운 3/4 시점(좌·우) 측정표·좌우 대칭·면 식별·FOV 복원·축 잠금 유지·GLB/PNG 불변
// 실행: SABARI_URL=http://127.0.0.1:8877/ DIST=<빌드 폴더> STAGE_OUT=verification-private/standing-view node e2e/standing_view_task6.mjs
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { OUT, ROOT, assert, fs, path, start } from './stage24_common.mjs';
const DIST = process.env.DIST;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const f = path.join(DIST, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] ?? 'application/octet-stream');
  res.end(fs.readFileSync(f));
}).listen(8877);
const { p, finish, rec, colorFaces } = await start();
await colorFaces();
const near = (a, b, e) => Math.abs(a - b) <= e;
const st = () => p.evaluate(() => {
  const v = window.__sabari.viewer;
  return { fov: v.camera.fov, q: v.boxQuat.toArray(), cam: v.camera.position.toArray(), tgt: v.controls.target.toArray(), fit: v.getFitDistance(), c: v.bounds().getCenter(new v.camera.position.constructor()).toArray(), lock: v.captureLockState(), angle: v.getLockAngleDeg() };
});
const metrics = (side) => p.evaluate((side) => {
  const v = window.__sabari.viewer, narrowId = side === 'left' ? 'lid_back' : 'lid_front';
  const ext = (id) => { const c = v.faceCorners(id); const xs = c.map((q) => q[0]), ys = c.map((q) => q[1]); return { c, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
  const big = ext('lid_top'), nar = ext(narrowId);
  const cv = document.querySelector('#viewport canvas'), H = cv.clientHeight, W = cv.clientWidth;
  const cs = big.c.slice().sort((a, b) => a[0] - b[0]);
  const L = cs.slice(0, 2).sort((a, b) => a[1] - b[1]), R = cs.slice(2).sort((a, b) => a[1] - b[1]);
  const hL = L[1][1] - L[0][1], hR = R[1][1] - R[0][1];
  const { w, h, data, names } = v.debugIdMap();
  const cnt = {}; let border = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const id = data[(y * w + x) * 4]; if (!id) continue;
    const n = names[id - 1]; cnt[n] = (cnt[n] ?? 0) + 1;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++;
  }
  const over = Object.entries(cnt).filter(([, c]) => c > 800).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}:${c}`);
  const all = [big, nar];
  const x0 = Math.min(...all.map((e) => e.x0)), x1 = Math.max(...all.map((e) => e.x1)), y0 = Math.min(...all.map((e) => e.y0)), y1 = Math.max(...all.map((e) => e.y1));
  return {
    facesOver800px: over, narrowCenterLeftOfBig: (nar.x0 + nar.x1) / 2 < (big.x0 + big.x1) / 2,
    ratio: (nar.x1 - nar.x0) / (big.x1 - big.x0), topExposePx: (cnt.lid_left ?? 0) + (cnt.lid_right ?? 0) + (cnt.base_left ?? 0) + (cnt.base_right ?? 0),
    marginPx: Math.min(x0, W - x1, y0, H - y1), clippedPx: border, topSlopeDeg: Math.atan2(R[0][1] - L[0][1], R[0][0] - L[0][0]) * 180 / Math.PI,
    farNearHeightRatio: Math.min(hL, hR) / Math.max(hL, hR), narrowPixels: cnt[narrowId] ?? 0, bigPixels: cnt.lid_top ?? 0,
  };
}, side);
const glbNodes = async (name) => {
  const [g] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]);
  const f = path.join(OUT, name); await g.saveAs(f);
  const buf = fs.readFileSync(f); const jl = buf.readUInt32LE(12); const j = JSON.parse(buf.slice(20, 20 + jl).toString());
  const val = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'validate_glb.mjs'), f], { encoding: 'utf8' });
  return { nodes: JSON.stringify(j.nodes.map((n) => [n.name, n.translation, n.rotation, n.scale])), val: JSON.parse(val.stdout.slice(val.stdout.indexOf('{'))) };
};
const canvasShot = async (n) => { await p.waitForTimeout(150); await p.locator('#viewport canvas').screenshot({ path: path.join(OUT, n) }); };

await p.click('[data-view=iso]'); await p.waitForTimeout(80);
const glbBefore = await glbNodes('glb_before.glb');
const table = {};
for (const side of ['left', 'right']) {
  await p.click(`.vp-fixed[data-side=${side}]`); await p.waitForTimeout(150);
  const s = await st(), m = await metrics(side); await canvasShot(`render_${side}.png`);
  const toCam = s.cam.map((x, i) => x - s.c[i]), dist = Math.hypot(...toCam);
  table[side] = { state: s, metrics: m, azimuthDeg: Math.atan2(toCam[0], toCam[2]) * 180 / Math.PI, elevationDeg: Math.asin(toCam[1] / dist) * 180 / Math.PI, distOverFit: dist / s.fit };
  assert(m.clippedPx === 0 && m.marginPx > 20, `${side} 잘림/여백`);
  assert(m.ratio >= 0.17 && m.ratio <= 0.2, `${side} 비율 ${m.ratio}`);
  assert(m.facesOver800px.slice(0, 2).map((x) => x.split(':')[0]).sort().join() === ['lid_top', side === 'left' ? 'lid_back' : 'lid_front'].sort().join(), `${side} 면 식별 ${m.facesOver800px}`);
  assert(side === 'left' ? m.narrowCenterLeftOfBig : !m.narrowCenterLeftOfBig, `${side} 옆면 위치`);
  assert(s.q.every((x) => near(x, 0.5, 1e-9)) && near(s.fov, 22, 1e-9), JSON.stringify([s.q, s.fov]));
}
const L = table.left, R = table.right;
rec('measure_table', table);
const d2 = (t) => t.state.cam.map((x, i) => x - t.state.c[i]).reduce((a, x) => a + x * x, 0);
rec('symmetry', { azSum: L.azimuthDeg + R.azimuthDeg, azAbsL: Math.abs(L.azimuthDeg), elDiff: L.elevationDeg - R.elevationDeg, dist2Diff: d2(L) - d2(R), ratioDiff: L.metrics.ratio - R.metrics.ratio, marginDiff: L.metrics.marginPx - R.metrics.marginPx, slopeSum: L.metrics.topSlopeDeg + R.metrics.topSlopeDeg });
assert(near(L.azimuthDeg + R.azimuthDeg, 0, 1e-9) && near(L.elevationDeg, R.elevationDeg, 1e-9) && near(L.metrics.ratio, R.metrics.ratio, 0.002));

// 시점 설정은 저장된 시점과 같은 데이터 형식: 저장 → 다른 시점 → 불러오기로 복원
await p.click('.vp-card[data-slot="0"] .vp-save'); await p.waitForTimeout(100);
const saved = await st(); await p.click('[data-view=front]'); await p.waitForTimeout(80);
const afterFront = await st(); rec('fov_after_front_button', afterFront.fov); assert(afterFront.fov === 30);
await p.click('.vp-card[data-slot="0"] .vp-thumb'); await p.waitForTimeout(120);
const loaded = await st();
assert(near(loaded.fov, saved.fov, 1e-9) && loaded.cam.every((x, i) => near(x, saved.cam[i], 1e-6)) && loaded.q.every((x, i) => near(x, saved.q[i], 1e-9)), '저장된 시점 불러오기 일치');
rec('saved_slot_roundtrip', { fov: loaded.fov });

// F·3/4·눕힘(윗면) 전환에서 기본 FOV 복원
for (const how of ['keyF', 'iso', 'top']) {
  await p.click('.vp-fixed[data-side=left]'); await p.waitForTimeout(80);
  if (how === 'keyF') await p.keyboard.press('f'); else await p.click(`[data-view=${how}]`);
  await p.waitForTimeout(80); const f = (await st()).fov; rec(`fov_after_${how}`, f); assert(f === 30);
}
// 단축키 Alt+6 = 왼쪽
await p.click('[data-view=iso]'); await p.keyboard.press('Alt+Digit6'); await p.waitForTimeout(100);
const k = await st();
assert(near(k.fov, 22, 1e-9) && near(Math.atan2(k.cam[0] - k.c[0], k.cam[2] - k.c[2]) * 180 / Math.PI, -32, 1e-6)); rec('alt6_left', true);

// 축 잠금 유지
await p.click('[data-view=iso]'); await p.click('#lockToggle'); await p.locator('#axisRow button').first().click(); await p.waitForTimeout(80);
const lockBefore = await st(); await p.click('.vp-fixed[data-side=right]'); await p.waitForTimeout(100);
const lockAfter = await st();
rec('axis_lock_kept', { before: lockBefore.lock, after: lockAfter.lock, angleAfter: lockAfter.angle });
assert(lockAfter.lock.on && lockAfter.lock.n && lockAfter.lock.view === lockBefore.lock.view && near(lockAfter.angle, 0, 1e-6));
// 시점 이후에도 드래그 회전이 동작
const q0 = lockAfter.q, box = await p.locator('#viewport canvas').boundingBox();
await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5); await p.mouse.down();
await p.mouse.move(box.x + box.width * 0.5 + 80, box.y + box.height * 0.5 + 60, { steps: 8 }); await p.mouse.up();
const q1 = (await st()).q; rec('drag_after_standing_rotates', { moved: q1.some((x, i) => !near(x, q0[i], 1e-4)) });
assert(q1.some((x, i) => !near(x, q0[i], 1e-4)));
await p.click('#lockToggle');

// GLB 노드 변환 불변 + validator 0/0, PNG 저장
await p.click('.vp-fixed[data-side=left]'); await p.waitForTimeout(100);
const glbDuring = await glbNodes('glb_during.glb');
rec('glb_nodes_unchanged', glbBefore.nodes === glbDuring.nodes); rec('glb_validator', glbDuring.val);
assert(glbBefore.nodes === glbDuring.nodes && glbDuring.val.validator.errors === 0 && glbDuring.val.validator.warnings === 0);
const [pg] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]);
const pngPath = path.join(OUT, 'png_during.png'); await pg.saveAs(pngPath); rec('png_bytes', fs.statSync(pngPath).size);
await finish('standing_task6.json'); srv.close();
