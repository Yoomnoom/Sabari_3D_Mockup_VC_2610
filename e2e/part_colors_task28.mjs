// 작업 28 검증(합성 이미지만): 뚜껑·몸통 대칭 색 구조(고급 색상). 실행: SABARI_URL=<새 빌드> [BASE_URL=<변경 전 빌드>] STAGE_OUT=verification/colors28 node e2e/part_colors_task28.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), S = path.join(ROOT, 'assets', 'samples');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/colors28'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL, BASE = process.env.BASE_URL;
const checks = {}, R = {};
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const open = async (url) => {
  const p = await (await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true })).newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(url); await p.waitForFunction(() => window.__sabari);
  await p.evaluate((id) => window.__sabari.setCurrent(id), 'lid_top'); await p.setInputFiles('#filePick', path.join(S, 'sample_lid_top.png')); await p.waitForFunction(() => window.__sabari.faces.lid_top.img);
  return p;
};
const dl = async (p, sel, name) => { const w = p.waitForEvent('download', { timeout: 30000 }); await p.click(sel); const d = await w; const f = path.join(OUT, name); await d.saveAs(f); return f; };
// GLB 재질 색: 메시 이름 → baseColorFactor, 그리고 노드·메시·재질 개수
const glbColors = (file) => {
  const buf = fs.readFileSync(file); const jlen = buf.readUInt32LE(12); const j = JSON.parse(buf.slice(20, 20 + jlen).toString('utf8'));
  const out = {}; for (const n of j.nodes ?? []) { if (n.mesh === undefined) continue; const prim = j.meshes[n.mesh].primitives[0]; const mat = j.materials?.[prim.material]; out[n.name] = mat?.pbrMetallicRoughness?.baseColorFactor?.map((x) => +x.toFixed(4)) ?? null; } // 이름은 노드에 있다
  return { colors: out, counts: [j.nodes?.length, j.meshes?.length, j.materials?.length] };
};
const setColor = (p, id, v) => p.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
const exportGlb = async (p, name) => { await p.click('#tabExport').catch(() => {}); return glbColors(await dl(p, '#btnGlb', name)); };
const palettes = [['#ffffff', '#ffffff', '#ffffff'], ['#ff0000', '#00aa00', '#0000ff'], ['#123456', '#abcdef', '#fedcba']];
const p = await open(URL); const q = BASE ? await open(BASE) : null;
// 1) 같게(기본): 변경 전 빌드와 GLB 재질 색 동일
R.same = [];
for (const [i, [f, l, bs]] of palettes.entries()) {
  for (const page of [p, q].filter(Boolean)) { await p === page; await page.click('#tabDesign').catch(() => {}); await page.evaluate(() => { document.getElementById('dColor').open = true; }); await setColor(page, 'colFace', f); await setColor(page, 'colLid', l); await setColor(page, 'colBase', bs); }
  const a = await exportGlb(p, `new_${i}.glb`); if (q) { const c = await exportGlb(q, `base_${i}.glb`); R.same.push(JSON.stringify(a.colors) === JSON.stringify(c.colors) && JSON.stringify(a.counts) === JSON.stringify(c.counts)); } else R.same.push(null);
}
checks.same_as_before_all_palettes = q ? R.same.every(Boolean) : 'skipped(BASE_URL 없음)';
// 2) 항목별로 체크를 끄고 색을 주면 해당 부품만 변한다
await setColor(p, 'colFace', '#ffffff'); await setColor(p, 'colLid', '#c8c8c8'); await setColor(p, 'colBase', '#d8d8d8');
const ref = await exportGlb(p, 'ref.glb');
const MESH = { LidRim: 'lid_rim', LidInner: 'lid_inner', BaseFace: ['base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'], BaseRim: 'base_rim', BaseInner: 'base_inner' };
R.item = {};
await p.evaluate(() => { document.getElementById('dColorAdv').open = true; });
for (const [id, mesh] of Object.entries(MESH)) {
  await p.uncheck('#advChk' + id); await setColor(p, 'advCol' + id, '#ff8800');
  const g = await exportGlb(p, `item_${id}.glb`);
  const names = Object.keys(g.colors); const changed = names.filter((n) => JSON.stringify(g.colors[n]) !== JSON.stringify(ref.colors[n]));
  const want = Array.isArray(mesh) ? mesh : [mesh];
  R.item[id] = { changed, want, colorsOk: changed.length > 0 && changed.every((n) => want.includes(n)) && JSON.stringify(g.counts) === JSON.stringify(ref.counts) };
  await p.check('#advChk' + id);
}
checks.each_item_changes_only_its_part = Object.values(R.item).every((x) => x.colorsOk);
// 3) .sabari 저장→열기 복원, 필드 없는 기존 파일, 미래 버전, 색상 기본값
await p.uncheck('#advChkLidInner'); await setColor(p, 'advColLidInner', '#112233'); await p.uncheck('#advChkBaseRim'); await setColor(p, 'advColBaseRim', '#445566');
await p.click('#tabExport').catch(() => {}); const proj = await dl(p, '#btnProjSave', 'p28.sabari');
const pj = JSON.parse(await (await JSZip.loadAsync(fs.readFileSync(proj))).file('project.json').async('string'));
R.saved = { v: pj.schemaVersion, colors: pj.colors };
checks.saved_v8_and_fields = pj.schemaVersion === 12 && pj.colors.lidInner === '#112233' && pj.colors.baseRim === '#445566' && !('lidRim' in pj.colors) && !('baseFace' in pj.colors);
await p.click('#btnColorReset');
checks.reset_all_same = await p.evaluate(() => ['LidRim', 'LidInner', 'BaseFace', 'BaseRim', 'BaseInner'].every((k) => document.getElementById('advChk' + k).checked));
await p.setInputFiles('#fileProj', proj); await p.waitForTimeout(900);
checks.reopen_restores = await p.evaluate(() => !document.getElementById('advChkLidInner').checked && document.getElementById('advColLidInner').value === '#112233' && !document.getElementById('advChkBaseRim').checked && document.getElementById('advChkLidRim').checked);
const zip = await JSZip.loadAsync(fs.readFileSync(proj)); const old = JSON.parse(await zip.file('project.json').async('string')); old.schemaVersion = 7; for (const k of ['lidRim', 'lidInner', 'baseFace', 'baseRim', 'baseInner']) delete old.colors[k]; zip.file('project.json', JSON.stringify(old));
const fOld = path.join(OUT, 'old_v7.sabari'); fs.writeFileSync(fOld, await zip.generateAsync({ type: 'nodebuffer' }));
await p.setInputFiles('#fileProj', fOld); await p.waitForTimeout(900);
checks.old_file_opens_same = await p.evaluate(() => ['LidRim', 'LidInner', 'BaseFace', 'BaseRim', 'BaseInner'].every((k) => document.getElementById('advChk' + k).checked));
old.schemaVersion = 99; zip.file('project.json', JSON.stringify(old)); const fFut = path.join(OUT, 'future.sabari'); fs.writeFileSync(fFut, await zip.generateAsync({ type: 'nodebuffer' }));
await p.setInputFiles('#fileProj', fFut); await p.waitForTimeout(700);
checks.future_rejected = await p.evaluate(() => /열 수 없습니다/.test(document.body.innerText));
checks.no_page_errors = p.errors.length === 0;
R.checks = checks;
fs.writeFileSync(path.join(OUT, 'part_colors_task28.json'), JSON.stringify(R, null, 1));
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 1)); console.log(JSON.stringify(checks));
await b.close();
process.exit(Object.values(checks).every((v) => v === true || (typeof v === 'string' && v.startsWith('skipped'))) ? 0 : 1);
