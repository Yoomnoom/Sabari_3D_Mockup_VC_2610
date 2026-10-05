// 작업 12 호환 보조: 새 UI는 컨트롤이 작업 탭(디자인/박스/보기/내보내기)·상단 메뉴(열기·더보기) 안에 있어, 기존 e2e가 다른 탭의 컨트롤을 직접 누르면 보이지 않아 실패한다.
// 이 모듈은 `node --import <이 파일> 스크립트.mjs` 로 미리 불러와, 대상 요소가 숨겨진 탭 패널·팝오버 안에 있으면 그 탭(또는 메뉴)을 실제 UI 클릭으로 먼저 연다.
// 앱 동작을 바꾸지 않고 테스트의 "사용자라면 먼저 탭을 눌렀을" 단계만 대신한다. 읽기 전용 호출(isVisible, textContent 등)은 건드리지 않는다.
import { chromium } from '../frontend/node_modules/playwright/index.mjs';

const ACTIONS = ['scrollIntoViewIfNeeded', 'blur', 'type', 'pressSequentially', 'clear', 'click', 'dblclick', 'fill', 'check', 'uncheck', 'setChecked', 'selectOption', 'setInputFiles', 'hover', 'press', 'focus', 'dispatchEvent', 'tap'];
const TAB_BTN = { 'tp-design': 'tabDesign', 'tp-box': 'tabBox', 'tp-view': 'tabView', 'tp-export': 'tabExport' };
const patchedPages = new WeakSet(), patchedLocators = new WeakSet();

async function ensure(page, selector) {
  if (typeof selector !== 'string') return;
  const first = selector.split(' >> ')[0];
  try {
    await page.evaluate(({ sel, TAB_BTN }) => {
      let el; try { el = document.querySelector(sel); } catch { return; }
      if (!el) return;
      const pop = el.closest('.popover');
      if (pop && pop.hidden) document.getElementById(pop.id === 'openMenu' ? 'btnTopOpen' : 'btnMore')?.click();
      const tp = el.closest('.tabpanel');
      if (tp && tp.hidden) document.getElementById(TAB_BTN[tp.id])?.click();
      if (document.body.classList.contains('panel-collapsed') && tp) document.getElementById('panelExpand')?.click();
    }, { sel: first, TAB_BTN });
  } catch { /* 페이지가 없거나 이동 중이면 건너뜀 */ }
}

function patch(page) {
  addBgPoint(page);
  if (process.env.NO_TAB_SHIM) return;
  patchMouse(page);
  const pp = Object.getPrototypeOf(page);
  if (!patchedPages.has(pp)) {
    patchedPages.add(pp);
    for (const m of ACTIONS) {
      const orig = pp[m]; if (typeof orig !== 'function') continue;
      pp[m] = async function (selector, ...rest) { await ensure(this, selector); return orig.call(this, selector, ...rest); };
    }
  }
  const lp = Object.getPrototypeOf(page.locator('body'));
  if (!patchedLocators.has(lp)) {
    patchedLocators.add(lp);
    for (const m of ACTIONS) {
      const orig = lp[m]; if (typeof orig !== 'function') continue;
      lp[m] = async function (...rest) { await ensure(this.page(), this._selector); return orig.apply(this, rest); };
    }
  }
}

// 3D 화면 클릭: 면 클릭 선택은 디자인 탭에서만 동작하므로(축 잠금 중에는 어느 탭이든 축을 정함) 사용자라면 디자인 탭을 먼저 열었을 것이다
function patchMouse(page) {
  const mp = Object.getPrototypeOf(page.mouse);
  if (patchedPages.has(mp)) return; patchedPages.add(mp);
  for (const m of ['click', 'down']) {
    const orig = mp[m];
    mp[m] = async function (...a) {
      try { await page.evaluate(() => { const lock = document.getElementById('lockToggle')?.getAttribute('aria-pressed') === 'true'; const ext = !document.getElementById('extGlbBanner')?.hidden; if (!lock && !ext) document.getElementById('tabDesign')?.click(); }); } catch { /* 무시 */ }
      return orig.apply(this, a);
    };
  }
}
// 기존 e2e는 1360×900 화면의 3D 화면 오른쪽 아래(1330, 780 등)를 "배경 클릭"으로 썼다. 새 레이아웃에서는 그 자리가 오른쪽 패널이라 3D 화면 오른쪽 아래의 빈 곳으로 바꿔 준다.
function addBgPoint(page) {
  const pp = Object.getPrototypeOf(page);
  if (pp.bgPoint) return;
  pp.bgPoint = async function () { const r = await this.evaluate(() => { const b = document.querySelector('#viewport canvas').getBoundingClientRect(); return [b.right - 24, b.bottom - 24]; }); return r; };
}
// 레거시 e2e 호환(작업 17): 저장 이름 대화상자는 건너뛰고(저장 파일 내용은 같다), 안내·오류·"저장하지 않은 변경"·"임시저장 불러오기" 확인은 자동으로 확인한다.
// 하단 몸통 끄기·임시저장 삭제 확인은 각 테스트가 직접 누른다(취소 경로를 검증하기 때문).
const INIT = () => {
  try { localStorage.setItem('sabari.askSaveName', '0'); } catch { /* 무시 */ }
  const AUTO = new Set(['confirm-unsaved', 'confirm-draft-load', 'error', 'info']);
  addEventListener('DOMContentLoaded', () => {
    const dlg = document.getElementById('msgDlg'); if (!dlg) return;
    new MutationObserver(() => { if (dlg.open && AUTO.has(dlg.dataset.kind)) setTimeout(() => document.getElementById('msgDlgOk')?.click(), 30); }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  });
};
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...a) => {
  const browser = await launch(...a);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...c) => {
    const ctx = await newContext(...c);
    if (!process.env.NO_TAB_SHIM) await ctx.addInitScript(INIT);
    const newPage = ctx.newPage.bind(ctx);
    ctx.newPage = async (...x) => { const pg = await newPage(...x); patch(pg); return pg; };
    ctx.on('page', (pg) => patch(pg));
    return ctx;
  };
  const np = browser.newPage.bind(browser);
  browser.newPage = async (...x) => { const pg = await np(...x); if (!process.env.NO_TAB_SHIM) await pg.context().addInitScript(INIT); patch(pg); return pg; };
  return browser;
};
