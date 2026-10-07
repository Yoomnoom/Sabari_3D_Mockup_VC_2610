// 면 레이어 구역(디자인 탭): 디자인 이미지(맨 위) · 바탕 레이어들(여러 장, 아래부터 쌓임) · 면 바탕색(잠금).
// 선택한 레이어에 기존 이미지 조절 컨트롤(맞춤·위치·확대·회전·반전, 3D 화면에서 마우스로 이동 M)이 적용된다. 합성은 transform.ts 의 bake 가 맡는다.
import { FaceData, FaceId, MAX_UNDERS, UnderData, bgFor, decodeUnder, newUnderId } from './faces';
import { defaultUnderlay } from './transform';

export interface LayerDeps {
  faces: Record<FaceId, FaceData>;
  current(): FaceId;
  /** 현재 면과 같은 그룹(뚜껑/하단 몸통)의 면 id 와 그룹 이름 */
  groupOf(id: FaceId): { ids: FaceId[]; label: string };
  pushHistory(id: FaceId, force?: boolean): void;
  pushHistoryMany(ids: FaceId[]): void;
  apply(id: FaceId): void;
  /** 이미지 파일 검사(형식·크기). 문제가 있으면 던진다 */
  inspect(file: Blob): Promise<void>;
  run(fn: () => Promise<void>): Promise<void>;
}

const cloneUnder = (u: UnderData): UnderData => ({ ...u, id: newUnderId(), state: { ...u.state } });

export function initLayers(d: LayerDeps) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  /** 'top' = 디자인 이미지, 그 외 = 바탕 레이어 id */
  let sel = 'top';

  const cur = () => d.faces[d.current()];
  const selUnder = (f: FaceData): UnderData | null => (sel === 'top' ? null : f.unders.find((u) => u.id === sel) ?? null);
  const fixSel = (f: FaceData) => { if (sel !== 'top' && !f.unders.some((u) => u.id === sel)) sel = 'top'; };

  function thumb(u: UnderData): HTMLCanvasElement {
    const c = document.createElement('canvas'); c.width = 28; c.height = 28; c.className = 'layer-thumb';
    const g = c.getContext('2d')!; g.fillStyle = '#f1efea'; g.fillRect(0, 0, 28, 28);
    const k = Math.min(28 / u.iw, 28 / u.ih); const w = u.iw * k, h = u.ih * k;
    try { g.drawImage(u.img, (28 - w) / 2, (28 - h) / 2, w, h); } catch { /* 이미 닫힌 비트맵이면 빈 칸으로 둔다 */ }
    return c;
  }

  function render() {
    const f = cur(); fixSel(f);
    const list = $('layerList'); list.innerHTML = '';
    const row = (cls: string, build: (li: HTMLLIElement) => void, key?: string) => { const li = document.createElement('li'); li.className = 'layer-row ' + cls; if (key) li.dataset.layer = key; build(li); list.appendChild(li); };
    const pickBtn = (li: HTMLLIElement, key: string, label: string, sub: string) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'layer-pick'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(sel === key));
      b.innerHTML = '<span class="layer-name"></span><small class="layer-sub"></small>';
      (b.querySelector('.layer-name') as HTMLElement).textContent = label; (b.querySelector('.layer-sub') as HTMLElement).textContent = sub;
      b.onclick = () => { sel = key; d.apply(d.current()); };
      li.appendChild(b);
    };
    const designRow = () => row(sel === 'top' ? 'active' : '', (li) => pickBtn(li, 'top', f.img ? '디자인 이미지' : '디자인 이미지 (없음)', f.img ? (f.name ?? '') : '이미지를 선택하세요'), 'top');
    const layerRows = () => { // 위쪽 레이어가 목록 위에 온다
      for (const u of [...f.unders].reverse()) row(sel === u.id ? 'active' : '', (li) => {
        li.appendChild(thumb(u));
        pickBtn(li, u.id, u.name ?? '바탕 레이어', `${u.state.visible ? '보임' : '숨김'} · 불투명도 ${Math.round(u.state.opacity * 100)}%`);
        const eye = document.createElement('button');
        eye.type = 'button'; eye.className = 'layer-eye'; eye.setAttribute('aria-pressed', String(u.state.visible)); eye.setAttribute('aria-label', `${u.name ?? '바탕 레이어'} 보이기`); eye.title = '보이기·숨기기';
        eye.textContent = u.state.visible ? '👁 보이기' : '숨김';
        eye.onclick = () => { d.pushHistory(d.current(), true); u.state.visible = !u.state.visible; d.apply(d.current()); };
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'layer-del'; del.setAttribute('aria-label', `${u.name ?? '바탕 레이어'} 삭제`); del.title = '이 레이어 삭제'; del.textContent = '✕';
        del.onclick = () => removeLayer(u.id);
        li.append(eye, del);
      }, u.id);
    };
    if (f.underOnTop) { layerRows(); designRow(); } else { designRow(); layerRows(); }
    if (!f.unders.length) row('empty', (li) => { const s = document.createElement('span'); s.className = 'layer-empty'; s.textContent = '바탕 레이어 없음'; li.appendChild(s); });
    row('locked', (li) => {
      const sw = document.createElement('i'); sw.className = 'layer-swatch'; sw.style.background = bgFor(d.current()); li.appendChild(sw);
      const s = document.createElement('span'); s.className = 'layer-locked'; s.textContent = '면 바탕색 (잠금)'; li.appendChild(s);
    });
    list.setAttribute('aria-label', `레이어 목록 (위가 앞): ${f.underOnTop ? '바탕 레이어가 디자인 이미지 위에 있음' : '디자인 이미지가 바탕 레이어 위에 있음'}`);

    const u = selUnder(f), has = f.unders.length > 0, idx = u ? f.unders.indexOf(u) : -1;
    $<HTMLButtonElement>('btnUnderAdd').textContent = '바탕 레이어 추가';
    $<HTMLButtonElement>('btnUnderAdd').disabled = !f.img || f.unders.length >= MAX_UNDERS;
    $('btnUnderAdd').title = !f.img ? '디자인 이미지를 먼저 선택하세요' : f.unders.length >= MAX_UNDERS ? `바탕 레이어는 면마다 최대 ${MAX_UNDERS}장입니다` : '';
    const reason = '바탕 레이어를 추가하면 쓸 수 있습니다';
    $<HTMLButtonElement>('btnUnderSwap').disabled = !has; $<HTMLButtonElement>('btnUnderAll').disabled = !has;
    $<HTMLButtonElement>('btnUnderDel').disabled = !u; $<HTMLButtonElement>('btnUnderUp').disabled = !u || idx >= f.unders.length - 1; $<HTMLButtonElement>('btnUnderDown').disabled = !u || idx <= 0;
    for (const id of ['btnUnderSwap', 'btnUnderAll']) $(id).title = has ? '' : reason;
    $('btnUnderDel').title = u ? '선택한 레이어를 삭제합니다' : '삭제할 바탕 레이어를 목록에서 고르세요';
    $('btnUnderUp').title = u ? (idx >= f.unders.length - 1 ? '이미 맨 위입니다' : '선택한 레이어를 위로') : '목록에서 바탕 레이어를 고르세요';
    $('btnUnderDown').title = u ? (idx <= 0 ? '이미 맨 아래입니다' : '선택한 레이어를 아래로') : '목록에서 바탕 레이어를 고르세요';
    const g = d.groupOf(d.current());
    $<HTMLButtonElement>('btnUnderAll').textContent = `같은 바탕을 ${g.label} ${g.ids.length}면에 적용`;
    const pct = u ? Math.round(u.state.opacity * 100) : 100;
    $<HTMLInputElement>('underOpR').value = String(pct); $<HTMLInputElement>('underOpN').value = String(pct);
    $<HTMLInputElement>('underOpR').disabled = !u; $<HTMLInputElement>('underOpN').disabled = !u;
    $('underInfo').textContent = u ? `선택: ${u.name ?? '바탕 레이어'} · 원본 ${u.ow}×${u.oh}px${Math.max(u.ow, u.oh) > 4096 ? ` (표시용 ${u.iw}×${u.ih}px로 축소)` : ''}` : has ? `바탕 레이어 ${f.unders.length}장 · 목록에서 고르면 위치·크기를 고칠 수 있습니다` : '';
    $('fitTileLabel').hidden = !u; // 반복은 바탕 레이어에서만
  }

  function removeLayer(id: string) {
    const f = cur(); const i = f.unders.findIndex((x) => x.id === id); if (i < 0) return;
    d.pushHistory(d.current(), true);
    f.unders.splice(i, 1);
    if (sel === id) sel = f.unders[Math.min(i, f.unders.length - 1)]?.id ?? 'top';
    d.apply(d.current());
  }

  $<HTMLButtonElement>('btnUnderAdd').onclick = () => $<HTMLInputElement>('fileUnder').click();
  $<HTMLInputElement>('fileUnder').onchange = () => {
    const input = $<HTMLInputElement>('fileUnder'), file = input.files?.[0]; input.value = '';
    if (!file) return;
    void d.run(async () => {
      await d.inspect(file);
      const id = d.current(), f = d.faces[id];
      if (!f.img) return;
      if (f.unders.length >= MAX_UNDERS) throw new Error(`바탕 레이어는 면마다 최대 ${MAX_UNDERS}장입니다.`);
      const dec = await decodeUnder(file).catch(() => { throw new Error('이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.'); });
      d.pushHistory(id, true);
      const nu: UnderData = { id: newUnderId(), state: defaultUnderlay(), blob: file, name: file.name, ...dec };
      f.unders.push(nu); // 새 레이어는 맨 위(바탕 레이어들 중 가장 앞)에 쌓인다
      sel = nu.id;
      d.apply(id);
    });
  };
  $<HTMLButtonElement>('btnUnderSwap').onclick = () => { const f = cur(); if (!f.unders.length) return; d.pushHistory(d.current(), true); f.underOnTop = !f.underOnTop; d.apply(d.current()); };
  $<HTMLButtonElement>('btnUnderDel').onclick = () => { const u = selUnder(cur()); if (u) removeLayer(u.id); };
  const move = (delta: 1 | -1) => { const f = cur(), u = selUnder(f); if (!u) return; const i = f.unders.indexOf(u), j = i + delta; if (j < 0 || j >= f.unders.length) return; d.pushHistory(d.current(), true); [f.unders[i], f.unders[j]] = [f.unders[j], f.unders[i]]; d.apply(d.current()); };
  $<HTMLButtonElement>('btnUnderUp').onclick = () => move(1);
  $<HTMLButtonElement>('btnUnderDown').onclick = () => move(-1);
  const setOpacity = (v: number) => { const u = selUnder(cur()); if (!u || Number.isNaN(v)) return; d.pushHistory(d.current()); u.state.opacity = Math.min(1, Math.max(0, v / 100)); d.apply(d.current()); };
  $<HTMLInputElement>('underOpR').oninput = () => setOpacity(Number($<HTMLInputElement>('underOpR').value));
  $<HTMLInputElement>('underOpN').onchange = () => setOpacity(Number($<HTMLInputElement>('underOpN').value));
  $<HTMLButtonElement>('btnUnderAll').onclick = () => { // 같은 그룹의 모든 면에 같은 바탕 레이어들을 넣는다(실행 취소 한 번에 되돌림)
    const f = cur(); if (!f.unders.length) return;
    const g = d.groupOf(d.current());
    d.pushHistoryMany(g.ids);
    for (const id of g.ids) { const t = d.faces[id]; if (t === f) continue; t.unders = f.unders.map(cloneUnder); t.underOnTop = f.underOnTop; }
    for (const id of g.ids) d.apply(id);
  };

  return {
    render,
    underSelected: () => !!selUnder(cur()),
    /** 선택한 레이어의 변환 상태(편집 대상) */
    activeState: (f: FaceData) => { const u = selUnder(f); return u ? u.state : f.state; },
    select: (id: string) => { sel = id; },
  };
}
