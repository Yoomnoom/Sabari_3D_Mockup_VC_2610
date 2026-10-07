// 바닥 그림자 계단·물결 측정(합성 박스만): "스튜디오 소프트"·"접촉 위주" 스타일은 빛 방향을 여러 번 흔들어 그림자 맵을 겹친다.
// 장수가 유한해서 멀리 번진 가장자리에 층층이 계단(물결·점무늬)이 남던 것을, 누적이 끝난 뒤 한 번 흐려 지운다.
// 측정: 그림자 켠 화면 − 끈 화면 = 그림자 어둡기 D. 완만한 경사(번지는 구간)에서 D 와 7×7 평균의 차이(RMS, 밝기 단계).
// 부드러우면 0에 가깝고 계단이 있으면 커진다. 3/4 시점·스튜디오 소프트 기본 세기·부드러움에서 수정 전(candidate-9) 1.06 / 수정 후 0.73 이라 기준을 0.9 로 정했다(소프트웨어 GL 기준, 이 시험의 자체 계산값).
// 실행: SABARI_URL=http://127.0.0.1:8766/ STAGE_OUT=verification/shadowsmooth node e2e/shadow_smooth_task.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/shadowsmooth'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const checks = {}, R = {};
const ok = (k, v, d) => { checks[k] = !!v; if (d !== undefined) R[k] = d; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const c = await b.newContext({ viewport: { width: 1366, height: 768 } }); const p = await c.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(800);
const shot = async () => { const r = await p.evaluate(() => { const q = window.__sabari.viewer.renderer.domElement.getBoundingClientRect(); return { x: Math.round(q.left), y: Math.round(q.top), width: Math.round(q.width), height: Math.round(q.height) }; }); return (await p.screenshot({ clip: r })).toString('base64'); };
const setSh = (o) => p.evaluate((o) => { const V = window.__sabari.viewer; V.setFloorShadow({ ...V.getFloorShadow(), ...o }); }, o);
const settle = async () => { await p.waitForTimeout(300); for (let i = 0; i < 80; i++) { const d = await p.evaluate(() => { const s = window.__sabari.viewer.getShadowStats(); return s.done || !s.supported; }); if (d) break; await p.waitForTimeout(250); } await p.waitForTimeout(500); };
const metric = (onB64, offB64) => p.evaluate(async ([onB64, offB64]) => {
  const load = async (b64) => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
  const A = await load(onB64), B = await load(offB64), w = A.width, h = A.height, n = w * h;
  const D = new Float32Array(n);
  for (let i = 0; i < n; i++) { const o = i * 4; D[i] = (0.2126 * B.data[o] + 0.7152 * B.data[o + 1] + 0.0722 * B.data[o + 2]) - (0.2126 * A.data[o] + 0.7152 * A.data[o + 1] + 0.0722 * A.data[o + 2]); }
  const boxOf = (src, r) => { const I = new Float64Array((w + 1) * (h + 1)); for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } } const o = new Float32Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1); o[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); } return o; };
  const grad = (s) => { const g = new Float32Array(n); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const gx = (s[y * w + x + 1] - s[y * w + x - 1]) / 2, gy = (s[(y + 1) * w + x] - s[(y - 1) * w + x]) / 2; g[y * w + x] = Math.hypot(gx, gy); } return g; };
  const S = boxOf(D, 1), g = grad(S), s2 = grad(boxOf(D, 2));
  const sorted = Float32Array.from(S).sort(); const mx = sorted[Math.floor(n * 0.995)];
  const steep = new Float32Array(n); for (let i = 0; i < n; i++) steep[i] = s2[i] >= 3 ? 1 : 0;
  const nearSteep = boxOf(steep, 6);
  const M = boxOf(S, 7); let cnt = 0, sum = 0;
  for (let i = 0; i < n; i++) { if (S[i] > 6 && S[i] < 0.92 * mx && g[i] > 0.25 && g[i] < 3 && nearSteep[i] === 0) { const r = S[i] - M[i]; sum += r * r; cnt++; } }
  return { n: cnt, rms: cnt ? Math.round(Math.sqrt(sum / cnt) * 1000) / 1000 : null };
}, [onB64, offB64]);
const cases = [
  { id: 'iso_studio_s40_f50', pose: 'iso', style: 'studio', str: 0.4, soft: 0.5, max: 0.9 },
];
for (const cs of cases) {
  await p.click('#tabView').catch(() => {});
  if (cs.pose === 'iso') await p.evaluate(() => window.__sabari.viewer.setView('iso')); else await p.evaluate((k) => document.querySelector(`.vp-fixed[data-side=${k}]`).click(), cs.pose);
  await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('[data-bgkind=white]').click()); await p.waitForTimeout(400);
  await setSh({ on: false }); await p.waitForTimeout(400); const off = await shot();
  await setSh({ on: true, style: cs.style, strength: cs.str, soft: cs.soft }); await settle(); const on = await shot();
  const m = await metric(on, off);
  fs.writeFileSync(path.join(OUT, `${cs.id}_on.png`), Buffer.from(on, 'base64'));
  ok(`${cs.id}_has_penumbra_region`, m.n > 1000, m);
  ok(`${cs.id}_smooth`, m.rms !== null && m.rms <= cs.max, { rms: m.rms, max: cs.max });
}
// 기본 스타일은 원래부터 매끄러워야 한다(수정이 건드리지 않음): 완만한 경사 구간 자체가 거의 없다
ok('no_page_errors', p.errors.length === 0, p.errors);
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 1)); console.log(JSON.stringify({ checks, R }, null, 1)); await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
