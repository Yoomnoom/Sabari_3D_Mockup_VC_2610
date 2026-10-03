// 기본 화면(편집 모드, 모든 접이식 기본 상태)에서 눈에 보이는 컨트롤 개수. 사용: SABARI_URL=<주소> node e2e/stage26c_count.mjs <출력 json>
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400);
const count = () => p.evaluate(() => {
  const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden';
  const all = [...document.querySelectorAll('aside button, aside input:not([type=hidden]), aside select, aside summary')].filter(vis);
  const view = [...document.querySelectorAll('#dView button, #dView input, #dView select, #dView summary')].filter(vis);
  return { sidebarControls: all.length, viewSectionControls: view.length, viewButtons: view.map((e) => (e.textContent || e.id || '').trim().replace(/\s+/g, ' ')).filter(Boolean) };
});
const res = { defaultState: await count() };
if (await p.locator('#lockToggle').count()) { await p.click('#lockToggle'); res.lockOn = await count(); await p.click('#lockToggle'); res.lockOffAgain = await count(); }
fs.writeFileSync(process.argv[2], JSON.stringify(res, null, 1)); console.log(JSON.stringify({ d: res.defaultState.sidebarControls, v: res.defaultState.viewSectionControls, on: res.lockOn?.viewSectionControls }));
await b.close();
