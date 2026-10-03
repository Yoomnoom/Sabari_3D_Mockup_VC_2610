// 닫힌 상태에서 하단 면 클릭 선택 확인
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
await p.goto(process.env.SABARI_URL ?? 'http://127.0.0.1:8766/'); await p.waitForFunction(() => window.__sabari);
const R = {};
const clickFace = async (id) => { const pt = await p.evaluate((id) => { const v = window.__sabari.viewer; const c = v.faceCorners(id); const r = v.renderer.domElement.getBoundingClientRect(); return [r.left + c.reduce((s, q) => s + q[0], 0) / 4, r.top + c.reduce((s, q) => s + q[1], 0) / 4]; }, id); await p.mouse.click(...pt); return p.evaluate(() => ({ sel: window.__sabari.viewer.selected, lift: window.__sabari.viewer.getLiftMm() })); };
// 스위치 꺼짐: 닫힌 상태에서 하단 면을 눌러도 선택되지 않는다
await p.evaluate(() => window.__sabari.viewer.setCameraRaw([0, 0.01, 0.4], [0, 0.0225, 0])); await p.waitForTimeout(200);
R.off_closed_click_base_front = await clickFace('base_front');
// 스위치 켬: 닫힌 상태, 정면(뚜껑 아래로 몸통 일부가 보임)과 아래에서 보기
await p.check('#useBase'); await p.waitForTimeout(150);
R.on_closed_click_base_front = await clickFace('base_front');
R.on_closed_notice = { visible: await p.isVisible('#openNotice'), text: await p.textContent('#openNoticeText'), liftStillClosed: (await p.evaluate(() => window.__sabari.viewer.getLiftMm())) === 0 };
await p.evaluate(() => window.__sabari.viewer.setCameraRaw([0.001, -0.45, 0.0001], [0, 0.0225, 0])); await p.waitForTimeout(200);
R.on_closed_click_base_bottom_from_below = await clickFace('base_bottom');
console.log(JSON.stringify(R)); await b.close();
