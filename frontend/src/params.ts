// 박스 치수 파라미터 하나에서 메시·UV·면 크기·텍스처 크기·칼선 레이아웃을 모두 만든다. DOM·three 에 의존하지 않는다.
//
// 용어: 가로(X) = 박스의 긴 쪽, 세로(Z) = 짧은 쪽, 높이(Y). 단위 mm.
// 기본값은 160×110×43 몸통 / 뚜껑 165×115×38 / 합지 2mm / 뚜껑 여유 0.5mm.
// wrapMargin·tuck·bleed 는 inputs/ 의 .ai 칼선 샘플에서 읽은 **가정값이며 제조 규격이 아니다**.

export interface BoxParams {
  /** 몸통 외경 가로(X) */
  baseW: number;
  /** 몸통 외경 세로(Z) */
  baseD: number;
  /** 몸통 높이(Y) */
  baseH: number;
  /** 뚜껑 높이(Y) = 뚜껑 날개 깊이 */
  lidH: number;
  /** 합지 두께 */
  board: number;
  /** 뚜껑 여유(편측): 뚜껑 안쪽이 몸통 바깥보다 이만큼 크다 */
  lidClearance: number;
  /** 싸바리지 여유: 싸바리지 패널 = 완성 외경 + wrapMargin (가정값, 샘플 117.4−115 = 2.4) */
  wrapMargin: number;
  /** 날개 안쪽 접어 넣는 폭 (가정값, 샘플 19.3) */
  tuck: number;
  /** 재단 여분(블리드). 재단(칼선) 크기와 분리해서 저장한다 (가정값 3) */
  bleed: number;
}

export const DEFAULT_PARAMS: Readonly<BoxParams> = Object.freeze({
  baseW: 160, baseD: 110, baseH: 43,
  lidH: 38, board: 2, lidClearance: 0.5,
  wrapMargin: 2.4, tuck: 19.3, bleed: 3,
});

export const PARAM_KEYS = Object.keys(DEFAULT_PARAMS) as (keyof BoxParams)[];

export const PARAM_LABELS: Record<keyof BoxParams, string> = {
  baseW: '몸통 가로', baseD: '몸통 세로', baseH: '몸통 높이',
  lidH: '뚜껑 높이', board: '합지 두께', lidClearance: '뚜껑 여유(편측)',
  wrapMargin: '싸바리지 여유', tuck: '접어 넣는 폭', bleed: '재단 여분',
};

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export const cloneParams = (p: BoxParams): BoxParams => ({ ...p });
export const paramsEqual = (a: BoxParams, b: BoxParams) => PARAM_KEYS.every((k) => Math.abs(a[k] - b[k]) < 1e-9);

/** 저장 파일 등에서 읽은 임의 값을 파라미터로. 없거나 잘못된 값은 기본값. */
export function paramsFromUnknown(v: unknown): BoxParams {
  const o = (v ?? {}) as Record<string, unknown>;
  const out = cloneParams(DEFAULT_PARAMS);
  for (const k of PARAM_KEYS) if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = o[k] as number;
  return out;
}

export interface Derived {
  lidW: number; lidD: number; // 뚜껑 외경
  lidInnerW: number; lidInnerD: number;
  closedH: number; // 닫힌 전체 높이
  lidWrapW: number; lidWrapD: number; // 뚜껑 싸바리지 패널 (긴 변·짧은 변)
  baseWrapW: number; baseWrapD: number; // 몸통 싸바리지 패널
}

export function derive(p: BoxParams): Derived {
  const lidW = r6(p.baseW + 2 * (p.board + p.lidClearance));
  const lidD = r6(p.baseD + 2 * (p.board + p.lidClearance));
  return {
    lidW, lidD,
    lidInnerW: r6(lidW - 2 * p.board), lidInnerD: r6(lidD - 2 * p.board),
    closedH: r6(p.baseH + p.board),
    lidWrapW: r6(lidW + p.wrapMargin), lidWrapD: r6(lidD + p.wrapMargin),
    baseWrapW: r6(p.baseW + p.wrapMargin), baseWrapD: r6(p.baseD + p.wrapMargin),
  };
}

export type FaceKey =
  | 'lid_top' | 'lid_front' | 'lid_back' | 'lid_left' | 'lid_right'
  | 'base_front' | 'base_back' | 'base_left' | 'base_right' | 'base_bottom';

/** 면별 크기(mm) [가로, 세로]. 면 이미지의 가로:세로 비율 기준이다. */
export function faceSizes(p: BoxParams): Record<FaceKey, [number, number]> {
  const d = derive(p);
  return {
    lid_top: [d.lidW, d.lidD],
    lid_front: [d.lidW, p.lidH], lid_back: [d.lidW, p.lidH],
    lid_left: [d.lidD, p.lidH], lid_right: [d.lidD, p.lidH],
    base_front: [p.baseW, p.baseH], base_back: [p.baseW, p.baseH],
    base_left: [p.baseD, p.baseH], base_right: [p.baseD, p.baseH],
    base_bottom: [p.baseW, p.baseD],
  };
}

// ---------------------------------------------------------------- 검증
const RANGE: Record<keyof BoxParams, [number, number]> = {
  baseW: [20, 1000], baseD: [20, 1000], baseH: [5, 500],
  lidH: [5, 500], board: [0.2, 20], lidClearance: [0, 20],
  wrapMargin: [0, 50], tuck: [0, 100], bleed: [0, 50],
};

/** 불가능한 조합이면 한국어 오류 문구 목록, 가능하면 빈 배열. */
export function validateParams(p: BoxParams): string[] {
  const errs: string[] = [];
  for (const k of PARAM_KEYS) {
    const v = p[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) { errs.push(`${PARAM_LABELS[k]}은(는) 숫자여야 합니다.`); continue; }
    if (v < 0) { errs.push(`${PARAM_LABELS[k]}은(는) 음수일 수 없습니다.`); continue; }
    const [lo, hi] = RANGE[k];
    if (v < lo) errs.push(`${PARAM_LABELS[k]}은(는) ${lo}mm 이상이어야 합니다.`);
    if (v > hi) errs.push(`${PARAM_LABELS[k]}은(는) ${hi}mm 이하여야 합니다.`);
  }
  if (errs.length) return errs;
  if (p.lidClearance < 0) errs.push('뚜껑 여유는 0 이상이어야 합니다. 뚜껑이 몸통보다 작아집니다.');
  if (p.board * 2 >= Math.min(p.baseW, p.baseD)) errs.push('합지 두께가 몸통 가로·세로의 절반 이상입니다. 두께를 줄이거나 치수를 키워 주세요.');
  if (p.board >= p.baseH) errs.push('합지 두께가 몸통 높이 이상입니다.');
  if (p.board >= p.lidH) errs.push('합지 두께가 뚜껑 높이 이상입니다.');
  const d = derive(p);
  if (d.lidInnerW < p.baseW || d.lidInnerD < p.baseD) errs.push('뚜껑 안쪽이 몸통보다 작습니다. 뚜껑 여유를 확인해 주세요.');
  return errs;
}

// ---------------------------------------------------------------- 입력 기준 변환
/** 싸바리지(전개) 기준 입력. 뚜껑 패널 긴 변·짧은 변과 날개 깊이로 완성 외경을 계산한다. */
export interface WrapInput {
  lidWrapW: number; lidWrapD: number; // 뚜껑 싸바리지 패널 (긴 변, 짧은 변)
  lidWingDepth: number; // 뚜껑 날개 깊이 = 뚜껑 높이
  baseWingDepth: number; // 몸통 날개 깊이 = 몸통 높이
  board: number; lidClearance: number; wrapMargin: number; tuck: number; bleed: number;
}

export function paramsFromWrap(w: WrapInput): BoxParams {
  const lidW = w.lidWrapW - w.wrapMargin;
  const lidD = w.lidWrapD - w.wrapMargin;
  return {
    baseW: r6(lidW - 2 * (w.board + w.lidClearance)),
    baseD: r6(lidD - 2 * (w.board + w.lidClearance)),
    baseH: w.baseWingDepth, lidH: w.lidWingDepth,
    board: w.board, lidClearance: w.lidClearance, wrapMargin: w.wrapMargin, tuck: w.tuck, bleed: w.bleed,
  };
}

export function wrapFromParams(p: BoxParams): WrapInput {
  const d = derive(p);
  return {
    lidWrapW: d.lidWrapW, lidWrapD: d.lidWrapD, lidWingDepth: p.lidH, baseWingDepth: p.baseH,
    board: p.board, lidClearance: p.lidClearance, wrapMargin: p.wrapMargin, tuck: p.tuck, bleed: p.bleed,
  };
}

// ---------------------------------------------------------------- 비율 변경 판단
/** 면 가로:세로 비율이 이만큼(비율) 이상 달라지면 알린다. 한 곳에서 조정한다. */
export const RATIO_ALERT_THRESHOLD = 0.05;

export const ratioOf = (size: [number, number]) => size[0] / size[1];

export interface RatioChange { id: FaceKey; from: number; to: number; pct: number }

/**
 * 기준 비율(ref) 대비 현재 비율이 임계값 이상 달라진 면. 이미지가 없는 면은 제외한다.
 * pct 는 (현재/기준 − 1) 이다.
 */
export function ratioChanges(
  ref: Partial<Record<FaceKey, number>>,
  sizes: Record<FaceKey, [number, number]>,
  hasImage: (id: FaceKey) => boolean,
  threshold = RATIO_ALERT_THRESHOLD,
): RatioChange[] {
  const out: RatioChange[] = [];
  for (const id of Object.keys(sizes) as FaceKey[]) {
    const from = ref[id];
    if (from === undefined || !hasImage(id)) continue;
    const to = ratioOf(sizes[id]);
    const pct = to / from - 1;
    if (Math.abs(pct) >= threshold - 1e-12) out.push({ id, from, to, pct });
  }
  return out;
}

/** "1.43:1" 형태 */
export const formatRatio = (r: number) => `${r.toFixed(2)}:1`;
/** "+12%" 형태 (반올림) */
export const formatPct = (pct: number) => `${pct >= 0 ? '+' : '−'}${Math.round(Math.abs(pct) * 100)}%`;
