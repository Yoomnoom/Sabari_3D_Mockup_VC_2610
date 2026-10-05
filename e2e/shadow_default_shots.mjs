// 작업 10: 후보 빛 방향별 3/4 시점·세운 3/4 왼쪽/오른쪽 스크린샷(합성 면 이미지). 사용: COMBOS="35,55;225,65" SHOT_PREFIX=cand node e2e/shadow_default_shots.mjs
import { OUT, path, start } from './stage24_common.mjs';
const { p, finish, colorFaces } = await start();
await colorFaces();
await p.setViewportSize({ width: 1000, height: 640 }); await p.waitForTimeout(400);
await p.evaluate(() => { document.getElementById('dLight').open = true; });
const combos = (process.env.COMBOS ?? '35,55').split(';').map((c) => c.split(',').map(Number));
const set = (o) => p.evaluate((o) => { const V = window.__sabari.viewer; V.setFloorShadow({ ...V.getFloorShadow(), ...o }); }, o);
for (const [az, el] of combos) {
  await set({ on: true, strength: 0.4, soft: 0.5, az, el });
  for (const v of ['iso', 'left', 'right']) {
    if (v === 'iso') await p.evaluate(() => window.__sabari.viewer.setView('iso')); // 3/4 기본 시점(오른쪽). 버튼은 누를 때마다 R↔L이 바뀌므로 쓰지 않는다 else await p.click(`.vp-fixed[data-side=${v}]`);
    await p.waitForTimeout(250);
    await p.locator('#viewport canvas').screenshot({ path: path.join(OUT, `${process.env.SHOT_PREFIX ?? 'shot'}_${az}_${el}_${v}.png`) });
  }
}
await finish('shadow_default_shots.json');
