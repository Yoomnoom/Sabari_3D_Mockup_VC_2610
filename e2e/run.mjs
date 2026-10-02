// E2E 검증: node e2e/run.mjs  (서버가 127.0.0.1:8765 에서 실행 중이어야 함)
// 결과: verification/e2e_results.json + 스크린샷
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = path.join(ROOT, 'verification');
const S = path.join(ROOT, 'assets', 'samples');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8765/';
const FACES = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'];
const results = {};
const rec = (k, v) => { results[k] = v; console.log(k, JSON.stringify(v)); };
fs.mkdirSync(V, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true });
// 오프라인 검증: 127.0.0.1 이외로 나가는 요청은 모두 차단하고 기록한다 (CDN 사용 여부 확인)
const blockedExternal = [];
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith('http://127.0.0.1') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue();
  blockedExternal.push(u); return route.abort();
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

await page.goto(URL);
await page.waitForFunction(() => window.__sabari);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(V, '01_initial.png') });

// ---- 이미지 5면 적용 ----
for (const f of FACES) {
  await page.click(`#faceList button[data-face=${f}]`);
  await page.setInputFiles('#filePick', path.join(S, `sample_${f}.png`));
  await page.waitForFunction((id) => window.__sabari.faces[id].img, f);
}
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(V, '02_five_faces_iso.png') });
rec('applied_faces', await page.evaluate(() => Object.values(window.__sabari.faces).filter((f) => f.img).map((f) => f.id)));

// ---- 번짐 검사 ----
// 면마다 고유 색 → 화면의 해당 색 픽셀이 그 면의 투영 다각형 안에만 있는지 확인 (허용오차 4px).
const analyze = (cam) => page.evaluate(async ({ cam }) => {
  const S = window.__sabari, v = S.viewer;
  v.setCameraRaw(cam.pos, cam.target);
  await new Promise((r) => setTimeout(r, 150));
  const blob = await v.screenshot('white');
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, bmp.width, bmp.height).data;
  const k = bmp.width / v.renderer.domElement.clientWidth;
  const hueClass = (r, gg, b) => {
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx < 60 || (mx - mn) / mx < 0.5) return null;
    let h; const d = mx - mn;
    if (mx === r) h = ((gg - b) / d + 6) % 6; else if (mx === gg) h = (b - r) / d + 2; else h = (r - gg) / d + 4;
    h *= 60;
    if (h < 15 || h > 345) return 'lid_top';
    if (h >= 165 && h < 200) return 'lid_left';
    if (h >= 105 && h < 160) return 'lid_back';
    if (h >= 195 && h < 245) return 'lid_front';
    if (h >= 255 && h < 305) return 'lid_right';
    return null; // 노란 표식 등
  };
  const polys = {};
  for (const id of Object.keys(S.faces)) polys[id] = v.faceCorners(id).map(([x, y]) => [x * k, y * k]);
  const inside = (p, [x, y], tol) => {
    // 볼록 사각형: 모든 변에 대해 같은 쪽인지 (tol px 여유)
    let pos = 0, neg = 0;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const cr = ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) / len;
      if (cr > tol) pos++; else if (cr < -tol) neg++;
    }
    return !(pos && neg);
  };
  const count = {}, bleed = {};
  for (let y = 0; y < bmp.height; y += 2) for (let x = 0; x < bmp.width; x += 2) {
    const i = (y * bmp.width + x) * 4;
    if (data[i + 3] < 250) continue;
    const cls = hueClass(data[i], data[i + 1], data[i + 2]);
    if (!cls) continue;
    count[cls] = (count[cls] ?? 0) + 1;
    if (!inside(polys[cls], [x, y], -4 * k / 2 - 2)) bleed[cls] = (bleed[cls] ?? 0) + 1;
  }
  return { count, bleed };
}, { cam });

const dist = 0.42, cy = 0.0225;
const cams = {
  iso_front_right: { pos: [dist * 0.6, cy + dist * 0.5, dist * 0.65], target: [0, cy, 0] },
  iso_back_left: { pos: [-dist * 0.6, cy + dist * 0.5, -dist * 0.65], target: [0, cy, 0] },
  iso_front_left: { pos: [-dist * 0.65, cy + dist * 0.35, dist * 0.6], target: [0, cy, 0] },
  iso_back_right: { pos: [dist * 0.65, cy + dist * 0.35, -dist * 0.6], target: [0, cy, 0] },
  axis_front: { pos: [0, cy, dist], target: [0, cy, 0] },
  axis_back: { pos: [0, cy, -dist], target: [0, cy, 0] },
  axis_left: { pos: [-dist, cy, 0], target: [0, cy, 0] },
  axis_right: { pos: [dist, cy, 0], target: [0, cy, 0] },
  top_down: { pos: [0, dist, 0.0001], target: [0, cy, 0] },
};
const bleedRes = {};
for (const [name, cam] of Object.entries(cams)) {
  bleedRes[name] = await analyze(cam);
  await page.screenshot({ path: path.join(V, `03_rot_${name}.png`) });
}
rec('bleed', bleedRes);
const totalBleed = Object.values(bleedRes).flatMap((r) => Object.values(r.bleed)).reduce((a, b) => a + b, 0);
rec('bleed_total_pixels', totalBleed);

// ---- 표준 뷰 버튼 ----
for (const v of ['front', 'back', 'left', 'right', 'top', 'iso']) {
  await page.click(`[data-view=${v}]`);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(V, `04_view_${v}.png`) });
}

// ---- 마우스 회전/확대 ----
await page.click('[data-view=iso]');
const before = await page.evaluate(() => window.__sabari.viewer.camera.position.toArray());
await page.mouse.move(800, 400); await page.mouse.down(); await page.mouse.move(900, 440, { steps: 6 }); await page.mouse.up();
await page.mouse.wheel(0, -300);
await page.waitForTimeout(200);
const after = await page.evaluate(() => window.__sabari.viewer.camera.position.toArray());
rec('mouse_orbit_zoom_changed_camera', JSON.stringify(before) !== JSON.stringify(after));
await page.screenshot({ path: path.join(V, '05_after_mouse.png') });

// ---- 면 클릭 선택 ----
await page.click('[data-view=top]');
await page.waitForTimeout(150);
await page.click('#faceList button[data-face=lid_back]');
await page.mouse.click(680, 430); // 화면 중앙 = 상단면
rec('click_picks_top', await page.evaluate(() => window.__sabari.viewer.selected));

// ---- 조절 기능: 상단 180° 회전 + 배율 120% ----
await page.click('#faceList button[data-face=lid_top]');
await page.click('#rot180');
await page.fill('#scaleN', '120'); await page.dispatchEvent('#scaleN', 'change');
await page.fill('#xN', '10'); await page.dispatchEvent('#xN', 'change');
await page.click('#flipX');
await page.check('input[name=fit][value=cover]');
rec('top_state_after_edit', await page.evaluate(() => ({ ...window.__sabari.faces.lid_top.state })));
await page.click('[data-view=top]');
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(V, '06_top_edited.png') });
// 회전 라운드트립 확인 (왼쪽 90° x4)
await page.click('#rotL'); await page.click('#rotL'); await page.click('#rotL'); await page.click('#rotL');
rec('rot_left_x4_returns_180', await page.evaluate(() => window.__sabari.faces.lid_top.state.rotationDeg));

// 제거 → 되돌리기, 초기화 → 되돌리기
await page.click('#faceList button[data-face=lid_left]');
await page.click('#btnRemove');
rec('remove_left_has_img', await page.evaluate(() => !!window.__sabari.faces.lid_left.img));
await page.click('#btnUndo');
rec('undo_restores_left', await page.evaluate(() => !!window.__sabari.faces.lid_left.img));

// ---- 열기/닫기 ----
await page.click('[data-view=iso]');
await page.click('#btnOpen');
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(V, '07_open.png') });
const open = await page.evaluate(() => {
  const v = window.__sabari.viewer; const m = v.models.editor;
  m.root.updateMatrixWorld(true);
  const lid = m.lid.position.y, base = m.base.position.y;
  // 뚜껑과 몸통의 AABB가 겹치지 않는지 (y축)
  const box = (o) => { const b = new (v.bounds().constructor)(); o.traverse((x) => { if (x.isMesh && x.name !== '__highlight') b.expandByObject(x); }); return b; };
  return { liftMm: v.getLiftMm(), lidMinY: box(m.lid).min.y, baseMaxY: box(m.base).max.y };
});
rec('open_state', open);
await page.click('[data-view=front]'); await page.waitForTimeout(150);
await page.screenshot({ path: path.join(V, '07b_open_front.png') });
await page.click('#btnClose');
rec('closed_lift_mm', await page.evaluate(() => window.__sabari.viewer.getLiftMm()));
await page.click('#btnOpen'); // 저장 시 열린 상태 유지 확인용으로 다시 열기

// ---- PNG 저장 (흰 배경 / 투명) ----
await page.click('[data-view=iso]');
async function pngCheck(bg, file) {
  await page.selectOption('#bgSel', bg);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnPng')]);
  const p = path.join(V, file);
  await dl.saveAs(p);
  const buf = fs.readFileSync(p);
  const info = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
    const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
    return { w: bmp.width, h: bmp.height, corners: [px(2, 2), px(bmp.width - 3, 2), px(2, bmp.height - 3), px(bmp.width - 3, bmp.height - 3)] };
  }, buf.toString('base64'));
  return { file, bytes: buf.length, pngSignature: buf.subarray(1, 4).toString() === 'PNG', ...info };
}
rec('png_white', await pngCheck('white', '08_export_white.png'));
rec('png_transparent', await pngCheck('transparent', '08_export_transparent.png'));

// ---- GLB 저장 ----
const [glbDl] = await Promise.all([page.waitForEvent('download'), page.click('#btnGlb')]);
const glbPath = path.join(V, 'exported_sabari_mockup.glb');
await glbDl.saveAs(glbPath);
rec('glb_saved_bytes', fs.statSync(glbPath).size);

// ---- 프로젝트 저장 ----
const [pjDl] = await Promise.all([page.waitForEvent('download'), page.click('#btnProjSave')]);
const projPath = path.join(V, 'test_project.sabari');
await pjDl.saveAs(projPath);
rec('project_saved_bytes', fs.statSync(projPath).size);
const expectedState = await page.evaluate(() => Object.fromEntries(Object.entries(window.__sabari.faces).map(([k, f]) => [k, f.state])));

// ---- 오류 UI ----
fs.writeFileSync(path.join(V, 'bad.png'), 'not an image');
await page.click('#msgClose');
await page.setInputFiles('#filePick', path.join(V, 'bad.png'));
await page.waitForSelector('#msg:not([hidden])');
rec('error_message_bad_file', await page.textContent('#msgText'));
try { fs.unlinkSync(path.join(V, 'bad.png')); } catch {}

rec('console_errors_edit', consoleErrors.slice());

// ====== 새 페이지(새 브라우저 컨텍스트 = 다른 PC 가정)에서 프로젝트 재열기 ======
const ctx2 = await browser.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true });
const p2 = await ctx2.newPage();
await p2.goto(URL);
await p2.waitForFunction(() => window.__sabari);
await p2.setInputFiles('#fileProj', projPath);
await p2.waitForFunction(() => Object.values(window.__sabari.faces).every((f) => f.img));
const reopenedState = await p2.evaluate(() => Object.fromEntries(Object.entries(window.__sabari.faces).map(([k, f]) => [k, f.state])));
rec('project_reopen_state_equal', JSON.stringify(reopenedState) === JSON.stringify(expectedState));
rec('project_reopen_lift_mm', await p2.evaluate(() => window.__sabari.viewer.getLiftMm()));
rec('project_reopen_names', await p2.evaluate(() => Object.values(window.__sabari.faces).map((f) => f.name)));
await p2.waitForTimeout(300);
await p2.click('[data-view=iso]');
await p2.screenshot({ path: path.join(V, '09_project_reopened.png') });

// ====== GLB 뷰어 모드: 내보낸 GLB 불러오기 (이미지 파일 없이 GLB만) ======
const p3 = await (await browser.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
await p3.goto(URL);
await p3.waitForFunction(() => window.__sabari);
await p3.click('#tabView');
await p3.setInputFiles('#fileGlb', glbPath);
await p3.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시'));
rec('viewer_glb_info', await p3.textContent('#glbInfo'));
await p3.waitForTimeout(300);
await p3.screenshot({ path: path.join(V, '10_viewer_loaded_glb.png') });
rec('viewer_lid_slider_visible', await p3.isVisible('#viewLid'));
await p3.fill('#vLiftN', '0'); await p3.dispatchEvent('#vLiftN', 'change');
await p3.click('[data-view=top]'); await p3.waitForTimeout(200);
await p3.screenshot({ path: path.join(V, '10b_viewer_top_closed.png') });
await p3.click('[data-view=back]'); await p3.waitForTimeout(200);
await p3.screenshot({ path: path.join(V, '10c_viewer_back_closed.png') });
const [pngDl] = await Promise.all([p3.waitForEvent('download'), p3.click('#btnPng')]);
await pngDl.saveAs(path.join(V, '10d_viewer_png.png'));
rec('viewer_mode_png_saved', true);

rec('external_requests_blocked', blockedExternal);
fs.writeFileSync(path.join(V, 'e2e_results.json'), JSON.stringify(results, null, 2));
await browser.close();
