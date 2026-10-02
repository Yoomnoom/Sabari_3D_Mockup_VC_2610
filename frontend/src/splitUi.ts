// 칼선 이미지 분할 화면: 칼선 위에서 만든 디자인 한 장을 템플릿의 면 배치 목록(dieline.ts)대로 면별 이미지로 나눈다.
// 자동으로 나눈 결과가 어긋나면 면 사각형을 끌어 위치·크기를 직접 조정할 수 있다.
import { BoxParams } from './params';
import { DieKind, Dieline, Rect, aspectMismatch, buildDieline, regionsFor } from './dieline';
import type { FaceId } from './faceDefs';
import type { DielineSave } from './project';

export interface SplitResult {
  source: Blob; name: string | null; bleedMm: number; kind: DieKind;
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

/** 칼선 이미지의 한 영역을 잘라 면 이미지(정립)로 만든다. 시계방향 rot 만큼 돌려 놓았던 것을 되돌린다. */
export async function cropFace(src: ImageBitmap, r: Rect, rot: number): Promise<Blob> {
  const swap = rot === 90 || rot === 270;
  const w = Math.max(1, Math.round(swap ? r.h : r.w)), h = Math.max(1, Math.round(swap ? r.w : r.h));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); // 이미지 밖(영역이 가장자리를 넘은 부분)은 흰색
  g.translate(w / 2, h / 2);
  g.rotate((-rot * Math.PI) / 180);
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, r.x, r.y, r.w, r.h, -r.w / 2, -r.h / 2, r.w, r.h);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('면 이미지를 만들지 못했습니다.'))), 'image/png'));
}

export function initSplitUi(ctx: SplitCtx) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dlg = $<HTMLDialogElement>('splitDlg');
  const img = $<HTMLImageElement>('splitImg');
  const svg = document.getElementById('splitSvg') as unknown as SVGSVGElement;
  const NS = 'http://www.w3.org/2000/svg';

  let source: Blob | null = null, sourceName: string | null = null, bmp: ImageBitmap | null = null, url = '';
  let kind: DieKind = 'lid', bleed = 3;
  let layout: Dieline;
  let regions: Record<string, Rect> = {}, rots: Record<string, Rot> = {};
  let active: string | null = null;
  let busy = false;

  const autoRegions = () => {
    layout = buildDieline(ctx.params(), kind);
    regions = regionsFor(layout, bmp!.width, bmp!.height, bleed);
    rots = Object.fromEntries(layout.faces.map((f) => [f.id, f.rotationDeg])) as Record<string, Rot>;
    warn();
  };
  const warn = () => {
    const m = aspectMismatch(layout, bmp!.width, bmp!.height, bleed);
    const el = $('splitWarn');
    el.hidden = m <= 0.02;
    el.textContent = `이미지 비율이 칼선(재단 여분 ${bleed}mm 포함)의 비율과 ${(m * 100).toFixed(1)}% 다릅니다. 재단 여분 값이나 이미지가 맞는지 확인하거나, 사각형을 직접 조정하세요.`;
  };

  function draw() {
    svg.setAttribute('viewBox', `0 0 ${bmp!.width} ${bmp!.height}`);
    svg.innerHTML = '';
    layout.faces.forEach((f, i) => {
      const r = regions[f.id];
      const col = COLORS[i % COLORS.length];
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('data-face', f.id);
      const rect = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h, fill: col, 'fill-opacity': active === f.id ? '0.28' : '0.14', stroke: col, 'stroke-width': active === f.id ? '3' : '2', 'vector-effect': 'non-scaling-stroke' })) rect.setAttribute(k, String(v));
      rect.setAttribute('class', 'split-rect'); rect.setAttribute('data-role', 'move');
      g.appendChild(rect);
      const label = document.createElementNS(NS, 'text');
      label.textContent = ctx.faceLabel(f.id as FaceId);
      for (const [k, v] of Object.entries({ x: r.x + r.w / 2, y: r.y + r.h / 2, fill: col, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': Math.max(12, Math.min(r.w, r.h) / 6), 'pointer-events': 'none', 'font-weight': '700', stroke: '#fff', 'stroke-width': '0.6', 'paint-order': 'stroke' })) label.setAttribute(k, String(v));
      g.appendChild(label);
      const hs = Math.max(8, Math.min(bmp!.width, bmp!.height) / 70); // 모서리 조절점 크기
      for (const [cx, cy, name] of [[r.x, r.y, 'nw'], [r.x + r.w, r.y, 'ne'], [r.x, r.y + r.h, 'sw'], [r.x + r.w, r.y + r.h, 'se']] as [number, number, string][]) {
        const h = document.createElementNS(NS, 'rect');
        for (const [k, v] of Object.entries({ x: cx - hs, y: cy - hs, width: hs * 2, height: hs * 2, fill: '#fff', stroke: col, 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' })) h.setAttribute(k, String(v));
        h.setAttribute('class', 'split-handle'); h.setAttribute('data-role', name);
        g.appendChild(h);
      }
      svg.appendChild(g);
    });
    renderList();
  }

  function renderList() {
    const box = $('splitList');
    box.innerHTML = '';
    layout.faces.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'split-row' + (active === f.id ? ' active' : '');
      const r = regions[f.id];
      row.innerHTML = `<span class="chip" style="background:${COLORS[i % COLORS.length]}"></span><b>${ctx.faceLabel(f.id as FaceId)}</b><small>${Math.round(r.w)}×${Math.round(r.h)}px</small>`;
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `${ctx.faceLabel(f.id as FaceId)} 회전`);
      for (const d of [0, 90, 180, 270]) sel.add(new Option(`회전 ${d}°`, String(d), false, rots[f.id] === d));
      sel.onchange = () => { rots[f.id] = Number(sel.value) as Rot; };
      row.appendChild(sel);
      row.onclick = () => { active = f.id; draw(); };
      box.appendChild(row);
    });
  }

  // ---- 드래그: 이동 / 모서리 크기 조정 ----
  let drag: { id: string; role: string; start: [number, number]; orig: Rect } | null = null;
  const toImg = (e: PointerEvent): [number, number] => {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return [q.x, q.y];
  };
  svg.addEventListener('pointerdown', (e) => {
    const t = e.target as SVGElement;
    const role = t.getAttribute('data-role'), id = t.closest('g')?.getAttribute('data-face');
    if (!role || !id) return;
    active = id; drag = { id, role, start: toImg(e), orig: { ...regions[id] } };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    draw();
  });
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
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

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
    $<HTMLSelectElement>('splitKind').value = kind;
    $<HTMLInputElement>('splitBleed').value = String(bleed);
    autoRegions();
    if (saved && Object.keys(saved.regions).length) { // 저장된 조정값 복원
      for (const [k, v] of Object.entries(saved.regions)) if (v) regions[k] = { ...v };
      for (const [k, v] of Object.entries(saved.rotations ?? {})) if (v !== undefined) rots[k] = v as Rot;
    }
    active = layout.faces[0].id;
    draw();
    if (!dlg.open) dlg.showModal();
  }

  $('splitKind').onchange = () => { kind = ($('splitKind') as HTMLSelectElement).value as DieKind; autoRegions(); draw(); };
  $('splitBleed').oninput = () => { const v = Number(($('splitBleed') as HTMLInputElement).value); if (Number.isFinite(v) && v >= 0 && v <= 50) { bleed = v; autoRegions(); draw(); } };
  $('btnSplitAuto').onclick = () => { autoRegions(); draw(); };
  $('btnSplitCancel').onclick = () => dlg.close();
  $('btnSplitApply').onclick = async () => {
    if (busy || !bmp || !source) return;
    busy = true; ($('btnSplitApply') as HTMLButtonElement).disabled = true;
    try {
      const faces: SplitResult['faces'] = [];
      for (const f of layout.faces) faces.push({ id: f.id as FaceId, blob: await cropFace(bmp, regions[f.id], rots[f.id]), name: `칼선분할_${ctx.faceLabel(f.id as FaceId)}.png` });
      await ctx.apply({ source, name: sourceName, bleedMm: bleed, kind, regions: { ...regions } as SplitResult['regions'], rotations: { ...rots } as SplitResult['rotations'], faces });
      dlg.close();
    } catch (e) {
      $('splitWarn').hidden = false;
      $('splitWarn').textContent = e instanceof Error ? e.message : String(e);
    } finally { busy = false; ($('btnSplitApply') as HTMLButtonElement).disabled = false; }
  };
  dlg.addEventListener('keydown', (e) => e.stopPropagation()); // 대화상자 안에서는 앱 단축키가 동작하지 않게

  return { open };
}
