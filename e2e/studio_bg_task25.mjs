// 작업 25 검증(합성 샘플 이미지만 사용): 스튜디오 배경 — 그리기 규칙, 수평선 자동/고정, 저장·열기(schemaVersion 7), 투명 PNG/화면 그대로 PNG, GLB 불변.
// 실행: NO_TAB_SHIM=1 없이 러너(tab_shim)와 함께 실행해도 된다. SABARI_URL=<주소> STAGE_OUT=verification/studio25 node e2e/studio_bg_task25.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), S = path.join(ROOT, 'assets', 'samples');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/studio25'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL;
const R = {}; const checks = {};
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari);
for (const f of ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']) { await p.evaluate((id) => window.__sabari.setCurrent(id), f); await p.setInputFiles('#filePick', path.join(S, `sample_${f}.png`)); await p.waitForFunction((id) => window.__sabari.faces[id].img, f); }
const dl = async (sel, name) => { const w = p.waitForEvent('download', { timeout: 30000 }); await p.click(sel); const d = await w; const f = path.join(OUT, name); await d.saveAs(f); return f; };
const bgPix = (ys) => p.evaluate((ys) => { const c = document.getElementById('bgCanvas'); const g = c.getContext('2d'); return ys.map((fy) => Array.from(g.getImageData(Math.floor(c.width * 0.5), Math.min(c.height - 1, Math.floor(c.height * fy)), 1, 1).data)); }, ys);
const openBgTab = async () => { await p.evaluate(() => { document.getElementById('dBg').open = true; }); };
await openBgTab();
// 1) 기본 스튜디오: 흰색에 가깝고, 맨 위 벽이 살짝 어둡고 바닥 맨 아래가 약간 어둡다
await p.click('[data-bgkind=studio]'); await p.waitForTimeout(200);
const px0 = await bgPix([0.01, 0.3, 0.5, 0.7, 0.99]);
R.default_studio_pixels = px0;
checks.default_near_white = px0.every((c) => c[0] >= 215 && c[1] >= 215 && c[2] >= 215);
checks.default_bottom_darker = px0[4][0] < px0[2][0] && px0[0][0] <= 255;
// 2) 벽 회색 + 바닥 밝은 회색 + 고정 수평선 40%
await p.click('#bgStudioWallChips button[data-color="#949494"]'); await p.click('#bgStudioFloorChips button[data-color="#e6e6e6"]');
await p.evaluate(() => { const a = document.getElementById('bgHorizonAuto'); if (a.getAttribute('aria-checked') === 'true') a.click(); });
await p.fill('#bgHorN', '40'); await p.dispatchEvent('#bgHorN', 'change'); await p.fill('#bgVigN', '0'); await p.dispatchEvent('#bgVigN', 'change'); await p.waitForTimeout(250);
const px1 = await bgPix([0.1, 0.3, 0.4, 0.7, 0.95]);
R.gray_studio_pixels = px1;
checks.wall_gray_floor_brighter = px1[1][0] > 125 && px1[1][0] < 160 && px1[3][0] > 200 && px1[3][0] > px1[1][0];
checks.horizon_soft_band = px1[2][0] > px1[1][0] + 5 && px1[2][0] < px1[3][0] + 5; // 수평선(40%) 위치는 벽과 바닥 사이로 섞인 값
// 3) 자동 수평선: 시점이 바뀌면 수평선 높이 값이 바뀌고 고정이면 그대로
await p.evaluate(() => { const a = document.getElementById('bgHorizonAuto'); if (a.getAttribute('aria-checked') !== 'true') a.click(); });
const hz = {};
for (const v of ['iso', 'front', 'top']) { hz[v] = await p.evaluate((v) => { window.__sabari.viewer.setView(v); return window.__sabari.viewer.horizonFrac(); }, v); await p.waitForTimeout(150); }
R.horizon_by_view = hz;
checks.horizon_auto_moves = Math.abs(hz.front - hz.iso) > 0.05 && hz.top < hz.iso;
await p.evaluate(() => window.__sabari.viewer.setView('iso'));
// 4) PNG: 투명 = 배경 없음, 화면 그대로 = 스튜디오 포함 (+ 그림자)
await p.evaluate(() => { const t = document.getElementById('shadowToggle'); if (t.getAttribute('aria-pressed') !== 'true') t.click(); const s = document.getElementById('shStyle'); s.value = 'studio'; s.dispatchEvent(new Event('change')); });
await p.click('#tabExport').catch(() => {});
await p.selectOption('#bgSel', 'transparent'); const fT = await dl('#btnPng', 'studio_transparent.png');
await p.selectOption('#bgSel', 'screen'); const fS = await dl('#btnPng', 'studio_screen.png');
const png = async (f) => p.evaluate(async (b64) => { const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob()); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; const px = (x, y) => Array.from(d.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 4)); return { w: c.width, h: c.height, tl: px(2, 2), bl: px(2, c.height - 3), mid: px(c.width >> 1, c.height >> 1) }; }, fs.readFileSync(f).toString('base64'));
const t = await png(fT), sc = await png(fS);
R.png_transparent = t; R.png_screen = sc;
checks.png_transparent_corner_alpha0 = t.tl[3] === 0 && t.bl[3] === 0;
checks.png_screen_has_studio_bg = sc.tl[3] === 255 && sc.tl[0] > 100 && sc.bl[3] === 255 && sc.bl[0] > sc.tl[0];
// 5) 저장·열기: 스튜디오 → schemaVersion 7 + studio 필드, 기본(흰색)은 studio 필드 없음
const pj = async (f) => JSON.parse(await (await JSZip.loadAsync(fs.readFileSync(f))).file('project.json').async('string'));
const fProj = await dl('#btnProjSave', 'studio_project.sabari'); const j = await pj(fProj);
R.project_studio = { schemaVersion: j.schemaVersion, bg: j.viewSettings?.background };
checks.project_v7_studio = j.schemaVersion >= 8 && j.viewSettings.background.kind === 'studio' && j.viewSettings.background.studio.wall === '#949494' && j.viewSettings.background.studio.horizonAuto === true;
// 열기: 스튜디오 저장 파일 → 스튜디오 복원, 필드 없는 구 파일(studio 키 제거) → 기본 스튜디오 값이 아니라 흰색 배경으로 열림(종류가 white)
await p.setInputFiles('#fileProj', fProj); await p.waitForTimeout(800);
R.reopened = await p.evaluate(() => ({ pressed: document.querySelector('[data-bgkind=studio]').getAttribute('aria-pressed'), wall: document.getElementById('bgStudioWall').value }));
checks.reopen_restores_studio = R.reopened.pressed === 'true' && R.reopened.wall === '#949494';
const zip = await JSZip.loadAsync(fs.readFileSync(fProj)); const old = JSON.parse(await zip.file('project.json').async('string')); old.schemaVersion = 6; delete old.viewSettings; zip.file('project.json', JSON.stringify(old));
const fOld = path.join(OUT, 'old_v6_no_viewsettings.sabari'); fs.writeFileSync(fOld, await zip.generateAsync({ type: 'nodebuffer' }));
await p.setInputFiles('#fileProj', fOld); await p.waitForTimeout(800);
checks.old_file_opens_default_bg = await p.evaluate(() => document.querySelector('[data-bgkind=white]').getAttribute('aria-pressed') === 'true');
const fW = await dl('#btnProjSave', 'white_project.sabari'); const jw = await pj(fW);
checks.project_default_has_no_studio_field = jw.schemaVersion >= 8 && !('studio' in (jw.viewSettings?.background ?? {}));
const future = JSON.parse(JSON.stringify(old)); future.schemaVersion = 99; zip.file('project.json', JSON.stringify(future));
const fFut = path.join(OUT, 'future_v99.sabari'); fs.writeFileSync(fFut, await zip.generateAsync({ type: 'nodebuffer' }));
await p.setInputFiles('#fileProj', fFut); await p.waitForTimeout(600);
checks.future_version_rejected = await p.evaluate(() => /열 수 없습니다/.test(document.getElementById('msgText')?.textContent ?? document.body.innerText));
// 6) GLB 불변: 스튜디오·그림자 스타일 상관없이 같은 바이트
await p.click('[data-bgkind=white]'); await p.evaluate(() => { const t = document.getElementById('shadowToggle'); if (t.getAttribute('aria-pressed') === 'true') t.click(); });
const g1 = fs.readFileSync(await dl('#btnGlb', 'glb_plain.glb'));
await p.click('[data-bgkind=studio]'); await p.evaluate(() => { const t = document.getElementById('shadowToggle'); if (t.getAttribute('aria-pressed') !== 'true') t.click(); });
const g2 = fs.readFileSync(await dl('#btnGlb', 'glb_studio_shadow.glb'));
const g3 = fs.readFileSync(await dl('#btnGlb', 'glb_again.glb'));
R.glb = { g1: g1.length, g2: g2.length, g3: g3.length, g1eqg3: g1.equals(g3) };
checks.glb_bytes_same = g1.equals(g2);
// 7) 그림자 스타일은 localStorage 에만
const ls = await p.evaluate(() => localStorage.getItem('sabari.floorShadow'));
checks.shadow_style_in_localStorage = /"style":"studio"/.test(ls ?? '');
checks.shadow_not_in_project = !/shadow/i.test(JSON.stringify(j));
checks.no_page_errors = errs.length === 0;
R.checks = checks;
fs.writeFileSync(path.join(OUT, 'studio_bg_task25.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(checks), '\n', JSON.stringify({ px0, px1, hz, t, sc }));
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
