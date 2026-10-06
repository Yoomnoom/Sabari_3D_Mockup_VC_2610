// 면 레이어 구역(디자인 탭): 위 레이어(디자인 이미지) · 바탕 이미지(아래 레이어) · 면 바탕색(잠금).
// 선택한 레이어에 기존 이미지 조절 컨트롤(맞춤·위치·확대·회전·반전)이 적용된다. 합성은 transform.ts 의 bake 가 맡는다.
import { FaceData, FaceId, UnderData, bgFor, decodeUnder } from './faces';
import { defaultUnderlay } from './transform';

export type LayerSel = 'top' | 'under';

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

const cloneUnder = (u: UnderData): UnderData => ({ ...u, state: { ...u.state } });

export function initLayers(d: LayerDeps) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  let sel: LayerSel = 'top';

  const cur = () => d.faces[d.current()];
  const underSelected = () => sel === 'under' && !!cur().under;

  function render() {
    const f = cur(), u = f.under;
    if (sel === 'under' && !u) sel = 'top';
    const list = $('layerList');
    list.innerHTML = '';
    const row = (key: string, cls: string, build: (li: HTMLLIElement) => void) => { const li = document.createElement('li'); li.className = 'layer-row ' + cls; li.dataset.layer = key; build(li); list.appendChild(li); };
    const pick = (li: HTMLLIElement, key: LayerSel, label: string, sub: string) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'layer-pick'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(sel === key));
      b.innerHTML = '<span class="layer-name"></span><small class="layer-sub"></small>';
      (b.querySelector('.layer-name') as HTMLElement).textContent = label; (b.querySelector('.layer-sub') as HTMLElement).textContent = sub;
      b.onclick = () => { sel = key; d.apply(d.current()); };
      li.appendChild(b);
    };
    const designRow = () => row('top', sel === 'top' ? 'active' : '', (li) => pick(li, 'top', f.img ? '디자인 이미지' : '디자인 이미지 (없음)', f.img ? (f.name ?? '') : '이미지를 선택하세요'));
    const underRow = () => {
      if (!u) return row('under', 'empty', (li) => { const s = document.createElement('span'); s.className = 'layer-empty'; s.textContent = '바탕 이미지 없음'; li.appendChild(s); });
      row('under', sel === 'under' ? 'active' : '', (li) => {
        pick(li, 'under', '바탕 이미지', `${u.name ?? '이미지'} · ${u.state.visible ? '보임' : '숨김'} · 불투명도 ${Math.round(u.state.opacity * 100)}%`);
        const eye = document.createElement('button');
        eye.type = 'button'; eye.className = 'layer-eye'; eye.setAttribute('aria-pressed', String(u.state.visible)); eye.setAttribute('aria-label', '바탕 이미지 보이기');
        eye.textContent = u.state.visible ? '👁 보이기' : '숨김';
        eye.onclick = () => { d.pushHistory(d.current(), true); u.state.visible = !u.state.visible; d.apply(d.current()); };
        li.appendChild(eye);
      });
    };
    if (f.underOnTop) { underRow(); designRow(); } else { designRow(); underRow(); }
    row('color', 'locked', (li) => {
      const sw = document.createElement('i'); sw.className = 'layer-swatch'; sw.style.background = bgFor(d.current()); li.appendChild(sw);
      const s = document.createElement('span'); s.className = 'layer-locked'; s.textContent = '면 바탕색 (잠금)'; li.appendChild(s);
    });
    list.setAttribute('aria-label', `레이어 목록 (위가 앞): ${f.underOnTop ? '바탕 이미지가 디자인 이미지 위에 있음' : '디자인 이미지가 바탕 이미지 위에 있음'}`);

    $<HTMLButtonElement>('btnUnderAdd').textContent = u ? '바탕 이미지 바꾸기' : '바탕 이미지 추가';
    $<HTMLButtonElement>('btnUnderAdd').disabled = !f.img;
    $('btnUnderAdd').title = f.img ? '' : '디자인 이미지를 먼저 선택하세요'; // 비활성 이유(작업 32B)
    for (const id of ['btnUnderSwap', 'btnUnderDel', 'btnUnderAll']) $(id).title = u ? '' : '바탕 이미지를 추가하면 쓸 수 있습니다';
    $<HTMLButtonElement>('btnUnderSwap').disabled = !u;
    $<HTMLButtonElement>('btnUnderDel').disabled = !u;
    const g = d.groupOf(d.current());
    $<HTMLButtonElement>('btnUnderAll').disabled = !u;
    $<HTMLButtonElement>('btnUnderAll').textContent = `같은 바탕을 ${g.label} ${g.ids.length}면에 적용`;
    const pct = u ? Math.round(u.state.opacity * 100) : 100;
    $<HTMLInputElement>('underOpR').value = String(pct); $<HTMLInputElement>('underOpN').value = String(pct);
    $<HTMLInputElement>('underOpR').disabled = !u; $<HTMLInputElement>('underOpN').disabled = !u;
    $('underInfo').textContent = u ? `바탕 원본 ${u.ow}×${u.oh}px${Math.max(u.ow, u.oh) > u.iw && Math.max(u.ow, u.oh) > 4096 ? ` (표시용 ${u.iw}×${u.ih}px로 축소)` : ''}` : '';
    $('fitTileLabel').hidden = !underSelected(); // 반복은 바탕 이미지에서만
  }

  $<HTMLButtonElement>('btnUnderAdd').onclick = () => $<HTMLInputElement>('fileUnder').click();
  $<HTMLInputElement>('fileUnder').onchange = () => {
    const input = $<HTMLInputElement>('fileUnder'), file = input.files?.[0]; input.value = '';
    if (!file) return;
    void d.run(async () => {
      await d.inspect(file);
      const dec = await decodeUnder(file).catch(() => { throw new Error('이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.'); });
      const id = d.current(), f = d.faces[id];
      if (!f.img) return;
      d.pushHistory(id, true);
      f.under = { state: f.under ? { ...f.under.state } : defaultUnderlay(), blob: file, name: file.name, ...dec };
      sel = 'under';
      d.apply(id);
    });
  };
  $<HTMLButtonElement>('btnUnderSwap').onclick = () => { const f = cur(); if (!f.under) return; d.pushHistory(d.current(), true); f.underOnTop = !f.underOnTop; d.apply(d.current()); };
  $<HTMLButtonElement>('btnUnderDel').onclick = () => { const f = cur(); if (!f.under) return; d.pushHistory(d.current(), true); f.under = null; f.underOnTop = false; sel = 'top'; d.apply(d.current()); };
  const setOpacity = (v: number) => { const f = cur(); if (!f.under || Number.isNaN(v)) return; d.pushHistory(d.current()); f.under.state.opacity = Math.min(1, Math.max(0, v / 100)); d.apply(d.current()); };
  $<HTMLInputElement>('underOpR').oninput = () => setOpacity(Number($<HTMLInputElement>('underOpR').value));
  $<HTMLInputElement>('underOpN').onchange = () => setOpacity(Number($<HTMLInputElement>('underOpN').value));
  $<HTMLButtonElement>('btnUnderAll').onclick = () => { // 같은 그룹의 모든 면에 같은 바탕을 넣는다(실행 취소 한 번에 되돌림)
    const f = cur(); if (!f.under) return;
    const g = d.groupOf(d.current());
    d.pushHistoryMany(g.ids);
    for (const id of g.ids) { const t = d.faces[id]; if (t === f) continue; t.under = cloneUnder(f.under); t.underOnTop = f.underOnTop; }
    for (const id of g.ids) d.apply(id);
  };

  return {
    render,
    underSelected,
    /** 선택한 레이어의 변환 상태(편집 대상) */
    activeState: (f: FaceData) => (sel === 'under' && f.under ? f.under.state : f.state),
    select: (s: LayerSel) => { sel = s; },
  };
}
