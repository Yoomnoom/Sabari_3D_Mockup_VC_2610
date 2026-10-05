// 작업 9 검증: 바닥 그림자(켜기/끄기, 세기·부드러움·방향, 접촉 높이, 색 불변, 투명 PNG, GLB·.sabari 불변, 새로고침 복원, 프레임 시간, 외부 GLB)
// 실행: SABARI_URL=<주소> STAGE_OUT=verification-private/floor-shadow node e2e/floor_shadow_task9.mjs  (그 뒤 python e2e/floor_shadow_task9.py)
import { spawnSync } from 'node:child_process';
import { OUT, ROOT, assert, fs, path, start } from './stage24_common.mjs';
const { p, finish, rec, colorFaces } = await start();
await colorFaces();
const near = (a, b, e) => Math.abs(a - b) <= e;
await p.evaluate(() => { document.getElementById('dLight').open = true; });

// 페이지 안 도구: 화면 캡처를 이름으로 저장하고, 두 캡처의 차이(전체/마스크 안/바깥)를 센다
const inject = () => p.evaluate(() => {
  const V = window.__sabari.viewer; const snaps = {}; window.__snaps = snaps;
  window.__cap = async (name, bg = 'white', mult = 1) => { const r = await V.screenshotScaled(bg, mult); const bm = await createImageBitmap(r.blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); snaps[name] = g.getImageData(0, 0, c.width, c.height); return [c.width, c.height]; };
  // 박스 실루엣 안쪽 마스크(2px 침식): 가장자리 안티앨리어싱 픽셀은 뒤쪽 그림자와 정당하게 섞일 수 있어 면 색 비교에서 뺀다
  window.__mask = () => { const m = V.debugIdMap(); let a = new Uint8Array(m.w * m.h); for (let i = 0; i < a.length; i++) a[i] = m.data[i * 4] ? 1 : 0; for (let it = 0; it < 2; it++) { const b = new Uint8Array(a.length); for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) { const i = y * m.w + x; b[i] = a[i] && a[i - 1] && a[i + 1] && a[i - m.w] && a[i + m.w] && a[i - m.w - 1] && a[i - m.w + 1] && a[i + m.w - 1] && a[i + m.w + 1] ? 1 : 0; } a = b; } snaps.__mask = a; return [m.w, m.h]; };
  window.__diff = (a, b) => { const A = snaps[a], B = snaps[b], M = snaps.__mask; let all = 0, inBox = 0, maxIn = 0, outBox = 0, sumDark = 0; for (let i = 0; i < A.width * A.height; i++) { let d = 0; for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(A.data[i * 4 + k] - B.data[i * 4 + k])); if (!d) continue; all++; if (M && M[i]) { inBox++; maxIn = Math.max(maxIn, d); } else { outBox++; sumDark += (A.data[i * 4] - B.data[i * 4]); } } return { diffPixels: all, inBox, maxDiffInBox: maxIn, outBox, meanDarkening: outBox ? sumDark / outBox : 0 }; };
});
await inject();
const cap = (n, bg, m) => p.evaluate(([n, bg, m]) => window.__cap(n, bg, m), [n, bg ?? 'white', m ?? 1]);
const mask = () => p.evaluate(() => window.__mask());
const diff = (a, b) => p.evaluate(([a, b]) => window.__diff(a, b), [a, b]);
const set = async (o) => p.evaluate((o) => { const V = window.__sabari.viewer; V.setFloorShadow({ ...V.getFloorShadow(), ...o }); }, o);
const ui = async (id, v) => { await p.fill(`#${id}`, String(v)); await p.locator(`#${id}`).dispatchEvent('change'); };
const stateOf = () => p.evaluate(() => ({ ...window.__sabari.viewer.getFloorShadow(), floorY: window.__sabari.viewer.getFloorY(), pressed: document.getElementById('shadowToggle').getAttribute('aria-pressed'), label: document.getElementById('shadowToggle').textContent, ctlHidden: document.getElementById('shadowCtl').hidden }));

// 1) 기본 꺼짐, 토글 UI(텍스트 라벨 + aria-pressed), 조절 항목은 켰을 때만
const s0 = await stateOf(); rec('default_off', s0);
assert(s0.on === false && s0.pressed === 'false' && s0.label === '바닥 그림자 보기' && s0.ctlHidden === true && s0.floorY === null);
await p.click('#shadowToggle'); const s1 = await stateOf(); rec('after_on', s1);
assert(s1.on && s1.pressed === 'true' && s1.label === '바닥 그림자 숨기기' && s1.ctlHidden === false && s1.strength === 0.4 && s1.soft === 0.5 && s1.az === 225 && s1.el === 65);
await p.click('[data-view=iso]'); await p.waitForTimeout(200);
await p.click('#shadowToggle'); await p.waitForTimeout(100); assert((await stateOf()).ctlHidden === true);
await p.click('#shadowToggle');

// 2) 세기·부드러움·방향 변경에 따른 그림자 변화 (전면 시점에서 바닥에 보이는 그림자)
await p.click('[data-view=front]'); await set({ on: false }); await p.waitForTimeout(150); await cap('off_front'); await mask();
const eff = {};
for (const [k, o] of Object.entries({ strength0: { on: true, strength: 0 }, strength40: { on: true, strength: 0.4 }, strength100: { on: true, strength: 1 }, soft0: { on: true, strength: 0.6, soft: 0, az: 35 }, soft100: { on: true, strength: 0.6, soft: 1, az: 35 }, azLeft: { on: true, strength: 0.6, soft: 0.5, az: 325 }, azRight: { on: true, strength: 0.6, soft: 0.5, az: 90 }, elLow: { on: true, strength: 0.6, soft: 0.5, az: 35, el: 20 }, elHigh: { on: true, strength: 0.6, soft: 0.5, az: 35, el: 80 } })) {
  await set(o); await p.waitForTimeout(150); await cap(k); eff[k] = await diff('off_front', k);
}
rec('effects_vs_off', eff);
assert(eff.strength0.diffPixels === 0, '세기 0 = 그림자 없음');
assert(eff.strength40.diffPixels > 500 && eff.strength100.meanDarkening > eff.strength40.meanDarkening * 1.5, '세기가 클수록 진함');
for (const k of Object.keys(eff)) assert(eff[k].inBox === 0, `${k}: 박스 색은 그대로`);
// 부드러움: 그림자 가장자리 전이 폭(중간 밝기 픽셀 수) 비교
const edge = await p.evaluate(() => { const S = window.__snaps; const cnt = (n) => { const A = S[n], B = S.off_front; let mid = 0, full = 0; for (let i = 0; i < A.width * A.height; i++) { const d = B.data[i * 4] - A.data[i * 4]; if (d > 3) { full++; if (d < 0.6 * 153) mid++; } } return { shadowPx: full, midTonePx: mid }; }; return { soft0: cnt('soft0'), soft100: cnt('soft100') }; });
rec('softness_edge', edge); assert(edge.soft100.midTonePx > edge.soft0.midTonePx * 1.3 || edge.soft100.shadowPx > edge.soft0.shadowPx, '부드러움이 크면 가장자리 전이가 넓음');
// 방향: 그림자 무게중심의 좌우 이동
const cen = await p.evaluate(() => { const S = window.__snaps; const c = (n) => { const A = S[n], B = S.off_front; let sx = 0, sy = 0, N = 0; for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) { const i = y * A.width + x; if (B.data[i * 4] - A.data[i * 4] > 3) { sx += x; sy += y; N++; } } return { x: N ? sx / N : null, y: N ? sy / N : null, n: N }; }; return { azLeft: c('azLeft'), azRight: c('azRight'), elLow: c('elLow'), elHigh: c('elHigh') }; });
rec('shadow_centroids', cen);
assert(cen.azLeft.x > cen.azRight.x, '오른쪽에서 비추면 그림자는 왼쪽, 왼쪽에서 비추면 오른쪽'); assert(cen.elLow.n > 0 && cen.elHigh.n > 0);

// 3) 자세별 바닥 접촉 높이(수치): floorY = 보이는 메시 꼭짓점의 월드 최저점 − 1e-4
await set({ on: true, strength: 0.4, soft: 0.5, az: 225, el: 65 });
const contactOf = () => p.evaluate(() => {
  const V = window.__sabari.viewer; V.setFloorShadow({ ...V.getFloorShadow() }); // 그리기 요청
  return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
    let minY = Infinity; const root = V.cur?.root ?? V['models'][V['slot']].root; root.updateWorldMatrix(true, true);
    const shown = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
    root.traverse((o) => { if (!o.isMesh || !shown(o) || /highlight|lock|__/.test(o.name)) return; const pos = o.geometry.attributes.position, v = new (V.camera.position.constructor)(); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); minY = Math.min(minY, v.y); } });
    res({ floorY: V.getFloorY(), minY, gap: V.getFloorY() - (minY - 1e-4) });
  })));
});
const poses = { lying: [0, 0, 0, 1], standing: [0.5, 0.5, 0.5, 0.5], flipped_x180: [1, 0, 0, 0], tilt30: [Math.sin(Math.PI / 12), 0, 0, Math.cos(Math.PI / 12)], tilt_xyz: [0.3, 0.5, 0.2, 0.7874] };
const contact = {};
for (const [k, q] of Object.entries(poses)) { await p.evaluate((q) => window.__sabari.viewer.setBoxQuatRaw(q), q); contact[k] = await contactOf(); assert(near(contact[k].gap, 0, 1e-6), `${k} 접촉 ${JSON.stringify(contact[k])}`); }
await p.evaluate(() => window.__sabari.viewer.setBoxQuatRaw([0, 0, 0, 1]));
await p.click('#btnOpen'); await p.waitForTimeout(100); contact.lid_open = await contactOf(); assert(near(contact.lid_open.gap, 0, 1e-6));
await p.uncheck('#showBase'); contact.base_hidden_lid_open = await contactOf(); assert(near(contact.base_hidden_lid_open.gap, 0, 1e-6)); await p.check('#showBase');
await p.uncheck('#showLid'); contact.lid_hidden = await contactOf(); assert(near(contact.lid_hidden.gap, 0, 1e-6)); await p.check('#showLid');
await p.click('#btnClose'); rec('contact_height', contact);
// 뚜껑·몸통 표시/열림이 그림자에 반영(그림자 픽셀 수·형태가 달라짐)
await p.click('[data-view=front]'); await p.waitForTimeout(150); await set({ on: true, strength: 0.6, az: 60, el: 40 });
await cap('sh_closed'); await p.click('#btnOpen'); await p.waitForTimeout(150); await cap('sh_open'); await p.click('#btnClose');
await p.uncheck('#showLid'); await p.waitForTimeout(150); await cap('sh_nolid'); await p.check('#showLid'); await p.uncheck('#showBase'); await p.waitForTimeout(150); await cap('sh_nobase'); await p.check('#showBase');
await set({ on: false }); await p.waitForTimeout(100);
// 같은 시점에서 그림자가 꺼진 기준과 비교한 그림자 픽셀 수
const shPix = {};
for (const [k, setup] of Object.entries({ closed: async () => {}, open: async () => p.click('#btnOpen'), nolid: async () => p.uncheck('#showLid'), nobase: async () => p.uncheck('#showBase') })) { await setup(); await p.waitForTimeout(120); await cap('base_' + k); shPix[k] = await diff('base_' + k, 'sh_' + k); await p.click('#btnClose'); await p.check('#showLid'); await p.check('#showBase'); }
rec('shadow_by_part_state', shPix);
const px = (k) => shPix[k].diffPixels;
assert(px('open') !== px('closed') && px('nolid') !== px('closed') && px('nobase') !== px('closed'), '뚜껑 열림·숨김이 그림자에 반영');

// 4) 색 불변: 여러 시점에서 켠 화면과 끈 화면이 박스 실루엣 안에서 픽셀 단위로 같다
const colorSame = {};
for (const v of ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom']) {
  await p.click(`[data-view=${v}]`); await p.waitForTimeout(120);
  await set({ on: false }); await mask(); await cap('c_off'); await set({ on: true, strength: 1, soft: 0.2 }); await p.waitForTimeout(120); await cap('c_on');
  colorSame[v] = await diff('c_off', 'c_on'); assert(colorSame[v].inBox === 0 && colorSame[v].maxDiffInBox === 0, `${v}: 박스 색 변경`);
}
rec('box_pixels_unchanged_with_shadow_on', colorSame);
// 아래 시점: 바닥판이 시야를 가리지 않음(켠 화면 = 끈 화면 전체)
assert(colorSame.bottom.diffPixels === 0, '아래 시점에서 바닥판/그림자가 보이지 않아야 함');
// 뒤집힌 자세 + 아래에서 보기
await p.evaluate(() => window.__sabari.viewer.setBoxQuatRaw([1, 0, 0, 0])); await p.click('[data-view=bottom]'); await p.waitForTimeout(100);
// 시점 버튼이 자세를 초기화하므로 자세를 다시 준 뒤 카메라만 아래로
await p.evaluate(() => { const V = window.__sabari.viewer; V.setBoxQuatRaw([1, 0, 0, 0]); const b = V.bounds(), c = b.getCenter(new (V.camera.position.constructor)()); V.setCameraRaw([c.x + 0.05, c.y - 0.35, c.z + 0.1], [c.x, c.y, c.z]); });
await set({ on: false }); await mask(); await cap('f_off'); await set({ on: true, strength: 1 }); await p.waitForTimeout(120); await cap('f_on');
const flippedBelow = await diff('f_off', 'f_on'); rec('flipped_pose_view_from_below', flippedBelow); assert(flippedBelow.inBox === 0);
await p.click('[data-view=iso]');

// 5) 투명 PNG: 그림자는 반투명 알파, 가장자리 흰선 없음 (UI 저장 버튼 경유 + 합성 측정은 python)
await set({ on: true, strength: 0.5, soft: 0.6, az: 40, el: 45 }); await p.click('[data-view=front]'); await p.waitForTimeout(150);
for (const [bg, name] of [['transparent', 'shadow_transparent.png'], ['white', 'shadow_white.png']]) {
  await p.selectOption('#bgSel', bg); const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); await d.saveAs(path.join(OUT, name));
}
await set({ on: false }); await p.selectOption('#bgSel', 'transparent'); { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); await d.saveAs(path.join(OUT, 'noshadow_transparent.png')); }
await p.selectOption('#bgSel', 'white'); await set({ on: true, strength: 0.5, soft: 0.6, az: 40, el: 45 });
await p.selectOption('#pngScale', '2'); await p.selectOption('#bgSel', 'transparent'); { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); await d.saveAs(path.join(OUT, 'shadow_transparent_x2.png')); } await p.selectOption('#pngScale', '1');

// 6) GLB 불변 + .sabari 영향 없음
const readGlb = async (name) => { const [g] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); const f = path.join(OUT, name); await g.saveAs(f); const buf = fs.readFileSync(f); const jl = buf.readUInt32LE(12); const j = JSON.parse(buf.slice(20, 20 + jl).toString()); const val = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'validate_glb.mjs'), f], { encoding: 'utf8' }); return { j, val: JSON.parse(val.stdout.slice(val.stdout.indexOf('{'))), file: f }; };
await set({ on: false }); const gOff = await readGlb('glb_shadow_off.glb'); await set({ on: true }); const gOn = await readGlb('glb_shadow_on.glb');
const norm = (j) => JSON.stringify({ nodes: j.nodes, meshes: j.meshes, materials: j.materials, accessors: j.accessors?.length, scenes: j.scenes });
rec('glb', { sameStructure: norm(gOff.j) === norm(gOn.j), nodeNames: gOn.j.nodes.map((n) => n.name), hasFloor: JSON.stringify(gOn.j).includes('floor') || JSON.stringify(gOn.j).includes('hadow'), bytesOff: fs.statSync(gOff.file).size, bytesOn: fs.statSync(gOn.file).size, validator: gOn.val.validator });
assert(norm(gOff.j) === norm(gOn.j) && !JSON.stringify(gOn.j).includes('floor') && !JSON.stringify(gOn.j).includes('hadow') && gOn.val.validator.errors === 0 && gOn.val.validator.warnings === 0);
const saveSabari = async (name) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); const f = path.join(OUT, name); await d.saveAs(f); return f; };
await set({ on: false }); const sOff = await saveSabari('shadow_off.sabari'); await set({ on: true }); const sOn = await saveSabari('shadow_on.sabari');
fs.writeFileSync(path.join(OUT, 'sabari_files.txt'), `${sOff}\n${sOn}\n`);
const draftKeys = await p.evaluate(() => { const out = {}; for (const k of Object.keys(localStorage)) out[k] = localStorage.getItem(k).includes('hadow'); return out; });
rec('localStorage_shadow_mentions', draftKeys);

// 7) 새로고침 후 설정 복원
await ui('shStrN', 70); await ui('shSoftN', 20); await ui('shAzN', 200); await ui('shElN', 30);
const before = await stateOf(); await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
await p.evaluate(() => { document.getElementById('dLight').open = true; }); await inject();
const afterReload = await stateOf(); rec('reload_restore', { before, afterReload });
assert(afterReload.on && near(afterReload.strength, 0.7, 1e-9) && near(afterReload.soft, 0.2, 1e-9) && afterReload.az === 200 && afterReload.el === 30 && afterReload.ctlHidden === false);
await p.click('#shDefault'); const dflt = await stateOf(); rec('default_restore_button', dflt); assert(dflt.on && dflt.strength === 0.4 && dflt.soft === 0.5 && dflt.az === 225 && dflt.el === 65);
await ui('shElN', 5); assert((await stateOf()).el === 20, '높이는 20~80으로 제한'); await ui('shElN', 99); assert((await stateOf()).el === 80);
await ui('shAzN', 400); assert((await stateOf()).az === 40, '좌우는 0~360으로 순환');
await p.click('#shDefault');

// 8) 프레임 시간(헤드리스 소프트웨어 렌더링 기준, 실제 GPU 성능은 미검증)
const frame = (on) => p.evaluate(async (on) => { const V = window.__sabari.viewer; V.setFloorShadow({ ...V.getFloorShadow(), on }); await new Promise((r) => requestAnimationFrame(r)); const N = 40, ts = []; let t0 = performance.now(); for (let i = 0; i < N; i++) { V.setBoxQuatRaw([Math.sin(i / 20), 0, 0, Math.cos(i / 20)]); await new Promise((r) => requestAnimationFrame(r)); const t = performance.now(); ts.push(t - t0); t0 = t; } ts.sort((a, b) => a - b); return { meanMs: ts.reduce((a, b) => a + b, 0) / N, medianMs: ts[N >> 1], p95Ms: ts[Math.floor(N * 0.95)] }; }, on);
const fOff = await frame(false), fOn = await frame(true); rec('frame_time_headless', { off: fOff, on: fOn, shadowMapSize: 2048 }); await p.evaluate(() => window.__sabari.viewer.setBoxQuatRaw([0, 0, 0, 1]));

// 9) 외부 GLB(뷰어로 연 GLB)에서도 같은 설정·바닥 접촉
await p.click('#shDefault'); await p.setInputFiles('#fileGlb', gOff.file); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시')); await p.waitForTimeout(400);
await p.click('[data-view=front]'); await p.waitForTimeout(150);
const ext = await contactOf(); rec('external_glb_contact', ext); assert(near(ext.gap, 0, 1e-6) && (await stateOf()).on);
await set({ on: false }); await mask(); await cap('x_off'); await set({ on: true, strength: 0.6, az: 60, el: 40 }); await p.waitForTimeout(150); await cap('x_on'); const extDiff = await diff('x_off', 'x_on'); rec('external_glb_shadow_pixels', extDiff); assert(extDiff.diffPixels > 500 && extDiff.inBox === 0);
await p.click('#btnExtGlbBack');
await finish('floor_shadow_task9.json');
