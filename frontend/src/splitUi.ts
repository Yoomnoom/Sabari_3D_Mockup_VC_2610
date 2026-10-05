// 칼선 이미지 분할 화면: 칼선 위에서 만든 디자인 한 장을 템플릿의 면 배치 목록(dieline.ts)대로 면별 이미지로 나눈다.
// 자동으로 나눈 결과가 어긋나면 면 사각형을 끌어 위치·크기를 직접 조정할 수 있다.
import { BoxParams } from './params';
import { ARTBOARD_PRESETS, CROP_SABARI_160_110_43_OFFSET_MM, CROP_SABARI_160_110_43_SIZE_MM, DieKind, Dieline, PRESET_SABARI_160_110_43, Rect, artboardMismatch, artboardRegions, aspectMismatch, buildDieline, cropMismatch, cropRegions, presetBoxMatches, regionsFor } from './dieline';
import type { FaceId } from './faceDefs';
import type { DielineSave } from './project';

export interface SplitResult {
  source: Blob; name: string | null; bleedMm: number; kind: DieKind;
  mode: 'param' | 'artboard' | 'crop'; artboardMm: [number, number];
  /** 적용하지 않은(빈 영역 등) 면 */
  skipped: FaceId[];
  regions: Partial<Record<FaceId, Rect>>; rotations: Partial<Record<FaceId, number>>;
  faces: { id: FaceId; blob: Blob; name: string }[];
}
export interface SplitCtx {
  params(): BoxParams;
  faceLabel(id: FaceId): string;
  /** 분할 결과를 면에 적용한다(이력 기록 포함). */
  apply(r: SplitResult): Promise<void>;
}

const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00'];
type Rot = 0 | 90 | 180 | 270;

/**
 * 칼선 이미지의 한 영역을 잘라 면 이미지(정립)로 만든다. 시계방향 rot 만큼 돌려 놓았던 것을 되돌린다.
 * target(면 비율, 정립 기준 mm)이 주어지고 영역 비율과 3% 이내로 다르면 면 비율로 늘여 맞춘다(싸바리지 패널 117.4×167.4 → 면 115×165 같은 작은 차이).
 * 그보다 크게 다르면(사용자가 사각형을 직접 바꾼 경우 등) 영역 그대로 둔다.
 */
export async function cropFace(src: ImageBitmap, r: Rect, rot: number, target?: { w: number; h: number }): Promise<Blob> {
  const swap = rot === 90 || rot === 270;
  const w = Math.max(1, Math.round(swap ? r.h : r.w));
  let h = Math.max(1, Math.round(swap ? r.w : r.h));
  if (target && target.w > 0 && target.h > 0 && Math.abs(w / h / (target.w / target.h) - 1) <= 0.03) h = Math.max(1, Math.round((w * target.h) / target.w));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  // 캔버스 기본값(완전 투명)을 그대로 둔다: 투명 픽셀과 이미지 밖(영역이 가장자리를 넘은 부분)을 미리 흰색으로 채우면 알파가 지워져 면 바탕색 합성(bake)이 깨진다 — 투명도는 cv.toBlob('image/png')이 그대로 보존한다.
  g.translate(w / 2, h / 2);
  g.rotate((-rot * Math.PI) / 180);
  g.imageSmoothingQuality = 'high';
  const dw = swap ? h : w, dh = swap ? w : h; // 회전 전(칼선 방향) 기준 그리기 크기
  g.drawImage(src, r.x, r.y, r.w, r.h, -dw / 2, -dh / 2, dw, dh);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('면 이미지를 만들지 못했습니다.'))), 'image/png'));
}

/** 영역이 (거의) 흰색·투명뿐인지: 작게 줄여 흰색이 아닌 픽셀 비율을 본다. 비어 있는 몸통 십자형 등을 빈 영역으로 알아보는 데 쓴다. */
export function isBlankRegion(src: ImageBitmap, r: Rect): boolean {
  const N = 96;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'low';
  g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8 && (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245)) ink++;
  return ink / (N * N) < 0.002;
}

/** 이미지 네 모서리가 투명에 가까운지 본다(평균 알파 비교). 칼선 외곽 크롭 이미지는 십자형 바깥(모서리)이 투명이다. */
function cornersTransparent(bmp: ImageBitmap): boolean {
  const cw = Math.max(1, Math.round(bmp.width / 8)), ch = Math.max(1, Math.round(bmp.height / 8));
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'low';
  const corners: [number, number][] = [[0, 0], [bmp.width - cw, 0], [0, bmp.height - ch], [bmp.width - cw, bmp.height - ch]];
  let sum = 0, count = 0;
  for (const [cx, cy] of corners) {
    g.clearRect(0, 0, cw, ch);
    g.drawImage(bmp, cx, cy, cw, ch, 0, 0, cw, ch);
    const d = g.getImageData(0, 0, cw, ch).data;
    for (let i = 3; i < d.length; i += 4) { sum += d[i]; count++; }
  }
  return sum / count < 12; // 평균 알파 5% 미만
}

export function initSplitUi(ctx: SplitCtx) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dlg = $<HTMLDialogElement>('splitDlg');
  const img = $<HTMLImageElement>('splitImg');
  const svg = document.getElementById('splitSvg') as unknown as SVGSVGElement;
  const viewport = $<HTMLDivElement>('splitViewport');
  const stage = $<HTMLDivElement>('splitStage');
  const zoomLabel = $<HTMLSpanElement>('zoomLabel');
  const statusEl = $<HTMLParagraphElement>('splitStatus');
  const NS = 'http://www.w3.org/2000/svg';

  let source: Blob | null = null, sourceName: string | null = null, bmp: ImageBitmap | null = null, url = '';
  let kind: DieKind = 'lid', bleed = 3;
  let mode: 'param' | 'artboard' | 'crop' = 'param';
  let artW = PRESET_SABARI_160_110_43.artboardMm[0], artH = PRESET_SABARI_160_110_43.artboardMm[1];
  let include: Record<string, boolean> = {}, blank: Record<string, boolean> = {};
  let layout: Dieline;
  let regions: Record<string, Rect> = {}, rots: Record<string, Rot> = {};
  let active: string | null = null;
  let busy = false;

  // ---- 화면 확대·이동 (대화상자를 열 때마다 맞춤으로 초기화하고 저장하지 않는다) ----
  const ZMIN = 0.25, ZMAX = 16;
  let zoom = 1, panX = 0, panY = 0, fitZoom = 1;
  let fitMode = true; // 맞춤 상태면 창·레이아웃이 바뀔 때 다시 맞춘다(사용자가 확대·이동한 뒤에는 건드리지 않는다)
  let fillOpacity = 0.14, showRegions = true;
  let spaceHeld = false, handTool = false, panMode = false, panLast: [number, number] | null = null;
  const panning = () => spaceHeld || handTool; // Space를 누르는 동안과 손 도구가 켜진 동안은 영역 편집 대신 화면 이동만 한다
  const regHist: string[] = []; // 영역 변경 실행 취소 목록(대화상자를 열 때마다 비운다)
  const syncUndo = () => { ($('btnRegUndo') as HTMLButtonElement).disabled = regHist.length === 0; };
  const pushHist = (snap?: string) => { regHist.push(snap ?? JSON.stringify(regions)); if (regHist.length > 100) regHist.shift(); syncUndo(); };
  let lastCursorImg: [number, number] | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0, pinchMid: [number, number] = [0, 0];
  /** 현재 모드에서 쓰는 px/mm 배율(가로, 세로) — regionsFor/artboardRegions/cropRegions 와 같은 식을 재사용한다 */
  const mmScale = (): [number, number] => {
    if (mode === 'artboard') return [bmp!.width / artW, bmp!.height / artH];
    if (mode === 'crop') return [bmp!.width / CROP_SABARI_160_110_43_SIZE_MM[0], bmp!.height / CROP_SABARI_160_110_43_SIZE_MM[1]];
    return [bmp!.width / (layout.width + 2 * bleed), bmp!.height / (layout.height + 2 * bleed)];
  };
  const vpPoint = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = viewport.getBoundingClientRect();
    return [e.clientX - r.left - viewport.clientLeft, e.clientY - r.top - viewport.clientTop];
  };
  const clampZoom = (z: number) => Math.min(ZMAX, Math.max(Math.min(ZMIN, fitZoom), z));
  const clampPan = () => {
    const vw = viewport.clientWidth, vh = viewport.clientHeight, sw = bmp!.width * zoom, sh = bmp!.height * zoom;
    panX = sw > vw ? Math.min(0, Math.max(vw - sw, panX)) : Math.min(vw - sw, Math.max(0, panX));
    panY = sh > vh ? Math.min(0, Math.max(vh - sh, panY)) : Math.min(vh - sh, Math.max(0, panY));
  };
  const applyTransform = () => {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    fitMode = false;
    updateScrollbars();
  };
  // ---- 스크롤바(이동 수단): 이미지가 화면보다 크면 가로·세로로 나타나고 같은 이동 상태를 쓴다 ----
  const sbH = $<HTMLDivElement>('splitSbH'), sbV = $<HTMLDivElement>('splitSbV');
  const updateScrollbars = () => {
    if (!bmp) return;
    const vw = viewport.clientWidth, vh = viewport.clientHeight, sw = bmp.width * zoom, sh = bmp.height * zoom;
    const one = (sb: HTMLDivElement, view: number, size: number, pan: number, horizontal: boolean) => {
      const show = size > view + 0.5; sb.hidden = !show; if (!show) return;
      const track = horizontal ? sb.clientWidth : sb.clientHeight, thumb = Math.max(24, (track * view) / size);
      const pos = (-pan / (size - view)) * (track - thumb), t = sb.firstElementChild as HTMLElement;
      if (horizontal) { t.style.left = `${pos}px`; t.style.width = `${thumb}px`; } else { t.style.top = `${pos}px`; t.style.height = `${thumb}px`; }
    };
    one(sbH, vw, sw, panX, true); one(sbV, vh, sh, panY, false);
  };
  const bindScrollbar = (sb: HTMLDivElement, horizontal: boolean) => {
    let st: { start: number; pan: number } | null = null;
    sb.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const thumb = sb.firstElementChild as HTMLElement, tr = thumb.getBoundingClientRect(), pt = horizontal ? e.clientX : e.clientY;
      if (e.target !== thumb) { // 트랙을 누르면 한 화면씩 그쪽으로
        const vw = viewport.clientWidth, vh = viewport.clientHeight, back = pt < (horizontal ? tr.left : tr.top);
        if (horizontal) panX += back ? vw * 0.9 : -vw * 0.9; else panY += back ? vh * 0.9 : -vh * 0.9;
        clampPan(); applyTransform(); return;
      }
      st = { start: pt, pan: horizontal ? panX : panY }; sb.setPointerCapture(e.pointerId);
    });
    sb.addEventListener('pointermove', (e) => {
      if (!st || !bmp) return;
      const view = horizontal ? viewport.clientWidth : viewport.clientHeight, size = (horizontal ? bmp.width : bmp.height) * zoom;
      const track = horizontal ? sb.clientWidth : sb.clientHeight, thumb = Math.max(24, (track * view) / size);
      const d = (horizontal ? e.clientX : e.clientY) - st.start, v = st.pan - (d / Math.max(1, track - thumb)) * (size - view);
      if (horizontal) panX = v; else panY = v;
      clampPan(); applyTransform();
    });
    const up = () => { st = null; };
    sb.addEventListener('pointerup', up); sb.addEventListener('pointercancel', up);
  };
  bindScrollbar(sbH, true); bindScrollbar(sbV, false);
  new ResizeObserver(() => { if (!bmp) return; if (fitMode) { resetView(); draw(); } else { clampPan(); applyTransform(); } }).observe(viewport);
  const refocus = () => viewport.focus({ preventScroll: true }); // 확대·맞춤 버튼을 눌러도 키보드(Space 이동·방향키)가 바로 화면으로 가게 한다
  const syncCursor = () => { viewport.classList.toggle('hand', panning() && !panMode); viewport.classList.toggle('grabbing', panMode); };
  const zoomToRegion = (id = active) => { // 선택한 영역이 화면에 가득 차게(여백 24px) 이동·확대한다. 맞춤을 누르면 전체 보기로 돌아간다.
    if (!bmp || !id || !regions[id]) return;
    const r = regions[id], vw = viewport.clientWidth, vh = viewport.clientHeight;
    zoom = clampZoom(Math.min((vw - 48) / r.w, (vh - 48) / r.h));
    panX = vw / 2 - (r.x + r.w / 2) * zoom; panY = vh / 2 - (r.y + r.h / 2) * zoom;
    applyTransform(); draw();
  };
  // 확대 전 커서 아래 이미지 좌표를 구하고, 확대 후 같은 좌표가 같은 화면 위치에 오도록 이동값을 보정한다(커서 중심 확대)
  const setZoomAtPoint = (newZoom: number, vx: number, vy: number) => {
    const z = clampZoom(newZoom);
    const ix = (vx - panX) / zoom, iy = (vy - panY) / zoom;
    zoom = z;
    panX = vx - ix * zoom; panY = vy - iy * zoom;
    applyTransform(); draw(); // 핸들 크기(hs)가 배율에 반비례해 다시 그려야 한다. 커서 중심 확대를 정확히 유지하기 위해 clampPan을 적용하지 않는다.
  };
  const resetView = () => {
    const vw = viewport.clientWidth || 1, vh = viewport.clientHeight || 1;
    fitZoom = Math.min(ZMAX, Math.min(vw / bmp!.width, vh / bmp!.height));
    zoom = fitZoom;
    panX = (vw - bmp!.width * zoom) / 2; panY = (vh - bmp!.height * zoom) / 2;
    applyTransform(); fitMode = true;
  };

  const preset = ARTBOARD_PRESETS[0];
  const autoRegions = () => {
    layout = buildDieline(ctx.params(), kind);
    if (mode === 'artboard') {
      bleed = preset.bleedMm; // 이 칼선은 재단 여분이 칼선 바깥에 없다(그림이 칼선 외곽에서 끝난다)
      regions = artboardRegions(preset, kind, bmp!.width, bmp!.height, artW, artH);
    } else if (mode === 'crop') {
      bleed = 0; // 칼선 외곽 크롭 이미지는 재단 여분이 없다
      regions = kind === 'lid'
        ? cropRegions(preset, 'lid', bmp!.width, bmp!.height, CROP_SABARI_160_110_43_SIZE_MM[0], CROP_SABARI_160_110_43_SIZE_MM[1], CROP_SABARI_160_110_43_OFFSET_MM)
        : regionsFor(layout, bmp!.width, bmp!.height, 0); // 이 크롭 이미지에는 몸통이 없다: 파라미터 칼선(여분 0)으로 대신 배치
    } else regions = regionsFor(layout, bmp!.width, bmp!.height, bleed);
    rots = Object.fromEntries(layout.faces.map((f) => [f.id, f.rotationDeg])) as Record<string, Rot>;
    // 아트보드 전체 이미지는 한쪽 십자형이 비어 있을 수 있다: 빈 영역은 기본으로 적용하지 않는다(몸통 색을 흰색으로 덮지 않도록)
    include = {}; blank = {};
    for (const f of layout.faces) { blank[f.id] = mode === 'artboard' && isBlankRegion(bmp!, regions[f.id]); include[f.id] = !blank[f.id]; }
    $('splitBleed').toggleAttribute('disabled', mode === 'artboard' || mode === 'crop');
    ($('splitBleed') as HTMLInputElement).value = String(bleed);
    $('splitArtRow').hidden = mode !== 'artboard';
    $('splitCropInfo').hidden = mode !== 'crop';
    warn();
  };
  const warn = () => {
    const el = $('splitWarn');
    if (mode === 'artboard') {
      const m = artboardMismatch(bmp!.width, bmp!.height, artW, artH);
      const msgs: string[] = [];
      if (m > 0.01) msgs.push(`이미지 비율이 아트보드(${artW}×${artH}mm)의 비율과 ${(m * 100).toFixed(1)}% 다릅니다. 아트보드 크기 값이나 이미지가 맞는지 확인하거나, 사각형을 직접 조정하세요.`);
      if (!presetBoxMatches(preset, ctx.params())) msgs.push(`현재 박스 치수가 이 칼선(${preset.box.baseW}×${preset.box.baseD}×${preset.box.baseH}mm)과 달라 면 크기에 맞춰 늘려 적용됩니다.`);
      el.hidden = msgs.length === 0;
      el.textContent = msgs.join(' ');
      return;
    }
    if (mode === 'crop') {
      const msgs: string[] = [];
      if (kind !== 'lid') msgs.push('이 크롭 이미지에는 몸통이 없습니다. 몸통은 파라미터 칼선(재단 여분 0mm)으로 배치됩니다.');
      else {
        const m = cropMismatch(bmp!.width, bmp!.height, CROP_SABARI_160_110_43_SIZE_MM[0], CROP_SABARI_160_110_43_SIZE_MM[1]);
        if (m > 0.01) msgs.push(`이미지 비율이 칼선 외곽(${CROP_SABARI_160_110_43_SIZE_MM[0]}×${CROP_SABARI_160_110_43_SIZE_MM[1]}mm)의 비율과 ${(m * 100).toFixed(1)}% 다릅니다. 사각형을 직접 조정하세요.`);
      }
      if (!presetBoxMatches(preset, ctx.params())) msgs.push(`현재 박스 치수가 이 칼선(${preset.box.baseW}×${preset.box.baseD}×${preset.box.baseH}mm)과 달라 면 크기에 맞춰 늘려 적용됩니다.`);
      el.hidden = msgs.length === 0;
      el.textContent = msgs.join(' ');
      return;
    }
    const m = aspectMismatch(layout, bmp!.width, bmp!.height, bleed);
    el.hidden = m <= 0.01;
    el.textContent = `이미지 비율이 칼선(재단 여분 ${bleed}mm 포함)의 비율과 ${(m * 100).toFixed(1)}% 다릅니다. 이미지에 여백이 있을 수 있습니다. 칼선 기준을 확인하세요.`;
  };

  function draw() {
    svg.setAttribute('width', String(bmp!.width));
    svg.setAttribute('height', String(bmp!.height));
    svg.setAttribute('viewBox', `0 0 ${bmp!.width} ${bmp!.height}`);
    svg.innerHTML = '';
    if (showRegions) {
      const hs = 9 / zoom; // 모서리 조절점: 배율에 반비례시켜 화면에서 항상 18px 정사각형으로 보이게 한다
      layout.faces.forEach((f, i) => {
        const r = regions[f.id];
        const col = COLORS[i % COLORS.length];
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('data-face', f.id);
        const rect = document.createElementNS(NS, 'rect');
        const fo = active === f.id ? (fillOpacity > 0 ? Math.min(0.6, fillOpacity + 0.1) : 0) : fillOpacity;
        for (const [k, v] of Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h, fill: col, 'fill-opacity': fo, stroke: col, 'stroke-width': active === f.id ? '3' : '2', 'vector-effect': 'non-scaling-stroke' })) rect.setAttribute(k, String(v));
        rect.setAttribute('class', 'split-rect'); rect.setAttribute('data-role', 'move');
        g.appendChild(rect);
        const label = document.createElementNS(NS, 'text');
        label.textContent = ctx.faceLabel(f.id as FaceId);
        const screenFont = Math.max(11, Math.min(18, (Math.min(r.w, r.h) * zoom) / 6));
        for (const [k, v] of Object.entries({ x: r.x + r.w / 2, y: r.y + r.h / 2, fill: col, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': screenFont / zoom, 'pointer-events': 'none', 'font-weight': '700', stroke: '#fff', 'stroke-width': '0.6', 'paint-order': 'stroke' })) label.setAttribute(k, String(v));
        g.appendChild(label);
        for (const [cx, cy, name] of [[r.x, r.y, 'nw'], [r.x + r.w, r.y, 'ne'], [r.x, r.y + r.h, 'sw'], [r.x + r.w, r.y + r.h, 'se']] as [number, number, string][]) {
          const h = document.createElementNS(NS, 'rect');
          for (const [k, v] of Object.entries({ x: cx - hs, y: cy - hs, width: hs * 2, height: hs * 2, fill: '#fff', stroke: col, 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' })) h.setAttribute(k, String(v));
          h.setAttribute('class', 'split-handle'); h.setAttribute('data-role', name);
          g.appendChild(h);
        }
        svg.appendChild(g);
      });
    }
    renderList();
    updateStatus();
  }

  function updateStatus() {
    const [sx, sy] = mmScale();
    let s = `배율 ${Math.round(zoom * 100)}%`;
    if (lastCursorImg) {
      const [cx, cy] = lastCursorImg;
      s += ` · 커서 ${Math.round(cx)}, ${Math.round(cy)}px (${(cx / sx).toFixed(1)}, ${(cy / sy).toFixed(1)}mm)`;
    }
    if (active && regions[active]) {
      const r = regions[active];
      s += ` · 선택 영역 ${Math.round(r.w)}×${Math.round(r.h)}px (${(r.w / sx).toFixed(1)}×${(r.h / sy).toFixed(1)}mm)`;
    }
    statusEl.textContent = s;
    syncRegEdit();
  }
  function syncRegEdit() { // 선택한 영역의 위치·크기를 숫자(px, mm)로 보여 준다(입력 중인 칸은 건드리지 않는다)
    const ids = ['regX', 'regY', 'regW', 'regH'] as const, r = active ? regions[active] : null;
    for (const id of ids) { const el = $(id) as HTMLInputElement; el.disabled = !r; if (r && document.activeElement !== el) el.value = String(Math.round(id === 'regX' ? r.x : id === 'regY' ? r.y : id === 'regW' ? r.w : r.h)); }
    if (r) { const [sx, sy] = mmScale(); $('regMm').textContent = `= X ${(r.x / sx).toFixed(1)}, Y ${(r.y / sy).toFixed(1)}, ${(r.w / sx).toFixed(1)}×${(r.h / sy).toFixed(1)}mm`; } else $('regMm').textContent = '';
  }

  function renderList() {
    const box = $('splitList');
    box.innerHTML = '';
    layout.faces.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'split-row' + (active === f.id ? ' active' : '');
      const r = regions[f.id];
      row.innerHTML = `<input type="checkbox" class="split-use" aria-label="${ctx.faceLabel(f.id as FaceId)} 적용" ${include[f.id] ? 'checked' : ''}><span class="chip" style="background:${COLORS[i % COLORS.length]}"></span><b>${ctx.faceLabel(f.id as FaceId)}</b><small>${Math.round(r.w)}×${Math.round(r.h)}px${blank[f.id] ? ' · 빈 영역(흰색)' : ''}</small>`;
      const use = row.querySelector('.split-use') as HTMLInputElement;
      use.onclick = (e) => e.stopPropagation();
      use.onchange = () => { include[f.id] = use.checked; };
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `${ctx.faceLabel(f.id as FaceId)} 회전`);
      for (const d of [0, 90, 180, 270]) sel.add(new Option(`회전 ${d}°`, String(d), false, rots[f.id] === d));
      sel.onchange = () => { rots[f.id] = Number(sel.value) as Rot; };
      row.appendChild(sel);
      row.onclick = () => { active = f.id; draw(); };
      row.ondblclick = () => { active = f.id; draw(); zoomToRegion(f.id); }; // 목록의 영역을 두 번 누르면 그 영역을 화면 가득 보여 준다
      box.appendChild(row);
    });
  }

  // ---- 드래그: 이동 / 모서리 크기 조정 ----
  let drag: { id: string; role: string; start: [number, number]; orig: Rect; snap: string } | null = null;
  const toImg = (e: PointerEvent): [number, number] => {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || panning()) return; // 가운데 버튼·Space·손 도구 드래그는 이동(pan)이 맡는다(영역 위에서도)
    const t = e.target as SVGElement;
    const role = t.getAttribute('data-role'), id = t.closest('g')?.getAttribute('data-face');
    if (!role || !id) return;
    active = id; drag = { id, role, start: toImg(e), orig: { ...regions[id] }, snap: JSON.stringify(regions) };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    draw();
  });
  svg.addEventListener('pointermove', (e) => { lastCursorImg = toImg(e); updateStatus(); });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const [x, y] = toImg(e);
    const dx = x - drag.start[0], dy = y - drag.start[1], o = drag.orig, W = bmp!.width, H = bmp!.height, MIN = 10;
    let { x: nx, y: ny, w: nw, h: nh } = o;
    if (drag.role === 'move') { nx = o.x + dx; ny = o.y + dy; }
    else {
      if (drag.role.includes('w')) { nx = o.x + dx; nw = o.w - dx; }
      if (drag.role.includes('e')) nw = o.w + dx;
      if (drag.role.includes('n')) { ny = o.y + dy; nh = o.h - dy; }
      if (drag.role.includes('s')) nh = o.h + dy;
      if (nw < MIN) { if (drag.role.includes('w')) nx = o.x + o.w - MIN; nw = MIN; }
      if (nh < MIN) { if (drag.role.includes('n')) ny = o.y + o.h - MIN; nh = MIN; }
    }
    // 이미지 안에 머물게 한다(이동은 크기 유지, 조정은 가장자리에 붙는다)
    if (drag.role === 'move') { nx = Math.min(Math.max(0, nx), W - nw); ny = Math.min(Math.max(0, ny), H - nh); }
    else { const x2 = Math.min(W, nx + nw), y2 = Math.min(H, ny + nh); nx = Math.max(0, nx); ny = Math.max(0, ny); nw = x2 - nx; nh = y2 - ny; }
    regions[drag.id] = { x: nx, y: ny, w: nw, h: nh };
    draw();
  });
  const end = () => { if (drag && JSON.stringify(regions) !== drag.snap) pushHist(drag.snap); drag = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  // ---- 이동(pan) / 핀치 확대 ----
  const startPan = (e: PointerEvent) => { panMode = true; panLast = vpPoint(e); try { viewport.setPointerCapture(e.pointerId); } catch { /* 무시 */ } syncCursor(); };
  const endPan = () => { panMode = false; panLast = null; syncCursor(); };
  viewport.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { drag = null; panMode = false; const pts = [...pointers.values()]; pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); pinchMid = vpPoint({ clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 }); e.preventDefault(); return; }
    if (e.button === 1 || (e.button === 0 && panning())) { drag = null; startPan(e); e.preventDefault(); }
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { // 터치 두 손가락 핀치: 확대/축소(영역 드래그와 겹치지 않게 별도로 처리)
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const [vx, vy] = vpPoint({ clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 });
      if (pinchDist > 0) { // 두 손가락의 중간점 아래 이미지 지점이 중간점을 따라가도록(확대 + 이동을 함께)
      const ix = (pinchMid[0] - panX) / zoom, iy = (pinchMid[1] - panY) / zoom;
      zoom = clampZoom(zoom * (dist / pinchDist)); panX = vx - ix * zoom; panY = vy - iy * zoom; applyTransform(); draw();
    }
    pinchMid = [vx, vy];
      pinchDist = dist;
      e.preventDefault();
      return;
    }
    if (panMode && panLast) {
      const [vx, vy] = vpPoint(e);
      panX += vx - panLast[0]; panY += vy - panLast[1];
      panLast = [vx, vy];
      clampPan(); applyTransform();
      e.preventDefault();
    }
  });
  const releasePointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (panMode && pointers.size === 0) endPan();
  };
  viewport.addEventListener('pointerup', releasePointer);
  viewport.addEventListener('pointercancel', releasePointer);
  viewport.addEventListener('wheel', (e) => { // 휠: 커서 아래 지점을 유지하며 확대/축소, Ctrl+휠(터치패드 핀치)은 더 민감하게, Shift+휠은 가로 이동
    e.preventDefault();
    if (e.shiftKey && !e.ctrlKey) { panX -= e.deltaX || e.deltaY; clampPan(); applyTransform(); return; }
    const [vx, vy] = vpPoint(e);
    setZoomAtPoint(zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), vx, vy);
  }, { passive: false });
  $('btnHandTool').onclick = () => { handTool = !handTool; $('btnHandTool').setAttribute('aria-pressed', String(handTool)); syncCursor(); refocus(); };

  // ---- 열기 / 적용 ----
  async function open(blob: Blob, name: string | null, saved?: DielineSave | null) {
    if (url) URL.revokeObjectURL(url);
    bmp?.close();
    source = blob; sourceName = name;
    bmp = await createImageBitmap(blob);
    url = URL.createObjectURL(blob);
    img.src = url;
    kind = saved?.kind ?? 'lid';
    bleed = saved?.bleedMm ?? ctx.params().bleed;
    [artW, artH] = saved?.artboardMm ?? preset.artboardMm;
    // 저장된 값이 없으면: 이미지 비율이 칼선 외곽 크롭(232×283, ±1%)과 같고 모서리가 투명하면 크롭 이미지로,
    // 아트보드(525.7×349.0)와 1% 이내로 같으면 아트보드 전체 이미지로 본다(사용자가 바꿀 수 있다)
    mode = saved
      ? (saved.mode === 'artboard' ? 'artboard' : saved.mode === 'crop' ? 'crop' : 'param')
      : cropMismatch(bmp.width, bmp.height, CROP_SABARI_160_110_43_SIZE_MM[0], CROP_SABARI_160_110_43_SIZE_MM[1]) <= 0.01 && cornersTransparent(bmp)
        ? 'crop'
        : artboardMismatch(bmp.width, bmp.height, artW, artH) <= 0.01 ? 'artboard' : 'param';
    $<HTMLSelectElement>('splitKind').value = kind;
    $<HTMLSelectElement>('splitMode').value = mode;
    $<HTMLInputElement>('splitBleed').value = String(bleed);
    $<HTMLInputElement>('splitArtW').value = String(artW);
    $<HTMLInputElement>('splitArtH').value = String(artH);
    autoRegions();
    if (saved && Object.keys(saved.regions).length) { // 저장된 조정값 복원
      for (const [k, v] of Object.entries(saved.regions)) if (v) regions[k] = { ...v };
      for (const [k, v] of Object.entries(saved.rotations ?? {})) if (v !== undefined) rots[k] = v as Rot;
      for (const f of layout.faces) { blank[f.id] = mode === 'artboard' && isBlankRegion(bmp, regions[f.id]); include[f.id] = !blank[f.id]; }
    }
    active = layout.faces[0].id;
    if (!dlg.open) dlg.showModal();
    regHist.length = 0; syncUndo(); handTool = false; spaceHeld = false; $('btnHandTool').setAttribute('aria-pressed', 'false');
    resetView(); // 대화상자를 열 때마다 맞춤 배율로 시작하고 이전 확대·이동 상태는 저장하지 않는다
    draw(); syncCursor(); refocus();
  }

  $('splitMode').onchange = () => {
    const v = ($('splitMode') as HTMLSelectElement).value;
    mode = v === 'artboard' ? 'artboard' : v === 'crop' ? 'crop' : 'param';
    if (mode === 'param') bleed = ctx.params().bleed;
    if (mode === 'crop') bleed = 0;
    autoRegions(); draw();
  };
  for (const id of ['splitArtW', 'splitArtH']) {
    $(id).oninput = () => {
      const w = Number(($('splitArtW') as HTMLInputElement).value), h = Number(($('splitArtH') as HTMLInputElement).value);
      if (Number.isFinite(w) && Number.isFinite(h) && w >= 10 && h >= 10 && w <= 5000 && h <= 5000) { artW = w; artH = h; autoRegions(); draw(); }
    };
  }
  $('splitKind').onchange = () => { kind = ($('splitKind') as HTMLSelectElement).value as DieKind; autoRegions(); draw(); };
  $('splitBleed').oninput = () => { const v = Number(($('splitBleed') as HTMLInputElement).value); if (Number.isFinite(v) && v >= 0 && v <= 50) { bleed = v; autoRegions(); draw(); } };
  $('btnSplitAuto').onclick = () => { pushHist(); autoRegions(); draw(); };
  const allStep = () => Math.max(2, Math.round(Math.min(bmp!.width, bmp!.height) * 0.01)); // 영역 전체 이동 한 번의 크기(이미지 짧은 변 1%)
  const nudgeAll = (dx: number, dy: number) => { for (const f of layout.faces) { const r = regions[f.id]; regions[f.id] = { ...r, x: r.x + dx, y: r.y + dy }; } draw(); };
  const scaleAll = (factor: number) => {
    const ids = layout.faces.map((f) => f.id);
    const minX = Math.min(...ids.map((id) => regions[id].x)), minY = Math.min(...ids.map((id) => regions[id].y));
    const maxX = Math.max(...ids.map((id) => regions[id].x + regions[id].w)), maxY = Math.max(...ids.map((id) => regions[id].y + regions[id].h));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    for (const id of ids) {
      const r = regions[id], nw = r.w * factor, nh = r.h * factor;
      const ncx = cx + (r.x + r.w / 2 - cx) * factor, ncy = cy + (r.y + r.h / 2 - cy) * factor;
      regions[id] = { x: ncx - nw / 2, y: ncy - nh / 2, w: nw, h: nh };
    }
    draw();
  };
  $('btnRegAllLeft').onclick = () => nudgeAll(-allStep(), 0);
  $('btnRegAllRight').onclick = () => nudgeAll(allStep(), 0);
  $('btnRegAllUp').onclick = () => nudgeAll(0, -allStep());
  $('btnRegAllDown').onclick = () => nudgeAll(0, allStep());
  $('btnRegAllSmaller').onclick = () => scaleAll(1 / 1.02);
  $('btnRegAllBigger').onclick = () => scaleAll(1.02);
  $('btnZoomOut').onclick = () => setZoomAtPoint(zoom / 1.3, viewport.clientWidth / 2, viewport.clientHeight / 2); refocus();
  $('btnZoomIn').onclick = () => setZoomAtPoint(zoom * 1.3, viewport.clientWidth / 2, viewport.clientHeight / 2); refocus();
  $('btnZoomFit').onclick = () => { resetView(); draw(); refocus(); }; // 이동값을 처음 상태로 되돌리는 것은 맞춤뿐이다
  $('btnZoomRegion').onclick = () => { zoomToRegion(); refocus(); };
  $('btnZoom100').onclick = () => setZoomAtPoint(1, viewport.clientWidth / 2, viewport.clientHeight / 2); refocus();
  $('btnZoom200').onclick = () => setZoomAtPoint(2, viewport.clientWidth / 2, viewport.clientHeight / 2); refocus();
  for (const id of ['regX', 'regY', 'regW', 'regH']) {
    $(id).onchange = () => { // 선택한 영역을 숫자(px)로 고친다. 실행 취소 대상이며 이미지 안에 머문다.
      if (!bmp || !active || !regions[active]) return;
      const v = (k: string) => Number(($(k) as HTMLInputElement).value);
      const W = bmp.width, H = bmp.height, MIN = 10; let [x, y, w, h] = [v('regX'), v('regY'), v('regW'), v('regH')];
      if (![x, y, w, h].every(Number.isFinite)) { syncRegEdit(); return; }
      w = Math.min(W, Math.max(MIN, w)); h = Math.min(H, Math.max(MIN, h)); x = Math.min(W - w, Math.max(0, x)); y = Math.min(H - h, Math.max(0, y));
      const cur = regions[active]; if (cur.x === x && cur.y === y && cur.w === w && cur.h === h) { syncRegEdit(); return; } // 같은 값이면 기록하지 않는다
      pushHist(); regions[active] = { x, y, w, h }; draw();
    };
  }
  const undoRegion = () => { const snap = regHist.pop(); if (snap) { regions = JSON.parse(snap); draw(); } syncUndo(); };
  $('btnRegUndo').onclick = () => { undoRegion(); refocus(); };
  $('splitOpacity').oninput = () => { fillOpacity = Number(($('splitOpacity') as HTMLInputElement).value) / 100; draw(); };
  $('splitShowRegions').onchange = () => { showRegions = ($('splitShowRegions') as HTMLInputElement).checked; draw(); };
  $('btnSplitCancel').onclick = () => dlg.close();
  $('btnSplitApply').onclick = async () => {
    if (busy || !bmp || !source) return;
    busy = true; ($('btnSplitApply') as HTMLButtonElement).disabled = true;
    try {
      const faces: SplitResult['faces'] = [];
      const skipped: FaceId[] = [];
      for (const f of layout.faces) {
        if (!include[f.id]) { skipped.push(f.id as FaceId); continue; }
        faces.push({ id: f.id as FaceId, blob: await cropFace(bmp, regions[f.id], rots[f.id], { w: f.faceW, h: f.faceH }), name: `칼선분할_${ctx.faceLabel(f.id as FaceId)}.png` });
      }
      if (!faces.length) throw new Error('적용할 면이 없습니다. 면 목록에서 적용할 면을 체크하세요.');
      await ctx.apply({ source, name: sourceName, bleedMm: bleed, kind, mode, artboardMm: mode === 'crop' ? CROP_SABARI_160_110_43_SIZE_MM : [artW, artH], skipped, regions: { ...regions } as SplitResult['regions'], rotations: { ...rots } as SplitResult['rotations'], faces });
      dlg.close();
    } catch (e) {
      $('splitWarn').hidden = false;
      $('splitWarn').textContent = e instanceof Error ? e.message : String(e);
    } finally { busy = false; ($('btnSplitApply') as HTMLButtonElement).disabled = false; }
  };
  const isTyping = (t: HTMLElement | null) => { const tag = t?.tagName; return tag === 'TEXTAREA' || (tag === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes((t as HTMLInputElement).type)); };
  dlg.addEventListener('keydown', (e) => {
    e.stopPropagation(); // 대화상자 안에서는 앱 단축키가 동작하지 않게
    const typing = isTyping(e.target as HTMLElement);
    // Space: 입력칸 타이핑이 아니면 버튼 클릭·select 열기·체크 같은 기본 동작을 막고 항상 이동 도구로만 쓴다(한글 입력기가 켜져 있어도 e.code로 판별)
    if (e.code === 'Space') { if (typing) return; e.preventDefault(); if (!e.repeat) { spaceHeld = true; syncCursor(); } return; }
    if (typing) return;
    const center: [number, number] = [viewport.clientWidth / 2, viewport.clientHeight / 2];
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undoRegion(); return; }
    if (e.altKey && e.key.startsWith('Arrow') && active && regions[active] && bmp) { // Alt+방향키: 선택 영역을 1px(Shift 10px) 이동
      e.preventDefault(); const st = e.shiftKey ? 10 : 1, r = regions[active];
      const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      pushHist(); regions[active] = { ...r, x: Math.min(bmp.width - r.w, Math.max(0, r.x + dx)), y: Math.min(bmp.height - r.h, Math.max(0, r.y + dy)) }; draw(); return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { setZoomAtPoint(zoom * 1.2, center[0], center[1]); e.preventDefault(); }
    else if (e.key === '-') { setZoomAtPoint(zoom / 1.2, center[0], center[1]); e.preventDefault(); }
    else if (e.key.toLowerCase() === 'z') { zoomToRegion(); e.preventDefault(); }
    else if (e.key.startsWith('Arrow') && e.target === viewport) { // 화면에 포커스가 있으면 방향키로 이동(Shift는 큰 이동)
      const st = e.shiftKey ? 240 : 48;
      panX += e.key === 'ArrowLeft' ? st : e.key === 'ArrowRight' ? -st : 0; panY += e.key === 'ArrowUp' ? st : e.key === 'ArrowDown' ? -st : 0;
      clampPan(); applyTransform(); e.preventDefault();
    }
  });
  dlg.addEventListener('keyup', (e) => { // keyup에서도 막아야 포커스된 버튼이 Space를 뗄 때 눌리지 않는다
    if (e.code !== 'Space') return;
    if (!isTyping(e.target as HTMLElement)) e.preventDefault();
    spaceHeld = false; syncCursor();
  });
  window.addEventListener('blur', () => { spaceHeld = false; syncCursor(); });
  // 닫으면 큰 이미지(디코드된 비트맵·미리보기)를 놓아 메모리를 돌려준다. 다시 열 때 원본(.sabari 안의 바이트)에서 다시 디코드한다.
  dlg.addEventListener('close', () => { bmp?.close(); bmp = null; if (url) { URL.revokeObjectURL(url); url = ''; } img.removeAttribute('src'); pointers.clear(); panMode = false; spaceHeld = false; handTool = false; $('btnHandTool').setAttribute('aria-pressed', 'false'); syncCursor(); regHist.length = 0; syncUndo(); drag = null; });
  return { open };
}
