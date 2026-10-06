// 작업 32A: 설명문·안내·경고 문구 전수 조사(읽기 전용). 실행: SABARI_URL=<서버> node tools/ui_info_inventory.mjs
// 열려 있는 화면(데스크톱 1366×768·모바일 390×844)에서 안내 요소(.hint .info .err p[role] 등)와 버튼 강조·스크롤 높이를 모은다.
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.env.SABARI_URL ?? 'http://127.0.0.1:8790/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const collect = () => {
  const sel = '.hint, .info, .err, [role=status], [role=alert], summary small, .split-help-line, p';
  const rows = [];
  const where = (el) => { const d = el.closest('dialog'); if (d) return '대화상자 #' + d.id; const tp = el.closest('.tabpanel'); if (tp) return '탭 #' + tp.id; if (el.closest('#sidebar,aside')) return '사이드바'; if (el.closest('header,.topbar')) return '상단 바'; return '기타'; };
  for (const el of document.querySelectorAll(sel)) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || el.querySelector('p, .hint')) continue;
    let hid = false; for (let n = el; n; n = n.parentElement) if (n.hidden && !n.classList.contains('tabpanel')) hid = true; // 다른 탭 패널은 숨김으로 보지 않는다(탭을 열면 항상 보이는 문구인지 판단)
    const r = el.getBoundingClientRect(), hiddenAttr = hid, inDetails = el.closest('details:not([open])') && !el.closest('summary');
    rows.push({ id: el.id || '', cls: el.className?.toString?.() ?? '', where: where(el), text, len: [...text].length, visible: !hiddenAttr && !inDetails && !!el.closest('.tabpanel,dialog,aside,#sidebar'), hiddenAttr: hiddenAttr || !!inDetails, lines: Math.max(1, Math.ceil(text.length / 28)) });
  }
  return rows;
};
const await_id = (t) => ({ tabDesign: 'tp-design', tabBox: 'tp-box', tabView: 'tp-view', tabExport: 'tp-export' })[t] ?? t;
const out = {};
for (const [name, vp] of [['desktop', { width: 1366, height: 768 }], ['tablet', { width: 1024, height: 768 }], ['mobile', { width: 390, height: 844 }]]) {
  const p = await (await b.newContext({ viewport: vp })).newPage(); await p.goto(URL); await p.waitForFunction(() => window.__sabari); await p.waitForTimeout(400);
  const tabs = await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].map((t) => t.id).filter(Boolean));
  const res = { tabs: {}, dialogs: {} };
  for (const t of tabs) {
    await p.click('#' + t).catch(() => {}); await p.waitForTimeout(150);
    res.tabs[t] = await p.evaluate(() => {
      const panel = document.querySelector('.tabpanel:not([hidden])'); if (!panel) return null;
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const fills = [...panel.querySelectorAll('button')].filter((x) => vis(x) && /primary/.test(x.className)).map((x) => x.textContent.trim().slice(0, 20));
      const firstScreen = [...panel.querySelectorAll('button, input, select, summary')].filter((x) => { const r = x.getBoundingClientRect(); return vis(x) && r.bottom <= innerHeight && r.top >= 0; }).length;
      return { scrollH: panel.scrollHeight, clientH: panel.clientHeight, primaryButtons: fills, controlsInFirstScreen: firstScreen };
    });
  }
  res.hints = await p.evaluate(`(${collect.toString()})()`);
  for (const d of ['splitDlg', 'importDlg', 'saveDlg', 'msgDlg', 'notifyDlg', 'helpDlg']) {
    res.dialogs[d] = await p.evaluate((id) => { const dl = document.getElementById(id); if (!dl) return null; const was = dl.open; if (!was) dl.show(); const rows = [...dl.querySelectorAll('p, .hint, small, label')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean); if (!was) dl.close(); return rows; }, d).catch(() => null);
  }
  out[name] = res; await p.context().close();
}
fs.mkdirSync(path.join(ROOT, 'verification/ui-info'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'verification/ui-info/' + (process.env.MEASURE_OUT ?? 'measure.json')), JSON.stringify(out, null, 1));
console.log(Object.entries(out).map(([k, v]) => `${k}: hints=${v.hints.length}, visible=${v.hints.filter((h) => h.visible).length}`).join('\n'));
await b.close();
