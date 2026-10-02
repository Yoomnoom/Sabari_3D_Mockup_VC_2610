import { FACES, FaceData, FaceId, FaceSnapshot, decode, faces, rebake, theme } from './faces';
import { Viewer, ViewName } from './viewer';
import { Rotation, defaultState } from './transform';
import { UserError, inspectImage, packProject, unpackProject, OpenedProject } from './project';
import { Draft, delDraft, getDraft, putDraft } from './draft';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const OPEN_MM = 80;

let viewer: Viewer;
let current: FaceId = 'lid_top';
let mode: 'edit' | 'view' = 'edit';

// ---------- 공통 UI 유틸 ----------
function msg(text: string, kind: 'error' | 'ok' = 'error') {
  $('msgText').textContent = text;
  $('msg').className = kind === 'ok' ? 'ok' : '';
  $('msg').hidden = false;
}
const clearMsg = () => { $('msg').hidden = true; };
async function busy<T>(fn: () => Promise<T>): Promise<T | undefined> {
  $('loading').hidden = false;
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    msg(e instanceof Error ? e.message : String(e));
  } finally {
    $('loading').hidden = true;
  }
}
function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- 이미지 적용 ----------
// 실행 취소/다시 실행: 면 하나의 변경 전 상태를 쌓는다. 같은 면의 연속 조작(드래그·슬라이더)은 0.8초 안이면 한 번으로 묶는다.
type Snap = FaceSnapshot & { id: FaceId };
const undoStack: Snap[] = [];
const redoStack: Snap[] = [];
let lastPushAt = 0;
let lastPushId: FaceId | null = null;
const take = (id: FaceId): Snap => { const f = faces[id]; return { id, state: { ...f.state }, blob: f.blob, name: f.name, img: f.img, iw: f.iw, ih: f.ih }; };

function pushHistory(id: FaceId, force = false) {
  const now = performance.now();
  const merge = !force && lastPushId === id && now - lastPushAt < 800;
  lastPushAt = now; lastPushId = id;
  if (merge) return;
  undoStack.push(take(id));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}
function stepHistory(from: Snap[], to: Snap[]): boolean {
  const s = from.pop();
  if (!s) return false;
  to.push(take(s.id));
  const { id, ...rest } = s;
  Object.assign(faces[id], { ...rest, state: { ...rest.state } });
  lastPushId = null;
  apply(id);
  setCurrent(id);
  return true;
}
const undo = () => stepHistory(undoStack, redoStack);
const redo = () => stepHistory(redoStack, undoStack);
const clearHistory = () => { undoStack.length = 0; redoStack.length = 0; lastPushId = null; };

async function setImage(id: FaceId, file: Blob, name: string) {
  const info = await inspectImage(file);
  const { img, iw, ih } = await decode(file).catch(() => { throw new Error('이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.'); });
  const f = faces[id];
  pushHistory(id, true);
  f.blob = file; f.name = name; f.img = img; f.iw = iw; f.ih = ih;
  f.state = defaultState(); // 새 이미지는 항상 "이미지 전체 보이기"로 시작
  clearMsg();
  if (info.warnings.length) msg(info.warnings.join(' '), 'ok');
  apply(id);
  setCurrent(id);
}

/** 상태 변경 후 텍스처·UI를 갱신한다. */
function apply(id: FaceId) {
  const f = faces[id];
  const has = rebake(f);
  viewer.setFaceTexture(id, has ? f.canvas : null);
  renderFaceList();
  if (id === current) syncControls();
  scheduleDraft();
}

// ---------- 면 UI ----------
function renderFaceList() {
  const box = $('faceList');
  box.innerHTML = '';
  for (const fd of FACES) {
    const f = faces[fd.id];
    const b = document.createElement('button');
    b.setAttribute('aria-pressed', String(fd.id === current));
    b.dataset.face = fd.id;
    b.innerHTML = `<span>${fd.label}</span><small>${f.img ? '이미지 있음' : '비어 있음'}</small>`;
    b.onclick = () => setCurrent(fd.id);
    box.appendChild(b);
  }
}

function setCurrent(id: FaceId) {
  current = id;
  viewer.setSelected(id);
  renderFaceList();
  syncControls();
}

function syncControls() {
  const fd = FACES.find((x) => x.id === current)!;
  const f = faces[current];
  $('faceTitle').textContent = fd.label;
  $('faceSize').textContent = `면 크기 ${fd.wMm}×${fd.hMm}mm (비율 ${(fd.wMm / fd.hMm).toFixed(2)}:1)`;
  $('fileInfo').textContent = f.img ? `${f.name} · 원본 ${f.iw}×${f.ih}px` : '이미지 없음';
  $('faceControls').classList.toggle('disabled', !f.img);
  $('facePreview').style.cursor = f.img ? 'grab' : 'default';
  const prev = $<HTMLCanvasElement>('facePreview');
  prev.width = f.canvas.width / 4; prev.height = f.canvas.height / 4;
  const ctx = prev.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, prev.width, prev.height);
  if (f.img) ctx.drawImage(f.canvas, 0, 0, prev.width, prev.height);
  (document.querySelector(`input[name=fit][value=${f.state.fit}]`) as HTMLInputElement).checked = true;
  $('flipX').setAttribute('aria-pressed', String(f.state.flipX));
  $('flipY').setAttribute('aria-pressed', String(f.state.flipY));
  $('rotText').textContent = `${f.state.rotationDeg}°`;
  setPair('scale', f.state.scale * 100);
  setPair('x', f.state.offsetX * 100);
  setPair('y', f.state.offsetY * 100);
  $<HTMLButtonElement>('btnRemove').disabled = !f.img;
  $<HTMLButtonElement>('btnReset').disabled = !f.img;
  $('btnUndo').hidden = undoStack.length === 0;
}
function setPair(k: string, v: number) {
  $<HTMLInputElement>(k + 'R').value = String(Math.round(v));
  $<HTMLInputElement>(k + 'N').value = String(Math.round(v));
}

function edit(fn: (f: FaceData) => void) {
  const f = faces[current];
  if (!f.img) return;
  pushHistory(current);
  fn(f);
  apply(current);
}
const rotate = (d: number) => edit((f) => (f.state.rotationDeg = ((((f.state.rotationDeg + d) % 360) + 360) % 360) as Rotation));

function bindPair(k: string, min: number, max: number, set: (f: FaceData, v: number) => void) {
  const r = $<HTMLInputElement>(k + 'R'), n = $<HTMLInputElement>(k + 'N');
  const on = (src: HTMLInputElement) => () => {
    const v = Math.min(max, Math.max(min, Number(src.value)));
    if (Number.isNaN(v)) return;
    edit((f) => set(f, v));
  };
  r.oninput = on(r);
  n.onchange = on(n);
}

// ---------- 저장 / 열기 ----------
async function saveProject() {
  await busy(async () => {
    const blob = await packProject(
      FACES.map((x) => ({ id: x.id, state: faces[x.id].state, blob: faces[x.id].blob, name: faces[x.id].name })),
      Math.round(viewer.slot === 'editor' ? viewer.getLiftMm() : 0),
      $<HTMLSelectElement>('bgSel').value,
      { face: $<HTMLInputElement>('colFace').value, lid: $<HTMLInputElement>('colLid').value, base: $<HTMLInputElement>('colBase').value },
    );
    download(blob, '사바리_프로젝트.sabari');
    msg('프로젝트를 저장했습니다. (다운로드 폴더의 사바리_프로젝트.sabari)', 'ok');
  });
}

async function applyOpened(proj: OpenedProject) {
  clearHistory();
  for (const fdsc of FACES) {
    const f = faces[fdsc.id];
    const p = proj.faces[fdsc.id];
    f.state = p.state;
    if (p.blob) {
      const d = await decode(p.blob);
      f.blob = p.blob; f.name = p.name; f.img = d.img; f.iw = d.iw; f.ih = d.ih;
    } else {
      f.blob = null; f.name = null; f.img = null; f.iw = f.ih = 0;
    }
    apply(fdsc.id);
  }
  if (proj.colors) applyColors(proj.colors.face, proj.colors.lid, proj.colors.base);
  setLift(proj.lidLiftMm);
  $<HTMLSelectElement>('bgSel').value = proj.background;
  syncControls();
}

async function openProject(file: File) {
  await busy(async () => {
    await applyOpened(await unpackProject(file));
    msg('프로젝트를 열었습니다.', 'ok');
  });
}

// ---------- 임시저장 (IndexedDB) ----------
const COLOR_IDS = ['colFace', 'colLid', 'colBase'] as const;
let draftReady = false;
let draftTimer = 0;
let draftPending = false;
const hasAnyImage = () => FACES.some((f) => faces[f.id].blob);
const timeText = (t: number) => new Date(t).toLocaleString('ko-KR');

function collectDraft(): Draft {
  const [face, lid, base] = COLOR_IDS.map((i) => $<HTMLInputElement>(i).value);
  return {
    savedAt: Date.now(), lidLiftMm: Math.round(viewer.getLiftMm()), colors: { face, lid, base },
    background: $<HTMLSelectElement>('bgSel').value as 'white' | 'transparent',
    faces: Object.fromEntries(FACES.map((x) => [x.id, { state: { ...faces[x.id].state }, blob: faces[x.id].blob, name: faces[x.id].name }])) as Draft['faces'],
  };
}

async function saveDraft(manual: boolean) {
  try {
    const d = collectDraft();
    await putDraft(d);
    $('draftInfo').textContent = `${manual ? '임시저장' : '자동 저장'}됨 · ${timeText(d.savedAt)}`;
    $<HTMLButtonElement>('btnDraftLoad').disabled = false;
    if (manual) msg('임시저장했습니다. (이 브라우저 안에 보관됩니다)', 'ok');
  } catch (e) {
    $('draftInfo').textContent = '임시저장 실패';
    if (manual) msg(e instanceof Error ? e.message : String(e));
  }
}

/** 변경 후 1.5초 뒤 자동 저장. 이미지가 하나도 없을 때는 기존 임시저장을 덮어쓰지 않는다. */
function scheduleDraft() {
  if (!draftReady || !hasAnyImage()) return;
  clearTimeout(draftTimer);
  draftPending = true;
  draftTimer = window.setTimeout(() => { draftPending = false; saveDraft(false); }, 1500);
}

/** 탭을 닫거나 숨길 때, 기다리던 자동 저장을 바로 실행한다(브라우저가 허용하는 범위의 최선). */
function flushDraft() {
  if (!draftPending) return;
  clearTimeout(draftTimer);
  draftPending = false;
  saveDraft(false);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });
window.addEventListener('pagehide', flushDraft);

async function loadDraft() {
  await busy(async () => {
    const d = await getDraft();
    if (!d) throw new UserError('임시저장된 작업이 없습니다.');
    await applyOpened(d);
    msg(`임시저장을 불러왔습니다. (${timeText(d.savedAt)})`, 'ok');
  });
}

async function initDraft() {
  try {
    const d = await getDraft();
    if (d) {
      $('draftInfo').textContent = `임시저장 있음 · ${timeText(d.savedAt)}`;
      $<HTMLButtonElement>('btnDraftLoad').disabled = false;
      msg(`이전 임시저장(${timeText(d.savedAt)})이 있습니다. 왼쪽 아래 "임시저장 불러오기"로 이어서 작업할 수 있습니다.`, 'ok');
    }
  } catch { $('draftInfo').textContent = '이 브라우저에서는 임시저장을 쓸 수 없습니다'; }
  draftReady = true;
}

async function saveGlb() {
  await busy(async () => {
    const buf = await viewer.exportGLB();
    download(new Blob([buf], { type: 'model/gltf-binary' }), '사바리_목업.glb');
    msg(`GLB를 저장했습니다. (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB, 이미지 임베드)`, 'ok');
  });
}

async function savePng() {
  await busy(async () => {
    const blob = await viewer.screenshot($<HTMLSelectElement>('bgSel').value as 'white' | 'transparent');
    download(blob, '사바리_목업.png');
    msg('PNG를 저장했습니다.', 'ok');
  });
}

// ---------- 목업 색상 ----------
let defaultColors = { face: '#ffffff', lid: '#ffffff', base: '#ffffff' };

function applyColors(face: string, lid: string, base: string) {
  $<HTMLInputElement>('colFace').value = face;
  $<HTMLInputElement>('colLid').value = lid;
  $<HTMLInputElement>('colBase').value = base;
  viewer.setPartColor('lid', lid);
  viewer.setPartColor('base', base);
  theme.faceBg = face;
  viewer.setFaceBg(face);
  for (const f of FACES) if (faces[f.id].img) apply(f.id); // 여백 색이 바뀌므로 다시 굽는다
  scheduleDraft();
}

// ---------- 박스 / 뷰어 ----------
function setLift(mm: number) {
  const v = Math.min(150, Math.max(0, Math.round(mm)));
  viewer.setLiftMm(v);
  for (const id of ['liftR', 'liftN', 'vLiftR', 'vLiftN']) $<HTMLInputElement>(id).value = String(v);
  scheduleDraft();
}

function setMode(m: 'edit' | 'view') {
  mode = m;
  $('tabEdit').setAttribute('aria-selected', String(m === 'edit'));
  $('tabView').setAttribute('aria-selected', String(m === 'view'));
  $('editPanel').hidden = m !== 'edit';
  $('editSave').hidden = m !== 'edit';
  $('viewPanel').hidden = m !== 'view';
  viewer.setSlot(m === 'edit' ? 'editor' : 'viewer');
  viewer.setView('iso');
  clearMsg();
  if (m === 'edit') {
    $<HTMLInputElement>('showLid').checked = true;
    $<HTMLInputElement>('showBase').checked = true;
    setLift(viewer.getLiftMm());
  } else {
    setLift(viewer.getLiftMm());
  }
}

async function openGlb(file: File) {
  await busy(async () => {
    const info = await viewer.loadExternal(await file.arrayBuffer()).catch(() => {
      throw new Error('GLB를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.');
    });
    setMode('view');
    $('glbInfo').textContent = `${file.name} · 메시 ${info.meshes}개 · 이미지가 붙은 재질 ${info.textured}개`;
    $('viewLid').hidden = !info.hasLid;
    viewer.setView('iso');
  });
}

async function handleFile(file: File) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.glb')) return openGlb(file);
  if (n.endsWith('.sabari')) { setMode('edit'); return openProject(file); }
  if (mode !== 'edit') setMode('edit');
  await busy(() => setImage(current, file, file.name));
}

// ---------- 화면 설정 (접기·펼치기, 단축키 사용) — 이 브라우저의 localStorage에 기억 ----------
const UI_KEY = 'sabari-ui';
let keysEnabled = true;
const loadUi = (): { open?: Record<string, boolean>; keys?: boolean } => {
  try { return JSON.parse(localStorage.getItem(UI_KEY) ?? '{}'); } catch { return {}; }
};
const saveUi = (patch: object) => { try { localStorage.setItem(UI_KEY, JSON.stringify({ ...loadUi(), ...patch })); } catch { /* 저장 불가 환경이면 기억만 안 한다 */ } };

function initUiPrefs() {
  const ui = loadUi();
  const sections = Array.from(document.querySelectorAll<HTMLDetailsElement>('details[id]'));
  const defaults = new Map(sections.map((d) => [d, d.open]));
  for (const d of sections) {
    if (ui.open && d.id in ui.open) d.open = ui.open[d.id];
    d.addEventListener('toggle', () => saveUi({ open: { ...(loadUi().open ?? {}), [d.id]: d.open } }));
  }
  keysEnabled = ui.keys !== false;
  const opt = $<HTMLInputElement>('optKeys');
  opt.checked = keysEnabled;
  opt.onchange = () => { keysEnabled = opt.checked; saveUi({ keys: keysEnabled }); };
  $('btnUiReset').onclick = () => { for (const [d, open] of defaults) d.open = open; saveUi({ open: {} }); };
  $('btnDraftClear').onclick = async () => {
    if (!window.confirm('이 브라우저에 보관된 임시저장을 삭제할까요?\n(파일로 저장한 .sabari 프로젝트에는 영향이 없습니다.)')) return;
    await busy(async () => {
      await delDraft();
      $('draftInfo').textContent = '임시저장 없음';
      $<HTMLButtonElement>('btnDraftLoad').disabled = true;
      msg('임시저장을 삭제했습니다.', 'ok');
    });
  };
}

// ---------- 시작 ----------
async function init() {
  try {
    viewer = new Viewer($('viewport'));
  } catch {
    msg('이 브라우저에서는 3D 미리보기를 사용할 수 없습니다. Chrome 또는 Edge를 사용해 주세요.');
    return;
  }
  initUiPrefs();
  viewer.onPick = (id) => setCurrent(id);
  viewer.canDrag = () => !!faces[current].img;
  viewer.onWheelFace = (dy) => edit((f) => (f.state.scale = Math.min(3, Math.max(0.25, f.state.scale * Math.exp(-dy * 0.001)))));
  const mm = $<HTMLInputElement>('moveMode');
  mm.onchange = () => {
    viewer.moveMode = mm.checked;
    $('viewport').classList.toggle('moving', mm.checked);
  };
  const clamp1 = (v: number) => Math.min(1, Math.max(-1, v));
  viewer.onDragFace = (du, dv) => edit((f) => { f.state.offsetX = clamp1(f.state.offsetX + du); f.state.offsetY = clamp1(f.state.offsetY + dv); });
  // 면 미리보기 드래그 = 이미지 이동 (오프셋은 면 크기 대비 비율이라 미리보기 크기와 무관)
  const prev = $<HTMLCanvasElement>('facePreview');
  let pd: { x: number; y: number } | null = null;
  prev.onpointerdown = (e) => { if (!faces[current].img) return; pd = { x: e.clientX, y: e.clientY }; prev.setPointerCapture(e.pointerId); };
  prev.onpointermove = (e) => {
    if (!pd) return;
    const r = prev.getBoundingClientRect();
    const dx = (e.clientX - pd.x) / r.width, dy = (e.clientY - pd.y) / r.height;
    pd = { x: e.clientX, y: e.clientY };
    edit((f) => { f.state.offsetX = clamp1(f.state.offsetX + dx); f.state.offsetY = clamp1(f.state.offsetY + dy); });
  };
  prev.onpointerup = prev.onpointercancel = () => { pd = null; };
  $('msgClose').onclick = clearMsg;
  renderFaceList();

  // 탭
  $('tabEdit').onclick = () => setMode('edit');
  $('tabView').onclick = () => setMode('view');

  // 이미지
  const pick = $<HTMLInputElement>('filePick');
  $('btnPick').onclick = () => pick.click();
  pick.onchange = () => { const f = pick.files?.[0]; pick.value = ''; if (f) busy(() => setImage(current, f, f.name)); };
  document.querySelectorAll<HTMLInputElement>('input[name=fit]').forEach((r) => (r.onchange = () => edit((f) => (f.state.fit = r.value as 'contain' | 'cover'))));
  $('rotL').onclick = () => rotate(-90);
  $('rotR').onclick = () => rotate(90);
  $('rot180').onclick = () => rotate(180);
  $('flipX').onclick = () => edit((f) => (f.state.flipX = !f.state.flipX));
  $('flipY').onclick = () => edit((f) => (f.state.flipY = !f.state.flipY));
  bindPair('scale', 25, 300, (f, v) => (f.state.scale = v / 100));
  bindPair('x', -100, 100, (f, v) => (f.state.offsetX = v / 100));
  bindPair('y', -100, 100, (f, v) => (f.state.offsetY = v / 100));
  $('btnRemove').onclick = () => {
    const f = faces[current];
    if (!f.img) return;
    pushHistory(current, true);
    f.blob = null; f.name = null; f.img = null; f.iw = f.ih = 0; f.state = defaultState();
    apply(current);
  };
  $('btnReset').onclick = () => {
    const f = faces[current];
    if (!f.img) return;
    pushHistory(current, true);
    f.state = defaultState();
    apply(current);
  };
  $('btnUndo').onclick = () => { undo(); };

  // 목업 색상 (input 이벤트로 즉시 반영)
  const cur = () => [$<HTMLInputElement>('colFace').value, $<HTMLInputElement>('colLid').value, $<HTMLInputElement>('colBase').value] as const;
  for (const id of ['colFace', 'colLid', 'colBase']) $<HTMLInputElement>(id).oninput = () => applyColors(...cur());
  $('btnColorReset').onclick = () => applyColors(defaultColors.face, defaultColors.lid, defaultColors.base);

  // 박스
  $('btnClose').onclick = () => setLift(0);
  $('btnOpen').onclick = () => setLift(OPEN_MM);
  for (const [r, n] of [['liftR', 'liftN'], ['vLiftR', 'vLiftN']]) {
    $<HTMLInputElement>(r).oninput = (e) => setLift(Number((e.target as HTMLInputElement).value));
    $<HTMLInputElement>(n).onchange = (e) => setLift(Number((e.target as HTMLInputElement).value));
  }
  $<HTMLInputElement>('showLid').onchange = (e) => viewer.setPartVisible('lid', (e.target as HTMLInputElement).checked);
  $<HTMLInputElement>('showBase').onchange = (e) => viewer.setPartVisible('base', (e.target as HTMLInputElement).checked);

  // 보기
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => (b.onclick = () => viewer.setView(b.dataset.view as ViewName)));

  // 저장 / 열기
  $('btnPng').onclick = savePng;
  $('btnGlb').onclick = saveGlb;
  $('btnProjSave').onclick = saveProject;
  $('btnDraftSave').onclick = () => saveDraft(true);
  $('btnDraftLoad').onclick = loadDraft;
  const pf = $<HTMLInputElement>('fileProj');
  $('btnProjOpen').onclick = () => pf.click();
  pf.onchange = () => { const f = pf.files?.[0]; pf.value = ''; if (f) openProject(f); };
  const gf = $<HTMLInputElement>('fileGlb');
  $('btnOpenGlb').onclick = () => gf.click();
  gf.onchange = () => { const f = gf.files?.[0]; gf.value = ''; if (f) openGlb(f); };

  // 드래그앤드롭
  const stage = $('stage');
  let depth = 0;
  stage.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; $('dropHint').hidden = false; });
  stage.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('dropHint').hidden = true; } });
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; $('dropHint').hidden = true;
    const f = e.dataTransfer?.files[0];
    if (f) handleFile(f);
  });

  // 단축키
  // ---------- 단축키 ----------
  const openHelp = () => { const d = $<HTMLDetailsElement>('dHelp'); d.open = true; d.scrollIntoView({ block: 'start' }); };
  const typing = (t: HTMLElement) => t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['radio', 'checkbox', 'range', 'button'].includes((t as HTMLInputElement).type));
  const fieldFocus = (t: HTMLElement) => t.tagName === 'INPUT' || t.tagName === 'SELECT'; // 방향키는 슬라이더·입력칸이 쓴다
  const releasePan = () => { viewer.setPanHeld(false); };
  window.addEventListener('blur', releasePan);
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && !typing(e.target as HTMLElement)) { e.preventDefault(); releasePan(); }
  });
  const goView = (v: ViewName) => viewer.setView(v);
  const cycleFace = (d: number) => {
    const i = FACES.findIndex((x) => x.id === current);
    setCurrent(FACES[(i + d + FACES.length) % FACES.length].id);
  };
  const nudge = (dx: number, dy: number) => edit((f) => {
    f.state.offsetX = Math.min(1, Math.max(-1, f.state.offsetX + dx));
    f.state.offsetY = Math.min(1, Math.max(-1, f.state.offsetY + dy));
  });
  const zoomImg = (k: number) => edit((f) => (f.state.scale = Math.min(3, Math.max(0.25, f.state.scale * k))));

  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (typing(t)) return;
    const k = e.key.toLowerCase();
    const editing = mode === 'edit';

    if (e.code === 'Space') { // 누르고 있는 동안 화면 이동. 포커스된 버튼이 눌리거나 페이지가 스크롤되지 않게 막는다.
      e.preventDefault();
      if (!e.repeat) viewer.setPanHeld(true);
      return;
    }
    if (k === '?' || (e.code === 'Slash' && e.shiftKey) || k === 'f1') { e.preventDefault(); openHelp(); return; }
    if (!keysEnabled) return; // 설정에서 단축키를 끈 경우 (Space 이동·도움말만 유지)
    if (e.ctrlKey || e.metaKey) {
      if (k === 's') { e.preventDefault(); if (editing) saveProject(); }
      else if (k === 'o') { e.preventDefault(); if (editing) pf.click(); }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); if (editing) undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); if (editing) redo(); }
      return;
    }
    if (e.altKey) return;

    // 시점: 숫자(키패드 포함) 1 정면 · Shift+1 후면 · 3 우측 · Shift+3 좌측 · 7 윗면 · 0/R 3/4
    if (e.code === 'Digit1' || e.code === 'Numpad1') return goView(e.shiftKey ? 'back' : 'front');
    if (e.code === 'Digit3' || e.code === 'Numpad3') return goView(e.shiftKey ? 'left' : 'right');
    if (e.code === 'Digit7' || e.code === 'Numpad7') return goView('top');
    if (e.code === 'Digit0' || e.code === 'Numpad0' || k === 'r') return goView('iso');
    if (k === 'o' && viewer.hasLid()) return setLift(viewer.getLiftMm() > 0 ? 0 : OPEN_MM);
    if (k === 'escape') { viewer.setHighlightOn(false); clearMsg(); return; }
    if (!editing) return;

    if (k === 'm') { const c = $<HTMLInputElement>('moveMode'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); }
    else if (k === '[') cycleFace(-1);
    else if (k === ']') cycleFace(1);
    else if (k === 'delete' || k === 'backspace') { if (faces[current].img) { e.preventDefault(); $('btnRemove').click(); } }
    else if (k === '+' || k === '=') zoomImg(1.05);
    else if (k === '-' || k === '_') zoomImg(1 / 1.05);
    else if (!fieldFocus(t) && k.startsWith('arrow')) {
      e.preventDefault();
      const s = e.shiftKey ? 0.05 : 0.01; // Shift = 5%
      nudge(k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0);
    }
  });

  await busy(() => viewer.loadTemplate('./template.glb'));
  defaultColors = { face: '#ffffff', lid: viewer.getPartColor('lid'), base: viewer.getPartColor('base') };
  applyColors(defaultColors.face, defaultColors.lid, defaultColors.base);
  for (const f of FACES) viewer.setFaceTexture(f.id, null);
  setCurrent('lid_top');
  viewer.setView('iso');
  await initDraft();
  // 테스트·검증용 훅 (UI 동작에는 쓰지 않음)
  (window as unknown as Record<string, unknown>).__sabari = { viewer, faces, setCurrent };
}

init();
