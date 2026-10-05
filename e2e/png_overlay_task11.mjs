// 작업 11-4: 주황 면 선택선(highlight)·축 잠금 선이 PNG 저장(흰·투명, 화면/2배/4배)에 들어가는지 검사.
// 선택선을 켠 채 저장한 PNG와 선택선을 끈 채 저장한 PNG가 픽셀 단위로 같아야 한다. 비교는 e2e/png_overlay_task11.py.
// 실행: SABARI_URL=<주소> STAGE_OUT=verification/png-overlay node e2e/png_overlay_task11.mjs
import { OUT, assert, path, start } from './stage24_common.mjs';
const { p, finish, rec, colorFaces } = await start();
await colorFaces(); // 면별 합성 색 이미지(시안 아님)
await p.setViewportSize({ width: 1000, height: 520 }); await p.waitForTimeout(400);
await p.evaluate(() => { document.getElementById('dLight').open = true; });
// 선택선이 화면에 실제로 보이는 상태를 만든다: 상단 면 선택 + 선택선 켬
await p.click('#tab_lid'); await p.click('#faceList button[data-face=lid_top]');
await p.evaluate(() => window.__sabari.viewer.setHighlightOn(true)); await p.click('[data-view=iso]'); await p.waitForTimeout(300);
const hl = () => p.evaluate(() => { const V = window.__sabari.viewer; return { hlVisible: V.highlight?.visible ?? null, lockLine: V.lockLine?.visible ?? null, lockHls: V.lockHls.map((o) => o.visible) }; });
rec('state_with_selection_line', await hl());
// 화면에 주황 선택선이 보이는지(화면 캡처에서 주황 픽셀 수)
const orange = () => p.evaluate(async () => { const V = window.__sabari.viewer; const cv = document.querySelector('#viewport canvas'); const r = await V.screenshotScaled('white', 1); return r.width; });
const save = async (name) => { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]); await d.saveAs(path.join(OUT, name)); };
const states = { with_lines: async () => { await p.evaluate(() => window.__sabari.viewer.setHighlightOn(true)); }, without_lines: async () => { await p.evaluate(() => window.__sabari.viewer.setHighlightOn(false)); } };
await p.screenshot({ path: path.join(OUT, 'screen_with_selection_line.png'), clip: { x: 321, y: 0, width: 679, height: 520 } });
for (const [state, set] of Object.entries(states)) {
  await set(); await p.waitForTimeout(200);
  for (const bg of ['white', 'transparent']) for (const sc of ['1', '2', '4']) {
    await p.selectOption('#bgSel', bg); await p.selectOption('#pngScale', sc); await save(`png_${state}_${bg}_x${sc}.png`);
  }
}
// 축 잠금 선(회전축 표시선)도 같은 방식으로: 잠금 켜고 축을 정한 뒤 저장
await p.evaluate(() => window.__sabari.viewer.setHighlightOn(true));
await p.click('#lockToggle'); await p.locator('#axisRow button').first().click(); await p.waitForTimeout(300);
rec('state_with_lock_lines', await hl());
await p.selectOption('#pngScale', '1');
for (const bg of ['white', 'transparent']) { await p.selectOption('#bgSel', bg); await save(`png_lock_lines_on_${bg}_x1.png`); }
await p.click('#lockToggle'); await p.waitForTimeout(200);
for (const bg of ['white', 'transparent']) { await p.selectOption('#bgSel', bg); await save(`png_lock_lines_off_${bg}_x1.png`); }
// GLB에는 선택선이 들어가지 않는다(노드 이름에 highlight/lock 없음)
const [g] = await Promise.all([p.waitForEvent('download'), p.click('#btnGlb')]); await g.saveAs(path.join(OUT, 'glb_with_selection.glb'));
await finish('png_overlay_task11.json');
