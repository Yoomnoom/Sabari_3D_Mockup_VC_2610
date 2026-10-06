// 작업 26 추가 검증(합성만): (1) 8000px 바탕 이미지 로딩 시간·메모리·4096px 축소·원본 보존 (2) 바탕 없는 면 10종 픽셀이 변경 전 빌드와 같음.
// 실행: SABARI_URL=<새 빌드> BASE_URL=<변경 전 빌드> node e2e/underlay_extra_task26.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'verification/overnight/underlay_extra'); fs.mkdirSync(OUT, { recursive: true });
const NEW = process.env.SABARI_URL, OLD = process.env.BASE_URL; const checks = {}, R = {};
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = async (u) => { const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage(); await p.goto(u); await p.waitForFunction(() => window.__sabari); return p; };
const png = (p, w, h) => p.evaluate(async ([w, h]) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2a9d8f'); gr.addColorStop(1, '#e9c46a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const bl = await new Promise((r) => cv.toBlob(r)); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768)); return btoa(s); }, [w, h]);
const FACES = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right', 'base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'];
const sample = (p) => p.evaluate((ids) => Object.fromEntries(ids.map((i) => { const f = window.__sabari.faces[i]; if (!f.img) return [i, null]; const d = f.canvas.getContext('2d').getImageData(0, 0, f.canvas.width, f.canvas.height).data; const s = []; for (let k = 0; k < d.length; k += 1013) s.push(d[k]); return [i, s]; })), FACES);
const fill = async (p) => { await p.check('#useBase').catch(() => {}); for (const [n, id] of FACES.entries()) { await p.evaluate((id) => window.__sabari.setCurrent(id), id); await p.setInputFiles('#filePick', { name: id + '.png', mimeType: 'image/png', buffer: Buffer.from(await png(p, 320, 240 + n * 10), 'base64') }); await p.waitForFunction((id) => window.__sabari.faces[id].img, id); } await p.waitForTimeout(500); };
const pn = await page(NEW); await fill(pn); const sn = await sample(pn);
if (OLD) { const po = await page(OLD); await fill(po); const so = await sample(po); checks.no_underlay_faces_equal_before = FACES.every((k) => sn[k] && so[k] && sn[k].length === so[k].length && sn[k].filter((v, i) => Math.abs(v - so[k][i]) > 1).length <= sn[k].length * 0.01); }
// 8000px 바탕
await pn.evaluate((id) => window.__sabari.setCurrent(id), 'lid_top');
const big = Buffer.from(await png(pn, 8000, 5333), 'base64'); fs.writeFileSync(path.join(OUT, 'under8000.png'), big);
const t0 = Date.now(); await pn.setInputFiles('#fileUnder', path.join(OUT, 'under8000.png')); await pn.waitForFunction(() => window.__sabari.faces.lid_top.under, null, { timeout: 60000 }); const ms = Date.now() - t0;
const info = await pn.evaluate(async () => { const u = window.__sabari.faces.lid_top.under; return { iw: u.iw, ih: u.ih, ow: u.ow, oh: u.oh, bytes: u.blob.size, mem: performance.memory?.usedJSHeapSize ?? null }; });
R.big = { ms, ...info }; checks.big_loads_under_10s = ms < 10000; checks.big_display_max_4096 = Math.max(info.iw, info.ih) <= 4096; checks.big_original_kept = info.ow === 8000 && info.bytes === big.length;
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 1)); console.log(JSON.stringify({ checks, R })); await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
