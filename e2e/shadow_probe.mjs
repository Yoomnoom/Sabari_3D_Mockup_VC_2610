import { OUT, path, start } from './stage24_common.mjs';
const { p, finish, rec, colorFaces } = await start();
await colorFaces();
await p.click('#dLight summary').catch(() => {});
await p.evaluate(() => { document.getElementById('dLight').open = true; });
for (const [name, view, on] of [['off', 'iso', false], ['on_iso', 'iso', true], ['on_front', 'front', true], ['on_top', 'top', true], ['on_below', 'bottom', true]]) {
  await p.click(`[data-view=${view}]`);
  const pressed = await p.getAttribute('#shadowToggle', 'aria-pressed');
  if ((pressed === 'true') !== on) await p.click('#shadowToggle');
  await p.waitForTimeout(400);
  await p.locator('#viewport canvas').screenshot({ path: path.join(OUT, `probe_${name}.png`) });
  rec(name, await p.evaluate(() => window.__sabari.viewer.getFloorY()));
}
await finish('shadow_probe.json');
