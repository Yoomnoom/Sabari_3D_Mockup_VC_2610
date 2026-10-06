// 다른 .sabari 프로젝트에서 원하는 면만 현재 프로젝트로 가져오는 대화상자.
// 원본은 신뢰할 수 없는 입력이다: 읽기는 unpackProject(버전 검사·형식 검사·한국어 오류)를 그대로 쓰고, 고르는 동안 현재 작업은 바뀌지 않는다.
import { FACES, FaceId } from './faceDefs';
import type { OpenedProject } from './project';
import { paramsEqual, type BoxParams } from './params';

export interface ImportOptions {
  /** 선택한 면 */
  ids: FaceId[];
  transform: boolean; bgColor: boolean; dieline: boolean; underlay: boolean; params: boolean;
}
export interface ImportDeps {
  read(file: File): Promise<OpenedProject & { paramNote?: string }>;
  currentParams(): BoxParams;
  /** 현재 대상 면에 이미지가 있는지 */
  hasImage(id: FaceId): boolean;
  apply(src: OpenedProject, o: ImportOptions): Promise<void>;
}

const LID = FACES.filter((f) => f.group === 'lid').map((f) => f.id), BASE = FACES.filter((f) => f.group === 'base').map((f) => f.id);

export function initImportFaces(d: ImportDeps) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dlg = $<HTMLDialogElement>('importDlg');
  let src: (OpenedProject & { paramNote?: string }) | null = null, srcName = '';
  let busy = false;
  const checks = new Map<FaceId, HTMLInputElement>();
  const picked = () => FACES.map((f) => f.id).filter((id) => checks.get(id)?.checked && src?.faces[id]?.blob);

  async function thumb(blob: Blob): Promise<HTMLCanvasElement> {
    const bm = await createImageBitmap(blob), k = 72 / Math.max(bm.width, bm.height);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bm.width * k)); cv.height = Math.max(1, Math.round(bm.height * k));
    const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bm, 0, 0, cv.width, cv.height);
    bm.close();
    return cv;
  }

  /** 선택에 따라 옵션 줄의 표시와 "가져오기" 버튼 상태를 맞춘다 */
  function sync() {
    if (!src) return;
    const ids = picked(), has = (g: FaceId[]) => ids.some((i) => g.includes(i));
    const dl = src.dielines ?? {};
    const dieOk = (has(LID) && !!dl.lid && Object.keys(dl.lid.regions).length > 0) || (has(BASE) && !!dl.base && Object.keys(dl.base.regions).length > 0);
    $('impOptDieline').hidden = !dieOk;
    $('impOptUnderlay').hidden = !ids.some((i) => src!.faces[i].under);
    $('impOptParams').hidden = !src.params;
    $('importCount').textContent = `${ids.length}면 선택`;
    $<HTMLButtonElement>('btnImportApply').disabled = busy || ids.length === 0;
  }

  async function show(file: File) {
    busy = true;
    $('importWarn').hidden = true;
    try {
      src = await d.read(file);
    } catch (e) {
      src = null;
      busy = false;
      throw e; // 호출한 쪽이 한국어 오류 대화상자를 띄운다
    }
    srcName = file.name;
    $('importTitleName').textContent = srcName;
    const cur = d.currentParams();
    const same = !src.params || paramsEqual(src.params, cur);
    const fmt = (p: BoxParams) => `${p.baseW}×${p.baseD}×${p.baseH}mm(뚜껑 높이 ${p.lidH}mm)`;
    $('importDims').textContent = src.params ? `원본 박스 ${fmt(src.params)} · 현재 ${fmt(cur)}${same ? ' · 같음' : ''}` : '원본에 박스 치수 정보가 없습니다(이전 형식).';
    $('importDimsWarn').hidden = same;
    const grid = $('importGrid');
    grid.innerHTML = ''; checks.clear();
    for (const f of FACES) {
      const p = src.faces[f.id], has = !!p?.blob;
      const lab = document.createElement('label');
      lab.className = 'imp-cell' + (has ? '' : ' empty');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.disabled = !has; cb.dataset.face = f.id; cb.setAttribute('aria-label', `${f.label} ${has ? '' : '(이미지 없음)'}`.trim());
      cb.onchange = sync; checks.set(f.id, cb);
      const box = document.createElement('span'); box.className = 'imp-thumb';
      if (has) void thumb(p.blob!).then((c) => box.appendChild(c)).catch(() => { box.textContent = '?'; });
      const name = document.createElement('b'); name.textContent = f.short;
      const st = document.createElement('small'); st.textContent = has ? (p.under ? '이미지 · 바탕' : '이미지 있음') : '이미지 없음';
      lab.append(cb, box, name, st);
      grid.appendChild(lab);
    }
    ($('impTransform') as HTMLInputElement).checked = true; ($('impBgColor') as HTMLInputElement).checked = false;
    ($('impDieline') as HTMLInputElement).checked = true; ($('impUnderlay') as HTMLInputElement).checked = true; ($('impParams') as HTMLInputElement).checked = false;
    busy = false;
    sync();
    if (!dlg.open) dlg.showModal();
    (grid.querySelector('input:not(:disabled)') as HTMLElement | null)?.focus();
  }

  const quick = (ids: FaceId[]) => { for (const [id, cb] of checks) cb.checked = !cb.disabled && ids.includes(id); sync(); };
  $('impQuickLid').onclick = () => quick(LID);
  $('impQuickBase').onclick = () => quick(BASE);
  $('impQuickAll').onclick = () => quick(FACES.map((f) => f.id));
  $('impQuickNone').onclick = () => quick([]);
  $('btnImportCancel').onclick = () => dlg.close();
  dlg.addEventListener('close', () => { src = null; checks.clear(); $('importGrid').innerHTML = ''; });
  // 방향키로 격자 이동(스페이스는 체크박스 기본 동작으로 선택)
  $('importGrid').addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (!k.startsWith('Arrow')) return;
    const list = [...$('importGrid').querySelectorAll<HTMLInputElement>('input:not(:disabled)')], i = list.indexOf(e.target as HTMLInputElement);
    if (i < 0) return;
    const step = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : k === 'ArrowUp' ? -5 : 5;
    e.preventDefault(); list[Math.min(list.length - 1, Math.max(0, i + step))]?.focus();
  });
  $('btnImportApply').onclick = async () => {
    if (!src || busy) return;
    const ids = picked();
    if (!ids.length) return;
    busy = true; sync();
    try {
      await d.apply(src, {
        ids, transform: ($('impTransform') as HTMLInputElement).checked, bgColor: ($('impBgColor') as HTMLInputElement).checked,
        dieline: !$('impOptDieline').hidden && ($('impDieline') as HTMLInputElement).checked,
        underlay: !$('impOptUnderlay').hidden && ($('impUnderlay') as HTMLInputElement).checked,
        params: !$('impOptParams').hidden && ($('impParams') as HTMLInputElement).checked,
      });
      dlg.close();
    } catch (e) {
      $('importWarn').hidden = false; $('importWarn').textContent = e instanceof Error ? e.message : String(e);
    } finally { busy = false; sync(); }
  };
  return { open: show };
}
