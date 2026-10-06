// 작업 8 검증: 회전 상태 한 줄(실시간 갱신) + 왼쪽 패널 접기/펴기(카메라·자세 불변, 4종 창 크기, 새로고침 후 유지)
// 실행: SABARI_URL=<주소> node e2e/sidebar_task8.mjs
import { OUT, assert, fs, path, start } from './stage24_common.mjs';
const { p, finish, rec, drag, colorFaces } = await start();
await colorFaces();
const near = (a, b, e) => Math.abs(a - b) <= e;
const togglePanel = async () => ((await p.isVisible('#panelToggle')) ? p.click('#panelToggle') : p.click('#panelExpand')); // 작업 12: 접기(패널 안 화살표)와 펴기(가장자리 버튼)가 분리됨
const readout = () => p.textContent('#rotReadoutText');
const st = () => p.evaluate(() => { const v = window.__sabari.viewer; v.camera.updateMatrixWorld(true); return { q: v.boxQuat.toArray(), cam: v.camera.position.toArray(), camQ: v.camera.quaternion.toArray(), tgt: v.controls.target.toArray(), fov: v.camera.fov, lift: v.getLiftMm() }; });
const sameState = (a, b) => ['q', 'cam', 'camQ', 'tgt'].every((k) => a[k].every((x, i) => near(x, b[k][i], 1e-12))) && a.fov === b.fov && a.lift === b.lift;
const eulerText = () => p.evaluate(() => { const v = window.__sabari.viewer, T = v.boxQuat.constructor; const q = v.boxQuat; const sx = 2 * (q.w * q.x - q.y * q.z); const pitch = Math.asin(Math.max(-1, Math.min(1, sx))) * 180 / Math.PI; const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)) * 180 / Math.PI; return { yaw, pitch }; });
const parse = (t) => { const m = /좌우 ([+−])([\d.]+)° · 위아래 ([+−])([\d.]+)°/.exec(t); return m ? { yaw: (m[1] === '−' ? -1 : 1) * Number(m[2]), pitch: (m[3] === '−' ? -1 : 1) * Number(m[4]) } : null; };

// 1) 회전 상태 줄: 위치(뷰어 > 보기), 초기값, 알약 없음/임시 배지 유지
rec('readout_in_statusbar', await p.evaluate(() => !!document.querySelector('#statusRot #rotReadout')));
assert(await p.evaluate(() => !!document.querySelector('#statusRot #rotReadout')));
await p.click('[data-view=front]'); await p.waitForTimeout(100);
const t0 = await readout(); rec('readout_front', t0); assert(/^자유 회전 · 좌우 \+0\.0° · 위아래 \+0\.0°$/.test(t0), t0);
assert(!(await p.isVisible('#rotBadge')), '드래그 전에는 3D 화면 알약 없음');

// 2) 드래그 중: 임시 배지가 뜨고 상태 줄이 실시간 갱신, 끝나면 배지는 사라지고 줄은 남는다
const box = await p.locator('#viewport canvas').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
await p.mouse.move(cx, cy); await p.mouse.down();
await p.mouse.move(cx + 90, cy + 40, { steps: 10 });
const duringBadge = { visible: await p.isVisible('#rotBadge'), text: await p.textContent('#rotBadge') }; const duringReadout = await readout();
await p.mouse.up(); await p.waitForTimeout(100);
rec('drag', { badge: duringBadge, readoutDuring: duringReadout, badgeAfter: await p.isVisible('#rotBadge'), readoutAfter: await readout() });
assert(duringBadge.visible && /^자유 회전 · 좌우/.test(duringBadge.text), '임시 배지 유지');
assert(duringReadout !== t0 && parse(duringReadout), '드래그 중 줄 갱신');
assert(!(await p.isVisible('#rotBadge')) && (await readout()) === duringReadout);
const e1 = await eulerText(), pr1 = parse(await readout()); rec('readout_vs_quat', { e1, pr1 });
assert(near(e1.yaw, pr1.yaw, 0.06) && near(e1.pitch, pr1.pitch, 0.06), '표시 각도 = 박스 자세');

// 3) 시점 버튼·저장된 시점·세운 시점에서 갱신
const seen = {};
for (const v of ['top', 'iso', 'isoL', 'left']) { if (v === 'isoL') await p.keyboard.press('l'); else await p.click(`[data-view=${v}]`); await p.waitForTimeout(80); seen[v] = await readout(); const q = await eulerText(), pr = parse(seen[v]); assert(pr && near(q.yaw, pr.yaw, 0.06) && near(q.pitch, pr.pitch, 0.06), v); }
await p.click('.vp-fixed[data-side=left]'); await p.waitForTimeout(100); seen.standing = await readout(); assert(seen.standing !== seen.left, '세운 시점 후 갱신: ' + seen.standing);
rec('after_view_buttons', seen);

// 4) 축 잠금: 축 이름·각도 표시, 각도 바 버튼/드래그로 실시간
await p.click('[data-view=iso]'); await p.click('#lockToggle'); await p.waitForTimeout(60);
const lockNoAxis = await readout(); rec('lock_no_axis', lockNoAxis); assert(/축 잠금/.test(lockNoAxis));
await p.locator('#axisRow button').first().click(); await p.waitForTimeout(80);
const lockAxis = await readout(); rec('lock_axis', lockAxis); assert(/^축 잠금 · .+ 축 \+0\.0°$/.test(lockAxis), lockAxis);
await p.evaluate(() => { const d = document.querySelector('#angleBtnRow').closest('details'); if (d) d.open = true; });
await p.click('#angleBtnRow [data-ang="5"]'); await p.waitForTimeout(80);
const lock5 = await readout(); rec('lock_plus5', lock5); assert(/\+5\.0°$/.test(lock5), lock5);
await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 70, cy + 20, { steps: 8 });
const lockDragBadge = await p.isVisible('#rotBadge'); const lockDragReadout = await readout(); await p.mouse.up();
rec('lock_drag', { badge: lockDragBadge, readout: lockDragReadout }); assert(lockDragBadge && lockDragReadout !== lock5);
await p.click('#lockToggle'); await p.waitForTimeout(60); const unlocked = await readout(); rec('unlock', unlocked); assert(/^자유 회전/.test(unlocked));

// 5) 패널 접기/펴기: 카메라·자세 수치 불변, 새로고침 후 유지
await p.click('[data-view=iso]'); await p.waitForTimeout(80);
const wasW = (await p.locator('#viewport canvas').boundingBox()).width, before = await st();
await togglePanel(); await p.waitForTimeout(300);
const afterCollapse = await st(), collW = (await p.locator('#viewport canvas').boundingBox()).width;
rec('collapse', { canvasWidth: [wasW, collW], panelVisible: await p.isVisible('#panel'), ariaExpanded: await p.getAttribute('#panelToggle', 'aria-expanded'), label: await p.textContent('#panelToggle'), sameState: sameState(before, afterCollapse) });
assert(!(await p.isVisible('#panel')) && collW > wasW + 250 && sameState(before, afterCollapse));
await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
rec('collapsed_after_reload', { panelVisible: await p.isVisible('#panel'), label: await p.textContent('#panelToggle') }); assert(!(await p.isVisible('#panel')));
const keys = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k).length])));
rec('localStorage', keys);
const draftHas = await p.evaluate(() => Object.entries(localStorage).some(([k, v]) => k !== 'sabari.panelCollapsed' && v.includes('panelCollapsed')));
assert(!draftHas);
await togglePanel(); await p.waitForTimeout(300);
rec('expanded_again', { panelVisible: await p.isVisible('#panel'), canvasWidth: (await p.locator('#viewport canvas').boundingBox()).width }); assert(await p.isVisible('#panel'));
// 같은 페이지 안에서 접기→펴기 전후 수치 동일(새로고침 이후 새 상태에서 다시)
await p.keyboard.press('l'); await p.waitForTimeout(80); const b2 = await st();
await togglePanel(); await p.waitForTimeout(250); await togglePanel(); await p.waitForTimeout(250);
const a2 = await st(); rec('collapse_expand_roundtrip_same', sameState(b2, a2)); assert(sameState(b2, a2));

// 6) 창 크기 4종 × 접힘/펼침: 박스 잘림 없음(F 후), 가로 스크롤 없음
const sizes = [[1920, 1080], [1360, 900], [1024, 768], [390, 844]];
const clip = {};
for (const [w, h] of sizes) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(350);
  for (const collapsed of (w < 900 ? [false] : [false, true])) { // 900px 미만(모바일)에는 접기 버튼이 없고 작업 시트가 대신한다
    const isC = await p.evaluate(() => document.body.classList.contains('panel-collapsed'));
    if (w >= 900 && isC !== collapsed) { await togglePanel(); await p.waitForTimeout(300); }
    await p.evaluate(() => window.__sabari.viewer.setView('iso', true)); await p.waitForTimeout(150);
    const r = await p.evaluate(() => { const v = window.__sabari.viewer, m = v.debugIdMap(); let border = 0; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { if (!m.data[(y * m.w + x) * 4]) continue; if (x === 0 || y === 0 || x === m.w - 1 || y === m.h - 1) border++; } const cv = document.querySelector('#viewport canvas'); return { border, canvas: [cv.clientWidth, cv.clientHeight], hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, toggleVisible: !!(document.getElementById('panelToggle').offsetParent || document.getElementById('panelExpand').offsetParent || window.innerWidth < 900) }; });
    clip[`${w}x${h}_${collapsed ? 'collapsed' : 'open'}`] = r;
    assert(r.border === 0 && !r.hscroll && r.toggleVisible, `${w}x${h} ${collapsed} ${JSON.stringify(r)}`);
  }
}
rec('window_sizes', clip);
await p.screenshot({ path: path.join(OUT, 'last_collapsed_mobile.png') });
await finish('sidebar_task8.json');
