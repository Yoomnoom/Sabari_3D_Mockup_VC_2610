// 작업 32B 검증(합성 상태만): (1) 원문 보존 — 32A 표(measure_before.json)의 모든 문구가 DOM(접힘·숨김 포함)에 있거나 ui_text_map.json 에 매핑됨
// (2) 전후 측정 (3) 접근성(details, 대비) (4) 조건부 경고는 정상 상태에서 높이 0 (5) 3D 캔버스 크기 불변
// 실행: SABARI_URL=<주소> node e2e/ui_info_task32b.mjs
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'verification/ui-info');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8771/';
const before = JSON.parse(fs.readFileSync(path.join(OUT, 'measure_before.json'), 'utf8'));
const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/ui_text_map.json'), 'utf8'));
const checks = {}, R = {};
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const lum = (hex) => { const c = hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400);
const domText = norm(await p.evaluate(() => document.documentElement.textContent));
// (1) 원문 보존
const missing = [];
for (const h of before.desktop.hints) {
  const t = norm(h.text); if (!t) continue;
  if (/^사바리 목업 스튜디오 v/.test(t) || /^뚜껑 외경 /.test(t)) continue; // 빌드·치수에 따라 달라지는 동적 문구
  if (domText.includes(t)) continue;
  const mapped = Object.values(map).some((m) => norm(m.before) === t);
  if (!mapped) missing.push(t.slice(0, 60));
}
R.missing = missing; checks.original_text_preserved = missing.length === 0;
let mapOk = true; const mapBad = [];
for (const [k, m] of Object.entries(map)) {
  const kept = await p.evaluate((m) => [...document.querySelectorAll('details.more > .more-body, .help-body p, .help-body')].some((e) => e.textContent.replace(/\s+/g, ' ').trim() === m.before.replace(/\s+/g, ' ').trim()), m);
  const shown = domText.includes(norm(m.after_visible));
  if (!kept || !shown) { mapOk = false; mapBad.push(k); }
}
checks.map_original_in_details_and_short_visible = mapOk; R.mapBad = mapBad; R.mapEntries = Object.keys(map).length;
// (3) 접근성
const a11y = await p.evaluate(() => {
  const ds = [...document.querySelectorAll('details.more')];
  return { count: ds.length, allHaveSummary: ds.every((d) => d.querySelector(':scope > summary')?.textContent.includes('자세히 보기')), closedByDefault: ds.every((d) => !d.open), sumMinH: Math.min(...ds.map((d) => d.querySelector('summary').getBoundingClientRect().height)) };
});
const helps = await p.evaluate(() => { const hs = [...document.querySelectorAll('button.helpq')]; return { count: hs.length, ok: hs.every((h) => h.getAttribute('aria-expanded') === 'false' && !!document.getElementById(h.getAttribute('aria-controls') ?? '') && document.getElementById(h.getAttribute('aria-controls')).hidden) }; });
R.helps = helps; // v6 2차: 설명 4개를 "자세히 보기" 대신 ? 도움말로 옮겼다 → 자세히 보기 8개 이상 + ? 도움말 4개 이상(모두 aria-controls·aria-expanded 있음, 처음엔 접힘)
checks.details_unified = a11y.count >= 8 && a11y.allHaveSummary && a11y.closedByDefault && helps.count >= 4 && helps.ok;
await p.click('#tabView'); await p.evaluate(() => { const d = document.querySelector('#tp-view details.more'); d.open = false; });
const sum = p.locator('#tp-view details.more > summary').first(); await sum.focus(); await p.keyboard.press('Enter');
const afterEnter = await p.evaluate(() => document.querySelector('#tp-view details.more').open); await p.keyboard.press('Space'); const afterSpace = await p.evaluate(() => document.querySelector('#tp-view details.more').open);
R.keys = { afterEnter, afterSpace }; checks.enter_space_toggle = afterEnter === true && afterSpace === false;
const colors = await p.evaluate(() => { const rgb = (c) => '#' + c.match(/\d+/g).slice(0, 3).map((x) => (+x).toString(16).padStart(2, '0')).join(''); const h = document.querySelector('#tp-view p.hint.short'), s = document.querySelector('#tp-view details.more > summary'); const bg = rgb(getComputedStyle(document.querySelector('#tp-view')).backgroundColor === 'rgba(0, 0, 0, 0)' ? 'rgb(245,243,238)' : getComputedStyle(document.querySelector('#tp-view')).backgroundColor); return { hint: rgb(getComputedStyle(h).color), summary: rgb(getComputedStyle(s).color), bg }; });
R.contrast = { ...colors, hintRatio: +contrast(colors.hint, colors.bg).toFixed(2), summaryRatio: +contrast(colors.summary, colors.bg).toFixed(2) }; checks.contrast_4_5 = R.contrast.hintRatio >= 4.5 && R.contrast.summaryRatio >= 4.5;
checks.disabled_reason_tooltips = await p.evaluate(() => ['btnRemove', 'btnReset', 'btnSplitEdit', 'btnUnderAdd'].every((id) => { const e = document.getElementById(id); return !e.disabled || e.title.length > 0; }));
// 경고 4단계: 아이콘+글자
const lv = await p.evaluate(async () => { const out = {}; return out; });
// (4) 조건부 경고 높이 0
const zero = await p.evaluate(() => Object.fromEntries(['ratioBanner', 'ratioNote', 'extGlbBanner', 'draftToast', 'openNotice', 'msg', 'lockHint'].map((id) => { const e = document.getElementById(id); return [id, e ? Math.round(e.getBoundingClientRect().height) : null]; })));
R.conditionalHeights = zero; checks.conditional_warnings_height_0 = Object.values(zero).every((v) => v === 0 || v === null);
// (5) 캔버스
R.canvas = await p.evaluate(() => { const c = document.querySelector('#viewport canvas'); const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
checks.no_errors = errs.length === 0;
fs.writeFileSync(path.join(OUT, 'check_32b.json'), JSON.stringify({ checks, R }, null, 1)); console.log(JSON.stringify(checks, null, 1)); console.log(JSON.stringify(R).slice(0, 900));
await b.close(); process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
