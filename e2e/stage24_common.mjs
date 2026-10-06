// 단계 24 검증 공통 도구: 페이지 열기·면별 고유 색 이미지·회전 측정 함수
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
export { assert, fs, path };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = process.env.STAGE_OUT ? path.resolve(ROOT, process.env.STAGE_OUT) : path.join(ROOT, 'verification', 'stage24'); // 단계 26 은 STAGE_OUT=verification/stage26 으로 쓴다
export const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8874/';
export const COLORS = { lid_top: '#d62828', lid_front: '#1e64dc', lid_back: '#1ea046', lid_left: '#f2c200', lid_right: '#8232be', base_front: '#00a0aa', base_back: '#e8590c', base_left: '#7a5200', base_right: '#555555', base_bottom: '#ff66aa' };
export const dot = (a, b2) => a.reduce((s, x, i) => s + x * b2[i], 0);

export async function start() {
  fs.mkdirSync(path.join(OUT, 'colors'), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = {}; const rec = (k, v) => { results[k] = v; };
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true, hasTouch: true });
  // 작업 29: 회전 각도는 기본으로 왼쪽 패널(상태줄)에만 나온다. 3D 화면 위 배지를 읽는 시험은 "3D 화면 위" 표시를 고른 상태로 시작한다.
  if (!process.env.ROT_PLACE_DEFAULT) await context.addInitScript(() => { try { localStorage.setItem('sabari-ui', JSON.stringify({ rotPlace: 'view' })); } catch { /* 무시 */ } });
  const p = await context.newPage(); const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
  const H = () => p.evaluate(() => document.getElementById('viewport').clientHeight);
  const quat = () => p.evaluate(() => window.__sabari.viewer.boxQuat.toArray());
  const camAxes = () => p.evaluate(() => { const v = window.__sabari.viewer; v.camera.updateMatrixWorld(true); const q = v.camera.quaternion, T = v.camera.position.constructor; return { up: new T(0, 1, 0).applyQuaternion(q).toArray(), right: new T(1, 0, 0).applyQuaternion(q).toArray() }; });
  const camDist = () => p.evaluate(() => { const v = window.__sabari.viewer; return v.camera.position.distanceTo(v.controls.target); });
  // 상대 회전 rel = after · before⁻¹ 의 축(월드)·각(도)
  const rel = (a, b) => p.evaluate(({ a, b }) => { const T = window.__sabari.viewer.boxQuat.constructor, qa = new T(...a), qb = new T(...b); const r = qb.clone().multiply(qa.clone().invert()); if (r.w < 0) { r.x = -r.x; r.y = -r.y; r.z = -r.z; r.w = -r.w; } const ang = 2 * Math.acos(Math.min(1, r.w)), s = Math.sqrt(1 - r.w * r.w); return { angleDeg: ang * 180 / Math.PI, axis: s < 1e-9 ? [0, 0, 0] : [r.x / s, r.y / s, r.z / s] }; }, { a, b });
  const drag = async (from, to, steps = 10, opts = {}) => {
    const btn = opts.button ? { button: opts.button } : {};
    await p.mouse.move(...from); await p.mouse.down(btn); if (opts.ctrl) await p.keyboard.down('Control');
    await p.mouse.move(...to, { steps });
    const badge = (await p.isVisible('#rotBadge')) ? await p.textContent('#rotBadge') : null; const snapClass = await p.evaluate(() => document.getElementById('rotBadge').classList.contains('snap'));
    if (opts.ctrl) await p.keyboard.up('Control'); await p.mouse.up(btn); return { badge, snapClass };
  };
  const setAxis = async () => {}; // 단계 26: 방향 선택이 없어졌다(자유 회전). 예전 호출 자리를 유지하기 위한 빈 함수

  const reset = async () => { await p.click('[data-view=iso]'); await p.waitForTimeout(60); };
  const visible = () => p.evaluate(() => { const m = window.__sabari.viewer.debugIdMap(), { w, h, data, names } = m; const cnt = {}; let border = 0, sil = 0; const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? -1 : data[(yy * w + xx) * 4]); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const id = data[(y * w + x) * 4]; if (!id) continue; sil++; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++; if (at(x - 1, y) === id && at(x + 1, y) === id && at(x, y - 1) === id && at(x, y + 1) === id) { const n = names[id - 1]; cnt[n] = (cnt[n] ?? 0) + 1; } } const faces = Object.entries(cnt).filter(([n, c]) => c > 800 && /^(lid|base)_(top|front|back|left|right|bottom)$/.test(n)).sort((a, b) => b[1] - a[1]); return { faces: faces.map(([n, c]) => `${n}:${c}`), dominant: faces[0]?.[0] ?? null, border, sil }; });
  const shot = (n) => p.screenshot({ path: path.join(OUT, n), clip: { x: 321, y: 0, width: 1039, height: 900 } });
  const faceCenter = (id) => p.evaluate((f) => { const c = window.__sabari.viewer.faceCorners(f), r = document.querySelector('#viewport canvas').getBoundingClientRect(); return [r.left + c.reduce((s, x) => s + x[0], 0) / c.length, r.top + c.reduce((s, x) => s + x[1], 0) / c.length]; }, id);
  const colorFaces = async () => {
    for (const [id, color] of Object.entries(COLORS)) {
      const f = path.join(OUT, 'colors', `${id}.png`);
      if (!fs.existsSync(f)) { const b64 = await p.evaluate(({ id, color }) => { const c = document.createElement('canvas'); c.width = 500; c.height = 500; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 500, 500); g.fillStyle = '#fff'; g.font = 'bold 60px sans-serif'; g.textAlign = 'center'; g.fillText(id, 250, 280); return c.toDataURL('image/png').split(',')[1]; }, { id, color }); fs.writeFileSync(f, Buffer.from(b64, 'base64')); }
    }
    if (!(await p.isChecked('#useBase'))) await p.check('#useBase');
    for (const id of Object.keys(COLORS)) { await p.click(id.startsWith('base_') ? '#tab_base' : '#tab_lid'); await p.click(`#faceList button[data-face=${id}]`); await p.setInputFiles('#filePick', path.join(OUT, 'colors', `${id}.png`)); await p.waitForFunction((i) => window.__sabari.faces[i].img, id); }
    await p.click('#tab_lid'); await p.mouse.click(...(await p.bgPoint()));
  };
  const finish = async (name) => { results.page_errors = errors; assert.deepEqual(errors, []); fs.writeFileSync(path.join(OUT, name), JSON.stringify(results, null, 2)); console.log('ok', name, Object.keys(results).join(', ')); await context.close(); await browser.close(); };
  return { browser, context, p, results, rec, H, quat, camAxes, camDist, rel, drag, setAxis, reset, visible, shot, faceCenter, colorFaces, finish };
}
