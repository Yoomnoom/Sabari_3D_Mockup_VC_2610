// 유니티식 조작 검증 공통 도구
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const V = path.join(ROOT, 'verification');
export const S = path.join(ROOT, 'assets', 'samples');
export const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
export { fs, path };
export const same = (a, b2) => JSON.stringify(a) === JSON.stringify(b2);
export const near = (a, b2, tol = 0.6) => Math.abs(a - b2) <= tol;

export async function start() {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const R = {};
  const rec = (k, v) => { R[k] = v; };
  const open = async (touch = true) => {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, hasTouch: touch, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    await p.goto(URL);
    await p.waitForFunction(() => window.__sabari);
    await p.waitForTimeout(300);
    return { ctx, p };
  };
  const { ctx, p } = await open();
  const eul = () => p.evaluate(() => window.__sabari.viewer.getBoxEuler());
  const nums = () => p.evaluate(() => ['rbX', 'rbY', 'rbZ'].map((i) => +document.getElementById(i).value));
  const quat = () => p.evaluate(() => window.__sabari.viewer.boxQuat.toArray().map((n) => +n.toFixed(5)));
  const camState = () => p.evaluate(() => { const v = window.__sabari.viewer, c = v.camera, t = v.controls.target, d = c.position.clone().sub(t); const l = d.length(); return { dir: [d.x, d.y, d.z].map((n) => +(n / l).toFixed(4)), dist: +l.toFixed(5), a: v.getAngles() }; });
  const setEuler = (x, y, z) => p.evaluate(({ x, y, z }) => { for (const [id, v] of [['rbX', x], ['rbY', y], ['rbZ', z]]) { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); } }, { x, y, z });
  const ringPt = (axis, phiDeg, frozen = null) => p.evaluate(({ axis, phiDeg, frozen }) => {
    const v = window.__sabari.viewer, g = v.gizmo;
    v.syncCamera(); g.group.updateMatrixWorld(true); const M = frozen ? new (v.camera.matrixWorld.constructor)().fromArray(frozen) : g.group.matrixWorld;
    const Rr = g.pickers.get(axis).geometry.parameters.radius, phi = (phiDeg * Math.PI) / 180, T = v.camera.position.constructor;
    const loc = axis === 'x' ? new T(0, Rr * Math.cos(phi), Rr * Math.sin(phi)) : axis === 'y' ? new T(Rr * Math.cos(phi), 0, Rr * Math.sin(phi)) : new T(Rr * Math.cos(phi), Rr * Math.sin(phi), 0);
    const w = loc.applyMatrix4(M);
    const depth = w.clone().applyMatrix4(v.camera.matrixWorldInverse).z;
    const q = w.clone().project(v.camera), r = v.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (q.x * 0.5 + 0.5) * r.width, y: r.top + (-q.y * 0.5 + 0.5) * r.height, depth };
  }, { axis, phiDeg, frozen });
  const bestPhi = async (axis) => { let best = 0, bd = -1e9; for (let d = 0; d < 360; d += 15) { const s = await ringPt(axis, d); if (s.depth > bd && s.x > 380 && s.x < 1240 && s.y > 120 && s.y < 760) { bd = s.depth; best = d; } } return best; };
  const dragRing = async (axis, deltaDeg, { ctrl = false, steps = 12 } = {}) => {
    const phi0 = await bestPhi(axis), frozen = await p.evaluate(() => { const g = window.__sabari.viewer.gizmo; g.group.updateMatrixWorld(true); return g.group.matrixWorld.toArray(); }), a = await ringPt(axis, phi0, frozen);
    await p.mouse.move(a.x, a.y); await p.waitForTimeout(60); await p.mouse.down();
    if (ctrl) await p.keyboard.down('Control');
    const live = [];
    for (let i = 1; i <= steps; i++) { const t = await ringPt(axis, phi0 + (deltaDeg * i) / steps, frozen); await p.mouse.move(t.x, t.y); if (i === Math.round(steps / 2)) live.push({ badge: await p.textContent('#dragBadge'), nums: await nums() }); }
    const end = { badge: await p.textContent('#dragBadge'), badgeVisible: await p.isVisible('#dragBadge'), snapClass: await p.evaluate(() => document.getElementById('dragBadge').classList.contains('snap')) };
    if (ctrl) await p.keyboard.up('Control');
    await p.mouse.up(); await p.waitForTimeout(60);
    return { phi0, live, end };
  };
  const resetPose = async () => { await p.click('#btnBoxReset'); };
  const shot = (n) => p.screenshot({ path: path.join(V, `${n}.png`), clip: { x: 321, y: 0, width: 1039, height: 900 } });
  const finish = async (name) => { rec('errors', errs); fs.writeFileSync(path.join(V, name), JSON.stringify(R, null, 2)); console.log('done'); await ctx.close(); await b.close(); };
  return { b, R, rec, errs, open, ctx, p, eul, nums, quat, camState, setEuler, ringPt, bestPhi, dragRing, resetPose, shot, finish };
}
