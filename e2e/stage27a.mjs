// 단계 27a 검증: main(축 잠금·7개 회전축 버튼)과 feature/dieline-real(아트보드 전체 이미지 칼선 분할)이 한 화면에서 함께 동작하는지. 결과: verification/stage27a/
// 사용: STAGE_OUT=verification/stage27a SABARI_URL=http://127.0.0.1:8882/ node e2e/stage27a.mjs   (합성 이미지 verification/dieline-real/synth_art_colors.png 필요)
import { ROOT, assert, path } from './stage24_common.mjs';
import { start } from './stage24_common.mjs';
const { p, rec, quat, drag, reset, finish } = await start();
const OUT27 = path.join(ROOT, process.env.STAGE_OUT ?? 'verification/stage27a');
const full = (n) => p.screenshot({ path: path.join(OUT27, n) });
const lockSt = () => p.evaluate(() => { const v = window.__sabari.viewer; const a = v.getLockAxisLocal(); return { on: v.isLockOn(), view: v.getLockView(), local: a ? a.toArray() : null, rowHidden: document.getElementById('axisRow').hidden }; });
// 박스의 화면 중심에서 가로로 끌고, 회전 전후 쿼터니언 차이의 축이 잠금 축(월드)과 평행한지 본다
const rotAxisVsLock = () => p.evaluate(() => { const v = window.__sabari.viewer; return { q: v.boxQuat.clone().toArray(), w: v.getLockAxisWorld().toArray() }; });
const centerXY = () => p.evaluate(() => { const v = window.__sabari.viewer, c = v.models.editor.pivot.getWorldPosition(v.camera.position.clone()).project(v.camera), r = v.renderer.domElement.getBoundingClientRect(); return [r.left + (c.x * 0.5 + 0.5) * r.width, r.top + (-c.y * 0.5 + 0.5) * r.height]; });
const axisOf = (q0, q1) => { // q1 * q0^-1 의 회전축(월드)
  const m = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const d = m(q1, [-q0[0], -q0[1], -q0[2], q0[3]]); const n = Math.hypot(d[0], d[1], d[2]); return n < 1e-9 ? null : [d[0] / n, d[1] / n, d[2] / n];
};

// ===== 1. 축 잠금 + 7개 회전축 버튼 회전 (칼선 기능이 들어 있는 빌드에서)
await reset(); await p.click('#lockToggle'); await p.waitForTimeout(100);
const s0 = await lockSt(); assert(s0.on && !s0.rowHidden);
const rows = [];
for (const a of ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']) {
  await reset(); if (!(await lockSt()).on) await p.click('#lockToggle');
  await p.click(`[data-axis=${a}]`); await p.waitForTimeout(80);
  const b = await rotAxisVsLock(); const [cx, cy] = await centerXY();
  await drag([cx + 70, cy - 40], [cx + 40, cy + 40], 8); await p.waitForTimeout(60);
  const q1 = await quat(); const ax = axisOf(b.q, q1); const par = ax ? Math.abs(ax[0] * b.w[0] + ax[1] * b.w[1] + ax[2] * b.w[2]) : null;
  rows.push({ axis: a, rotated: !!ax, axisParallelToLock: par === null ? null : +par.toFixed(6) });
  assert(ax && par > 0.999, `${a}: 회전축이 잠금 축과 평행하지 않다 (${par})`);
}
rec('1_seven_axis_buttons_rotate', rows);
await reset(); await p.click('[data-axis=front]'); const [cx0, cy0] = await centerXY(); await drag([cx0 + 80, cy0 - 30], [cx0 - 60, cy0 + 50], 10); await p.waitForTimeout(150);
await full('combo1_lock_front_rotated.png');

// ===== 2. 같은 상태(잠금 켬)에서 칼선 이미지 한 장 올리기 → 분할 영역 조정 화면
await p.evaluate(() => { document.getElementById('dDie').open = true; });
await p.setInputFiles('#fileDieline', path.join(ROOT, 'verification', 'dieline-real', 'synth_art_colors.png'));
await p.waitForSelector('#splitDlg[open]'); await p.waitForFunction(() => document.getElementById('splitList').children.length > 0); await p.waitForTimeout(500);
const dlg = await p.evaluate(() => ({ open: document.getElementById('splitDlg').open, mode: document.getElementById('splitMode').value, regions: document.querySelectorAll('#splitSvg g[data-face]').length, listItems: document.getElementById('splitList').children.length, bleed: document.getElementById('splitBleed')?.value ?? null }));
rec('2_split_dialog', dlg); assert(dlg.open && dlg.mode === 'artboard' && dlg.regions === 5);
await full('combo2_split_dialog.png');

// ===== 3. 적용 후에도 잠금·7개 버튼이 그대로 동작
await p.click('#btnSplitApply'); await p.waitForTimeout(1000);
const st3 = await lockSt(); rec('3_after_apply_lock_state', st3); assert(st3.on && st3.view === 'front' && !st3.rowHidden);
await p.click('[data-axis=left]'); const [cx1, cy1] = await centerXY(); const qa = await quat(); const wa = (await rotAxisVsLock()).w; await drag([cx1 + 70, cy1 - 40], [cx1 + 40, cy1 + 40], 8); await p.waitForTimeout(100);
const qb = await quat(); const ax3 = axisOf(qa, qb); const par3 = ax3 ? Math.abs(ax3[0] * wa[0] + ax3[1] * wa[1] + ax3[2] * wa[2]) : null;
rec('3_rotate_after_apply', { axis: 'left', axisParallelToLock: par3 }); assert(par3 > 0.999);
await full('combo3_after_apply_lock_on.png');
await finish('stage27a.json');
