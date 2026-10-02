// 템플릿의 "칼선 안 면 배치 목록". 박스 치수 파라미터에서 뚜껑 십자형(또는 몸통) 전개도 레이아웃을 만든다.
// 이 목록 하나가 (1) 칼선 SVG 생성 (2) 칼선 이미지 한 장의 면별 자동 분할 (3) 인쇄소 .ai 샘플 대조에 모두 쓰인다.
//
// ※ 디자인 가이드용 레이아웃이며 제조 칼선이 아니다. 접힘·탭·재단 정밀도는 구현하지 않는다.
// ※ 면 위치·회전은 가정이다: 칼선 샘플(.ai)의 방향(긴 변이 세로)을 따르고, 3D 위에서 내려다본 십자 배치를 반시계 90° 돌려 놓았다.
//
// 좌표: 시트(재단선 바깥 외곽선의 바운딩박스) 왼쪽 위가 (0,0), 단위 mm, y 는 아래로 증가.
import { BoxParams, FaceKey, derive } from './params';

export type DieKind = 'lid' | 'base';
export interface Rect { x: number; y: number; w: number; h: number }
export type Pt = [number, number];
export type Side = 'panel' | 'left' | 'right' | 'top' | 'bottom';

export interface DieFace {
  id: FaceKey;
  /** 시트에서 이 면이 놓인 위치 */
  side: Side;
  /** 면 영역(싸바리지 여유·접어 넣는 영역 제외). 크기는 면 크기(mm)를 회전해 놓은 것이다. */
  rect: Rect;
  /** 면 이미지를 시계방향으로 이만큼 돌려 시트에 놓는다 (면 이미지 위쪽 = 상자의 위쪽/앞쪽 기준은 templateMesh.ts) */
  rotationDeg: 0 | 90 | 180 | 270;
  /** 면 이미지(회전 전)의 크기 mm */
  faceW: number; faceH: number;
}

export interface Dieline {
  kind: DieKind;
  /** 재단선 외곽 크기(여분 제외) */
  width: number; height: number;
  /** 날개 깊이(접이선 안쪽) / 접어 넣는 폭 */
  depth: number; tuck: number;
  panel: Rect; // 싸바리지 중앙 패널(여유 포함)
  faces: DieFace[];
  tuckRects: Rect[];
  outline: Pt[]; // 재단선(닫힌 다각형)
  folds: [Pt, Pt][]; // 접는선
  corner: number; // 외곽 모서리 깎임 mm
}

const CORNER = 3;

/** 시트 방향별 면 배치. lid: 위에서 본 십자(위쪽=뒤)를 반시계 90° 돌린 것. base: 아래에서 본 십자(위쪽=앞)를 같은 방식으로. */
const LAYOUT: Record<DieKind, { panel: FaceKey; wings: Record<Exclude<Side, 'panel'>, FaceKey>; rot: Record<Side, 0 | 90 | 180 | 270> }> = {
  lid: {
    panel: 'lid_top',
    // 반시계 90°: 위(뒤)→왼쪽, 아래(앞)→오른쪽, 왼쪽(−X)→아래, 오른쪽(+X)→위
    wings: { left: 'lid_back', right: 'lid_front', bottom: 'lid_left', top: 'lid_right' },
    // 뚜껑 날개는 위쪽 가장자리가 패널에 붙는다
    rot: { panel: 270, left: 90, right: 270, bottom: 0, top: 180 },
  },
  base: {
    panel: 'base_bottom',
    wings: { left: 'base_front', right: 'base_back', bottom: 'base_left', top: 'base_right' },
    // 몸통 날개는 아래쪽 가장자리가 바닥 패널에 붙는다(이미지 위쪽이 패널 반대쪽)
    rot: { panel: 270, left: 270, right: 90, bottom: 180, top: 0 },
  },
};

export function buildDieline(p: BoxParams, kind: DieKind): Dieline {
  const d = derive(p);
  // 뚜껑: 면 크기 = 뚜껑 외경, 날개 깊이 = 뚜껑 높이 / 몸통: 몸통 외경, 날개 깊이 = 몸통 높이
  const longEdge = kind === 'lid' ? d.lidW : p.baseW; // 가로(X): 시트에서는 세로 방향
  const shortEdge = kind === 'lid' ? d.lidD : p.baseD;
  const depth = kind === 'lid' ? p.lidH : p.baseH;
  const wrap = p.wrapMargin, tuck = p.tuck;
  const W = shortEdge + wrap, H = longEdge + wrap; // 패널(싸바리지) 크기: 샘플 117.4×167.4 / 112.4×162.4
  const a = depth + tuck;
  const width = W + 2 * a, height = H + 2 * a;
  const lay = LAYOUT[kind];
  const panel: Rect = { x: a, y: a, w: W, h: H };

  const mk = (id: FaceKey, side: Side, rect: Rect): DieFace => {
    const rot = lay.rot[side];
    const swap = rot === 90 || rot === 270;
    return { id, side, rect, rotationDeg: rot, faceW: swap ? rect.h : rect.w, faceH: swap ? rect.w : rect.h };
  };
  const faces: DieFace[] = [
    mk(lay.panel, 'panel', { x: a + wrap / 2, y: a + wrap / 2, w: shortEdge, h: longEdge }),
    mk(lay.wings.left, 'left', { x: tuck, y: a + wrap / 2, w: depth, h: longEdge }),
    mk(lay.wings.right, 'right', { x: a + W, y: a + wrap / 2, w: depth, h: longEdge }),
    mk(lay.wings.top, 'top', { x: a + wrap / 2, y: tuck, w: shortEdge, h: depth }),
    mk(lay.wings.bottom, 'bottom', { x: a + wrap / 2, y: a + H, w: shortEdge, h: depth }),
  ];
  const tuckRects: Rect[] = [
    { x: 0, y: a, w: tuck, h: H }, { x: width - tuck, y: a, w: tuck, h: H },
    { x: a, y: 0, w: W, h: tuck }, { x: a, y: height - tuck, w: W, h: tuck },
  ];
  const c = Math.min(CORNER, tuck, W / 4, H / 4);
  const outline: Pt[] = [
    [a, a], [a + c, 0], [a + W - c, 0], [a + W, a], // 위 날개
    [width, a + c], [width, a + H - c], [a + W, a + H], // 오른쪽 날개
    [a + W - c, height], [a + c, height], [a, a + H], // 아래 날개
    [0, a + H - c], [0, a + c], // 왼쪽 날개
  ];
  const folds: [Pt, Pt][] = [
    [[a, a], [a + W, a]], [[a + W, a], [a + W, a + H]], [[a + W, a + H], [a, a + H]], [[a, a + H], [a, a]], // 패널 가장자리
    [[a + c, tuck], [a + W - c, tuck]], [[width - tuck, a + c], [width - tuck, a + H - c]], // 접어 넣는 선
    [[a + W - c, height - tuck], [a + c, height - tuck]], [[tuck, a + H - c], [tuck, a + c]],
  ];
  return { kind, width, height, depth, tuck, panel, faces, tuckRects, outline, folds, corner: c };
}

export const KIND_LABEL: Record<DieKind, string> = { lid: '뚜껑(십자형)', base: '하단 몸통' };

// ------------------------------------------------------------------ 칼선 이미지 분할
/** 칼선 이미지 한 장(재단선 바깥으로 bleedMm 씩 여분 포함)에서 각 면의 영역(픽셀)을 계산한다. */
export function regionsFor(d: Dieline, imgW: number, imgH: number, bleedMm: number): Record<string, Rect> {
  const sx = imgW / (d.width + 2 * bleedMm), sy = imgH / (d.height + 2 * bleedMm);
  const out: Record<string, Rect> = {};
  for (const f of d.faces) out[f.id] = { x: (f.rect.x + bleedMm) * sx, y: (f.rect.y + bleedMm) * sy, w: f.rect.w * sx, h: f.rect.h * sy };
  return out;
}

/** 이미지 비율과 칼선(+여분) 비율이 얼마나 어긋나는지 (0.02 = 2%). 크게 어긋나면 여분 값이나 이미지가 맞는지 확인하라고 알린다. */
export function aspectMismatch(d: Dieline, imgW: number, imgH: number, bleedMm: number): number {
  const expect = (d.width + 2 * bleedMm) / (d.height + 2 * bleedMm);
  return Math.abs(imgW / imgH / expect - 1);
}

// ------------------------------------------------------------------ SVG 내보내기
export const SVG_DISCLAIMER = '디자인 가이드용, 제조 칼선 아님. 최종 칼선은 인쇄소 템플릿을 사용하세요';

const STYLE = {
  cut: { stroke: '#e60000', width: 0.3, dash: '' },
  fold: { stroke: '#0066ff', width: 0.25, dash: '4 2' },
  guide: { stroke: '#00a050', width: 0.2, dash: '1 1.5' },
};
const f2 = (n: number) => Math.round(n * 1000) / 1000;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * 1:1 실제 크기(mm) SVG. 재단선·접는선·안내선을 색과 선 종류로 구분하고 레이어(그룹)로 나눈다.
 * width/height 는 mm 단위이고 viewBox 1 단위 = 1mm 이다. 재단선 바깥 bleedMm 를 여분 영역으로 포함한다.
 */
export function dielineSvg(d: Dieline, bleedMm: number, faceLabel: (id: FaceKey) => string = (id) => id): string {
  const b = bleedMm;
  const W = d.width + 2 * b, H = d.height + 2 * b;
  const line = (p: Pt, q: Pt, s: { stroke: string; width: number; dash: string }) =>
    `<line x1="${f2(p[0])}" y1="${f2(p[1])}" x2="${f2(q[0])}" y2="${f2(q[1])}" stroke="${s.stroke}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} fill="none"/>`;
  const rect = (r: Rect, s: { stroke: string; width: number; dash: string }) =>
    `<rect x="${f2(r.x)}" y="${f2(r.y)}" width="${f2(r.w)}" height="${f2(r.h)}" stroke="${s.stroke}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''} fill="none"/>`;
  const pts = d.outline.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' ');
  const layer = (id: string, label: string, body: string) => `  <g id="${id}" inkscape:groupmode="layer" inkscape:label="${label}">\n${body}\n  </g>`;
  const bleedRect: Rect = { x: -b, y: -b, w: d.width + 2 * b, h: d.height + 2 * b };

  const cut = `    <polygon points="${pts}" stroke="${STYLE.cut.stroke}" stroke-width="${STYLE.cut.width}" fill="none" stroke-linejoin="miter"/>`;
  const fold = d.folds.map(([p, q]) => '    ' + line(p, q, STYLE.fold)).join('\n');
  const guide = [
    '    ' + rect(bleedRect, STYLE.guide),
    ...d.faces.map((f) => '    ' + rect(f.rect, STYLE.guide)),
    ...d.faces.map((f) => `    <text x="${f2(f.rect.x + f.rect.w / 2)}" y="${f2(f.rect.y + f.rect.h / 2)}" font-size="${f2(Math.min(5, f.rect.w / 6, f.rect.h / 3))}" fill="#00a050" text-anchor="middle" dominant-baseline="middle" transform="rotate(${f.rotationDeg} ${f2(f.rect.x + f.rect.w / 2)} ${f2(f.rect.y + f.rect.h / 2)})">${esc(faceLabel(f.id))}</text>`),
    `    <text x="${f2(-b + 1)}" y="${f2(d.height + b - 1)}" font-size="2.6" fill="#555">${esc(SVG_DISCLAIMER)}</text>`,
  ].join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ${esc(SVG_DISCLAIMER)} -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     width="${f2(W)}mm" height="${f2(H)}mm" viewBox="${f2(-b)} ${f2(-b)} ${f2(W)} ${f2(H)}"
     data-kind="${d.kind}" data-cut-width-mm="${f2(d.width)}" data-cut-height-mm="${f2(d.height)}" data-bleed-mm="${f2(b)}">
  <title>사바리 ${KIND_LABEL[d.kind]} 칼선 가이드 (1:1, mm)</title>
  <desc>${esc(SVG_DISCLAIMER)}. 재단선=빨강 실선, 접는선=파랑 점선, 안내선(여분·면 영역)=초록 점선. 단위 mm.</desc>
${layer('재단선', '재단선 (빨강 실선)', cut)}
${layer('접는선', '접는선 (파랑 점선)', fold)}
${layer('안내선', '안내선: 여분·면 영역 (초록 점선)', guide)}
</svg>
`;
}
