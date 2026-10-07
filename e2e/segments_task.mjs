// 선택 버튼(세그먼트) 배치 검사(합성 이미지만): 디자인·박스·보기·내보내기 탭의 모든 선택 버튼이
// (1) 가로 한 줄이고 (2) 패널 안에 있으며 (3) 패널(부모) 폭을 채우는지 본다. 항목 수가 많은 묶음(템플릿 카드 등)은 제외.
// 배경: details 에 grid 를 걸면 최신 Chromium 에서 안쪽 항목이 세로로 쌓이던 문제(맞춤 방식).
// 실행: SABARI_URL=http://127.0.0.1:8766/ STAGE_OUT=verification/segments node e2e/segments_task.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.STAGE_OUT ?? 'verification/segments'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8766/';
const checks = {}, R = {};
const ok = (k, v, d) => { checks[k] = !!v; if (d !== undefined) R[k] = d; };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const SEL = '.seg, .seg2, .lidseg, .segrow, .bgkinds, [role=radiogroup]:not(#tplList), div[role=group][aria-label]:not(#advRows)'; // 고급 색상(advRows)은 항목 줄 목록이라 선택 버튼이 아니다
const audit = (p) => p.evaluate((SEL) => {
  const panel = document.getElementById('panelScroll').getBoundingClientRect();
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest('[hidden]') || el.closest('dialog:not([open])') || !el.offsetParent) continue;
    if (el.closest('#panelScroll') === null) continue; // 패널 안의 것만(보기 바 등은 따로)
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const kids = [...el.children].filter((c) => !c.hidden && c.offsetParent !== null && !/^(SELECT|B|INPUT|P|SPAN)$/.test(c.tagName) || c.tagName === 'LABEL' || c.tagName === 'BUTTON').filter((c) => !c.hidden && c.offsetParent !== null);
    if (kids.length < 2) continue;
    const tops = kids.map((c) => Math.round(c.getBoundingClientRect().top));
    const oneRow = Math.max(...tops) - Math.min(...tops) <= 3;
    const par = el.parentElement.getBoundingClientRect(), cs = getComputedStyle(el.parentElement);
    const inner = par.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    out.push({ id: el.id || el.getAttribute('aria-label') || el.className, n: kids.length, oneRow, inPanel: r.left >= panel.left - 1 && r.right <= panel.right + 1, fill: Math.round((r.width / inner) * 100) / 100, w: Math.round(r.width) });
  }
  return out;
}, SEL);
const png = (p) => p.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 200; const g = cv.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 300, 200); const bl = await new Promise((r) => cv.toBlob(r)); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (const c of u) s += String.fromCharCode(c); return btoa(s); });
for (const [w, h] of [[1366, 768], [390, 844]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage(); p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
  await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(600);
  await p.setInputFiles('#filePick', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(await png(p), 'base64') }); await p.waitForTimeout(500);
  await p.setInputFiles('#fileUnder', { name: 'u.png', mimeType: 'image/png', buffer: Buffer.from(await png(p), 'base64') }); await p.waitForTimeout(600); // 바탕 레이어 → 맞춤 방식 3번째(반복) 표시
  const all = {};
  for (const tab of ['tabDesign', 'tabBox', 'tabView', 'tabExport']) {
    await p.click('#' + tab); await p.waitForTimeout(250);
    await p.evaluate(() => { document.querySelectorAll('#panelScroll details').forEach((d) => { d.open = true; }); const sc = document.getElementById('shadowCtl'); if (sc) sc.hidden = false; const bi = document.getElementById('bgImageCtl'); if (bi) bi.hidden = false; });
    await p.waitForTimeout(250);
    all[tab] = await audit(p);
  }
  R[`${w}x${h}`] = all;
  const flat = Object.entries(all).flatMap(([tab, L]) => L.map((x) => ({ tab, ...x })));
  ok(`${w}_found_segments`, flat.length >= 6, flat.length);
  ok(`${w}_fit_segment_found`, flat.some((x) => x.id === '맞춤 방식' && x.n === 3), flat.find((x) => x.id === '맞춤 방식'));
  ok(`${w}_all_one_row`, flat.every((x) => x.oneRow), flat.filter((x) => !x.oneRow));
  ok(`${w}_all_inside_panel`, flat.every((x) => x.inPanel), flat.filter((x) => !x.inPanel));
  ok(`${w}_fill_panel_width`, flat.filter((x) => x.n <= 5).every((x) => x.fill >= 0.9), flat.filter((x) => x.n <= 5 && x.fill < 0.9));
  ok(`${w}_no_page_errors`, p.errors.length === 0, p.errors);
  await c.close();
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ checks, R }, null, 1)); console.log(JSON.stringify(checks, null, 1)); await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
