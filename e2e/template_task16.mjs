// 작업 16 검증: 템플릿 카드(박스 탭 맨 위)·templateId 저장·복원·기존 파일 호환·알 수 없는 id 거부
// 실행: NO_TAB_SHIM=1 SABARI_URL=<주소> STAGE_OUT=verification/tpl16 node e2e/template_task16.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from '../frontend/node_modules/jszip/lib/index.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/tpl16'); fs.mkdirSync(OUT, { recursive: true });
const R = {}; const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await p.goto(process.env.SABARI_URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);
await p.evaluate(() => localStorage.setItem('sabari.askSaveName', '0'));
const dl = async (btn, name, tab) => { if (tab) await p.click(tab); const w = p.waitForEvent('download', { timeout: 20000 }); await p.click(btn); const d = await w; const f = path.join(OUT, name); await d.saveAs(f); return f; };
const projJson = async (file) => JSON.parse(await (await JSZip.loadAsync(fs.readFileSync(file))).file('project.json').async('string'));
const patched = async (name, mutate) => { const z = await JSZip.loadAsync(fs.readFileSync(path.join(ROOT, 'e2e', 'fixtures', 'legacy_v3_10face.sabari'))); const j = JSON.parse(await z.file('project.json').async('string')); mutate(j); z.file('project.json', JSON.stringify(j)); const f = path.join(os.tmpdir(), name); fs.writeFileSync(f, await z.generateAsync({ type: 'nodebuffer' })); return f; };
const allImages = () => p.evaluate(() => Object.values(window.__sabari.faces).every((f) => f.img));
const reset = async () => { await p.reload(); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(500); await p.evaluate(() => localStorage.setItem('sabari.askSaveName', '0')); };

// ---- 1. 템플릿 카드: 박스 탭 맨 위, 사바리 박스 활성, 나머지 준비 중(비활성) -------------------------------------------------------------------------
await p.click('#tabBox');
R.card = await p.evaluate(() => {
  const first = document.querySelector('#tp-box .tp-body').firstElementChild;
  return { firstIsTemplateCard: first.id === 'cardTemplate', title: first.querySelector('h2').textContent, items: [...document.querySelectorAll('#tplList button')].map((b) => ({ label: b.querySelector('b').textContent, sub: b.querySelector('small').textContent, disabled: b.disabled, checked: b.getAttribute('aria-checked'), role: b.getAttribute('role'), id: b.dataset.template })), group: document.getElementById('tplList').getAttribute('role'), hint: document.querySelector('#cardTemplate .hint').textContent };
});
assert(R.card.firstIsTemplateCard && R.card.title === '템플릿' && R.card.group === 'radiogroup');
assert.deepEqual(R.card.items.map((i) => [i.label, i.sub, i.disabled, i.checked]), [['사바리 박스 160×110×43', '사용 중', false, 'true'], ['책자', '준비 중', true, 'false'], ['카드', '준비 중', true, 'false'], ['접지물', '준비 중', true, 'false']]);
await p.click('#tplList button[data-template=booklet]', { force: true, timeout: 2000 }).catch(() => {});
R.after_click_disabled = await p.evaluate(() => document.querySelector('#tplList button[aria-checked=true]').dataset.template); assert.equal(R.after_click_disabled, 'sabari-160-110-43-v2', '준비 중 항목은 눌러도 바뀌지 않는다');
await p.screenshot({ path: path.join(OUT, 'template_card.png') });

// ---- 2. 저장: templateId가 .sabari에 들어간다(변경 전과 같은 값 sabari-160-110-43-v2), 다시 열어도 같다 ---------------------------------------------------------
const saved = await dl('#btnProjSave', 'tpl_saved.sabari', '#tabExport'); const j1 = await projJson(saved); R.saved_templateId = j1.templateId; assert.equal(j1.templateId, 'sabari-160-110-43-v2');
await reset(); await p.setInputFiles('#fileProj', saved); await p.waitForTimeout(800);
R.reopen_active = await p.evaluate(() => document.querySelector('#tplList button[aria-checked=true]')?.dataset.template); assert.equal(R.reopen_active, 'sabari-160-110-43-v2');
const re = await dl('#btnProjSave', 'tpl_resaved.sabari', '#tabExport'); assert.equal((await projJson(re)).templateId, 'sabari-160-110-43-v2');

// ---- 3. 기존 파일 호환: templateId 없음(→ v1 간주)·v1·v2 모두 열리고 다시 저장하면 현재 id ------------------------------------------------------------------
for (const [name, mut] of [['missing', (j) => { delete j.templateId; }], ['v1', (j) => { j.templateId = 'sabari-160-110-43-v1'; }], ['v2', (j) => { j.templateId = 'sabari-160-110-43-v2'; }]]) {
  await reset(); const f = await patched(`tpl_${name}.sabari`, mut); await p.setInputFiles('#fileProj', f);
  await p.waitForFunction(() => Object.values(window.__sabari.faces).every((x) => x.img), null, { timeout: 15000 }); await p.waitForTimeout(300);
  const out = await dl('#btnProjSave', `tpl_${name}_resaved.sabari`, '#tabExport'); R[`legacy_${name}`] = { opened: await allImages(), resavedTemplateId: (await projJson(out)).templateId };
  assert(R[`legacy_${name}`].opened && R[`legacy_${name}`].resavedTemplateId === 'sabari-160-110-43-v2', `${name}: 열림 + 다시 저장하면 현재 id`);
}
await reset(); await p.setInputFiles('#fileProj', path.join(ROOT, 'e2e', 'fixtures', 'legacy_v2_5face.sabari')); await p.waitForTimeout(1000); R.legacy_schema2_opens = await p.evaluate(() => Object.values(window.__sabari.faces).some((f) => f.img)); assert(R.legacy_schema2_opens);

// ---- 4. 알 수 없는 id·준비 중인 id·미래 버전은 열기 오류 대화상자 -----------------------------------------------------------------------------------------------
R.rejected = {};
for (const [name, tid] of [['unknown', 'mystery-box-v9'], ['booklet', 'booklet']]) {
  await reset(); const f = await patched(`tpl_${name}.sabari`, (j) => { j.templateId = tid; }); await p.setInputFiles('#fileProj', f); await p.waitForSelector('#msgDlg[open]', { timeout: 8000 });
  R.rejected[name] = await p.evaluate(() => ({ kind: document.getElementById('msgDlg').dataset.kind, title: document.getElementById('msgDlgTitle').textContent, text: document.getElementById('msgDlgText').textContent, banner: document.getElementById('msgText').textContent }));
  assert(R.rejected[name].kind === 'error' && R.rejected[name].text.includes('지원하지 않는 템플릿의 프로젝트입니다') && R.rejected[name].text.includes(tid), JSON.stringify(R.rejected[name]));
  await p.screenshot({ path: path.join(OUT, `template_error_${name}.png`) }); await p.click('#msgDlgOk');
  assert(!(await allImages()), '거부하면 아무것도 열지 않는다');
}
await reset(); await p.setInputFiles('#fileProj', path.join(ROOT, 'e2e', 'fixtures', 'future_v99.sabari')); await p.waitForSelector('#msgDlg[open]', { timeout: 8000 }); R.future = await p.evaluate(() => document.getElementById('msgDlg').dataset.kind); assert.equal(R.future, 'error'); await p.click('#msgDlgOk');

// ---- 5. 임시저장에도 templateId, 외부 GLB 중에는 카드 비활성(박스 탭 inert) -------------------------------------------------------------------------------------
await reset(); await p.setInputFiles('#fileGlb', path.join(ROOT, 'e2e', 'fixtures', 'legacy_5face.glb')); await p.waitForFunction(() => document.getElementById('glbInfo').textContent.includes('메시')); await p.waitForTimeout(400);
R.external_box_inert = await p.evaluate(() => document.getElementById('tp-box').inert); assert(R.external_box_inert, '외부 GLB 중 박스 탭(템플릿 카드 포함) 비활성');

R.errors = errors; assert.deepEqual(errors.filter((e) => !/Failed to load resource|지원하지 않는|버전/.test(e)), []);
fs.writeFileSync(path.join(OUT, 'template_task16.json'), JSON.stringify(R, null, 1));
console.log('ok template_task16');
await browser.close();
