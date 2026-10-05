// 단계 28c 검증: 투명 영역이 면 바탕색으로 합성되는지(숨은 흰색 RGB가 새지 않는지), 반투명 경계가 알파 혼합값과 맞는지
// SABARI_URL=http://127.0.0.1:8766/ node e2e/dieline_transparency.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = path.join(ROOT, 'verification');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const R = {}; const rec = (k, v) => { R[k] = v; };

// ---- 최소 PNG 인코더 (RGBA, 8bit): 캔버스 putImageData는 premultiplied 저장이라 alpha=0의 숨은 RGB를 보존 못함(실측 확인됨) -> 파일 바이트를 직접 만든다 ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
const setPx = (rgba, w, x, y, r, g, bl, a) => { const i = (y * w + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = bl; rgba[i + 3] = a; };

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250);

const BLEED = 3, SCALE = 6; // mm -> px
const layout = await p.evaluate((k) => window.__sabari.getLayout(k), 'lid');
const W = Math.round((layout.width + 2 * BLEED) * SCALE), H = Math.round((layout.height + 2 * BLEED) * SCALE);
const COLORS = { lid_top: [214, 40, 40], lid_front: [30, 100, 220], lid_back: [30, 160, 70], lid_left: [0, 160, 170], lid_right: [130, 50, 190] };
// 경계 폭은 면 크기 비율로 잡는다(분할·스냅 과정에서 생기는 몇 px 오차에 흔들리지 않도록 넉넉히).
const BAND_FRAC = 0.1;
const SUB_OUTER = 96, SUB_INNER = 192; // 바깥쪽(많이 투명)·안쪽(적게 투명) 반투명 구간 알파

const rgba = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) setPx(rgba, W, x, y, 255, 255, 255, 0); // 바탕 전체: 숨은 흰색 RGB, alpha=0

const faceRects = {}; // 분할 후 검증에 사용
for (const f of layout.faces) {
  const col = COLORS[f.id]; if (!col) continue;
  const x0 = Math.round((f.rect.x + BLEED) * SCALE), y0 = Math.round((f.rect.y + BLEED) * SCALE);
  const fw = Math.round(f.rect.w * SCALE), fh = Math.round(f.rect.h * SCALE);
  faceRects[f.id] = { x0, y0, fw, fh, rot: f.rotationDeg };
  const band = Math.max(6, Math.round(Math.min(fw, fh) * BAND_FRAC));
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const d = Math.min(x, y, fw - 1 - x, fh - 1 - y); // 가장자리까지 거리(px)
    const a = d < band / 2 ? SUB_OUTER : d < band ? SUB_INNER : 255;
    setPx(rgba, W, x0 + x, y0 + y, col[0], col[1], col[2], a); // 면 색 그대로, 알파만 구간별로 다르게
  }
}
fs.writeFileSync(path.join(V, 'test_dieline_rgba.png'), encodePNG(W, H, rgba));
rec('0_input_png', { W, H, faces: Object.keys(faceRects).length });

await p.setInputFiles('#fileDieline', { name: 'rgba_test.png', mimeType: 'image/png', buffer: encodePNG(W, H, rgba) });
await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(300);
await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open); await p.waitForTimeout(400);

// 면 blob(크롭 직후, bake 전) 크기 확인(참고용 - 분할·스냅 과정에서 내가 계산한 시트 좌표와 정확히 같지 않을 수 있음)
const readBlobSize = () => p.evaluate(async () => {
  const out = {};
  for (const [id, f] of Object.entries(window.__sabari.faces)) {
    if (!f.blob) { out[id] = null; continue; }
    const bmp = await createImageBitmap(f.blob);
    out[id] = { w: bmp.width, h: bmp.height };
  }
  return out;
});
// 면 canvas(bake 후, 실제 3D/GLB/PNG에 쓰이는 공용 경로)에서 필요한 픽셀만 표본 추출(실제 출력 크기의 비율 위치로 샘플링 -> 분할 스냅 오차에 안전)
const sampleCanvas = () => p.evaluate(() => {
  const out = {};
  for (const [id, f] of Object.entries(window.__sabari.faces)) {
    if (!f.canvas || !f.img) { out[id] = null; continue; }
    const g = f.canvas.getContext('2d');
    const w = f.canvas.width, h = f.canvas.height;
    const iw = f.iw, ih = f.ih;
    const fitScale = Math.min(w / iw, h / ih);
    const dw = iw * fitScale, dh = ih * fitScale;
    const y0 = (h - dh) / 2;
    const m = Math.min(dw, dh);
    const px = (x, y) => Array.from(g.getImageData(Math.max(0, Math.min(w - 1, Math.round(x))), Math.max(0, Math.min(h - 1, Math.round(y))), 1, 1).data.slice(0, 3));
    // 가장자리->안쪽으로 가는 단면을 촘촘히 표본해서(시트->크롭->굽기 과정의 리샘플로 정확한 행 위치를 미리 알 수 없음) 알파 단계별 혼합값과 맞는지 뒤에서 분류한다.
    const N = 24;
    const transect = [];
    for (let i = 0; i <= N; i++) { const frac = (i / N) * 0.14; transect.push(px(w / 2, y0 + m * frac)); }
    out[id] = { w, h, center: px(w / 2, h / 2), transect };
  }
  return out;
});

const BG_TESTS = ['#1c1c1c', '#030303', '#808080', '#ffffff']; // 28, 3, 128, 255
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

async function setFaceBg(hex) {
  await p.fill('#colFace', hex); await p.dispatchEvent('#colFace', 'input'); await p.waitForTimeout(250);
}

const blobSizes = await readBlobSize();
const bakeResults = {};
for (const hex of BG_TESTS) {
  await setFaceBg(hex);
  const sampled = await sampleCanvas();
  const bg = hexToRgb(hex);
  const perFace = {};
  for (const id of Object.keys(faceRects)) {
    const s = sampled[id]; if (!s) { perFace[id] = 'MISSING'; continue; }
    const col = COLORS[id];
    const blend = (a) => col.map((c, i) => Math.round((c * a + bg[i] * (255 - a)) / 255));
    const levels = [0, SUB_OUTER, SUB_INNER, 255];
    const expectedByLevel = levels.map((a) => blend(a));
    const close = (act, exp, tol) => act.every((v, i) => Math.abs(v - exp[i]) <= tol);
    const centerOk = close(s.center, col, 4);
    // 단면의 각 표본이 4개 알파 단계(0/96/192/255) 중 하나의 혼합값과 맞는지(숨은 흰색 유출이면 어느 단계에도 안 맞음). 단계 경계 1픽셀은 리샘플 보간으로 두 단계 사이 값이 될 수 있어 느슨한 허용폭(tol 6)을 쓴다.
    const classify = (px) => expectedByLevel.findIndex((exp) => close(px, exp, 6));
    const classes = s.transect.map(classify);
    // 경계 보간 픽셀(-1)은 바로 이웃한 두 단계 값 사이(각 성분이 두 단계의 min~max 안)면 허용한다.
    const betweenNeighbors = (px, loIdx, hiIdx) => {
      if (loIdx < 0 || hiIdx < 0) return false;
      const lo = expectedByLevel[loIdx], hi = expectedByLevel[hiIdx];
      return px.every((v, i) => v >= Math.min(lo[i], hi[i]) - 2 && v <= Math.max(lo[i], hi[i]) + 2);
    };
    let allClassified = true;
    for (let i = 0; i < classes.length; i++) {
      if (classes[i] >= 0) continue;
      if (i < 3) continue; // 맨 가장자리 1~2px는 모서리(두 변의 띠가 만나는 지점)라 리샘플 보간이 두 방향에서 섞여 들어옴 - 검사 제외
      const prev = classes[i - 1], next = classes[i + 1];
      if (betweenNeighbors(s.transect[i], prev, next)) continue;
      allClassified = false; break;
    }
    const sawOuter = classes.includes(1), sawInner = classes.includes(2);
    // 숨은 흰색 유출 직접 확인: 면 색·바탕색 둘 다 흰색 성분이 뚜렷하지 않은데 순백에 가까운 표본이 나오면 유출.
    const bgIsWhite = bg.every((v) => v >= 250);
    const colHasNoWhite = col.some((v) => v <= 230);
    const noWhiteLeak = bgIsWhite || !colHasNoWhite || s.transect.every((px) => !px.every((v) => v >= 253));
    const edgeOk = allClassified && sawOuter && sawInner && noWhiteLeak;
    perFace[id] = { centerOk, edgeOk, allClassified, sawOuter, sawInner, noWhiteLeak, classes, transect: s.transect };
  }
  bakeResults[hex] = perFace;
}
rec('1_bake_per_bg', bakeResults);
rec('1_all_ok', Object.values(bakeResults).every((pf) => Object.values(pf).every((v) => v !== 'MISSING' && v.centerOk && v.edgeOk)));

// 크롭 blob 단계 크기(참고 기록 - 분할 스냅으로 내가 계산한 시트 좌표와 약간 다를 수 있어 실패 기준으로 쓰지 않음)
const sizeInfo = {};
for (const [id, rect] of Object.entries(faceRects)) {
  const bs = blobSizes[id]; if (!bs) { sizeInfo[id] = 'MISSING'; continue; }
  sizeInfo[id] = { size: [bs.w, bs.h], expectedFromSheet: [rect.fw, rect.fh] };
}
rec('2_crop_size_info', sizeInfo);

fs.mkdirSync(path.join(V, 'overnight'), { recursive: true });
fs.writeFileSync(path.join(V, 'overnight', 'result_dieline_transparency.json'), JSON.stringify(R, null, 2));
console.log('OK', JSON.stringify({ all_ok: R['1_all_ok'], errs }, null, 0));
await b.close();
