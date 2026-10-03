// 단계 24 화면 기준 회전 검증 (2/2): 자세별 기능·잘림·GLB/PNG/저장 경계·휠·이동·터치·GLB 뷰어. 결과: verification/stage24/stage24_b.json
// 사용: SABARI_URL=http://127.0.0.1:8874/ node e2e/stage24_b.mjs   (먼저 e2e/stage24.mjs)
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { OUT, ROOT, assert, dot, fs, path, start } from './stage24_common.mjs';
const { context, p, rec, results, H, quat, camAxes, camDist, rel, drag, setAxis, reset, visible, shot, faceCenter, colorFaces, finish } = await start();
const dragSign = JSON.parse(fs.readFileSync(path.join(OUT, 'stage24.json'), 'utf8'))['5_stand_then_turn_horizontally'].standing.dragSign;
await colorFaces();

// ===== 7. 자세별 기능: 세운/뒤집은 자세에서 선택·이미지 이동·뚜껑·하단·PNG, 잘림 없음
const poses = {
  standing: async () => { await p.click('[data-view=right]'); await setAxis('vertical'); await drag([700, 500], [700, 500 + dragSign * (await H()) / 4], 9, { ctrl: true }); },
  flipped: async () => { await reset(); await setAxis('vertical'); await drag([700, 300], [700, 300 + (await H()) / 2], 12, { ctrl: true }); },
};
const poseResults = {};
for (const [name, make] of Object.entries(poses)) {
  await make(); await p.click('#btnClose'); await p.keyboard.press('f'); await p.waitForTimeout(120);
  const row = { quat: await quat() }, v = await visible(); row.visibleFaces = v.faces; row.dominant = v.dominant; await shot(`07_${name}.png`);
  const lidVis = v.faces.map((f) => f.split(':')[0]).filter((f) => f.startsWith('lid_'));
  row.select = {}; for (const id of lidVis) { await p.mouse.click(...(await faceCenter(id))); row.select[id] = await p.evaluate(() => window.__sabari.viewer.selected); }
  assert(lidVis.length > 0 && Object.entries(row.select).every(([k, x]) => k === x), `${name}: 면 클릭 선택`);
  const target = lidVis[0]; await p.mouse.click(...(await faceCenter(target))); const c = await faceCenter(target);
  const s0 = await p.evaluate((t) => ({ ...window.__sabari.faces[t].state }), target), qd0 = await quat();
  await p.keyboard.down('Shift'); await drag(c, [c[0] + 50, c[1] - 25], 8); await p.keyboard.up('Shift');
  const s1 = await p.evaluate((t) => ({ ...window.__sabari.faces[t].state }), target);
  row.shiftDrag = { face: target, moved: s0.offsetX !== s1.offsetX || s0.offsetY !== s1.offsetY, poseUnchanged: JSON.stringify(qd0) === JSON.stringify(await quat()) }; assert(row.shiftDrag.moved && row.shiftDrag.poseUnchanged);
  const lidPos = () => p.evaluate(() => { const v2 = window.__sabari.viewer; v2.models.editor.pivot.updateMatrixWorld(true); return v2.models.editor.lid.getWorldPosition(v2.camera.position.clone()).toArray(); });
  const lc = await lidPos(); await p.click('#btnOpen'); const lo = await lidPos(); const mv = lo.map((x, i) => x - lc[i]);
  const boxUp = await p.evaluate(() => { const v2 = window.__sabari.viewer; return new (v2.camera.position.constructor)(0, 1, 0).applyQuaternion(v2.boxQuat).toArray(); }), ml = Math.hypot(...mv);
  row.lid = { moveM: mv.map((x) => +x.toFixed(5)), alongBoxUp: +(dot(mv, boxUp) / ml).toFixed(6), mm: +(ml * 1000).toFixed(2) }; assert(Math.abs(row.lid.alongBoxUp - 1) < 1e-4 && Math.abs(row.lid.mm - 80) < 0.5);
  await p.click('#tab_base'); await setAxis('horizontal'); await drag([700, 450], [700 + (await H()) / 6, 450], 8); await p.keyboard.press('f'); await p.waitForTimeout(100); // 정면에서는 열린 뚜껑이 하단을 가리므로 60° 돌려 하단 옆면이 보이게 한다
  row.baseQuat = await quat();
  const vb = await visible(), baseVis = vb.faces.map((f) => f.split(':')[0]).filter((f) => f.startsWith('base_')); row.base = {};
  for (const id of baseVis) { await p.mouse.click(...(await faceCenter(id))); row.base[id] = await p.evaluate(() => window.__sabari.viewer.selected); }
  assert(baseVis.length > 0 && Object.entries(row.base).every(([k, x]) => k === x), `${name}: 하단 선택`);
  await p.click('#tab_lid'); await p.click('#btnClose');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); const pf = path.join(OUT, `png_${name}.png`); await dl.saveAs(pf); row.png = { bytes: fs.statSync(pf).size };
  poseResults[name] = row;
}
// 칼선 분할(박스를 세운 자세에서 대화상자 동작)
await poses.standing();
const die = await p.evaluate(async () => { const d = window.__sabari.getLayout('lid'), bleed = 3, sc = 6; const W = Math.round((d.width + 2 * bleed) * sc), Hh = Math.round((d.height + 2 * bleed) * sc); const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const g = cv.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, W, Hh); const cols = ['#d62828', '#1e64dc', '#1ea046', '#00a0aa', '#8232be']; d.faces.forEach((f, i) => { g.fillStyle = cols[i]; g.fillRect((f.rect.x + bleed) * sc, (f.rect.y + bleed) * sc, f.rect.w * sc, f.rect.h * sc); }); const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer()))); });
if (!(await p.evaluate(() => document.getElementById('dDie').open))) await p.click('#dDie > summary');
await p.setInputFiles('#fileDieline', { name: 'die.png', mimeType: 'image/png', buffer: Buffer.from(die, 'base64') }); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(400);
const bx = await p.evaluate(() => { const r = document.querySelector('#splitSvg g[data-face=lid_top] rect[data-role=move]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.x }; });
await drag([bx.x, bx.y], [bx.x + 30, bx.y], 5); const moved = await p.evaluate((l) => document.querySelector('#splitSvg g[data-face=lid_top] rect[data-role=move]').getBoundingClientRect().x - l, bx.left);
await p.click('#btnSplitApply'); await p.waitForTimeout(500);
poseResults.dieline_split_standing = { movedCss: +moved.toFixed(1), appliedFaces: await p.evaluate(() => Object.keys(window.__sabari.faces).filter((k) => window.__sabari.faces[k].img).length) }; assert(moved > 20);
rec('7_features_in_poses', poseResults);

// ===== 8. 어떤 자세·창 크기에서도 박스가 잘리지 않는다(위치 초기화 후)
const clip = [];
for (const [w, h] of [[1360, 900], [1024, 700], [800, 640], [1600, 800]]) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(250);
  for (const [name, q] of [['identity', [0, 0, 0, 1]], ['x90', [0.70710678, 0, 0, 0.70710678]], ['y45', [0, 0.38268343, 0, 0.92387953]], ['z90', [0, 0, 0.70710678, 0.70710678]], ['diag', [0.4, 0.5, 0.3, 0.70710678]], ['upside', [1, 0, 0, 0]]]) {
    await p.evaluate((qq) => { const v = window.__sabari.viewer; v.setBoxQuat(new v.boxQuat.constructor(...qq)); v.fit(); }, q); await p.waitForTimeout(80);
    clip.push({ size: `${w}x${h}`, pose: name, borderPixels: (await visible()).border });
    if (name === 'diag' && w === 1360) await shot('08_diag_pose_fit.png');
  }
}
await p.setViewportSize({ width: 1360, height: 900 }); await p.waitForTimeout(250);
rec('8_not_clipped', { rows: clip, allZero: clip.every((r) => r.borderPixels === 0) }); assert(results['8_not_clipped'].allZero);

// ===== 9. GLB·.sabari·임시저장·PNG 경계
await p.evaluate(() => window.__sabari.viewer.resetBoxPose()); await reset();
// GLTFExporter 는 이미지를 병렬로 처리해 images 배열 순서가 내보낼 때마다 달라질 수 있어(자세와 무관, 같은 상태에서 연속 내보내기도 바이트가 다르다) 파일 바이트 대신 내용으로 비교한다: 노드 변환 전체 + 메시별(지오메트리 해시·재질 색·이미지 PNG 해시)
const canon = (file) => { const b = fs.readFileSync(file), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')), bin = b.subarray(20 + jl + 8); const sh = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16); const view = (i) => { const v = j.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); }; const acc = (i) => view(j.accessors[i].bufferView); const meshes = {}; for (const n of j.nodes) { if (n.mesh === undefined) continue; const m = j.meshes[n.mesh]; const rows = m.primitives.map((pr) => { const mat = j.materials[pr.material] ?? {}, bc = mat.pbrMetallicRoughness?.baseColorTexture; const img = bc ? sh(view(j.images[j.textures[bc.index].source].bufferView)) : null; return { geom: sh(Buffer.concat([...Object.values(pr.attributes), pr.indices].filter((x) => x !== undefined).map(acc))), color: mat.pbrMetallicRoughness?.baseColorFactor ?? null, image: img }; }); meshes[n.name ?? m.name] = rows; } return { nodes: j.nodes.map((n) => ({ ...n, mesh: undefined })), meshes, imageCount: j.images?.length ?? 0 }; };
const exportOnce = () => p.evaluate(async () => Array.from(new Uint8Array(await window.__sabari.viewer.exportGLB()))).then((a) => Buffer.from(a));
const saveExport = async (name) => { const b = await exportOnce(); fs.writeFileSync(path.join(OUT, name), b); return crypto.createHash('sha256').update(b).digest('hex'); };
await p.waitForTimeout(1500);
const hIdent = await saveExport('glb_identity.glb'), hIdent2 = await saveExport('glb_identity_2.glb');
await p.evaluate(() => { const v = window.__sabari.viewer; v.setBoxQuat(new v.boxQuat.constructor(0.4, 0.5, 0.3, 0.70710678)); });
const hPosed = await saveExport('glb_posed.glb'), hPosed2 = await saveExport('glb_posed_2.glb');
const cIdent = canon(path.join(OUT, 'glb_identity.glb')), cPosed = canon(path.join(OUT, 'glb_posed.glb'));
const nodesEqual = JSON.stringify(cIdent.nodes) === JSON.stringify(cPosed.nodes);
const contentEqual = JSON.stringify(cIdent) === JSON.stringify(cPosed);
const rootNode = cPosed.nodes[0];
const val = spawnSync(process.execPath, [path.join(ROOT, 'e2e', 'validate_glb.mjs'), path.join(OUT, 'glb_posed.glb')], { encoding: 'utf8' });
const valJson = JSON.parse(val.stdout.slice(val.stdout.indexOf('{')));
rec('9_glb', { sha256: { identity: hIdent, identityAgain: hIdent2, posed: hPosed, posedAgain: hPosed2 }, byteIdenticalEverywhere: new Set([hIdent, hIdent2, hPosed, hPosed2]).size === 1, byteNote: '같은 자세에서 연속으로 내보내도 바이트가 다를 수 있다(이미지 배열 순서). 그래서 내용 비교를 쓴다.', nodeTransformsEqual: nodesEqual, contentEqual_nodes_geometry_materials_images: contentEqual, meshCount: Object.keys(cPosed.meshes).length, imageCount: cPosed.imageCount, rootNodeHasTransform: !!(rootNode.rotation || rootNode.translation || rootNode.scale || rootNode.matrix), validator: valJson.validator });
assert(nodesEqual && contentEqual && valJson.validator.errors + valJson.validator.warnings === 0);
const png = async () => { const [d] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => document.getElementById('btnPng').click())]); const f = path.join(OUT, 'png_tmp.png'); await d.saveAs(f); return fs.readFileSync(f); };
await setAxis('horizontal'); await p.mouse.move(700, 450); await p.mouse.down(); await p.mouse.move(760, 450, { steps: 4 }); const badgeShown = await p.isVisible('#rotBadge'); const pngA = await png(); await p.mouse.up();
await p.addStyleTag({ content: '#rotBadge,#rotDirLabel{visibility:hidden!important}' }); const pngB = await png(); fs.rmSync(path.join(OUT, 'png_tmp.png'), { force: true });
rec('9_png_overlay_excluded', { badgeVisibleDuringCapture: badgeShown, pngEqualWithOverlayHidden: Buffer.compare(pngA, pngB) === 0 }); assert(badgeShown && Buffer.compare(pngA, pngB) === 0);
const { default: JSZip } = await import('../frontend/node_modules/jszip/lib/index.js');
const [d3] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]); await d3.saveAs(path.join(OUT, 'tmp.sabari'));
const zip = await JSZip.loadAsync(fs.readFileSync(path.join(OUT, 'tmp.sabari'))); const proj = JSON.stringify(JSON.parse(await zip.file('project.json').async('string'))); fs.rmSync(path.join(OUT, 'tmp.sabari'), { force: true });
await p.click('#btnDraftSave');
const draft = JSON.stringify(await p.evaluate(async () => new Promise((res, rej) => { const q = indexedDB.open('sabari-mockup', 1); q.onsuccess = () => { const r = q.result.transaction('drafts').objectStore('drafts').get('current'); r.onsuccess = () => res(r.result); r.onerror = rej; }; q.onerror = rej; })));
rec('9_storage_boundary', { projectHasPose: /boxQuat|rotAxis|pose|quaternion/i.test(proj), draftHasPose: /boxQuat|rotAxis|pose|quaternion/i.test(draft), localStorageKeys: await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sabari-ui') ?? '{}'))) });
assert(!results['9_storage_boundary'].projectHasPose && !results['9_storage_boundary'].draftHasPose);

// ===== 10. 휠·이동·터치·GLB 뷰어 모드
const inter = {}; await p.evaluate(() => window.__sabari.viewer.resetBoxPose()); await reset();
const d0 = await camDist(); await p.mouse.move(700, 450); await p.mouse.wheel(0, -400); await p.waitForTimeout(150); const d1 = await camDist(); inter.wheelZoom = { before: +d0.toFixed(4), after: +d1.toFixed(4) }; assert(d1 < d0);
const tg = () => p.evaluate(() => window.__sabari.viewer.controls.target.toArray()); const t0 = await tg(); const qa = await quat();
await p.keyboard.down('Space'); await drag([600, 400], [700, 450], 6); await p.keyboard.up('Space'); const t1 = await tg();
await drag([600, 400], [680, 380], 6, { button: 'middle' }); const t2 = await tg(); await drag([600, 400], [560, 440], 6, { button: 'right' }); const t3 = await tg();
const mv2 = (a, b) => a.some((x, i) => Math.abs(x - b[i]) > 1e-6); inter.pan = { space: mv2(t0, t1), middle: mv2(t1, t2), right: mv2(t2, t3), poseUnchanged: JSON.stringify(qa) === JSON.stringify(await quat()) }; assert(inter.pan.space && inter.pan.middle && inter.pan.right && inter.pan.poseUnchanged);
const cdp = await context.newCDPSession(p); const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const touchRows = {};
for (const mode of ['horizontal', 'vertical']) {
  await setAxis(mode); const q0 = await quat(), ax = await camAxes(); await touch('touchStart', [[1000, 400]]); for (let i = 1; i <= 10; i++) await touch('touchMove', [[1000 + i * 12, 400 + i * 9]]); await touch('touchEnd', []); await p.waitForTimeout(80);
  const r = await rel(q0, await quat()); touchRows[mode] = { angleDeg: +r.angleDeg.toFixed(3), axisDotOtherScreenAxis: +Math.abs(dot(r.axis, ax[mode === 'horizontal' ? 'right' : 'up'])).toFixed(9) }; assert(r.angleDeg > 5 && touchRows[mode].axisDotOtherScreenAxis < 1e-6);
}
const q0t = await quat(), dist0 = await camDist(); // 두 손가락 핀치 = 확대(회전 아님)
await touch('touchStart', [[900, 450], [1000, 450]]); for (let i = 1; i <= 8; i++) await touch('touchMove', [[900 - i * 12, 450], [1000 + i * 12, 450]]); await touch('touchEnd', []); await p.waitForTimeout(150);
touchRows.pinch = { distBefore: +dist0.toFixed(4), distAfter: +(await camDist()).toFixed(4), poseUnchanged: JSON.stringify(q0t) === JSON.stringify(await quat()) }; assert(touchRows.pinch.distAfter < touchRows.pinch.distBefore && touchRows.pinch.poseUnchanged);
inter.touch = touchRows;
await p.click('#tabView'); await p.setInputFiles('#fileGlb', path.join(OUT, 'glb_identity.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메')); await p.evaluate(() => window.__sabari.viewer.resetBoxPose()); await setAxis('horizontal');
const qv0 = await quat(); await drag([700, 450], [800, 450], 8); const rv = await rel(qv0, await quat()), vv = await visible(); await shot('10_glb_viewer_rotated.png');
inter.glbViewerMode = { angleDeg: +rv.angleDeg.toFixed(3), visibleCount: vv.faces.length, border: vv.border }; assert(rv.angleDeg > 5 && vv.border === 0);
await p.click('#tabEdit');
rec('10_interactions', inter);
await finish('stage24_b.json');
