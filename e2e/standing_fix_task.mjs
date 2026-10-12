import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification-private/standing-fix');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8876/';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const syntheticPng = path.join(OUT, 'synthetic.png');
{
  const p = await browser.newPage({ viewport: { width: 32, height: 32 } });
  await p.setContent('<style>html,body{margin:0;width:32px;height:32px;background:#c64f25}</style>');
  await p.screenshot({ path: syntheticPng }); await p.close();
}

async function page() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const p = await context.newPage();
  await p.goto(URL);
  await p.waitForFunction(() => window.__sabari?.viewer);
  return p;
}

async function state(p) {
  return p.evaluate(() => {
    const read = (id) => {
      const b = document.getElementById(id), s = getComputedStyle(b);
      return { disabled: b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), pointerEvents: s.pointerEvents, opacity: s.opacity, cursor: s.cursor, title: b.title };
    };
    return { main: read('btnStanding'), floating: read('fvStanding'), selected: window.__sabari.viewer.selected };
  });
}

async function works(p, action) {
  const before = await p.evaluate(() => ({ q: window.__sabari.viewer.boxQuat.toArray(), fov: window.__sabari.viewer.camera.fov }));
  await action(); await p.waitForTimeout(120);
  const after = await p.evaluate(() => ({ q: window.__sabari.viewer.boxQuat.toArray(), fov: window.__sabari.viewer.camera.fov }));
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function buttonWorks(p, id) {
  if (await p.locator(id).isDisabled()) return false;
  return works(p, () => p.evaluate((id) => document.querySelector(id).click(), id));
}

const rows = {};
async function scenario(name, setup = async () => {}) {
  const p = await page();
  await setup(p);
  rows[name] = await state(p);
  rows[name].mainWorks = await buttonWorks(p, '#btnStanding');
  await p.reload(); await p.waitForFunction(() => window.__sabari?.viewer); await setup(p);
  rows[name].floatingWorks = await buttonWorks(p, '#fvStanding');
  await p.reload(); await p.waitForFunction(() => window.__sabari?.viewer); await setup(p);
  rows[name].alt6Works = await works(p, () => p.keyboard.press('Alt+6'));
  await p.context().close();
}

await scenario('이미지 없음');
await scenario('이미지 있음', async (p) => { await p.setInputFiles('#filePick', syntheticPng); await p.waitForFunction(() => window.__sabari.faces.base_bottom.img); });
await scenario('뚜껑 열림', async (p) => { await p.evaluate(() => document.getElementById('btnOpen').click()); });
await scenario('뚜껑 닫힘');
await scenario('외부 GLB', async (p) => { await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e/fixtures/legacy_5face.glb')); await p.waitForFunction(() => !document.getElementById('extGlbBanner').hidden); });
await scenario('하단 몸통 사용 꺼짐', async (p) => { await p.uncheck('#useBase'); });
await scenario('하단 몸통 사용 켜짐', async (p) => { await p.check('#useBase'); });
await scenario('바탕 레이어', async (p) => {
  await p.setInputFiles('#filePick', syntheticPng);
  await p.waitForFunction(() => window.__sabari.faces.base_bottom.img);
  await p.setInputFiles('#fileUnder', syntheticPng);
  await p.waitForFunction(() => window.__sabari.faces.base_bottom.unders.length === 1);
});
await scenario('.sabari 열기 후', async (p) => { await p.setInputFiles('#fileProj', path.join(ROOT, 'e2e/fixtures/legacy_v3_10face.sabari')); await p.waitForTimeout(500); });
await scenario('패널 접힘', async (p) => { await p.evaluate(() => document.getElementById('panelToggle').click()); });

const p = await page();
const bottom = {};
bottom.newProject = await p.evaluate(() => window.__sabari.viewer.selected);
await p.uncheck('#useBase'); await p.check('#useBase');
bottom.enableBase = await p.evaluate(() => window.__sabari.viewer.selected);
await p.evaluate(() => { const lid = document.getElementById('dieKindLid'); lid.checked = true; lid.dispatchEvent(new Event('change', { bubbles: true })); const base = document.getElementById('dieKindBase'); base.checked = true; base.dispatchEvent(new Event('change', { bubbles: true })); });
bottom.chooseBaseDieline = await p.evaluate(() => window.__sabari.viewer.selected);
await p.click('#tabView');
await p.locator('#panel').screenshot({ path: path.join(OUT, 'standing-buttons.png') });
await p.context().close();

const ext = await page();
await ext.setInputFiles('#fileGlb', path.join(ROOT, 'e2e/fixtures/legacy_5face.glb'));
await ext.waitForFunction(() => !document.getElementById('extGlbBanner').hidden);
await ext.locator('#stage').screenshot({ path: path.join(OUT, 'external-before.png') });
const forcedExternal = await ext.evaluate(() => {
  const v = window.__sabari.viewer;
  const beforeBounds = v.bounds();
  const before = { q: v.boxQuat.toArray(), fov: v.camera.fov, bounds: [beforeBounds.max.x - beforeBounds.min.x, beforeBounds.max.y - beforeBounds.min.y, beforeBounds.max.z - beforeBounds.min.z] };
  document.getElementById('btnStanding').click();
  return { before };
});
await ext.waitForTimeout(150);
forcedExternal.after = await ext.evaluate(() => { const v = window.__sabari.viewer, b = v.bounds(); return { q: v.boxQuat.toArray(), fov: v.camera.fov, bounds: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z] }; });
await ext.locator('#stage').screenshot({ path: path.join(OUT, 'external-forced-standing.png') });
const externalUi = await ext.evaluate(() => ({
  disabled: [...document.querySelectorAll(':disabled')].map((x) => x.id).filter(Boolean),
  inert: [...document.querySelectorAll('[inert]')].map((x) => x.id).filter(Boolean),
  ariaDisabled: [...document.querySelectorAll('[aria-disabled="true"]')].map((x) => x.id).filter(Boolean),
  titles: Object.fromEntries([...document.querySelectorAll(':disabled,[inert],[aria-disabled="true"]')].filter((x) => x.id).map((x) => [x.id, x.title])),
  standing: ['btnStanding', 'fvStanding'].map((id) => [id, document.getElementById(id).disabled]),
  axisLockDisabled: document.getElementById('lockToggle').disabled,
}));
await ext.context().close();

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ rows, bottom, forcedExternal, externalUi }, null, 2));
console.log(JSON.stringify({ rows, bottom, forcedExternal, externalUi }, null, 2));
await browser.close();
