// 작업 9: 그림자 꺼진 상태의 화면 캡처(변경 전 빌드와 변경 후 빌드에서 각각 실행해 픽셀 비교). 사용법은 e2e/floor_shadow_task9.py 참고.
import { OUT, path, start } from './stage24_common.mjs';
const { p, finish, colorFaces } = await start();
await colorFaces();
const shot = async (name) => { await p.waitForTimeout(250); await p.locator('#viewport canvas').screenshot({ path: path.join(OUT, `off_${name}.png`) }); };
for (const v of ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom', 'isoL']) { if (v === 'isoL') await p.keyboard.press('l'); else await p.click(`[data-view=${v}]`); await shot(v); }
await p.click('[data-view=iso]'); await p.click('#btnOpen'); await shot('iso_open');
await p.click('#btnClose'); await p.evaluate(() => { window.__sabari.viewer.setBoxQuatRaw([0.5, 0.5, 0.5, 0.5]); }); await shot('standing_quat');
await p.evaluate(() => { window.__sabari.viewer.setBoxQuatRaw([1, 0, 0, 0]); }); await shot('flipped_quat');
await p.uncheck('#showLid'); await shot('lid_hidden'); await p.check('#showLid');
await finish('off_states.json');
