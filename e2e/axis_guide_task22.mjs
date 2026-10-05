// 작업 22 검증: 축 선 보기 토글 — 7개 회전축에서 켬/끔 파란 선 픽셀, 축 잠금 수치 불변, 새로고침 후 유지, PNG·GLB에 선 없음.
// 합성(기본 빈 면) 화면만 사용한다. 실행: SABARI_URL=<주소> STAGE_OUT=verification/axis22 node e2e/axis_guide_task22.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/axis22'); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
const open = async () => { await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari?.viewer); await p.waitForTimeout(700); };
await open();
const click = (id) => p.evaluate((i) => document.getElementById(i).click(), id);
const blueCount = (b64) => p.evaluate(async (b) => { const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b)).blob()); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], bb = d[i + 2], a = d[i + 3]; if (a > 200 && bb > 150 && bb - r > 70 && gg > r && gg < bb) n++; } return n; }, b64);
const canvasShot = async () => p.evaluate(() => { const v = window.__sabari.viewer; v.draw(true); return v.renderer.domElement.toDataURL('image/png').split(',')[1]; }); // 3D 캔버스 픽셀만(DOM 겹침 제외): 그린 직후 같은 작업 안에서 읽는다
const pngBlue = async (bg, mult) => p.evaluate(async ({ bg, mult }) => { const r = await window.__sabari.viewer.screenshotScaled(bg, mult); const img = await createImageBitmap(r.blob); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) { const rr = d[i], gg = d[i + 1], bb = d[i + 2], a = d[i + 3]; if (a > 200 && bb > 150 && bb - rr > 70 && gg > rr && gg < bb) n++; } return { n, w: img.width, h: img.height, applied: r.applied }; }, { bg, mult });
const R = { axes: [], quat: [], png: [], persist: {}, glb: {} };
await click('lockToggle'); await p.waitForTimeout(150);
R.initial = await p.evaluate(() => ({ checked: document.getElementById('axisGuideToggle').getAttribute('aria-checked'), disabled: document.getElementById('axisGuideToggle').disabled, state: document.getElementById('axisGuideState').textContent }));
for (const ax of ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']) {
  await p.evaluate((a) => document.querySelector(`[data-axis=${a}]`).click(), ax); await p.waitForTimeout(250);
  const setGuide = async (want) => { const cur = await p.evaluate(() => document.getElementById('axisGuideToggle').getAttribute('aria-checked') === 'true'); if (cur !== want) await click('axisGuideToggle'); await p.waitForTimeout(150); };
  await setGuide(true); const on = await blueCount(await canvasShot());
  await setGuide(false); const off = await blueCount(await canvasShot());
  const vis = await p.evaluate(() => { const v = window.__sabari.viewer; return { line: !!v.lockLine, lineVisible: v.lockLine?.visible, hls: v.lockHls.length, hlVisible: v.lockHls.every((o) => o.visible) }; });
  await setGuide(true); const on2 = await blueCount(await canvasShot());
  const visOn = await p.evaluate(() => { const v = window.__sabari.viewer; return { lineVisibleOn: v.lockLine?.visible, hlVisibleOn: v.lockHls.every((o) => o.visible) }; });
  R.axes.push({ axis: ax, blueOn: on, blueOff: off, blueOnAgain: on2, ...vis, ...visOn, hasLine: vis.line });
}
// 축 잠금 수치 불변: 켬/끔에서 같은 조작의 quaternion 이 완전히 같아야 한다
const quatOf = (g) => p.evaluate(async (guide) => { const v = window.__sabari.viewer; const cur = document.getElementById('axisGuideToggle').getAttribute('aria-checked') === 'true'; if (cur !== guide) document.getElementById('axisGuideToggle').click(); document.querySelector('[data-axis=front]').click(); await new Promise((r) => setTimeout(r, 200)); v.setLockAngleDeg(0); const q0 = v.boxQuat.toArray(); v.setLockAngleDeg(30); const q30 = v.boxQuat.toArray(); const a30 = v.getLockAngleDeg(); v.setLockAngleDeg(0); const q0b = v.boxQuat.toArray(); return { q0, q30, a30, q0b }; }, g);
const qOn = await quatOf(true), qOff = await quatOf(false);
const dq = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
R.quat = { angle30On: qOn.a30, angle30Off: qOff.a30, maxDiff30: dq(qOn.q30, qOff.q30), maxDiff0: dq(qOn.q0, qOff.q0), returnTo0On: dq(qOn.q0, qOn.q0b), returnTo0Off: dq(qOff.q0, qOff.q0b) };
// PNG: 축 선을 켠 상태에서도 PNG 에는 파란 선이 없다
await p.evaluate(() => { const b = document.getElementById('axisGuideToggle'); if (b.getAttribute('aria-checked') !== 'true') b.click(); document.querySelector('[data-axis=top]').click(); });
await p.waitForTimeout(250);
R.canvasBlueWhileOn = await blueCount(await canvasShot());
for (const [bg, mult] of [['white', 1], ['transparent', 1], ['white', 2], ['transparent', 2], ['white', 4], ['transparent', 4]]) R.png.push({ bg, mult, ...(await pngBlue(bg, mult)) });
// 화면 그대로(배경 포함) 저장 경로는 같은 renderToCanvas 를 쓰므로 snapshot 으로도 확인
R.snapshotBlue = await p.evaluate(async () => { const c = window.__sabari.viewer.snapshot(2); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 200 && d[i + 2] > 150 && d[i + 2] - d[i] > 70 && d[i + 1] > d[i] && d[i + 1] < d[i + 2]) n++; } return n; });
// GLB: 켬/끔에서 바이트가 같고 선이 노드에 없다
const glbHash = (guide) => p.evaluate(async (g) => { const b = document.getElementById('axisGuideToggle'); if ((b.getAttribute('aria-checked') === 'true') !== g) b.click(); const buf = await window.__sabari.viewer.exportGLB(); const h = await crypto.subtle.digest('SHA-256', buf); const txt = new TextDecoder().decode(new Uint8Array(buf).slice(20, 20 + 200000)); return { sha: [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join(''), bytes: buf.byteLength, hasLockName: /__lock/.test(txt) }; }, guide);
R.glb = { on: await glbHash(true), off: await glbHash(false) };
const glbBuf = Buffer.from(await p.evaluate(async () => { const buf = await window.__sabari.viewer.exportGLB(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }), 'base64');
fs.writeFileSync(path.join(OUT, 'axis22_guide_on.glb'), glbBuf);
// 새로고침 후 유지: 끈 상태를 기억하고, 임시저장·프로젝트 직렬화에는 들어가지 않는다
await p.evaluate(() => { const b = document.getElementById('axisGuideToggle'); if (b.getAttribute('aria-checked') === 'true') b.click(); });
R.persist.stored = await p.evaluate(() => localStorage.getItem('sabari.axisGuide'));
await open(); await click('lockToggle'); await p.waitForTimeout(200);
R.persist.afterReload = await p.evaluate(() => ({ checked: document.getElementById('axisGuideToggle').getAttribute('aria-checked'), state: document.getElementById('axisGuideState').textContent, vis: window.__sabari.viewer.getAxisGuideVisible() }));
R.persist.otherKeys = await p.evaluate(() => Object.keys(localStorage).filter((k) => k !== 'sabari.axisGuide' && /axis/i.test(localStorage.getItem(k) ?? '')).length);
// 키 G (단축키 사용 켬/끔)
await p.evaluate(() => document.activeElement?.blur());
await p.keyboard.press('g'); await p.waitForTimeout(100); const afterG = await p.evaluate(() => window.__sabari.viewer.getAxisGuideVisible());
await p.evaluate(() => { const o = document.getElementById('optKeys'); o.checked = false; o.dispatchEvent(new Event('change')); }); await p.keyboard.press('g'); await p.waitForTimeout(100); const keysOffG = await p.evaluate(() => window.__sabari.viewer.getAxisGuideVisible());
await click('axisGuideToggle'); await p.waitForTimeout(100); const clickWorksWhenKeysOff = await p.evaluate(() => window.__sabari.viewer.getAxisGuideVisible());
R.keys = { afterGToggledOn: afterG, keysOffGUnchanged: keysOffG === afterG, clickWorksWhenKeysOff: clickWorksWhenKeysOff !== keysOffG };
// 축 잠금이 꺼지면 비활성
await p.evaluate(() => { const o = document.getElementById('optKeys'); o.checked = true; o.dispatchEvent(new Event('change')); });
await click('lockToggle'); await p.waitForTimeout(150);
R.lockOff = await p.evaluate(() => ({ disabled: document.getElementById('axisGuideToggle').disabled, state: document.getElementById('axisGuideState').textContent }));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
R.checks = {
  sevenAxes: R.axes.length === 7,
  offZeroBlue: R.axes.every((a) => a.blueOff === 0),
  onShowsBlue: R.axes.filter((a) => a.axis !== 'iso').every((a) => a.blueOn > 20), // 3/4(iso)는 대각선 축이라 화면에서 점으로 겹쳐 픽셀 대신 아래 가시성 플래그로 확인한다
  onAgainSame: R.axes.every((a) => Math.abs(a.blueOnAgain - a.blueOn) <= Math.max(5, a.blueOn * 0.02)),
  objectsKeptWhenOff: R.axes.every((a) => a.hasLine && a.lineVisible === false && (a.hls === 0 || a.hlVisible === false) && a.lineVisibleOn === true && (a.hls === 0 || a.hlVisibleOn === true)) && R.axes.filter((a) => a.axis !== 'iso').every((a) => a.hls > 0),
  quatInvariant: R.quat.maxDiff30 < 1e-6 && R.quat.maxDiff0 < 1e-9 && R.quat.returnTo0On < 1e-9 && R.quat.returnTo0Off < 1e-9,
  angle30: Math.abs(R.quat.angle30On - 30) < 1e-6 && Math.abs(R.quat.angle30Off - 30) < 1e-6,
  pngNoBlue: R.png.every((x) => x.n === 0) && R.snapshotBlue === 0 && R.canvasBlueWhileOn > 20,
  glbSame: R.glb.on.sha === R.glb.off.sha && !R.glb.on.hasLockName,
  persisted: R.persist.stored === '0' && R.persist.afterReload.checked === 'false' && R.persist.afterReload.vis === false && R.persist.otherKeys === 0,
  keys: R.keys.afterGToggledOn === true && R.keys.keysOffGUnchanged && R.keys.clickWorksWhenKeysOff,
  lockOffDisabled: R.lockOff.disabled === true && /축 잠금을 켜면/.test(R.lockOff.state),
  noPageErrors: errors.length === 0,
};
R.errors = errors;
fs.writeFileSync(path.join(OUT, 'axis22_results.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R.checks));
console.log('axes', JSON.stringify(R.axes.map((a) => [a.axis, a.blueOn, a.blueOff])), 'quat', JSON.stringify(R.quat));
const allOk = Object.values(R.checks).every(Boolean); console.log(allOk ? 'AXIS22_OK' : 'AXIS22_FAIL');
await browser.close(); process.exit(allOk ? 0 : 1);
