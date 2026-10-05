// 시안(inputs/ui-mockups/Sabari_UIUX_Mockup_v6.html) 화면 1~28 캡처. 고객 시안이므로 결과물은 verification-private/ui-mockup/ 에만 저장한다(커밋 금지).
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'verification-private', 'ui-mockup'); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1700, height: 1000 } })).newPage();
await p.goto(pathToFileURL(path.join(ROOT, 'inputs', 'ui-mockups', 'Sabari_UIUX_Mockup_v6.html')).href); await p.waitForTimeout(500);
const btns = await p.$$('#switcher button'); const titles = [];
for (let i = 0; i < btns.length; i++) { await btns[i].click(); await p.waitForTimeout(200); titles.push((await btns[i].textContent()).trim()); await p.screenshot({ path: path.join(OUT, `${String(i + 1).padStart(2, '0')}.png`), fullPage: true }); }
fs.writeFileSync(path.join(OUT, 'titles.json'), JSON.stringify(titles, null, 1));
console.log(btns.length, titles.join(' | '));
await b.close();
