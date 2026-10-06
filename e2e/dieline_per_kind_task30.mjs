// 작업 30 검증(합성 이미지만, 시안 사용 금지): 칼선 분할 저장을 뚜껑·하단 몸통 종류별로 따로 기억.
// 실행(B 단계): SABARI_URL=http://127.0.0.1:8766/ STAGE_OUT=verification/perkind30 node e2e/dieline_per_kind_task30.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/perkind30'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const checks = {}, R = {};
const ok = (k, v, detail) => { checks[k] = !!v; if (detail !== undefined) R[k] = detail; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const newPage = async () => {
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('sabari.askSaveName', '0'); } catch { /* 무시 */ } });
  const p = await ctx.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(250);
  return p;
};
// 아트보드(525.7×349.0) 합성 이미지: 뚜껑·몸통 십자형 자리 모두 서로 다른 무늬로 채운다
const art = (p) => p.evaluate(async () => {
  const W = 2628, H = 1745, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  for (let y = 0; y < H; y += 40) for (let x = 0; x < W; x += 40) { g.fillStyle = `hsl(${((x * 7 + y * 13) / 11) % 360} 70% ${35 + ((x + y) / 40) % 5 * 8}%)`; g.fillRect(x, y, 40, 40); }
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); const u8 = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s);
});
const upload = async (p, b64, name) => { await p.setInputFiles('#fileDieline', { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') }); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(500); };
const setKind = async (p, k) => { await p.selectOption('#splitKind', k); await p.waitForTimeout(900); };
const apply = async (p) => { await p.click('#btnSplitApply'); await p.waitForFunction(() => !document.getElementById('splitDlg').open, null, { timeout: 20000 }); await p.waitForTimeout(500); };
const faceHash = (p, ids) => p.evaluate(async (ids) => {
  const out = {};
  for (const id of ids) {
    const f = window.__sabari.faces[id]; if (!f?.blob) { out[id] = null; continue; }
    const bm = await createImageBitmap(f.blob), cv = document.createElement('canvas'); cv.width = bm.width; cv.height = bm.height;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, bm.width, bm.height).data; let h = 5381; for (let i = 0; i < d.length; i++) h = ((h * 33) ^ d[i]) >>> 0;
    out[id] = `${bm.width}x${bm.height}:${h}`;
  }
  return out;
}, ids);
const LID = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'], BASE = ['base_top', 'base_front', 'base_back', 'base_left', 'base_right'];
const regionsNow = (p) => p.evaluate(() => { const s = window.__sabari.getDielines(); return { lid: s.lid?.regions, base: s.base?.regions }; });
const dlgRegion = (p) => p.evaluate(() => ({ x: document.getElementById('regX').value, y: document.getElementById('regY').value, w: document.getElementById('regW').value, h: document.getElementById('regH').value, kind: document.getElementById('splitKind').value }));
const same = (a, c) => JSON.stringify(a) === JSON.stringify(c);

const p = await newPage();
const img = await art(p);
// 1) 뚜껑 적용
await upload(p, img, '아트보드_합성.png');
await apply(p);
const lidFaces1 = await faceHash(p, LID), st1 = await regionsNow(p);
ok('1_lid_applied', Object.values(lidFaces1).every(Boolean) && !!st1.lid && !st1.base, lidFaces1);

// 2) 같은 이미지를 올려 하단 몸통 적용 (방금 올린 이미지는 새 종류에 그대로 자동 배치)
await upload(p, img, '아트보드_합성.png');
await setKind(p, 'base');
const note = await p.textContent('#splitKindNote');
ok('2_kind_note', /이번 적용은 하단 몸통 5면만 바꿉니다\. 뚜껑 면은 그대로 유지됩니다\./.test(note), note);
await apply(p);
const lidFaces2 = await faceHash(p, LID), baseFaces2 = await faceHash(p, BASE), st2 = await regionsNow(p);
ok('2_lid_faces_pixel_identical_after_base_apply', same(lidFaces1, lidFaces2), { lidFaces1, lidFaces2 });
ok('2_base_applied_and_both_saved', Object.values(baseFaces2).some(Boolean) && !!st2.lid && !!st2.base && same(st2.lid, st1.lid));
const info = await p.textContent('#dielineInfo');
ok('2_info_shows_both', /뚜껑: .*아트보드_합성\.png.*하단 몸통: .*아트보드_합성\.png/.test(info), info);

// 3) 분할 영역 조정: 종류별 복원, 종류를 바꿨다 돌아와도 조정값 유지
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(500);
const dBase = await dlgRegion(p);
ok('3_edit_opens_last_kind', dBase.kind === 'base', dBase);
await setKind(p, 'lid');
const dLid = await dlgRegion(p);
ok('3_lid_restored_from_save', dLid.kind === 'lid' && Number(dLid.x) === Math.round(Object.values(st2.lid)[0].x), { dLid, first: Object.values(st2.lid)[0] });
await p.fill('#regX', String(Number(dLid.x) + 12)); await p.dispatchEvent('#regX', 'change'); await p.waitForTimeout(200);
await setKind(p, 'base'); await setKind(p, 'lid');
const dLid2 = await dlgRegion(p);
ok('3_adjustment_kept_after_kind_roundtrip', Number(dLid2.x) === Number(dLid.x) + 12, { dLid2 });
await p.click('#btnSplitCancel'); await p.waitForTimeout(300);
ok('3_cancel_changes_nothing', same(await regionsNow(p), st2));

// 4) 실행 취소 왕복: 하단을 다시 적용한 뒤 되돌리면 하단만 이전 상태, 뚜껑은 그대로
await p.click('#btnSplitEdit'); await p.waitForSelector('#splitDlg[open]'); await p.waitForTimeout(400);
await setKind(p, 'base'); await apply(p);
await p.keyboard.press('Control+z'); await p.waitForTimeout(600);
ok('4_undo_keeps_lid', same(await faceHash(p, LID), lidFaces1));

// 5) .sabari 저장→열기, 원본 중복 제거
const [pj] = await Promise.all([p.waitForEvent('download'), p.click('#btnProjSave')]);
const proj = path.join(OUT, 'both.sabari'); await pj.saveAs(proj);
const zip = await JSZip.loadAsync(fs.readFileSync(proj)); const pjson = JSON.parse(await zip.file('project.json').async('string'));
const dlFiles = Object.keys(zip.files).filter((f) => f.startsWith('images/dieline'));
ok('5_dedup_single_image', dlFiles.length === 1 && pjson.dielines?.lid?.file === pjson.dielines?.base?.file, dlFiles);
ok('5_schema_10_and_legacy_field', pjson.schemaVersion >= 10 && !!pjson.dieline, { v: pjson.schemaVersion });
const p2 = await newPage();
await p2.setInputFiles('#fileProj', proj); await p2.waitForFunction(() => { const s = window.__sabari.getDielines(); return s.lid && s.base; }, null, { timeout: 15000 });
ok('5_open_restores_both', same(await regionsNow(p2), await regionsNow(p)));
const info2 = await p2.textContent('#dielineInfo'); ok('5_open_info_both', /뚜껑: .*하단 몸통: /.test(info2), info2);

// 6) 한쪽만 적용한 프로젝트, 기존 단일 dieline 파일(합성), 미래 버전
const p3 = await newPage(); await upload(p3, img, 'one.png'); await apply(p3);
const [pj3] = await Promise.all([p3.waitForEvent('download'), p3.click('#btnProjSave')]);
const one = path.join(OUT, 'lid_only.sabari'); await pj3.saveAs(one);
const p4 = await newPage(); await p4.setInputFiles('#fileProj', one); await p4.waitForFunction(() => window.__sabari.getDielines().lid, null, { timeout: 15000 });
ok('6_lid_only_roundtrip', await p4.evaluate(() => { const s = window.__sabari.getDielines(); return !!s.lid && !s.base; }) && /하단 몸통: 없음/.test(await p4.textContent('#dielineInfo')));
const z1 = await JSZip.loadAsync(fs.readFileSync(proj)); const j1 = JSON.parse(await z1.file('project.json').async('string'));
delete j1.dielines; j1.schemaVersion = 9; j1.dieline.kind = 'base'; z1.file('project.json', JSON.stringify(j1));
const legacy = path.join(OUT, 'legacy_v9_base.sabari'); fs.writeFileSync(legacy, await z1.generateAsync({ type: 'nodebuffer' }));
const p5 = await newPage(); await p5.setInputFiles('#fileProj', legacy); await p5.waitForFunction(() => window.__sabari.getDielines().base, null, { timeout: 15000 });
ok('6_legacy_single_goes_to_its_kind', await p5.evaluate(() => { const s = window.__sabari.getDielines(); return !!s.base && !s.lid; }));
j1.schemaVersion = 99; z1.file('project.json', JSON.stringify(j1)); const fut = path.join(OUT, 'future.sabari'); fs.writeFileSync(fut, await z1.generateAsync({ type: 'nodebuffer' }));
const p6 = await newPage(); await p6.setInputFiles('#fileProj', fut); await p6.waitForTimeout(1200);
ok('6_future_rejected', await p6.evaluate(() => Object.keys(window.__sabari.getDielines()).length === 0)); // 빈 객체면 거부(열리지 않음)

ok('no_page_errors', [p, p2, p3, p4, p5, p6].every((x) => x.errors.length === 0), [p, p2, p3, p4, p5, p6].map((x) => x.errors));
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 2));
console.log(JSON.stringify(checks, null, 1));
await b.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
