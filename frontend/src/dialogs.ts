// 작업 17: 저장 이름 대화상자 · 확인/오류 대화상자 · 파일 이름 규칙. 저장되는 파일 내용은 건드리지 않는다(이름과 저장 방식만 다룬다).
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type SaveKind = 'sabari' | 'glb' | 'png' | 'svg';
const KIND: Record<SaveKind, { ext: string; mime: string; label: string }> = {
  sabari: { ext: '.sabari', mime: 'application/zip', label: '프로젝트 파일' },
  glb: { ext: '.glb', mime: 'model/gltf-binary', label: 'GLB 파일' },
  png: { ext: '.png', mime: 'image/png', label: 'PNG 이미지' },
  svg: { ext: '.svg', mime: 'image/svg+xml', label: '칼선 가이드 SVG' },
};

export const ASK_KEY = 'sabari.askSaveName'; // '0' = 이름을 묻지 않고 기본 이름으로 저장(이 브라우저에만 기억)
export const askEnabled = (): boolean => { try { return localStorage.getItem(ASK_KEY) !== '0'; } catch { return true; } };
export const setAskEnabled = (on: boolean) => { try { localStorage.setItem(ASK_KEY, on ? '1' : '0'); } catch { /* 저장소를 못 쓰면 기억만 안 한다 */ } };

/** 금지 문자(\ / : * ? " < > |, 제어 문자)를 _ 로 바꾸고 앞뒤 공백·점을 정리한다. */
export const sanitizeFileName = (name: string): string => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 80);

const pad = (n: number) => String(n).padStart(2, '0');
/** 기본 이름(확장자 제외): 예) 사바리_목업_20261005 */
export const defaultStem = (prefix: string, d = new Date()): string => `${prefix}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

const used = new Map<string, number>();
/** 이 세션에서 같은 이름으로 또 저장하면 " (2)", " (3)" 번호를 붙인다. */
export function uniqueName(stem: string, ext: string): string {
  const key = stem + ext;
  const n = (used.get(key) ?? 0) + 1;
  used.set(key, n);
  return n === 1 ? stem : `${stem} (${n})`;
}

// ---------- 공통 모달 도우미 ----------
function openModal(dlg: HTMLDialogElement): Promise<string> {
  return new Promise((resolve) => {
    const done = () => { dlg.removeEventListener('close', done); resolve(dlg.returnValue); };
    dlg.addEventListener('close', done);
    dlg.returnValue = 'cancel';
    dlg.showModal();
  });
}

/** 확인 대화상자. 취소·Esc는 false. kind 는 e2e가 상황을 구분하는 데 쓴다. */
export async function confirmDialog(o: { kind: string; title: string; text: string; ok?: string; cancel?: string }): Promise<boolean> {
  const dlg = $<HTMLDialogElement>('msgDlg');
  dlg.dataset.kind = o.kind;
  $('msgDlgTitle').textContent = o.title;
  $('msgDlgText').textContent = o.text;
  const ok = $<HTMLButtonElement>('msgDlgOk'), cancel = $<HTMLButtonElement>('msgDlgCancel');
  ok.textContent = o.ok ?? '확인'; cancel.textContent = o.cancel ?? '취소'; cancel.hidden = false;
  ok.onclick = () => dlg.close('ok'); cancel.onclick = () => dlg.close('cancel');
  return (await openModal(dlg)) === 'ok';
}

/** 안내·오류 대화상자(버튼 하나). */
export async function infoDialog(o: { kind: 'info' | 'error'; title: string; text: string; ok?: string }): Promise<void> {
  const dlg = $<HTMLDialogElement>('msgDlg');
  dlg.dataset.kind = o.kind;
  $('msgDlgTitle').textContent = o.title;
  $('msgDlgText').textContent = o.text;
  const ok = $<HTMLButtonElement>('msgDlgOk'), cancel = $<HTMLButtonElement>('msgDlgCancel');
  ok.textContent = o.ok ?? '확인'; cancel.hidden = true;
  ok.onclick = () => dlg.close('ok');
  await openModal(dlg);
}

/** 저장 이름 대화상자: 확인하면 (금지 문자를 바꾼) 이름(확장자 제외), 취소하면 null. */
function askName(kind: SaveKind, stem: string): Promise<string | null> {
  const dlg = $<HTMLDialogElement>('saveDlg');
  const input = $<HTMLInputElement>('saveName'), ok = $<HTMLButtonElement>('saveOk'), err = $('saveNameErr'), noAsk = $<HTMLInputElement>('saveNoAsk');
  $('saveDlgKind').textContent = `${KIND[kind].label}로 저장합니다. 확장자(${KIND[kind].ext})는 바뀌지 않습니다.`;
  $('saveExt').textContent = KIND[kind].ext;
  input.value = stem; noAsk.checked = false;
  const check = () => { const empty = sanitizeFileName(input.value) === ''; err.hidden = !empty; ok.disabled = empty; };
  input.oninput = check; check();
  const submit = () => { if (!ok.disabled) dlg.close('ok'); };
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  ok.onclick = submit;
  $<HTMLButtonElement>('saveCancel').onclick = () => dlg.close('cancel');
  const p = openModal(dlg);
  input.focus(); input.select();
  return p.then((r) => {
    if (r !== 'ok') return null;
    if (noAsk.checked) { setAskEnabled(false); const opt = document.getElementById('optAskName') as HTMLInputElement | null; if (opt) opt.checked = false; }
    return sanitizeFileName(input.value);
  });
}

const nativePicker = (): boolean => typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function' && !navigator.webdriver;

/**
 * 파일 저장. 지원 브라우저는 showSaveFilePicker(이름·위치 창)를 우선 쓰고, 아니면 이름 대화상자(끄면 기본 이름)로 받아 내려받는다.
 * 취소하면 저장하지 않는다. 실패하면 오류 대화상자를 띄운다. 저장되는 내용(blob)은 호출한 쪽이 정한 그대로다.
 */
export async function saveFile(blob: Blob, kind: SaveKind, stem: string, download: (b: Blob, name: string) => void): Promise<{ saved: boolean; name: string | null }> {
  const { ext, mime, label } = KIND[kind];
  try {
    if (nativePicker()) {
      try {
        const w = window as unknown as { showSaveFilePicker: (o: object) => Promise<{ name: string; createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };
        const h = await w.showSaveFilePicker({ suggestedName: stem + ext, types: [{ description: label, accept: { [mime]: [ext] } }] });
        const wr = await h.createWritable(); await wr.write(blob); await wr.close();
        return { saved: true, name: h.name };
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return { saved: false, name: null }; // 사용자가 취소
        throw e;
      }
    }
    let name = stem;
    if (askEnabled()) { const r = await askName(kind, stem); if (r === null) return { saved: false, name: null }; name = r; }
    const file = uniqueName(name, ext) + ext;
    download(blob, file);
    return { saved: true, name: file };
  } catch (e) {
    console.error(e);
    await infoDialog({ kind: 'error', title: '저장하지 못했습니다', text: `${label}를 저장하는 중 문제가 생겼습니다. 다시 시도해 주세요.\n(${e instanceof Error ? e.message : String(e)})` });
    return { saved: false, name: null };
  }
}
