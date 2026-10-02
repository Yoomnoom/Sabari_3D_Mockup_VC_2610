// "박스 치수" 패널. 입력 기준(완성 외경 / 싸바리지)을 고르고 숫자·슬라이더로 치수를 바꾼다.
// 상태(params)는 main.ts 가 갖고, 이 모듈은 입력을 BoxParams 후보로 바꿔 검증한 뒤 ctx.apply 로 넘긴다.
import { BoxParams, PARAM_LABELS, WrapInput, derive, paramsFromWrap, validateParams, wrapFromParams } from './params';

export interface DimsCtx {
  get(): BoxParams;
  /** 검증을 통과한 후보를 적용한다(이력 기록 포함). */
  apply(p: BoxParams): void;
  restoreDefault(): void;
  restoreBaseline(): void;
}

type Field = { key: string; label: string; min: number; max: number; step: number };

const OUTER: Field[] = [
  { key: 'baseW', label: '몸통 가로 (mm)', min: 40, max: 400, step: 0.1 },
  { key: 'baseD', label: '몸통 세로 (mm)', min: 40, max: 300, step: 0.1 },
  { key: 'baseH', label: '몸통 높이 (mm)', min: 10, max: 200, step: 0.1 },
  { key: 'lidH', label: '뚜껑 높이 (mm)', min: 10, max: 150, step: 0.1 },
  { key: 'board', label: '합지 두께 (mm)', min: 0.5, max: 6, step: 0.1 },
  { key: 'lidClearance', label: '뚜껑 여유, 편측 (mm)', min: 0, max: 3, step: 0.1 },
];
const WRAP: Field[] = [
  { key: 'lidWrapW', label: '뚜껑 싸바리지 긴 변 (mm)', min: 60, max: 450, step: 0.1 },
  { key: 'lidWrapD', label: '뚜껑 싸바리지 짧은 변 (mm)', min: 60, max: 350, step: 0.1 },
  { key: 'lidWingDepth', label: '뚜껑 날개 깊이 (mm)', min: 10, max: 150, step: 0.1 },
  { key: 'baseWingDepth', label: '몸통 날개 깊이 (mm)', min: 10, max: 200, step: 0.1 },
  { key: 'board', label: '합지 두께 (mm)', min: 0.5, max: 6, step: 0.1 },
  { key: 'lidClearance', label: '뚜껑 여유, 편측 (mm)', min: 0, max: 3, step: 0.1 },
];
const ASSUME: Field[] = [
  { key: 'wrapMargin', label: '싸바리지 여유 (mm)', min: 0, max: 10, step: 0.1 },
  { key: 'tuck', label: '접어 넣는 폭 (mm)', min: 0, max: 40, step: 0.1 },
  { key: 'bleed', label: '재단 여분 (mm)', min: 0, max: 10, step: 0.1 },
];

type Mode = 'outer' | 'wrap';
const NUM = (el: HTMLInputElement) => (el.value.trim() === '' ? NaN : Number(el.value));
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

export function initDimsUi(ctx: DimsCtx) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  let mode: Mode = 'outer';
  const inputs = new Map<string, { range: HTMLInputElement; num: HTMLInputElement; row: HTMLElement; mode: Mode | 'assume' }>();

  const addRows = (host: HTMLElement, fields: Field[], m: Mode | 'assume') => {
    for (const f of fields) {
      const label = document.createElement('label');
      label.className = 'slider';
      label.dataset.dim = f.key;
      label.append(f.label + ' ');
      const range = Object.assign(document.createElement('input'), { type: 'range', min: String(f.min), max: String(f.max), step: String(f.step) });
      const num = Object.assign(document.createElement('input'), { type: 'number', step: String(f.step) });
      num.id = `dim_${m}_${f.key}`;
      num.setAttribute('aria-label', f.label);
      label.append(range, num);
      host.appendChild(label);
      inputs.set(`${m}:${f.key}`, { range, num, row: label, mode: m });
      const onInput = (src: HTMLInputElement) => () => { if (src === range) num.value = range.value; else range.value = num.value; commit(); };
      range.oninput = onInput(range);
      num.oninput = onInput(num);
    }
  };
  addRows($('dimsOuterRows'), OUTER, 'outer');
  addRows($('dimsWrapRows'), WRAP, 'wrap');
  addRows($('dimsAssumeRows'), ASSUME, 'assume');

  const showErrors = (errs: string[]) => {
    const box = $('dimsError');
    box.hidden = errs.length === 0;
    box.textContent = errs.join(' ');
    document.querySelectorAll('#dDims .slider input[type=number]').forEach((e) => e.setAttribute('aria-invalid', String(errs.length > 0 && (e as HTMLInputElement).matches(':focus'))));
  };

  /** 현재 모드의 입력칸을 읽어 BoxParams 후보로 만든다. 숫자가 아닌 칸이 있으면 NaN 이 들어가 검증에서 걸린다. */
  const readCandidate = (): BoxParams => {
    const cur = ctx.get();
    const get = (m: Mode | 'assume', k: string) => NUM(inputs.get(`${m}:${k}`)!.num);
    const assume = { wrapMargin: get('assume', 'wrapMargin'), tuck: get('assume', 'tuck'), bleed: get('assume', 'bleed') };
    if (mode === 'outer') {
      return { ...cur, ...assume, baseW: get('outer', 'baseW'), baseD: get('outer', 'baseD'), baseH: get('outer', 'baseH'), lidH: get('outer', 'lidH'), board: get('outer', 'board'), lidClearance: get('outer', 'lidClearance') };
    }
    const w: WrapInput = {
      lidWrapW: get('wrap', 'lidWrapW'), lidWrapD: get('wrap', 'lidWrapD'), lidWingDepth: get('wrap', 'lidWingDepth'), baseWingDepth: get('wrap', 'baseWingDepth'),
      board: get('wrap', 'board'), lidClearance: get('wrap', 'lidClearance'), ...assume,
    };
    return paramsFromWrap(w);
  };

  function commit() {
    const cand = readCandidate();
    const errs = validateParams(cand);
    showErrors(errs);
    if (errs.length) return; // 불가능한 조합은 적용하지 않는다(입력칸은 그대로 둬서 고칠 수 있게)
    ctx.apply(cand);
  }

  /** params 에서 입력칸 값을 채운다. 사용자가 입력 중인 칸은 건드리지 않는다. */
  function sync() {
    const p = ctx.get();
    const w = wrapFromParams(p);
    const vals: Record<string, number> = {
      baseW: p.baseW, baseD: p.baseD, baseH: p.baseH, lidH: p.lidH, board: p.board, lidClearance: p.lidClearance,
      lidWrapW: w.lidWrapW, lidWrapD: w.lidWrapD, lidWingDepth: w.lidWingDepth, baseWingDepth: w.baseWingDepth,
      wrapMargin: p.wrapMargin, tuck: p.tuck, bleed: p.bleed,
    };
    for (const [id, f] of inputs) {
      const v = vals[id.split(':')[1]];
      if (document.activeElement !== f.num) f.num.value = fmt(v);
      f.range.value = fmt(v);
    }
    const d = derive(p);
    $('dimsDerived').textContent =
      `뚜껑 외경 ${fmt(d.lidW)}×${fmt(d.lidD)}×${fmt(p.lidH)}mm · 닫힌 높이 ${fmt(d.closedH)}mm\n` +
      `싸바리지: 뚜껑 ${fmt(d.lidWrapW)}×${fmt(d.lidWrapD)} · 몸통 ${fmt(d.baseWrapW)}×${fmt(d.baseWrapD)}mm`;
    // 파라미터가 바뀐 뒤에는(되돌리기 등) 이전 오류 문구를 지운다
    if (!validateParams(p).length && document.activeElement && !(document.activeElement as HTMLElement).closest?.('#dimsOuterRows, #dimsWrapRows, #dimsAssumeRows')) showErrors([]);
  }

  const setMode = (m: Mode) => {
    mode = m;
    $('dimsOuterRows').hidden = m !== 'outer';
    $('dimsWrapRows').hidden = m !== 'wrap';
    document.querySelectorAll<HTMLInputElement>('input[name=dimMode]').forEach((r) => (r.checked = r.value === m));
    showErrors([]);
    sync();
  };
  document.querySelectorAll<HTMLInputElement>('input[name=dimMode]').forEach((r) => (r.onchange = () => setMode(r.value as Mode)));
  $('btnDimsDefault').onclick = () => { showErrors([]); ctx.restoreDefault(); };
  $('btnDimsBaseline').onclick = () => { showErrors([]); ctx.restoreBaseline(); };
  setMode('outer');
  void PARAM_LABELS; // 라벨은 오류 문구(params.ts)에서 쓴다
  return { sync, showErrors, getMode: () => mode, setMode };
}
