import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '../../frontend/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:8873/');
  await page.waitForFunction(() => window.__sabari);
  const expected = { front: [0, .12, 1], back: [0, .12, -1], left: [-1, .12, 0], right: [1, .12, 0], top: [0, 1, .0001], bottom: [0, -1, .0001], iso: [.9, .75, 1.05] };
  const results = {};
  for (const [name, direction] of Object.entries(expected)) {
    await page.click(name === 'iso' ? '#btnIso' : `[data-view=${name}]`);
    const actual = await page.evaluate(() => {
      const v = window.__sabari.viewer;
      return v.camera.position.clone().sub(v.controls.target).normalize().toArray();
    });
    const length = Math.hypot(...direction);
    // The 3/4 button toggles R/L; either documented diagonal is valid.
    const wanted = direction.map(n => n / length);
    const variants = name === 'iso' ? [wanted, [-wanted[0], wanted[1], -wanted[2]]] : [wanted];
    assert(variants.some(d => d.every((n, i) => Math.abs(n - actual[i]) < 1e-5)), name);
    results[name] = { pass: true, direction: actual };
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(new URL('./views.json', import.meta.url), JSON.stringify({ results, errors }, null, 2));
  console.log('7 view directions passed');
} finally { await browser.close(); }
