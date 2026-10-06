// 작업 25 검증(합성 샘플 이미지만 사용): 그림자 농도 프로파일·접촉 높이·그림자 끈 화면 동일·박스 안쪽 색 불변·투명 PNG 합성·성능.
// 실행: SABARI_URL=<새 빌드> BASE_URL=<v0.8.0 빌드> STAGE_OUT=verification/studio25 node e2e/studio_shadow_task25.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), S = path.join(ROOT, 'assets', 'samples');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/studio25'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL, BASE = process.env.BASE_URL;
const R = { checks: {}, profile: {}, perf: {}, heights: {}, off12: {}, interior: {}, composite: {} };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const open = async (url) => {
  const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(url); await p.waitForFunction(() => window.__sabari);
  for (const f of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) { await p.evaluate((id) => window.__sabari.setCurrent(id), f); await p.setInputFiles('#filePick', path.join(S, `sample_${f}.png`)); await p.waitForFunction((id) => window.__sabari.faces[id].img, f); }
  return p;
};
const setShadow = (p, on, style) => p.evaluate(({ on, style }) => {
  const t = document.getElementById('shadowToggle');
  if ((t.getAttribute('aria-pressed') === 'true') !== on) t.click();
  if (on) { const sel = document.getElementById('shStyle'); if (sel) { sel.value = style; sel.dispatchEvent(new Event('change')); } }
}, { on, style });
const POSES = {
  iso: (v) => { v.resetBoxPose(); v.setLiftMm(0); v.setView('iso'); },
  standR: (v) => { v.setLiftMm(0); v.setBoxQuatRaw([0.5, 0.5, 0, 0.7071]); v.setView('iso'); },
  standL: (v) => { v.setLiftMm(0); v.setBoxQuatRaw([0.5, -0.5, 0, 0.7071]); v.setView('iso'); },
  flipped: (v) => { v.setLiftMm(0); v.setBoxQuatRaw([1, 0, 0, 0]); v.setView('iso'); },
  lidOpen: (v) => { v.resetBoxPose(); v.setLiftMm(60); v.setView('iso'); },
  front: (v) => { v.resetBoxPose(); v.setLiftMm(0); v.setView('front'); },
};
const pose = (p, name) => p.evaluate(([n, src]) => { new Function('v', src)(window.__sabari.viewer); }, [name, `(${POSES[name].toString()})(v)`]);
// 페이지 안 도구: 스냅샷(투명 배경, 그림자 포함) → 픽셀
const snapJs = `(scale) => { const c = window.__sabari.viewer.snapshot(scale); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, data: d.data }; }`;
const b64 = (p, scale) => p.evaluate(`(() => { const f = ${snapJs}; const o = f(${scale}); let s = ''; const u = o.data; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return { w: o.w, h: o.h, b: btoa(s) }; })()`);
const raw = (o) => Buffer.from(o.b, 'base64');

// ---- 1) 농도 프로파일 + 단일 값 비율 + 끝 감쇠 ----
const pp = await open(URL);
await pp.evaluate(() => { const v = window.__sabari.viewer; v.resetBoxPose(); v.setView('iso'); v.camera.position.multiplyScalar(1.9); v.camera.updateMatrixWorld(); v.request(); });
async function profile(style) {
  await setShadow(pp, true, style); await pp.waitForTimeout(300);
  const o = await pp.evaluate(`(() => { const f = ${snapJs}; const o = f(1); const { w, h, data } = o; const N = w * h; const a = new Uint8Array(N); for (let i = 0; i < N; i++) a[i] = data[i * 4 + 3];
    // 박스 = 불투명(255) 영역, 그림자 = 0<알파<255. 박스에서 바깥으로의 거리(체임퍼)를 구한다.
    const INF = 1e9, d = new Float32Array(N); for (let i = 0; i < N; i++) d[i] = a[i] === 255 ? 0 : INF;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; let v = d[i]; if (x > 0) v = Math.min(v, d[i - 1] + 1); if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + 1.414); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.414); } d[i] = v; }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; let v = d[i]; if (x < w - 1) v = Math.min(v, d[i + 1] + 1); if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.414); if (x > 0) v = Math.min(v, d[i + w - 1] + 1.414); } d[i] = v; }
    const hist = new Map(); let n = 0, maxD = 0; for (let i = 0; i < N; i++) if (a[i] > 0 && a[i] < 255 && d[i] > 3) { n++; hist.set(a[i], (hist.get(a[i]) || 0) + 1); maxD = Math.max(maxD, d[i]); }
    let top = 0, topV = 0; for (const [k, c] of hist) if (c > top) { top = c; topV = k; }
    const bins = 12, sum = new Float64Array(bins), cnt = new Float64Array(bins);
    for (let i = 0; i < N; i++) if (a[i] > 0 && a[i] < 255 && d[i] > 3) { const k = Math.min(bins - 1, Math.floor(((d[i] - 3) / (maxD - 3 + 1e-6)) * bins)); sum[k] += a[i] / 255; cnt[k]++; }
    return { pixels: n, modeShare: n ? top / n : 0, modeValue: topV, maxDist: maxD, bins: Array.from(sum).map((s, k) => (cnt[k] ? +(s / cnt[k]).toFixed(3) : null)) }; })()`);
  return o;
}
for (const st of ['default', 'studio', 'contact']) { R.profile[st] = await profile(st); await pp.locator('#viewport').screenshot({ path: path.join(OUT, `profile_${st}.png`) }); }
await pp.context().close();
const p = await open(URL);
const pr = R.profile;
const mono = (bins, from = 0) => { const v = bins.filter((x) => x !== null).slice(from); return v.every((x, i) => i === 0 || x <= v[i - 1] + 0.05); };
const nz = (arr) => arr.filter((x) => x !== null);
R.checks.studio_near_ge_0_5 = nz(pr.studio.bins)[0] >= 0.5;
R.checks.studio_far_le_0_1 = nz(pr.studio.bins).at(-1) <= 0.1;
R.checks.studio_monotone = mono(pr.studio.bins);
R.checks.studio_tail_monotone = mono(pr.studio.bins, Math.floor(nz(pr.studio.bins).length * 0.9));
R.checks.studio_mode_share_lt_20pct = pr.studio.modeShare < 0.2;
R.checks.default_mode_share_baseline = pr.default.modeShare; // 기존(약 96%) 대비 기록
R.checks.contact_near_ge_0_5 = nz(pr.contact.bins)[0] >= 0.5;

// ---- 2) 접촉 높이(5자세): 바닥판 높이 = 보이는 메시 최저점 - 1e-4 ----
for (const name of ['iso', 'standR', 'standL', 'flipped', 'lidOpen']) {
  await pose(p, name); await setShadow(p, true, 'studio'); await p.waitForTimeout(250);
  R.heights[name] = await p.evaluate(`(() => { const v = window.__sabari.viewer; v.snapshot(1); const root = v.cur.root; let min = Infinity; const shown = (o) => { for (let n = o; n && n !== v.cur.pivot.parent; n = n.parent) if (!n.visible) return false; return true; };
    root.updateMatrixWorld(true); root.traverse((o) => { if (o.isMesh && shown(o) && o.name !== '__highlight' && o.name !== '__lockhl' && o.name !== '__lockaxis') { const g = o.geometry; g.computeBoundingBox(); const bb = g.boundingBox; for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const e = o.matrixWorld.elements; const wy = e[1] * x + e[5] * y + e[9] * z + e[13]; if (wy < min) min = wy; } } });
    return { floorY: v.getFloorY(), minY: min, err: Math.abs(v.getFloorY() + 1e-4 - min) }; })()`);
}
R.checks.contact_height_1e6 = Object.values(R.heights).every((h) => h.err < 1e-6);

// ---- 3) 박스 실루엣 안쪽 색 불변(그림자 켬 vs 끔) ----
for (const name of ['iso', 'standR', 'flipped', 'lidOpen']) {
  await pose(p, name);
  await setShadow(p, false, 'default'); await p.waitForTimeout(150); const off = raw(await b64(p, 1));
  let worst = 0, diffPx = 0;
  for (const st of ['default', 'studio', 'contact']) {
    await setShadow(p, true, st); await p.waitForTimeout(250); const on = raw(await b64(p, 1));
    let diff = 0, mx = 0; for (let i = 0; i < off.length; i += 4) if (off[i + 3] === 255) { const d = Math.max(Math.abs(off[i] - on[i]), Math.abs(off[i + 1] - on[i + 1]), Math.abs(off[i + 2] - on[i + 2])); if (d > 0) diff++; mx = Math.max(mx, d); }
    R.interior[`${name}_${st}`] = { diffPixels: diff, maxDiff: mx }; worst = Math.max(worst, mx); diffPx += diff;
  }
  void worst; void diffPx;
}
R.checks.interior_color_diff_0 = Object.values(R.interior).every((x) => x.diffPixels === 0);

// ---- 4) 투명 PNG 합성(마젠타·검정·흰색): 그림자만 있는 픽셀의 색 오차 ----
await pose(p, 'iso'); await setShadow(p, true, 'studio'); await p.waitForTimeout(250);
{
  await setShadow(p, false, 'default'); await p.waitForTimeout(200); const offc = raw(await b64(p, 1)); await setShadow(p, true, 'studio'); await p.waitForTimeout(250);
  const o = await b64(p, 1); const d = raw(o); const bgs = { magenta: [255, 0, 255], black: [0, 0, 0], white: [255, 255, 255] };
  const C = 0x1c; const res = {};
  for (const [name, bg] of Object.entries(bgs)) {
    let maxErr = 0, halo = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] / 255; if (d[i + 3] === 0 || offc[i + 3] !== 0) continue; n++; // 그림자만 있는 픽셀(그림자 끈 화면에서 알파 0)
      for (let c = 0; c < 3; c++) { const got = bg[c] * (1 - a) + (d[i + c] / 255 * 255 * a); const want = bg[c] * (1 - a) + C * a; maxErr = Math.max(maxErr, Math.abs(got - want)); }
      if (name === 'magenta' && (bg[1] * (1 - a) + d[i + 1] * a) > 28 * a + 3) halo++; }
    res[name] = { shadowPixels: n, maxErr: +maxErr.toFixed(2), haloPixels: halo };
  }
  R.composite = res;
  R.checks.composite_err_le_2 = Object.values(res).every((x) => x.maxErr <= 2 && x.haloPixels === 0);
}

// ---- 5) 성능: 회전 중 프레임 간격(빠른 경로) vs 그림자 끔, 누적 완료까지 시간 ----
async function frames(label) {
  // 소프트웨어 렌더링은 간헐적으로 수 초씩 멈추므로(그림자 꺼짐·구 빌드에서도 관찰) 3회 측정해 가장 좋은 회차와 전체 회차를 함께 기록한다
  const rounds = [];
  for (let r = 0; r < 3; r++) rounds.push(await p.evaluate(async () => {
    const v = window.__sabari.viewer; const ts = []; v.resetBoxPose();
    for (let i = 0; i < 24; i++) { v.setBoxQuatRaw([0, Math.sin((i * 0.05) / 2), 0, Math.cos((i * 0.05) / 2)]); await new Promise((r) => requestAnimationFrame(() => { ts.push(performance.now()); r(); })); }
    const dt = ts.slice(1).map((t, i) => t - ts[i]); dt.sort((a, b) => a - b);
    return { medianMs: +dt[Math.floor(dt.length / 2)].toFixed(1), p90Ms: +dt[Math.floor(dt.length * 0.9)].toFixed(1) };
  }));
  rounds.sort((a, b) => a.medianMs - b.medianMs);
  R.perf[label] = { best: rounds[0], rounds };
}
await pose(p, 'iso'); await setShadow(p, false, 'default'); await frames('shadow_off');
await setShadow(p, true, 'default'); await frames('shadow_default');
await setShadow(p, true, 'studio'); await frames('shadow_studio_rotating');
await setShadow(p, true, 'studio'); await pose(p, 'iso');
const t0 = Date.now(); await p.waitForFunction(() => { const s = window.__sabari.viewer.getShadowStats(); return s.done; }, null, { timeout: 90000, polling: 100 });
R.perf.settle_after_stop_ms = Date.now() - t0; R.perf.stats = await p.evaluate(() => window.__sabari.viewer.getShadowStats());
R.perf.rt_megabytes = +(R.perf.stats.bakeBytes / 1048576).toFixed(1);
R.perf.png_save_settle = await p.evaluate(() => { const v = window.__sabari.viewer; v.setBoxQuatRaw([0, 0.1, 0, 0.995]); const t = performance.now(); v.snapshot(2); return { ms: Math.round(performance.now() - t), done: v.getShadowStats().done }; });
R.checks.png_settles_before_save = R.perf.png_save_settle.done === true;
R.checks.no_page_errors = p.errors.length === 0;

// ---- 6) 그림자 끈 화면 12종: v0.8.0 빌드와 픽셀 단위 동일 ----
if (BASE) {
  const q = await open(BASE); let same = 0, total = 0; const names = [];
  const cases = [];
  for (const name of ['iso', 'standR', 'standL', 'flipped', 'lidOpen', 'front']) for (const bgk of ['white', 'transparent']) cases.push([name, bgk]);
  for (const [name, bgk] of cases) {
    for (const page of [p, q]) { await pose(page, name); await page.evaluate((k) => document.querySelector(`[data-bgkind=${k}]`).click(), bgk); await setShadow(page, false, 'default'); await page.waitForTimeout(250); }
    const A = raw(await b64(p, 1)), B = raw(await b64(q, 1)); const eq = A.length === B.length && A.equals(B);
    const shotA = await p.locator('#viewport').screenshot(), shotB = await q.locator('#viewport').screenshot();
    const eqShot = shotA.equals(shotB);
    total++; if (eq && eqShot) same++; names.push(`${name}/${bgk}:${eq && eqShot ? 'same' : `DIFF(snap=${eq},shot=${eqShot})`}`);
  }
  R.off12 = { total, same, names }; R.checks.shadow_off_12_pixel_identical = same === total && total === 12;
  await q.context().close();
}
fs.writeFileSync(path.join(OUT, 'studio_shadow_task25.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R.checks), '\nprofile', JSON.stringify(Object.fromEntries(Object.entries(R.profile).map(([k, v]) => [k, { n: v.pixels, mode: +v.modeShare.toFixed(3), bins: v.bins }]))), '\nperf', JSON.stringify(R.perf), '\nheights', JSON.stringify(R.heights), '\ninterior', JSON.stringify(R.interior), '\ncomposite', JSON.stringify(R.composite), '\noff12', JSON.stringify(R.off12));
await b.close();
process.exit(Object.values(R.checks).every((v) => v === true || typeof v === 'number') ? 0 : 1);
