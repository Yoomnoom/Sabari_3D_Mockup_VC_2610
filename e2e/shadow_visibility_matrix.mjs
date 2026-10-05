// 작업 11: 그림자 가시성 측정 표. 자세 × 카메라 고도 × 조작 이력 × 배경(흰/투명 PNG 경로) × 그림자 방향에서 "기준(그림자 끔)에서 배경이던 픽셀 중 그림자 때문에 바뀐 픽셀 수"를 잰다.
// 렌더러 메모리 때문에 조건(자세×고도×이력) 몇 개씩 나눠 실행한다: CONDS="0-2" (인덱스 범위). 결과는 STAGE_OUT/shadow_matrix_<시작>.json
// 실행: SABARI_URL=<주소> STAGE_OUT=verification/shadow-visibility CONDS=0-2 node e2e/shadow_visibility_matrix.mjs
import { OUT, fs, path, start } from './stage24_common.mjs';
const POSES = ['lying', 'standingL', 'standingR', 'tilt1', 'tilt2', 'tilt3', 'tilt4', 'tilt5', 'flipped'];
const CAMS = [-10, 0, 15, 30, 60];
const HIST = ['toggle', 'view', 'lift', 'resize'];
const DIRS = { default: { az: 225, el: 65 }, az0: { az: 0, el: 65 }, az90: { az: 90, el: 65 }, az180: { az: 180, el: 65 }, az270: { az: 270, el: 65 }, el20: { az: 225, el: 20 }, el80: { az: 225, el: 80 } };
const eul = (x, y, z) => { const r = Math.PI / 180, c = (a) => Math.cos(a * r / 2), s = (a) => Math.sin(a * r / 2); // XYZ 오일러(도) → 쿼터니언
  const [cx, cy, cz, sx, sy, sz] = [c(x), c(y), c(z), s(x), s(y), s(z)];
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz]; };
const QUATS = { lying: [0, 0, 0, 1], standingL: [0.5, 0.5, 0.5, 0.5], standingR: [0.5, 0.5, 0.5, 0.5], tilt1: eul(20, 30, 0), tilt2: eul(-25, 10, 15), tilt3: eul(40, -35, 20), tilt4: eul(10, 60, -10), tilt5: eul(-45, 20, 35), flipped: [1, 0, 0, 0] };
const conds = []; for (const h of HIST) for (const pz of POSES) for (const cam of CAMS) conds.push({ pose: pz, cam, hist: h });
const [c0, c1] = (process.env.CONDS ?? '0-0').split('-').map(Number);
const { p, finish, rec, colorFaces } = await start();
const FAST = process.env.FAST === '1'; // 빠른 모드: 면 이미지를 올리지 않는다(그림자 픽셀 수는 면 이미지와 무관, 기본 템플릿은 합성 데이터)
if (!FAST) await colorFaces(); // 면별 합성 색 이미지(시안 아님)
const url = p.url();
const rows = [];
for (let ci = c0; ci <= Math.min(c1, conds.length - 1); ci++) {
  const { pose, cam, hist } = conds[ci];
  await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(300);
  await p.setViewportSize({ width: 1000, height: 520 }); await p.waitForTimeout(250);
  if (!FAST) await colorFaces();
  await p.evaluate(() => { document.getElementById('dLight').open = true; });
  if ((await p.getAttribute('#shadowToggle', 'aria-pressed')) !== 'true') await p.click('#shadowToggle'); // 토글 켬(새로고침 후 저장된 켬 상태가 복원되므로 상태를 보고 누른다)
  if (hist === 'view') { await p.click('[data-view=top]'); await p.click('.vp-fixed[data-side=left]'); await p.keyboard.press('f'); }
  if (hist === 'lift') await p.click('#btnOpen');
  if (hist === 'resize') { await p.setViewportSize({ width: 1100, height: 560 }); await p.waitForTimeout(250); await p.setViewportSize({ width: 1000, height: 520 }); await p.waitForTimeout(250); }
  if (pose === 'standingL' || pose === 'standingR') await p.click(`.vp-fixed[data-side=${pose === 'standingL' ? 'left' : 'right'}]`); // 세운 3/4 버튼(FOV 22)
  const onAfterHistory = await p.evaluate(() => window.__sabari.viewer.getFloorShadow().on);
  await p.evaluate(({ q, cam, pose }) => {
    const V = window.__sabari.viewer; V.setBoxQuatRaw(q);
    const b = V.bounds(), c = b.getCenter(new V.camera.position.constructor()), fit = V.getFitDistance();
    const az = (pose === 'standingL' ? -32 : pose === 'standingR' ? 32 : 30) * Math.PI / 180, e = cam * Math.PI / 180;
    V.setCameraRaw([c.x + Math.sin(az) * Math.cos(e) * fit, c.y + Math.sin(e) * fit, c.z + Math.cos(az) * Math.cos(e) * fit], [c.x, c.y, c.z]);
  }, { q: QUATS[pose], cam, pose });
  await p.waitForTimeout(150);
  const shot = (bg) => p.evaluate(async (bg) => { const V = window.__sabari.viewer; const r = await V.screenshotScaled(bg, 1); const bm = await createImageBitmap(r.blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); bm.close(); return g.getImageData(0, 0, c.width, c.height).data; }, bg).then(() => 0);
  for (const bg of (FAST ? ['white'] : ['white', 'transparent'])) { // 빠른 모드는 흰 배경만(토글 이력에서 흰/투명 차이 최대 84px 확인)
    // 기준(끔)과 방향별(켬)을 한 번에 페이지 안에서 비교한다(큰 배열을 노드로 옮기지 않는다)
    const res = await p.evaluate(async ({ bg, DIRS }) => {
      const V = window.__sabari.viewer; const base = { ...V.getFloorShadow() };
      const grab = async () => { const r = await V.screenshotScaled(bg, 1); const bm = await createImageBitmap(r.blob); const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; const g = c.getContext('2d'); g.drawImage(bm, 0, 0); bm.close(); return g.getImageData(0, 0, c.width, c.height).data; };
      V.setFloorShadow({ ...base, on: false }); const off = await grab();
      const isBg = (d, i) => (bg === 'white' ? d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255 : d[i + 3] === 0);
      const out = {};
      for (const [k, dir] of Object.entries(DIRS)) {
        V.setFloorShadow({ ...base, on: true, strength: 0.4, soft: 0.5, ...dir }); const on = await grab(); let n = 0;
        for (let i = 0; i < on.length; i += 4) if (isBg(off, i) && (Math.abs(on[i] - off[i]) > 3 || Math.abs(on[i + 3] - off[i + 3]) > 3)) n++;
        out[k] = { px: n, floorY: V.getFloorY() };
      }
      V.setFloorShadow({ ...base });
      return out;
    }, { bg, DIRS });
    for (const [dk, v] of Object.entries(res)) rows.push({ ci, pose, cam, hist, bg, dir: dk, px: v.px, floorY: v.floorY, onAfterHistory });
  }
}
fs.writeFileSync(path.join(OUT, `shadow_matrix_${c0}.json`), JSON.stringify(rows));
rec('rows', rows.length);
await finish(`shadow_matrix_done_${c0}.json`);
