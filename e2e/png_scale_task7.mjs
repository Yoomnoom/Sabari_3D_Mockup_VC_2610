// 작업 7 검증: PNG 저장 배율(화면/2배/4배) — 해상도 배수, 같은 프레이밍, 투명 가장자리, 한계 초과 안내, 새로고침 후 선택 유지
// 실행: SABARI_URL=http://127.0.0.1:8877/ DIST=<빌드 폴더> STAGE_OUT=verification-private/png-scale node e2e/png_scale_task7.mjs && python e2e/png_scale_task7_diff.py
import http from 'node:http';
import { OUT, assert, fs, path, start } from './stage24_common.mjs';
const DIST = process.env.DIST;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  const f = path.join(DIST, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[path.extname(f)] ?? 'application/octet-stream');
  res.end(fs.readFileSync(f));
}).listen(8877);
const { p, finish, rec, colorFaces } = await start();
await colorFaces();
const pngSize = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const save = async (bg, scale, name) => {
  await p.selectOption('#bgSel', bg); await p.selectOption('#pngScale', String(scale));
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('#btnPng')]);
  const f = path.join(OUT, name); await d.saveAs(f); await p.waitForTimeout(100);
  return { file: name, size: pngSize(f), bytes: fs.statSync(f).size, msg: await p.textContent('#msg'), msgClass: await p.getAttribute('#msg', 'class') };
};
const limits = await p.evaluate(() => { const gl = window.__sabari.viewer.renderer.getContext(); return { maxRb: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), maxVp: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)), dpr: window.devicePixelRatio, canvas: [document.querySelector('#viewport canvas').clientWidth, document.querySelector('#viewport canvas').clientHeight] }; });
rec('device_limits_large_viewport', limits);

// 1) 큰 창: 4배는 한계 초과 → 자동 하향 + 안내 (작업 12 이후 3D 화면이 좁아져 창을 더 크게 잡는다)
await p.setViewportSize({ width: 2300, height: 1100 }); await p.waitForTimeout(500);
const big = {};
for (const s of [1, 2, 4]) big[s] = await save('white', s, `big_white_x${s}.png`);
rec('large_viewport', big);
assert(big[2].size[0] === big[1].size[0] * 2 && big[2].size[1] === big[1].size[1] * 2, '큰 창 2배 정확한 배수');
assert(Math.max(...big[4].size) <= 8192, '한계 이하');
assert(big[4].size[0] < big[1].size[0] * 4, '큰 창에서는 4배가 한계로 낮춰져야 함');
assert(/최대 크기/.test(big[4].msg), '한국어 안내: ' + big[4].msg);

// 2) 작은 창(캔버스 약 600px): 1/2/4배 정확한 배수, 흰/투명 각각
await p.setViewportSize({ width: 1300, height: 700 }); await p.waitForTimeout(400);
rec('small_canvas', await p.evaluate(() => [document.querySelector('#viewport canvas').clientWidth, document.querySelector('#viewport canvas').clientHeight]));
const small = {};
for (const bg of ['white', 'transparent']) for (const s of [1, 2, 4]) small[`${bg}_x${s}`] = await save(bg, s, `small_${bg}_x${s}.png`);
rec('small_viewport', small);
for (const bg of ['white', 'transparent']) {
  const b1 = small[`${bg}_x1`].size;
  for (const s of [2, 4]) { const z = small[`${bg}_x${s}`]; assert(z.size[0] === b1[0] * s && z.size[1] === b1[1] * s, `${bg} ${s}배 배수 ${z.size} vs ${b1}`); assert(/PNG를 저장했습니다/.test(z.msg), '정상 안내'); }
}

// 3) 면 텍스처 병목 수치: 큰 면(lid_top)의 화면 폭(px)과 텍스처 긴 변(px)의 비
const dens = await p.evaluate(() => {
  const v = window.__sabari.viewer, f = window.__sabari.faces.lid_top, c = v.faceCorners('lid_top'), xs = c.map((q) => q[0]), ys = c.map((q) => q[1]);
  const css = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
  const cvs = f.canvas ?? f.cv ?? null;
  return { lidTopCssPx: css, texture: cvs ? [cvs.width, cvs.height] : null, pr: Math.max(v.renderer.getPixelRatio(), 1) };
});
rec('texture_density_input', dens);

// 4) 새로고침 후 선택 유지(브라우저에만 기억)
await p.selectOption('#pngScale', '4'); await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400);
const afterReload = await p.inputValue('#pngScale'); rec('persist_after_reload', afterReload); assert(afterReload === '4');
const draftHasIt = await p.evaluate(() => JSON.stringify(Object.keys(localStorage)));
rec('localStorage_keys', draftHasIt);
await finish('png_scale_task7.json'); srv.close();
