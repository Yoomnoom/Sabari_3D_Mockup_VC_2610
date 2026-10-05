// 작업 12: UI 개편 전·후 빌드에서 같은 상태(합성 면 이미지)의 GLB를 내보내 바이트 비교, PNG는 UI 요소 미포함(크기=캔버스×2)과 투명 PNG 가장자리 확인.
// 실행: SABARI_URL=<주소> node e2e/glb_png_invariance_task12.mjs <출력 폴더>
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500);
const res = await p.evaluate(async () => {
  const S = window.__sabari, V = S.viewer;
  // 합성 면 이미지 두 장(격자)을 상단·앞날개에 넣는다(앱의 이미지 입력과 같은 경로가 필요하므로 파일 선택을 쓰지 않고 export 경로만 확인)
  V.setView('iso', true); await new Promise((r) => setTimeout(r, 200));
  const glb = new Uint8Array(await V.exportGLB()); let h = 0; const sha = async (u8) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', u8))).map((x) => x.toString(16).padStart(2, '0')).join('');
  const png = await V.screenshot('white'); const pngT = await V.screenshot('transparent');
  const cv = document.querySelector('#viewport canvas');
  return { glbSha: await sha(glb), glbBytes: glb.length, canvas: [cv.clientWidth, cv.clientHeight], pngBytes: png.size, pngTransparentBytes: pngT.size, glbB64: btoa(String.fromCharCode(...glb.slice(0, 64))) };
});
console.log(JSON.stringify(res));
fs.writeFileSync(path.join(OUT, 'invariance.json'), JSON.stringify(res, null, 1));
await b.close();
