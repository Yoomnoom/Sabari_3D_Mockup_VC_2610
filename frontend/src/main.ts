import * as THREE from 'three';
import { SNAP_DEG } from './screenRotate';
import { FACES, FaceData, FaceId, FaceSnapshot, decode, decodeUnder, faces, groupOf, rebake, resizeFaceCanvases, theme } from './faces';
import { FaceGroup, GROUPS, applyFaceSizes, facesOf } from './faceDefs';
import { BoxParams, DEFAULT_PARAMS, RatioChange, cloneParams, faceSizes, formatPct, formatRatio, paramsEqual, ratioChanges, ratioOf, validateParams } from './params';
import { initDimsUi } from './dimsUi';
import { DieKind, buildDieline, dielineSvg } from './dieline';
import { SplitResult, initSplitUi } from './splitUi';
import { initLayers } from './layers';
import { ImportOptions, initImportFaces } from './importFaces';
import { DetailKey, Viewer, ViewName } from './viewer';
import { Rotation, defaultState } from './transform';
import { DielineSave, DielineSet, UserError, inspectImage, packProject, unpackProject, OpenedProject, ViewPresetSlot, ViewPresetValue } from './project';
import { StandingSide, standingPresetValue } from './standingView';
import { BG_CHIPS, BG_SAMPLES, DEFAULT_STUDIO, BgSettings, BgSource, DEFAULT_BG, drawBackground, loadBgImage, makeSample, nextKind, sanitizeBg } from './background';
import { SABARI_BOX_ID, TEMPLATES } from './templates';
import { askEnabled, confirmDialog, defaultStem, infoDialog, saveFile, setAskEnabled } from './dialogs';
import { DEFAULT_SHADOW, ShadowSettings, sanitizeShadow } from './floorShadow';
import { NOTE_LEVELS, NoteKind, NoteSlot, mayReplace, noteHistory, pickVisible, recordNote } from './notify';
import { Draft, delDraft, getDraft, putDraft } from './draft';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const OPEN_MM = 80;

let viewer: Viewer;
let current: FaceId = 'lid_top';
/** "하단 몸통 디자인 사용" 스위치. 기본은 꺼짐이며, 꺼져 있으면 화면·동작이 뚜껑 5면만 있을 때와 같다. */
let baseEnabled = false;
const lastByGroup: Record<FaceGroup, FaceId> = { lid: 'lid_top', base: 'base_front' };
let externalGlbActive = false;
let workSnapshot: ReturnType<Viewer['capturePose']> | null = null;
/** 박스 치수 파라미터. 3D·면 크기·텍스처 크기는 모두 여기서 만들어진다. */
let params: BoxParams = cloneParams(DEFAULT_PARAMS);
/** "원래 사이즈로 되돌리기" 기준: 처음 열었을 때 / 프로젝트를 연 시점 / 마지막으로 저장한 시점의 치수 */
let baselineParams: BoxParams = cloneParams(DEFAULT_PARAMS);
let dims: ReturnType<typeof initDimsUi> | null = null;
let split: ReturnType<typeof initSplitUi> | null = null;
/** 마지막으로 올린 칼선 이미지 한 장과 분할 설정(원본 이미지는 .sabari 에 그대로 들어간다) */
const underSave = (id: FaceId) => { const u = faces[id].under; return u && faces[id].blob ? { blob: u.blob, name: u.name, state: { ...u.state }, onTop: faces[id].underOnTop } : null; };
let layersUi: ReturnType<typeof initLayers> | undefined;
const activeSt = (f: FaceData) => (layersUi ? layersUi.activeState(f) : f.state);
let dielines: DielineSet = {}; // 칼선 분할 저장: 뚜껑·하단 몸통 종류별로 따로
let lastDieKind: DieKind = 'lid'; // 가장 최근에 적용·불러온 칼선 종류("분할 영역 조정"이 여는 기본 종류)

// ---------- 저장된 시점 ----------
const VP_SLOTS = 5;
let presets: (ViewPresetSlot | null)[] = new Array(VP_SLOTS).fill(null);
let presetThumbUrls: (string | null)[] = new Array(VP_SLOTS).fill(null);

function capturePresetValue(): ViewPresetValue {
  const b = viewer.bounds();
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
  const fit = viewer.getFitDistance();
  const cp = viewer.camera.position, tg = viewer.controls.target, q = viewer.boxQuat;
  return {
    boxQuat: [q.x, q.y, q.z, q.w],
    camOffset: [(cp.x - cx) / fit, (cp.y - cy) / fit, (cp.z - cz) / fit],
    targetOffset: [(tg.x - cx) / fit, (tg.y - cy) / fit, (tg.z - cz) / fit],
    fov: viewer.camera.fov,
    lock: viewer.captureLockState(),
    liftMm: viewer.getLiftMm(),
  };
}

function applyPresetValue(v: ViewPresetValue) {
  viewer.camera.fov = v.fov; // 맞춤 거리는 FOV에 따라 달라지므로 거리 계산 전에 먼저 정한다
  viewer.camera.updateProjectionMatrix();
  viewer.setBoxQuatRaw(v.boxQuat);
  setLift(v.liftMm);
  const b = viewer.bounds();
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
  const fit = viewer.getFitDistance();
  viewer.setCameraRaw(
    [cx + v.camOffset[0] * fit, cy + v.camOffset[1] * fit, cz + v.camOffset[2] * fit],
    [cx + v.targetOffset[0] * fit, cy + v.targetOffset[1] * fit, cz + v.targetOffset[2] * fit],
  );
  viewer.restoreLockState(v.lock);
}

/** 기본 제공 시점 "세운 3/4": 축 잠금 상태는 유지하고(각도 바 기준만 새 자세로 다시 잡는다) 박스 자세·카메라·FOV만 바꾼다. */
function goStanding(side: StandingSide) {
  if (externalGlbActive) return;
  applyPresetValue(standingPresetValue(side, { lock: viewer.captureLockState(), liftMm: viewer.getLiftMm() }));
  viewer.rebaseLockAngle();
}

function presetCard(slot: number): HTMLElement {
  return document.querySelector<HTMLElement>(`.vp-card[data-slot="${slot}"]`)!;
}

function renderPresetCard(slot: number) {
  const card = presetCard(slot);
  const p = presets[slot];
  const thumb = card.querySelector<HTMLButtonElement>('.vp-thumb')!;
  const img = thumb.querySelector<HTMLImageElement>('img')!;
  const empty = thumb.querySelector<HTMLElement>('.vp-empty')!;
  const name = card.querySelector<HTMLInputElement>('.vp-name')!;
  const save = card.querySelector<HTMLButtonElement>('.vp-save')!;
  const del = card.querySelector<HTMLButtonElement>('.vp-del')!;
  card.classList.toggle('filled', !!p);
  thumb.disabled = !p || externalGlbActive;
  save.disabled = externalGlbActive;
  del.hidden = !p;
  del.disabled = externalGlbActive;
  name.disabled = externalGlbActive;
  if (p) {
    name.value = p.name;
    const url = presetThumbUrls[slot];
    img.hidden = !url;
    if (url) img.src = url;
    empty.hidden = !!url;
  } else {
    name.value = `시점 ${slot + 1}`;
    img.hidden = true;
    empty.hidden = false;
  }
}

function renderPresets() {
  for (let i = 0; i < VP_SLOTS; i++) renderPresetCard(i);
  document.querySelectorAll<HTMLButtonElement>('.vp-fixed').forEach((b) => { b.disabled = externalGlbActive; });
}

function setPresetThumb(slot: number, blob: Blob | null) {
  if (presetThumbUrls[slot]) URL.revokeObjectURL(presetThumbUrls[slot]!);
  presetThumbUrls[slot] = blob ? URL.createObjectURL(blob) : null;
}

async function savePresetSlot(slot: number) {
  await busy(async () => {
    const value = capturePresetValue();
    const thumbBlob = await viewer.thumbnail(160);
    const name = presets[slot]?.name ?? `시점 ${slot + 1}`;
    presets[slot] = { slot, name, value, thumbBlob };
    setPresetThumb(slot, thumbBlob);
    renderPresetCard(slot);
    scheduleDraft();
  });
}

function loadPresetSlot(slot: number) {
  const p = presets[slot];
  if (!p || externalGlbActive) return;
  applyPresetValue(p.value);
}

function deletePresetSlot(slot: number) {
  if (!presets[slot]) return;
  presets[slot] = null;
  setPresetThumb(slot, null);
  renderPresetCard(slot);
  scheduleDraft();
}

function renamePresetSlot(slot: number, name: string) {
  const p = presets[slot];
  if (!p) return;
  p.name = name.slice(0, 20) || `시점 ${slot + 1}`;
  scheduleDraft();
}

function initViewPresets() {
  for (let slot = 0; slot < VP_SLOTS; slot++) {
    const card = presetCard(slot);
    card.querySelector<HTMLButtonElement>('.vp-thumb')!.onclick = () => loadPresetSlot(slot);
    card.querySelector<HTMLButtonElement>('.vp-save')!.onclick = () => savePresetSlot(slot);
    card.querySelector<HTMLButtonElement>('.vp-del')!.onclick = () => deletePresetSlot(slot);
    card.querySelector<HTMLInputElement>('.vp-name')!.onchange = (e) => renamePresetSlot(slot, (e.target as HTMLInputElement).value);
  }
  document.querySelectorAll<HTMLButtonElement>('.vp-fixed').forEach((b) => { b.onclick = () => goStanding(b.dataset.side as StandingSide); });
  renderPresets();
}

// ---------- 공통 UI 유틸 ----------
// 알림(작업 29): 상단 바의 알림 영역 한 곳. 성공·안내는 5초 뒤 사라지고(마우스 올림·포커스 중 유지), 오류는 닫을 때까지 유지한다.
// 진행 중인 오류는 새 성공·안내로 대체하지 않고(기록에만 남음), 깨끗한 화면 중에는 기록에만 남는다. 문구·종류는 호출부 그대로다.
let msgTimer = 0, msgHold = false;
function msg(text: string, kind: NoteKind = 'error') {
  recordNote(text, kind);
  if (document.body.classList.contains('clean-screen')) return;
  const el = $('msg');
  const cur: NoteKind | null = el.hidden ? null : (el.dataset.level as NoteKind | undefined) ?? 'error';
  if (!mayReplace(cur, kind)) return;
  $('msgText').textContent = text; el.title = text;
  const lv = NOTE_LEVELS[kind];
  el.className = kind === 'error' ? '' : kind; el.dataset.level = kind; // 'ok'는 예전과 같은 클래스 이름
  $('msgLevel').textContent = `${lv.icon} ${lv.label}`;
  el.setAttribute('role', lv.role);
  el.hidden = false;
  clearTimeout(msgTimer);
  if (lv.autoHide && !msgHold) msgTimer = window.setTimeout(clearMsg, 5000);
}
// "자세히 보기"(details.more > summary): 앱의 Space 단축키(손 도구)보다 먼저 받아 Enter·Space 모두로 열고 닫는다(작업 32B).
{
  const isMoreSummary = (t: EventTarget | null) => t instanceof HTMLElement && t.matches('details.more > summary');
  document.addEventListener('keydown', (e) => { if (e.code === 'Space' && isMoreSummary(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) { const d = (e.target as HTMLElement).parentElement as HTMLDetailsElement; d.open = !d.open; } } }, true);
  document.addEventListener('keyup', (e) => { if (e.code === 'Space' && isMoreSummary(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}
const clearMsg = () => { clearTimeout(msgTimer); $('msg').hidden = true; };
const armMsg = () => { clearTimeout(msgTimer); const el = $('msg'); if (!el.hidden && NOTE_LEVELS[(el.dataset.level as NoteKind | undefined) ?? 'error'].autoHide && !msgHold) msgTimer = window.setTimeout(clearMsg, 5000); };
/** 알림 영역은 한 번에 한 개만 보인다(우선순위: 오류 > 안내 > 임시저장 > 손 도구 > 외부 GLB 상태). 요소의 hidden 은 각 기능이 그대로 쓰고, 여기서는 겹치는 쪽을 숨기기만 한다. */
function initNotifyArea() {
  const ids = ['msg', 'draftToast', 'panHintTop', 'extGlbBanner'];
  const owner: Record<NoteSlot, string> = { 'msg-error': 'msg', 'msg-ok': 'msg', draft: 'draftToast', pan: 'panHintTop', ext: 'extGlbBanner' };
  const run = () => {
    const m = $('msg');
    const pick = pickVisible({ 'msg-error': !m.hidden && (m.dataset.level ?? 'error') === 'error', 'msg-ok': !m.hidden && (m.dataset.level ?? 'error') !== 'error', draft: !$('draftToast').hidden, pan: !$('panHintTop').hidden, ext: !$('extGlbBanner').hidden });
    for (const id of ids) $(id).classList.toggle('note-hidden', !!pick && owner[pick] !== id);
    $('topBar').classList.toggle('has-note', !!pick);
  };
  const mo = new MutationObserver(run);
  for (const id of ids) mo.observe($(id), { attributes: true, attributeFilter: ['hidden', 'class'] });
  const m = $('msg');
  m.addEventListener('mouseenter', () => { msgHold = true; clearTimeout(msgTimer); });
  m.addEventListener('mouseleave', () => { msgHold = m.contains(document.activeElement); armMsg(); });
  m.addEventListener('focusin', () => { msgHold = true; clearTimeout(msgTimer); });
  m.addEventListener('focusout', (e) => { if (!m.contains((e as FocusEvent).relatedTarget as Node | null)) { msgHold = false; armMsg(); } });
  m.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Escape') { e.stopPropagation(); clearMsg(); } });
  run();
}
const fmtNoteTime = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function openNotifyLog() {
  const ul = $('notifyList'); ul.textContent = '';
  const items = noteHistory();
  $('notifyEmpty').hidden = items.length > 0;
  for (const n of items) { const li = document.createElement('li'); if (n.kind === 'error') li.className = 'err'; li.dataset.level = n.kind; const t = document.createElement('time'); t.textContent = fmtNoteTime(n.at); const sp = document.createElement('span'); sp.textContent = n.text; li.append(t, sp); ul.appendChild(li); }
  const d = $<HTMLDialogElement>('notifyDlg'); if (!d.open) d.showModal();
}
async function busy<T>(fn: () => Promise<T>, label = '처리 중…'): Promise<T | undefined> {
  $('loading').textContent = label; // 큰 이미지 등은 무엇을 처리하는 중인지 알린다
  $('loading').hidden = false;
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    msg(e instanceof Error ? e.message : String(e));
    if (e instanceof UserError) await infoDialog({ kind: 'error', title: '처리할 수 없습니다', text: e.message }); // 지원하지 않는 이미지 형식·미래 버전 프로젝트 등
  } finally {
    $('loading').hidden = true;
    $('loading').textContent = '처리 중…';
  }
}

/** 단축키 · 마우스 조작 안내 대화상자(? 키, ⋮ 더보기). Esc와 닫기 버튼으로 닫힌다. */
function openHelp() { const d = $<HTMLDialogElement>('helpDlg'); if (!d.open) d.showModal(); }

// ---------- 템플릿 카드(작업 16): 지금은 사바리 박스 하나만 선택 가능, 나머지는 "준비 중" ----------
let activeTemplateId = SABARI_BOX_ID;
function renderTemplateCard() {
  const box = $('tplList');
  box.innerHTML = '';
  for (const tp of TEMPLATES) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.template = tp.id; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(tp.ready && tp.id === activeTemplateId));
    b.disabled = !tp.ready;
    b.innerHTML = `<b></b><small>${tp.ready ? (tp.id === activeTemplateId ? '사용 중' : '선택') : '준비 중'}</small>`;
    b.querySelector('b')!.textContent = tp.label;
    box.appendChild(b); // 준비 중 항목은 비활성이라 눌러도 아무 일도 없다. 사용 가능한 템플릿이 하나뿐이라 선택 변경 동작은 아직 없다.
  }
}

// ---------- 저장하지 않은 변경 표시(● 변경됨) ----------
let dirty = false;
const setDirty = (v: boolean) => { dirty = v; $('dirtyMark').hidden = !v; };
/** 현재 작업을 바꾸는 "열기" 전에 저장하지 않은 변경이 있으면 확인을 받는다. */
async function confirmDiscard(what: string): Promise<boolean> {
  if (!dirty) return true;
  return confirmDialog({ kind: 'confirm-unsaved', title: '저장하지 않은 변경', text: `저장하지 않은 변경이 있습니다.\n${what}을(를) 열면 현재 작업이 바뀝니다. 계속할까요?`, ok: '계속', cancel: '취소' });
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
// 실행 취소/다시 실행: 한 번의 변경 전 상태(면 스냅샷 묶음 + 스위치 상태)를 쌓는다.
// 같은 면의 연속 조작(드래그·슬라이더)은 0.8초 안이면 한 번으로 묶는다. 하단 면을 한꺼번에 제거하는 것도 한 항목이다.
type Snap = FaceSnapshot & { id: FaceId };
type ColorSnap = { face: string; lid: string; base: string; detail: DetailColors };
/** colors 는 "다른 프로젝트에서 면 가져오기"에서 면 바탕색도 가져온 항목에만 들어간다(일반 색 변경은 예전처럼 실행 취소 대상이 아니다). */
type Entry = { snaps: Snap[]; base: boolean; params: BoxParams; colors?: ColorSnap };
const undoStack: Entry[] = [];
const redoStack: Entry[] = [];
let lastPushAt = 0;
let lastPushId: FaceId | 'params' | null = null;
const take = (id: FaceId): Snap => { const f = faces[id]; return { id, state: { ...f.state }, blob: f.blob, name: f.name, img: f.img, iw: f.iw, ih: f.ih, under: f.under ? { ...f.under, state: { ...f.under.state } } : null, underOnTop: f.underOnTop }; };
const takeEntry = (ids: FaceId[]): Entry => ({ snaps: ids.map(take), base: baseEnabled, params: cloneParams(params) });

function pushHistory(id: FaceId, force = false) {
  const now = performance.now();
  const merge = !force && lastPushId === id && now - lastPushAt < 800;
  lastPushAt = now; lastPushId = id;
  if (merge) return;
  undoStack.push(takeEntry([id]));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}
/** 치수 변경 직전 상태를 기록한다. 입력 중 연속 변경은 0.8초 안이면 한 항목으로 묶는다. */
function pushParamHistory(before: BoxParams, force = false) {
  const now = performance.now();
  const merge = !force && lastPushId === 'params' && now - lastPushAt < 800;
  lastPushAt = now; lastPushId = force ? null : 'params'; // 버튼 동작(기본값 복원 등)은 항상 별도 항목이고, 뒤따르는 입력과도 묶이지 않는다
  if (merge) return;
  undoStack.push({ snaps: [], base: baseEnabled, params: cloneParams(before) });
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}
function pushHistoryMany(ids: FaceId[]) {
  lastPushId = null;
  undoStack.push(takeEntry(ids));
  if (undoStack.length > 50) undoStack.shift();
  redoStack.length = 0;
}
function stepHistory(from: Entry[], to: Entry[]): boolean {
  const e = from.pop();
  if (!e) return false;
  const back = takeEntry(e.snaps.map((x) => x.id));
  if (e.colors) back.colors = currentColors(); // 되돌리기↔다시 실행에서 색도 왕복한다
  to.push(back);
  lastPushId = null;
  if (!paramsEqual(e.params, params)) applyParams(e.params, false); // 치수 변경도 실행 취소/다시 실행 대상
  for (const { id, ...rest } of e.snaps) Object.assign(faces[id], { ...rest, state: { ...rest.state }, under: rest.under ? { ...rest.under, state: { ...rest.under.state } } : null });
  if (e.colors) applyColors(e.colors.face, e.colors.lid, e.colors.base, e.colors.detail);
  if (e.base !== baseEnabled) setBaseEnabled(e.base, false);
  for (const { id } of e.snaps) apply(id);
  const first = e.snaps[0]?.id;
  if (first && (groupOf(first) === 'lid' || baseEnabled)) setCurrent(first);
  return true;
}
const undo = () => { stepHistory(undoStack, redoStack); syncTopHistory(); };
const redo = () => { stepHistory(redoStack, undoStack); syncTopHistory(); };
const clearHistory = () => { undoStack.length = 0; redoStack.length = 0; lastPushId = null; };

async function setImage(id: FaceId, file: Blob, name: string) {
  const info = await inspectImage(file);
  const { img, iw, ih } = await decode(file).catch(() => { throw new Error('이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.'); });
  const f = faces[id];
  pushHistory(id, true);
  f.blob = file; f.name = name; f.img = img; f.iw = iw; f.ih = ih;
  f.state = defaultState(); // 새 이미지는 항상 "이미지 전체 보이기"로 시작
  clearMsg();
  if (info.warnings.length) msg(info.warnings.join(' '), 'warn');
  apply(id);
  resetRatioRefs([id]); // 새 이미지는 지금 비율에 맞춰 넣은 것이므로 이 면의 알림은 사라진다
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

/**
 * 박스 치수를 바꾼다: 면 크기·텍스처 캔버스·3D 템플릿·칼선 레이아웃을 한꺼번에 갱신한다.
 * 이미 넣은 이미지는 지우지 않고, 면마다 현재 맞춤 방식으로 다시 맞춘다(위치·확대·회전·반전 값은 그대로).
 * 불가능한 조합이면 적용하지 않고 false.
 */
function applyParams(next: BoxParams, record = true, immediate = false): boolean {
  const errs = validateParams(next);
  if (errs.length) { dims?.showErrors(errs); return false; }
  if (paramsEqual(next, params)) return true;
  if (record) pushParamHistory(params, immediate);
  params = cloneParams(next);
  applyFaceSizes(faceSizes(params));
  resizeFaceCanvases();
  viewer.setTemplate(params);
  for (const fd of FACES) { // 새 3D 에 텍스처를 다시 연결한다(캔버스 크기가 바뀐 면은 다시 구워야 한다)
    const has = rebake(faces[fd.id]);
    viewer.setFaceTexture(fd.id, has ? faces[fd.id].canvas : null);
  }
  renderFaceList();
  syncControls();
  updateOpenNotice();
  dims?.sync();
  scheduleDraft();
  changeEpoch++;
  if (!opening) scheduleRatioCheck(immediate || !record ? 0 : RATIO_DEBOUNCE_MS); // 버튼·실행 취소는 바로, 연속 입력은 멈춘 뒤 한 번
  return true;
}

// ---------- 비율 변경 알림 ----------
// 면마다 "기준 비율"(이미지를 넣은 시점·마지막으로 확인한 시점·프로젝트를 연 시점의 비율)을 두고,
// 현재 비율이 기준보다 RATIO_ALERT_THRESHOLD(params.ts) 이상 달라진 면 중 이미지가 있는 면만 알린다.
const RATIO_DEBOUNCE_MS = 800;
const ratioRef: Partial<Record<FaceId, number>> = {};
let ratioAlerts: RatioChange[] = [];
let ratioTimer = 0;
let changeEpoch = 0; // 치수가 바뀔 때마다 증가. 배너를 "한 번만" 띄우는 기준
let dismissedEpoch = -1; // 사용자가 닫기를 누른 시점의 epoch
let opening = false; // 프로젝트·임시저장을 여는 중에는 알리지 않는다
const alertOf = (id: FaceId) => ratioAlerts.find((a) => a.id === id);

function resetRatioRefs(ids?: FaceId[]) {
  const sizes = faceSizes(params);
  for (const id of ids ?? FACES.map((f) => f.id)) ratioRef[id] = ratioOf(sizes[id]);
  recomputeRatio();
}
function scheduleRatioCheck(ms: number) {
  clearTimeout(ratioTimer);
  if (ms <= 0) return recomputeRatio();
  ratioTimer = window.setTimeout(recomputeRatio, ms);
}
function recomputeRatio() {
  ratioAlerts = ratioChanges(ratioRef, faceSizes(params), (id) => !!faces[id as FaceId].img) as RatioChange[];
  renderRatioUi();
}
function renderRatioUi() {
  const n = ratioAlerts.length;
  const show = n > 0 && dismissedEpoch !== changeEpoch && !externalGlbActive; // 외부 GLB를 보는 중에는 보이지 않는다
  $('ratioBanner').hidden = !show;
  if (show) {
    $('ratioBannerText').innerHTML = `<b>⚠ 비율 변경</b> · 치수 변경으로 ${n}개 면의 비율이 달라졌습니다. 이미지가 잘리거나 여백이 생길 수 있습니다.`;
    const ul = $('ratioDetail');
    ul.innerHTML = '';
    for (const a of ratioAlerts) {
      const li = document.createElement('li');
      li.textContent = `${FACES.find((f) => f.id === a.id)!.label}: 비율 ${formatRatio(a.from)} → ${formatRatio(a.to)} (${formatPct(a.pct)})`;
      ul.appendChild(li);
    }
  }
  renderFaceList(); // 배지
  renderRatioNote();
}
function renderRatioNote() {
  const a = alertOf(current);
  $('ratioNote').hidden = !a;
  if (a) $('ratioNoteText').textContent = `⚠ 비율 ${formatRatio(a.from)} → ${formatRatio(a.to)} (${formatPct(a.pct)})`;
}

// ---------- 면 UI ----------
function renderFaceList() {
  const group = groupOf(current);
  $('faceTabs').hidden = !baseEnabled;
  for (const g of ['lid', 'base'] as FaceGroup[]) {
    const t = $('tab_' + g);
    t.setAttribute('aria-selected', String(g === group));
    const alerted = facesOf(g).filter((f) => alertOf(f.id)).length; // 다른 탭의 면이 바뀌었을 때도 알아볼 수 있게 탭에 표시
    t.textContent = `${GROUPS[g].label} (${facesOf(g).filter((f) => faces[f.id].img).length}/${facesOf(g).length})${alerted ? ` ⚠${alerted}` : ''}`;
    t.title = alerted ? `비율이 달라진 면 ${alerted}개` : '';
  }
  const box = $('faceList');
  box.innerHTML = '';
  for (const fd of facesOf(group)) {
    const f = faces[fd.id];
    const b = document.createElement('button');
    b.setAttribute('aria-pressed', String(fd.id === current));
    b.dataset.face = fd.id;
    const al = alertOf(fd.id);
    b.innerHTML = `<span>${fd.short}</span><small>${f.img ? (f.under ? '이미지 있음 · 바탕' : '이미지 있음') : '비어 있음'}</small>${al ? `<span class="badge" title="치수 변경으로 이 면의 비율이 ${formatPct(al.pct)} 달라졌습니다">⚠ 비율 변경</span>` : ''}`;
    b.onclick = () => setCurrent(fd.id);
    box.appendChild(b);
  }
}

function setCurrent(id: FaceId) {
  if (groupOf(id) === 'base' && !baseEnabled) return; // 스위치가 꺼져 있으면 하단 면은 선택할 수 없다
  current = id;
  lastByGroup[groupOf(id)] = id;
  viewer.setSelected(id);
  renderFaceList();
  syncControls();
  updateOpenNotice();
}

/** 하단 면을 고른 채 뚜껑이 닫혀 있으면 안내한다(자동으로 열지는 않는다). */
function updateOpenNotice() {
  const isBase = baseEnabled && groupOf(current) === 'base' && !externalGlbActive;
  const closed = viewer && viewer.getLiftMm() < 10;
  $('openNotice').hidden = !(isBase && closed);
  $('btnNoticeBottom').hidden = current !== 'base_bottom';
  $('openNoticeText').textContent = current === 'base_bottom'
    ? '뚜껑을 열거나 "아래" 시점에서 보입니다.'
    : '뚜껑을 열어야 보입니다.';
}

/** 스위치 상태를 화면에 반영한다. 하단 면 이미지를 지우는 일은 하지 않는다(그건 requestBaseOff 담당). */
function setBaseEnabled(v: boolean, schedule = true) {
  baseEnabled = v;
  viewer.pickFilter = (id) => groupOf(id) === 'lid' || baseEnabled;
  $<HTMLInputElement>('useBase').checked = v;
  if (!v && groupOf(current) === 'base') { current = lastByGroup.lid; viewer.setSelected(current); }
  renderFaceList();
  syncControls();
  updateOpenNotice();
  if (schedule) scheduleDraft();
}

/** 사용자가 스위치를 눌렀을 때. 끌 때 하단 이미지가 있으면 확인을 받고, 실행 취소로 복구할 수 있게 한 항목으로 기록한다. */
async function onUseBaseToggle() {
  const want = $<HTMLInputElement>('useBase').checked;
  if (want) return setBaseEnabled(true);
  const withImage = facesOf('base').filter((f) => faces[f.id].img).map((f) => f.id);
  if (withImage.length) {
    if (!(await confirmDialog({ kind: 'confirm-base-off', title: '하단 몸통 사용 끄기', text: `하단 이미지 ${withImage.length}개가 제거됩니다.\n계속할까요? (Ctrl+Z로 되돌릴 수 있습니다)`, ok: '제거하고 끄기', cancel: '취소' }))) {
      $<HTMLInputElement>('useBase').checked = true;
      return;
    }
    pushHistoryMany(withImage);
    for (const id of withImage) {
      const f = faces[id];
      f.blob = null; f.name = null; f.img = null; f.iw = f.ih = 0; f.state = defaultState(); f.under = null; f.underOnTop = false;
      apply(id);
    }
  }
  setBaseEnabled(false);
}

function syncControls() {
  const fd = FACES.find((x) => x.id === current)!;
  const f = faces[current];
  $('faceTitle').textContent = fd.label;
  $('faceSize').textContent = `면 크기 ${fd.wMm}×${fd.hMm}mm (비율 ${(fd.wMm / fd.hMm).toFixed(2)}:1)`;
  $('fileInfo').textContent = f.img ? `${f.name} · 원본 ${f.iw}×${f.ih}px` : '이미지 없음';
  $('faceControls').classList.toggle('disabled', !f.img);
  $('dropEmpty').hidden = !!f.img; // 시안 v6: 이미지가 없을 때만 점선 영역의 안내를 보인다
  $('facePreview').style.cursor = f.img ? 'grab' : 'default';
  const prev = $<HTMLCanvasElement>('facePreview');
  prev.width = f.canvas.width / 4; prev.height = f.canvas.height / 4;
  const ctx = prev.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, prev.width, prev.height);
  if (f.img) ctx.drawImage(f.canvas, 0, 0, prev.width, prev.height);
  layersUi?.render();
  const st = activeSt(f);
  (document.querySelector(`input[name=fit][value=${st.fit}]`) as HTMLInputElement).checked = true;
  $('flipX').setAttribute('aria-pressed', String(st.flipX));
  $('flipY').setAttribute('aria-pressed', String(st.flipY));
  $('rotText').textContent = `${st.rotationDeg}°`;
  setPair('scale', st.scale * 100);
  setPair('x', st.offsetX * 100);
  setPair('y', st.offsetY * 100);
  $<HTMLButtonElement>('btnRemove').disabled = !f.img;
  $<HTMLButtonElement>('btnReset').disabled = !f.img;
  for (const id of ['btnRemove', 'btnReset']) $(id).title = f.img ? '' : '이 면에 이미지를 넣으면 쓸 수 있습니다'; // 비활성 이유(작업 32B)
  $('btnUndo').hidden = undoStack.length === 0;
  syncTopHistory();
  renderRatioNote();
}
function setPair(k: string, v: number) {
  $<HTMLInputElement>(k + 'R').value = String(Math.round(v));
  $<HTMLInputElement>(k + 'N').value = String(Math.round(v));
}

function edit(fn: (f: FaceData) => void) {
  const f = faces[current];
  if (!f.img) return;
  pushHistory(current);
  fn({ ...f, state: activeSt(f) } as FaceData); // 선택한 레이어(디자인/바탕)의 변환 상태를 고친다
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
    const blob = await packProject({
      faces: FACES.map((x) => ({ id: x.id, state: faces[x.id].state, blob: faces[x.id].blob, name: faces[x.id].name, under: underSave(x.id) })),
      lidLiftMm: Math.round(viewer.slot === 'editor' ? viewer.getLiftMm() : 0),
      templateId: activeTemplateId,
      background: $<HTMLSelectElement>('bgSel').value === 'transparent' ? 'transparent' : 'white', // PNG 배경 옵션("화면 그대로"는 흰색으로 기억)
      viewSettings: { background: { settings: JSON.parse(JSON.stringify(bg)) as BgSettings, blob: bgImg?.blob ?? null, name: bgImg?.name ?? null } },
      colors: { face: $<HTMLInputElement>('colFace').value, lid: $<HTMLInputElement>('colLid').value, base: $<HTMLInputElement>('colBase').value, ...detailFor() },
      useBaseFaces: baseEnabled,
      params: cloneParams(params),
      dielines,
      viewPresets: presets.filter((p): p is ViewPresetSlot => p !== null),
    });
    const r = await saveFile(blob, 'sabari', defaultStem('사바리_프로젝트'), download);
    if (!r.saved) return;
    baselineParams = cloneParams(params); // 마지막 저장 시점의 치수가 "원래 사이즈"가 된다
    setDirty(false);
    msg(`프로젝트를 저장했습니다. (${r.name})`, 'ok');
  });
}

async function applyOpened(proj: OpenedProject) {
  suppressDraftToast();
  opening = true;
  clearHistory();
  // 치수가 없는 이전 파일·임시저장은 기본값으로 연다
  const np = proj.params ? cloneParams(proj.params) : cloneParams(DEFAULT_PARAMS);
  applyParams(np, false);
  baselineParams = cloneParams(np);
  const note = (proj as OpenedProject & { paramNote?: string }).paramNote;
  for (const fdsc of FACES) {
    const f = faces[fdsc.id];
    const p = proj.faces[fdsc.id] as OpenedProject['faces'][FaceId] | undefined; // 이전 임시저장에는 하단 면이 없다
    f.state = p ? p.state : defaultState();
    if (p && p.blob) {
      const d = await decode(p.blob);
      f.blob = p.blob; f.name = p.name; f.img = d.img; f.iw = d.iw; f.ih = d.ih;
    } else {
      f.blob = null; f.name = null; f.img = null; f.iw = f.ih = 0;
    }
    f.under = null; f.underOnTop = false;
    if (p?.under && p.blob) {
      try { const ud = await decodeUnder(p.under.blob); f.under = { state: { ...p.under.state }, blob: p.under.blob, name: p.under.name, ...ud }; f.underOnTop = p.under.onTop; } catch { /* 바탕 이미지를 못 읽으면 바탕 없이 연다 */ }
    }
    apply(fdsc.id);
  }
  if (proj.colors) { const d: DetailColors = {}; for (const [k] of ADV_IDS) { const v = proj.colors[k]; if (v) d[k] = v; } applyColors(proj.colors.face, proj.colors.lid, proj.colors.base, d); }
  // 하단 면에 이미지가 있으면 스위치는 자동으로 켜진다(없던 이전 파일은 꺼짐)
  setBaseEnabled(proj.useBase === true || facesOf('base').some((x) => faces[x.id].img), false);
  setLift(proj.lidLiftMm);
  $<HTMLSelectElement>('bgSel').value = proj.background;
  syncControls();
  dielines = proj.dielines ?? (proj.dieline ? { [proj.dieline.kind]: proj.dieline } : {});
  lastDieKind = dielines.lid ? 'lid' : 'base';
  renderDielineInfo();
  presets = new Array(VP_SLOTS).fill(null);
  for (const url of presetThumbUrls) if (url) URL.revokeObjectURL(url);
  presetThumbUrls = new Array(VP_SLOTS).fill(null);
  for (const p of proj.viewPresets) {
    if (p.slot < 0 || p.slot >= VP_SLOTS) continue;
    presets[p.slot] = p;
    setPresetThumb(p.slot, p.thumbBlob);
  }
  renderPresets();
  dims?.sync();
  activeTemplateId = proj.templateId ?? SABARI_BOX_ID; renderTemplateCard();
  await applyBgFromSave(proj.viewSettings?.background);
  opening = false;
  setDirty(false);
  resetRatioRefs(); // 프로젝트·임시저장을 열 때는 알림을 띄우지 않는다(이번 세션에서 바꾼 경우에만)
  dismissedEpoch = changeEpoch;
  if (note) msg(note);
}

async function openProject(file: File) {
  if (!(await confirmDiscard('프로젝트'))) return;
  await busy(async () => {
    await applyOpened(await unpackProject(file));
    msg('프로젝트를 열었습니다.', 'ok');
  });
}

// ---------- 다른 프로젝트에서 면 가져오기 ----------
/** 선택한 면만 원본 프로젝트에서 현재 프로젝트로 복사한다. 한 번의 실행 취소 항목이며, 선택하지 않은 면·옵션을 끈 항목은 바꾸지 않는다. */
async function applyImportedFaces(src: OpenedProject, o: ImportOptions) {
  const ids = o.ids;
  const withImage = ids.filter((id) => faces[id].img);
  if (withImage.length && !(await confirmDialog({ kind: 'confirm-import-replace', title: '면 이미지 바꾸기', text: `${withImage.map((id) => FACES.find((f) => f.id === id)!.label).join(', ')} 이미지가 바뀝니다.\n실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.`, ok: '가져오기', cancel: '취소' }))) throw new Error('가져오기를 취소했습니다.');
  // 필요한 것을 모두 읽은 뒤에 현재 작업을 바꾼다(중간에 실패해도 현재 작업은 그대로)
  const dec = new Map<FaceId, Awaited<ReturnType<typeof decode>>>();
  const und = new Map<FaceId, Awaited<ReturnType<typeof decodeUnder>>>();
  for (const id of ids) {
    const p = src.faces[id];
    dec.set(id, await decode(p.blob!));
    if (o.underlay && p.under) und.set(id, await decodeUnder(p.under.blob));
  }
  opening = true; // 치수·면 갱신 중 비율 알림·변경 표시 중복 방지(끝에서 직접 처리)
  try {
    pushHistoryMany(ids);
    if (o.bgColor && src.colors) undoStack[undoStack.length - 1].colors = currentColors(); // 가져오기 전 색을 같은 실행 취소 항목에 담는다
    if (ids.some((id) => groupOf(id) === 'base') && !baseEnabled) setBaseEnabled(true, false);
    if (o.params && src.params) applyParams(cloneParams(src.params), false);
    for (const id of ids) {
      const p = src.faces[id], d = dec.get(id)!, f = faces[id];
      f.blob = p.blob; f.name = p.name; f.img = d.img; f.iw = d.iw; f.ih = d.ih;
      f.state = o.transform ? { ...p.state } : defaultState();
      f.under = null; f.underOnTop = false;
      const ud = und.get(id);
      if (ud && p.under) { f.under = { state: { ...p.under.state }, blob: p.under.blob, name: p.under.name, ...ud }; f.underOnTop = p.under.onTop; }
    }
    if (o.bgColor && src.colors) { const { face, lid, base, ...detail } = src.colors; applyColors(face, lid, base, detail); }
    if (o.dieline) {
      const sd = src.dielines ?? {};
      for (const k of ['lid', 'base'] as const) if (sd[k] && Object.keys(sd[k]!.regions).length && ids.some((id) => groupOf(id) === k)) dielines = { ...dielines, [k]: sd[k]! };
      renderDielineInfo();
    }
    for (const id of ids) apply(id);
  } finally { opening = false; }
  // 가져온 면의 비율 기준은 원본 프로젝트의 면 크기: 현재 치수와 다르면 기존 "비율 변경" 알림이 그 면에 뜬다
  const srcSizes = faceSizes(src.params ?? params);
  for (const id of ids) ratioRef[id] = ratioOf(srcSizes[id]);
  recomputeRatio();
  setDirty(true);
  scheduleDraft();
  setCurrent(ids[0]);
  msg(`다른 프로젝트에서 ${ids.length}면을 가져왔습니다. (Ctrl+Z로 되돌릴 수 있습니다)`, 'ok');
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
    savedAt: Date.now(), templateId: activeTemplateId, lidLiftMm: Math.round(viewer.getLiftMm()), colors: { face, lid, base, ...detailFor() }, useBase: baseEnabled, params: cloneParams(params), dielines,
    background: $<HTMLSelectElement>('bgSel').value === 'transparent' ? 'transparent' : 'white',
    viewSettings: { background: { settings: JSON.parse(JSON.stringify(bg)) as BgSettings, blob: bgImg?.blob ?? null, name: bgImg?.name ?? null } },
    faces: Object.fromEntries(FACES.map((x) => [x.id, { state: { ...faces[x.id].state }, blob: faces[x.id].blob, name: faces[x.id].name, under: underSave(x.id) }])) as Draft['faces'],
    viewPresets: presets.filter((p): p is ViewPresetSlot => p !== null),
  };
}

async function saveDraft(manual: boolean) {
  try {
    const d = collectDraft();
    await putDraft(d);
    $('draftInfo').textContent = `${manual ? '임시저장' : '자동 저장'}됨 · ${timeText(d.savedAt)}`;
    $<HTMLButtonElement>('btnDraftLoad').disabled = false;
    setDraftDot(null);
    if (manual) msg('임시저장했습니다. (이 브라우저 안에 보관됩니다)', 'ok');
  } catch (e) {
    $('draftInfo').textContent = '임시저장 실패';
    if (manual) msg(e instanceof Error ? e.message : String(e));
  }
}

/** 변경 후 1.5초 뒤 자동 저장. 이미지가 하나도 없을 때는 기존 임시저장을 덮어쓰지 않는다. */
function scheduleDraft() {
  if (!opening) setDirty(true);
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
  if (dirty || hasAnyImage()) {
    if (!(await confirmDialog({ kind: 'confirm-draft-load', title: '임시저장 불러오기', text: '현재 작업을 임시저장된 내용으로 바꿉니다.\n계속할까요?', ok: '불러오기', cancel: '취소' }))) return;
  }
  await busy(async () => {
    const d = await getDraft();
    if (!d) throw new UserError('임시저장된 작업이 없습니다.');
    await applyOpened(d);
    msg(`임시저장을 불러왔습니다. (${timeText(d.savedAt)})`, 'ok');
    setDraftDot(null);
  });
}

// ---------- 임시저장 알림: 3D 화면 안 왼쪽 아래에 떠 있는 알림(레이아웃을 밀지 않음) ----------
const toastEl = $('draftToast');
let toastSavedAt = 0, toastClosed = false, toastSuppressed = false, toastPending = false, toastHold = false, toastTimer = 0;
/** 상단 "열기" 메뉴의 임시저장 줄에 날짜와 작은 주황 점을 표시한다(null이면 제거) */
const setDraftDot = (savedAt: number | null) => {
  const b = $('btnTopDraftLoad'); b.textContent = '임시저장 불러오기';
  if (savedAt === null) return;
  const s = document.createElement('small'); s.className = 'dt-date'; s.textContent = timeText(savedAt);
  const i = document.createElement('i'); i.className = 'dt-dot'; i.setAttribute('aria-hidden', 'true');
  b.append(' ', s, i);
};
const hideDraftToast = () => { clearTimeout(toastTimer); toastEl.hidden = true; };
const armDraftToast = () => { clearTimeout(toastTimer); if (!toastHold) toastTimer = window.setTimeout(hideDraftToast, 12000); };
const showDraftToast = () => {
  if (toastClosed || toastSuppressed || !toastSavedAt) return;
  if (externalGlbActive) { toastPending = true; return; } // 외부 GLB를 보는 동안은 표시하지 않고 돌아간 뒤 표시
  $('draftToastText').textContent = `${timeText(toastSavedAt)}에 자동 보관된 작업입니다.`;
  toastEl.hidden = false; armDraftToast();
};
const closeDraftToast = () => { toastClosed = true; toastPending = false; hideDraftToast(); };
const suppressDraftToast = () => { toastSuppressed = true; toastPending = false; hideDraftToast(); };
const holdDraftToastForExternal = () => { if (!toastEl.hidden) { toastPending = true; hideDraftToast(); } };
const showDraftToastIfPending = () => { if (toastPending) { toastPending = false; showDraftToast(); } };
const offerDraftToast = (savedAt: number) => { toastSavedAt = savedAt; setDraftDot(savedAt); showDraftToast(); };
toastEl.addEventListener('mouseenter', () => { toastHold = true; clearTimeout(toastTimer); });
toastEl.addEventListener('mouseleave', () => { toastHold = toastEl.contains(document.activeElement); armDraftToast(); });
toastEl.addEventListener('focusin', () => { toastHold = true; clearTimeout(toastTimer); });
toastEl.addEventListener('focusout', (e) => { if (!toastEl.contains((e as FocusEvent).relatedTarget as Node | null)) { toastHold = false; armDraftToast(); } });
toastEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeDraftToast(); } });
$('btnDraftToastClose').onclick = closeDraftToast;
$('btnDraftToastLoad').onclick = () => { hideDraftToast(); void loadDraft(); };

// ---------- 깨끗한 화면(녹화용): 3D 캔버스만 남기고 모든 화면 요소를 숨긴다. 저장하지 않고 항상 보통 화면으로 시작한다. ----------
let cleanScreen = false;
const cleanScroll = new Map<Element, number>(); // 숨기기 전 스크롤 위치(숨겼다 보이면 브라우저가 0으로 돌려 놓을 수 있어 직접 복원)
function setCleanScreen(on: boolean) {
  if (on === cleanScreen) return;
  if (on) {
    cleanScroll.clear();
    document.querySelectorAll<HTMLElement>('#panel, #panel *, #facePanel, #facePanel *').forEach((el) => { if (el.scrollTop > 0) cleanScroll.set(el, el.scrollTop); });
    document.querySelectorAll<HTMLElement>('.popover').forEach((m) => { m.hidden = true; });
    document.getElementById('btnMore')?.setAttribute('aria-expanded', 'false');
    clearMsg(); hideDraftToast(); // 해제 뒤에 이전 알림을 다시 띄우지 않는다(기록에는 남아 있음)
    cleanScreen = true; viewer.setCleanScreen(true);
    document.body.classList.add('clean-screen');
    (document.activeElement as HTMLElement | null)?.blur();
  } else {
    document.body.classList.remove('clean-screen');
    cleanScreen = false; viewer.setCleanScreen(false);
    for (const [el, top] of cleanScroll) (el as HTMLElement).scrollTop = top;
    cleanScroll.clear();
  }
}
// Esc는 단축키 사용 설정과 상관없이 항상 해제하고, 이 모드에서 다른 Esc 동작보다 먼저 처리한다(캡처 단계).
window.addEventListener('keydown', (e) => { if (cleanScreen && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setCleanScreen(false); } }, true);
// 터치 기기: 오른쪽 위 모서리를 1초 길게 누르면 해제(화면에 아무 표시도 하지 않는다)
{
  const stageEl = $('stage'); let t = 0, sx = 0, sy = 0;
  stageEl.addEventListener('pointerdown', (e) => {
    if (!cleanScreen || e.pointerType !== 'touch') return;
    const r = stageEl.getBoundingClientRect();
    if (e.clientX < r.right - 64 || e.clientY > r.top + 64) return;
    sx = e.clientX; sy = e.clientY; clearTimeout(t); t = window.setTimeout(() => setCleanScreen(false), 1000);
  }, true);
  stageEl.addEventListener('pointermove', (e) => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) { clearTimeout(t); t = 0; } }, true);
  for (const ev of ['pointerup', 'pointercancel']) stageEl.addEventListener(ev, () => { clearTimeout(t); t = 0; }, true);
}
$('btnCleanScreen').onclick = () => setCleanScreen(true);

async function initDraft() {
  try {
    const d = await getDraft();
    if (d) {
      $('draftInfo').textContent = `임시저장 있음 · ${timeText(d.savedAt)}`;
      $<HTMLButtonElement>('btnDraftLoad').disabled = false;
      offerDraftToast(d.savedAt); // 상단 띠 대신 3D 화면 안의 알림으로(레이아웃을 밀지 않음)
    }
  } catch { $('draftInfo').textContent = '이 브라우저에서는 임시저장을 쓸 수 없습니다'; }
  draftReady = true;
}

async function saveGlb() {
  await busy(async () => {
    const buf = await viewer.exportGLB();
    const r = await saveFile(new Blob([buf], { type: 'model/gltf-binary' }), 'glb', defaultStem('사바리_목업'), download);
    if (!r.saved) return;
    msg(`GLB를 저장했습니다. (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB, 이미지 임베드)`, 'ok');
  });
}

async function savePng() {
  await busy(async () => {
    const sel = $<HTMLSelectElement>('bgSel').value as 'white' | 'transparent' | 'screen';
    const r = await viewer.screenshotScaled(sel === 'screen' ? 'transparent' : sel, Number($<HTMLSelectElement>('pngScale').value));
    if (sel === 'screen') r.blob = await composeScreenPng(r.blob, r.width, r.height); // 배경(단색·이미지·흰색)과 그림자를 포함해 화면 그대로
    const lowered = r.applied < r.requested - 1e-9;
    const sv = await saveFile(r.blob, 'png', defaultStem('사바리_목업'), download);
    if (!sv.saved) return;
    if (lowered) {
      const t = `장치가 만들 수 있는 최대 크기를 넘어 ${r.requested}배 대신 ${r.applied.toFixed(2)}배(${r.width}×${r.height}px)로 저장했습니다.`;
      msg(t, 'ok');
      await infoDialog({ kind: 'info', title: 'PNG 저장 크기 안내', text: t });
    } else msg(`PNG를 저장했습니다. (${r.width}×${r.height}px)`, 'ok');
  });
}

// ---------- 목업 색상 ----------
let defaultColors = { face: '#ffffff', lid: '#ffffff', base: '#ffffff' };
/** 고급 색상(작업 28): 키가 없으면 "다른 항목과 같게". 저장 파일·임시저장에는 정해진 항목만 기록한다. */
type DetailColors = Partial<Record<DetailKey, string>>;
let detailColors: DetailColors = {};
const ADV_IDS: [DetailKey, string][] = [['lidRim', 'LidRim'], ['lidInner', 'LidInner'], ['baseFace', 'BaseFace'], ['baseRim', 'BaseRim'], ['baseInner', 'BaseInner']];
const detailFor = (): DetailColors => ({ ...detailColors });
const currentColors = (): ColorSnap => ({ face: $<HTMLInputElement>('colFace').value, lid: $<HTMLInputElement>('colLid').value, base: $<HTMLInputElement>('colBase').value, detail: { ...detailColors } });
function syncAdvUi() {
  for (const [k, id] of ADV_IDS) {
    const chk = $<HTMLInputElement>('advChk' + id), col = $<HTMLInputElement>('advCol' + id);
    const own = detailColors[k];
    chk.checked = own === undefined; col.disabled = own === undefined;
    col.value = own ?? (k.startsWith('lid') ? $<HTMLInputElement>('colLid').value : $<HTMLInputElement>('colBase').value);
  }
}

function applyColors(face: string, lid: string, base: string, detail: DetailColors = detailColors) {
  detailColors = { ...detail };
  $<HTMLInputElement>('colFace').value = face;
  $<HTMLInputElement>('colLid').value = lid;
  $<HTMLInputElement>('colBase').value = base;
  viewer.setPartColor('lid', lid);
  viewer.setPartColor('base', base);
  viewer.setDetailColors(detailColors);
  syncAdvUi();
  theme.faceBg = face;
  theme.baseBg = detailColors.baseFace ?? base; // 이미지 없는 하단 면·여백·투명 픽셀은 "몸통 바깥 면" 색(따로 정하지 않았으면 몸통 색)
  viewer.setFaceBg(face);
  for (const f of FACES) if (faces[f.id].img) apply(f.id); // 여백 색이 바뀌므로 다시 굽는다
  scheduleDraft();
}

// ---------- 박스 / 뷰어 ----------
function setLift(mm: number) {
  const v = Math.min(150, Math.max(0, Math.round(mm)));
  viewer.setLiftMm(v);
  for (const id of ['liftR', 'liftN']) $<HTMLInputElement>(id).value = String(v);
  updateOpenNotice();
  scheduleDraft();
}

function syncBoxControlsForSlot() {
  for (const id of ['liftR', 'liftN']) $<HTMLInputElement>(id).value = String(Math.round(viewer.getLiftMm()));
  $<HTMLInputElement>('showLid').checked = viewer.getPartVisible('lid');
  $<HTMLInputElement>('showBase').checked = viewer.getPartVisible('base');
  updateOpenNotice();
}

async function openGlb(file: File) {
  await busy(async () => {
    const info = await viewer.loadExternal(await file.arrayBuffer()).catch(() => {
      throw new Error('GLB를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.');
    });
    if (!externalGlbActive) workSnapshot = viewer.capturePose();
    externalGlbActive = true;
    renderPresets();
    viewer.setSlot('viewer');
    viewer.setEditingEnabled(false);
    setExternalUi(true);
    $('extGlbBannerText').textContent = `외부 GLB를 보는 중 · ${file.name}`;
    $('extGlbBanner').hidden = false;
    holdDraftToastForExternal();
    syncBoxControlsForSlot();
    const dimText = info.params ? ` · 몸통 ${info.params.baseW}×${info.params.baseD}×${info.params.baseH}mm` : '';
    $('glbInfo').textContent = `${file.name} · 메시 ${info.meshes}개 · 이미지가 붙은 재질 ${info.textured}개${dimText}`;
    syncGlbEntry(file.name);
    showView('iso', true);
    clearMsg();
  });
}

/** 보기 탭 맨 위 "GLB 보기" 한 줄(작업 33): 열기 메뉴의 #glbInfo 와 같은 상태를 보여 주고, 외부 GLB 중에는 돌아가기 버튼을 보인다. */
function syncGlbEntry(extName?: string) {
  const info = $('glbInfoView'), back = $('btnExtGlbBackView');
  const text = externalGlbActive && extName ? `외부 GLB 보는 중 · ${extName}` : ($('glbInfo').textContent ?? '불러온 파일 없음');
  info.textContent = text; info.title = text;
  back.hidden = !externalGlbActive;
}

function returnToWork() {
  if (!externalGlbActive) return;
  externalGlbActive = false;
  syncGlbEntry();
  renderPresets();
  viewer.setSlot('editor');
  setExternalUi(false);
  $('extGlbBanner').hidden = true;
  if (workSnapshot) { viewer.restorePose(workSnapshot); workSnapshot = null; }
  syncBoxControlsForSlot();
  showDraftToastIfPending();
  clearMsg();
}

async function handleFile(file: File) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.glb')) return openGlb(file);
  if (n.endsWith('.sabari')) { returnToWork(); return openProject(file); }
  if (externalGlbActive) returnToWork();
  await busy(() => setImage(current, file, file.name), file.size > 8e6 ? '큰 이미지를 처리하는 중…' : '이미지를 처리하는 중…');
}

// ---------- 화면 설정 (접기·펼치기, 단축키 사용) — 이 브라우저의 localStorage에 기억 ----------
const UI_KEY = 'sabari-ui';
let keysEnabled = true;
const loadUi = (): { open?: Record<string, boolean>; keys?: boolean; shade?: number; ratio?: number } => {
  try { return JSON.parse(localStorage.getItem(UI_KEY) ?? '{}'); } catch { return {}; }
};
const saveUi = (patch: object) => { try { localStorage.setItem(UI_KEY, JSON.stringify({ ...loadUi(), ...patch })); } catch { /* 저장 불가 환경이면 기억만 안 한다 */ } };
// 개별 설정 2개(이 브라우저에만 기억, 기본 켜짐)
{
  const optRot = $<HTMLSelectElement>('optRotPlace'), optFloat = $<HTMLInputElement>('optFloatViews');
  const prefs = loadUi() as { rotPlace?: string; floatViews?: boolean };
  // 회전 각도 표시 위치(작업 29): 한 번에 한 곳에만 표시한다. 이전의 "회전 각도 배지 보기" 저장 값(rotBadge)은 무시한다.
  optRot.value = ['panel', 'view', 'off'].includes(prefs.rotPlace ?? '') ? (prefs.rotPlace as string) : 'panel'; optFloat.checked = prefs.floatViews !== false;
  const apply = () => {
    document.body.classList.remove('rotplace-panel', 'rotplace-view', 'rotplace-off'); document.body.classList.add(`rotplace-${optRot.value}`);
    document.body.classList.toggle('hide-floatviews', !optFloat.checked);
    document.dispatchEvent(new Event('sabari-rotplace'));
  };
  optRot.onchange = () => { saveUi({ rotPlace: optRot.value }); apply(); };
  optFloat.onchange = () => { saveUi({ floatViews: optFloat.checked }); apply(); };
  apply();
}

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
  const askOpt = $<HTMLInputElement>('optAskName');
  askOpt.checked = askEnabled();
  askOpt.onchange = () => setAskEnabled(askOpt.checked);
  const ver = `사바리 목업 스튜디오 v${__APP_VERSION__} · ${__GIT_HASH__} · 빌드 ${__BUILD_DATE__}`;
  $('verLine').textContent = ver; // 빌드 시점에 주입된 값(외부 요청 없음)
  $('btnCopyVer').onclick = async () => {
    try { await navigator.clipboard.writeText(ver); msg('버전 정보를 복사했습니다.', 'ok'); }
    catch { await infoDialog({ kind: 'info', title: '복사하지 못했습니다', text: `아래 문구를 직접 복사해 주세요.\n${ver}` }); }
  };
  $('btnHelpOpen').onclick = () => { $('moreMenu').hidden = true; $('btnMore').setAttribute('aria-expanded', 'false'); openHelp(); };
  $('helpClose').onclick = () => $<HTMLDialogElement>('helpDlg').close();
  $('btnUiReset').onclick = () => { for (const [d, open] of defaults) d.open = open; saveUi({ open: {} }); };
  $('btnDraftClear').onclick = async () => {
    if (!(await confirmDialog({ kind: 'confirm-draft-clear', title: '임시저장 삭제', text: '이 브라우저에 보관된 임시저장을 삭제할까요?\n(파일로 저장한 .sabari 프로젝트에는 영향이 없습니다.)', ok: '삭제', cancel: '취소' }))) return;
    await busy(async () => {
      await delDraft();
      $('draftInfo').textContent = '임시저장 없음';
      $<HTMLButtonElement>('btnDraftLoad').disabled = true;
      msg('임시저장을 삭제했습니다.', 'ok');
    });
  };
}

// ---------- 배경(작업 13): 화면 전용 배경 캔버스 + PNG "화면 그대로" 합성 ----------
let bg: BgSettings = JSON.parse(JSON.stringify(DEFAULT_BG));
/** 배경 이미지: 사용자 파일(원본 blob 보관) 또는 샘플(blob 없음, 번호로 다시 만든다). canvas 는 표시용(긴 변 4096px 이내). */
let bgImg: { blob: Blob | null; name: string | null; canvas: HTMLCanvasElement } | null = null;
const bgSource = (): BgSource => (bgImg ? { img: bgImg.canvas, w: bgImg.canvas.width, h: bgImg.canvas.height } : null);

let lastHz = -1;
function renderBg() {
  const cv = $<HTMLCanvasElement>('bgCanvas'), r = $('viewport').getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  drawBackground(cv.getContext('2d')!, w, h, bg, bgSource(), true, viewer.horizonFrac());
  lastHz = viewer.horizonFrac();
}

/** 저장 PNG "화면 그대로": 투명 배경으로 그린 박스(그림자 포함)를 같은 그리기 함수의 배경 위에 합성한다. 체크무늬는 넣지 않는다. */
async function composeScreenPng(blob: Blob, w: number, h: number): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  drawBackground(ctx, w, h, bg, bgSource(), false, viewer.horizonFrac());
  ctx.drawImage(bmp, 0, 0); bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG 생성 실패'))), 'image/png'));
}

/** PNG 배경 선택의 기본값: 배경이 단색·이미지면 "화면 그대로", 아니면(이미 "화면 그대로"였다면) 현재 배경 종류에 맞는 기존 옵션 */
function syncPngBgDefault() {
  const sel = $<HTMLSelectElement>('bgSel');
  if (bg.kind === 'solid' || bg.kind === 'image' || bg.kind === 'studio') sel.value = 'screen';
  else if (sel.value === 'screen') sel.value = bg.kind === 'transparent' ? 'transparent' : 'white';
}

function syncBgUi() {
  document.querySelectorAll<HTMLButtonElement>('[data-bgkind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.bgkind === bg.kind)));
  $('bgTransparentCtl').hidden = bg.kind !== 'transparent';
  $('bgSolidCtl').hidden = bg.kind !== 'solid';
  $('bgImageCtl').hidden = bg.kind !== 'image';
  $('bgStudioCtl').hidden = bg.kind !== 'studio';
  $<HTMLInputElement>('bgStudioWall').value = bg.studio.wall; $<HTMLInputElement>('bgStudioFloor').value = bg.studio.floor;
  document.querySelectorAll<HTMLButtonElement>('#bgStudioWallChips button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === bg.studio.wall)));
  document.querySelectorAll<HTMLButtonElement>('#bgStudioFloorChips button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === bg.studio.floor)));
  for (const [id, v] of [['bgVig', bg.studio.vignette], ['bgHor', bg.studio.horizon]] as [string, number][]) for (const sfx of ['R', 'N']) $<HTMLInputElement>(id + sfx).value = String(Math.round(v));
  const hAuto = $<HTMLButtonElement>('bgHorizonAuto'); hAuto.setAttribute('aria-checked', String(bg.studio.horizonAuto));
  for (const sfx of ['R', 'N']) $<HTMLInputElement>('bgHor' + sfx).disabled = bg.studio.horizonAuto;
  const ck = $<HTMLButtonElement>('bgChecker'); ck.setAttribute('aria-pressed', String(bg.checkerDark)); ck.textContent = bg.checkerDark ? '체크무늬 밝게' : '체크무늬 어둡게';
  $<HTMLInputElement>('bgColor').value = bg.color;
  document.querySelectorAll<HTMLButtonElement>('#bgChips button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === bg.color)));
  document.querySelectorAll<HTMLButtonElement>('#bgSamples button').forEach((b) => b.setAttribute('aria-pressed', String(bg.image.sample === Number(b.dataset.i))));
  for (const [id, v] of [['bgX', bg.image.x], ['bgY', bg.image.y], ['bgScale', bg.image.scale]] as [string, number][]) for (const sfx of ['R', 'N']) $<HTMLInputElement>(id + sfx).value = String(Math.round(v));
  (document.querySelector(`input[name=bgfit][value=${bg.image.fit}]`) as HTMLInputElement).checked = true;
  $<HTMLButtonElement>('btnBgRemove').disabled = !bgImg;
  $('bgImageInfo').textContent = bgImg ? (bg.image.sample !== null ? `샘플 배경 ${bg.image.sample + 1}` : `${bgImg.name ?? '배경 이미지'} · 표시용 ${bgImg.canvas.width}×${bgImg.canvas.height}px`) : '배경 이미지 없음';
}

function bgChanged(kindChanged = false) {
  renderBg(); syncBgUi();
  if (kindChanged) syncPngBgDefault();
  scheduleDraft();
}
const setBgKind = (k: BgSettings['kind']) => { bg.kind = k; bgChanged(true); };
const cycleBg = () => setBgKind(nextKind(bg.kind, !!bgImg));

/** 열기(프로젝트·임시저장)·새 상태: 저장된 배경을 적용한다. 필드가 없는 이전 파일은 기본 배경(흰색)으로 연다. */
async function applyBgFromSave(b?: { settings: BgSettings; blob: Blob | null; name: string | null }) {
  bg = b ? sanitizeBg(b.settings) : JSON.parse(JSON.stringify(DEFAULT_BG));
  bgImg = null;
  if (b && bg.image.sample !== null) bgImg = { blob: null, name: null, canvas: makeSample(bg.image.sample) };
  else if (b?.blob) {
    try { const l = await loadBgImage(b.blob); bgImg = { blob: b.blob, name: b.name, canvas: l.canvas }; } catch { bgImg = null; }
  }
  if (bg.kind === 'image' && !bgImg) bg.kind = 'white';
  renderBg(); syncBgUi();
  if (bg.kind === 'solid' || bg.kind === 'image' || bg.kind === 'studio') $<HTMLSelectElement>('bgSel').value = 'screen';
}

function initBackground() {
  const chips = $('bgChips');
  for (const c of BG_CHIPS) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.color = c.color; b.style.background = c.color; b.title = c.name; b.setAttribute('aria-label', `배경 색 ${c.name}`); b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span>${c.name}</span>`;
    b.onclick = () => { bg.color = c.color; setBgKind('solid'); };
    chips.appendChild(b);
  }
  const samples = $('bgSamples');
  BG_SAMPLES.forEach(([a, z], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.i = String(i); b.style.background = `linear-gradient(135deg, ${a}, ${z})`; b.title = `샘플 배경 ${i + 1}`; b.setAttribute('aria-label', `샘플 배경 ${i + 1}`); b.setAttribute('aria-pressed', 'false');
    b.onclick = () => { bgImg = { blob: null, name: null, canvas: makeSample(i) }; bg.image.sample = i; setBgKind('image'); };
    samples.appendChild(b);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-bgkind]').forEach((b) => (b.onclick = () => setBgKind(b.dataset.bgkind as BgSettings['kind'])));
  // 스튜디오 배경(작업 25): 벽·바닥 색(빠른 색 칩 + 직접 선택), 비네팅, 수평선(자동/고정)
  for (const [boxId, key] of [['bgStudioWallChips', 'wall'], ['bgStudioFloorChips', 'floor']] as [string, 'wall' | 'floor'][]) {
    for (const c of [{ name: '흰색', color: '#ffffff' }, { name: '밝은 회색', color: '#e6e6e6' }, { name: '회색', color: '#949494' }, { name: '어두운 회색', color: '#4a4a4a' }, { name: '베이지', color: '#e8dccb' }, { name: '하늘', color: '#cfe0ee' }]) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.color = c.color; b.style.background = c.color; b.title = c.name; b.setAttribute('aria-label', `${key === 'wall' ? '벽' : '바닥'} 색 ${c.name}`); b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span>${c.name}</span>`;
      b.onclick = () => { bg.studio[key] = c.color; bgChanged(); };
      $(boxId).appendChild(b);
    }
  }
  $<HTMLInputElement>('bgStudioWall').oninput = (e) => { bg.studio.wall = (e.target as HTMLInputElement).value.toLowerCase(); bgChanged(); };
  $<HTMLInputElement>('bgStudioFloor').oninput = (e) => { bg.studio.floor = (e.target as HTMLInputElement).value.toLowerCase(); bgChanged(); };
  for (const [id, key] of [['bgVig', 'vignette'], ['bgHor', 'horizon']] as [string, 'vignette' | 'horizon'][]) {
    for (const sfx of ['R', 'N']) {
      const el = $<HTMLInputElement>(id + sfx);
      el[sfx === 'R' ? 'oninput' : 'onchange'] = () => { const v = Number(el.value); if (!Number.isNaN(v)) { bg.studio[key] = Math.min(100, Math.max(0, v)); bgChanged(); } };
    }
  }
  $('bgHorizonAuto').onclick = () => { bg.studio.horizonAuto = !bg.studio.horizonAuto; bgChanged(); };
  viewer.addDrawListener(() => { if (bg.kind === 'studio' && bg.studio.horizonAuto && Math.abs(viewer.horizonFrac() - lastHz) > 0.002) renderBg(); });
  $('bgChecker').onclick = () => { bg.checkerDark = !bg.checkerDark; bgChanged(); };
  $<HTMLInputElement>('bgColor').oninput = (e) => { bg.color = (e.target as HTMLInputElement).value.toLowerCase(); setBgKind('solid'); };
  document.querySelectorAll<HTMLInputElement>('input[name=bgfit]').forEach((r) => (r.onchange = () => { if (r.checked) { bg.image.fit = r.value as 'contain' | 'cover'; bgChanged(); } }));
  for (const [id, key, lo, hi] of [['bgX', 'x', -100, 100], ['bgY', 'y', -100, 100], ['bgScale', 'scale', 25, 300]] as [string, 'x' | 'y' | 'scale', number, number][]) {
    for (const sfx of ['R', 'N']) {
      const el = $<HTMLInputElement>(id + sfx);
      el[sfx === 'R' ? 'oninput' : 'onchange'] = () => { const v = Number(el.value); if (!Number.isNaN(v)) { bg.image[key] = Math.min(hi, Math.max(lo, v)); bgChanged(); } };
    }
  }
  const file = $<HTMLInputElement>('bgImageFile');
  $('btnBgImage').onclick = () => file.click();
  file.onchange = () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    busy(async () => { const l = await loadBgImage(f); bgImg = { blob: f, name: f.name, canvas: l.canvas }; bg.image.sample = null; setBgKind('image'); }, '배경 이미지를 처리하는 중…');
  };
  $('btnBgRemove').onclick = () => { bgImg = null; bg.image.sample = null; if (bg.kind === 'image') bg.kind = 'white'; bgChanged(true); };
  new ResizeObserver(() => renderBg()).observe($('viewport'));
  syncBgUi(); renderBg();
}

// ---------- 경계 점검(작업 14, 화면 전용): 확대경 + 알파 마스크 ----------
// 화면 스냅샷(PNG 저장과 같은 그리기 경로, 투명 배경)을 따로 만들어 그 위에서만 확대·알파를 보여 준다. 렌더러·PNG·GLB·저장 파일에는 아무 영향도 주지 않는다.
const edge = { on: false, zoom: 4 as 4 | 8, alpha: false };
let edgeSnap: { base: HTMLCanvasElement; alphaCv: HTMLCanvasElement } | null = null;
let edgeSig = '', edgeTimer = 0;
let edgeMouse: { x: number; y: number } | null = null;

const edgeSignature = (): string => {
  const c = viewer.camera, q = viewer.boxQuat, r = $('viewport').getBoundingClientRect();
  return [c.position.x, c.position.y, c.position.z, c.quaternion.x, c.quaternion.y, c.quaternion.z, q.x, q.y, q.z, q.w, c.fov, viewer.getLiftMm(), r.width, r.height, JSON.stringify(bg), bgImg ? bgImg.canvas.width : 0, JSON.stringify(viewer.getFloorShadow())].map((n) => (typeof n === 'number' ? n.toFixed(5) : n)).join('|');
};

function takeEdgeSnapshot() {
  const snap = viewer.snapshot(2); // 투명 배경(그림자 포함, 선택선 제외)
  const w = snap.width, h = snap.height;
  const base = document.createElement('canvas'); base.width = w; base.height = h;
  const bctx = base.getContext('2d')!;
  drawBackground(bctx, w, h, bg, bgSource(), true, viewer.horizonFrac()); // 지금 화면 배경(체크무늬 포함) 위에
  bctx.drawImage(snap, 0, 0);
  // 알파 마스크: 불투명도만 흑백(흰색 = 불투명)
  const src = snap.getContext('2d')!.getImageData(0, 0, w, h);
  const out = new ImageData(w, h);
  for (let i = 0; i < src.data.length; i += 4) { const a = src.data[i + 3]; out.data[i] = a; out.data[i + 1] = a; out.data[i + 2] = a; out.data[i + 3] = 255; }
  const alphaCv = document.createElement('canvas'); alphaCv.width = w; alphaCv.height = h;
  alphaCv.getContext('2d')!.putImageData(out, 0, 0);
  edgeSnap = { base, alphaCv };
  edgeSig = edgeSignature();
  renderEdgeMask(); drawLoupe();
}

function renderEdgeMask() {
  const cv = $<HTMLCanvasElement>('edgeMask');
  cv.hidden = !(edge.on && edge.alpha && edgeSnap);
  if (cv.hidden || !edgeSnap) return;
  cv.width = edgeSnap.alphaCv.width; cv.height = edgeSnap.alphaCv.height;
  cv.getContext('2d')!.drawImage(edgeSnap.alphaCv, 0, 0);
}

function drawLoupe() {
  const wrap = $('edgeLoupe');
  if (!edge.on || !edgeMouse || !edgeSnap) { wrap.hidden = true; return; }
  const r = $('viewport').getBoundingClientRect();
  const u = (edgeMouse.x - r.left) / r.width, v = (edgeMouse.y - r.top) / r.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) { wrap.hidden = true; return; }
  const src = edge.alpha ? edgeSnap.alphaCv : edgeSnap.base;
  const cv = $<HTMLCanvasElement>('edgeLoupeCv'), g = cv.getContext('2d')!;
  const k = src.width / r.width; // 화면 CSS 픽셀 → 스냅샷 픽셀
  const size = cv.width / edge.zoom * k; // 확대경이 보여 주는 스냅샷 영역(변 길이)
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(src, u * src.width - size / 2, v * src.height - size / 2, size, size, 0, 0, cv.width, cv.height);
  // 가운데 십자 표시
  g.strokeStyle = 'rgba(232, 89, 12, 0.9)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cv.width / 2 - 8, cv.height / 2); g.lineTo(cv.width / 2 + 8, cv.height / 2); g.moveTo(cv.width / 2, cv.height / 2 - 8); g.lineTo(cv.width / 2, cv.height / 2 + 8); g.stroke();
  $('edgeLoupeLabel').textContent = `${edge.zoom}배${edge.alpha ? ' · 알파' : ''}`;
  const sr = $('stage').getBoundingClientRect();
  let lx = edgeMouse.x - sr.left + 18, ly = edgeMouse.y - sr.top + 18;
  if (lx + 204 > sr.width) lx = edgeMouse.x - sr.left - 218;
  if (ly + 204 > sr.height) ly = edgeMouse.y - sr.top - 218;
  wrap.style.left = Math.max(4, lx) + 'px'; wrap.style.top = Math.max(4, ly) + 'px';
  wrap.hidden = false;
}

function syncEdgeUi() {
  $('edgeToggle').setAttribute('aria-pressed', String(edge.on));
  $('edgeToggle').textContent = edge.on ? '경계 점검 끄기' : '경계 점검 켜기';
  $('edgeCtl').hidden = !edge.on;
  $('edgeAlpha').setAttribute('aria-pressed', String(edge.alpha));
}

function initEdgeInspect() {
  const stageEl = $('stage');
  $('edgeToggle').onclick = () => {
    edge.on = !edge.on; syncEdgeUi();
    if (edge.on) takeEdgeSnapshot(); else { $('edgeLoupe').hidden = true; $('edgeMask').hidden = true; edgeSnap = null; }
  };
  $('edgeAlpha').onclick = () => { edge.alpha = !edge.alpha; syncEdgeUi(); renderEdgeMask(); drawLoupe(); };
  document.querySelectorAll<HTMLInputElement>('input[name=edgezoom]').forEach((r) => (r.onchange = () => { if (r.checked) { edge.zoom = Number(r.value) as 4 | 8; drawLoupe(); } }));
  stageEl.addEventListener('pointermove', (e) => { edgeMouse = { x: e.clientX, y: e.clientY }; if (edge.on) drawLoupe(); });
  stageEl.addEventListener('pointerleave', () => { edgeMouse = null; $('edgeLoupe').hidden = true; });
  // 화면이 바뀌면(회전·확대·이동·크기·배경 등) 잠깐 기다렸다 스냅샷을 다시 만든다. 점검 중에도 회전·확대는 그대로 쓸 수 있다.
  const tick = () => {
    if (edge.on) {
      const sig = edgeSignature();
      if (sig !== edgeSig && !edgeTimer) edgeTimer = window.setTimeout(() => { edgeTimer = 0; if (edge.on) takeEdgeSnapshot(); }, 150);
    }
    requestAnimationFrame(tick);
  };
  tick();
  syncEdgeUi();
}

// ---------- 작업 탭 · 패널 접기 · 상단 바 · 선택한 면 · 하단 플로팅 · 모바일 시트 (작업 12) ----------
// 활성 탭·접힘 상태는 이 브라우저의 localStorage에만 기억하고 .sabari·임시저장에는 저장하지 않는다.
type TabId = 'design' | 'box' | 'view' | 'export';
const TABS: TabId[] = ['design', 'box', 'view', 'export'];
const TAB_TITLES: Record<TabId, string> = { design: '면 디자인', box: '박스', view: '보기', export: '내보내기' };
let activeTab: TabId = 'design';
let tabBeforeExternal: TabId | null = null;
let setTab: (t: TabId, remember?: boolean) => void = () => {};
let syncTopHistory: () => void = () => {};

/** 면 선택선과 3D 면 클릭 편집 선택은 디자인 탭이 열려 있고 외부 GLB를 보는 중이 아닐 때만 동작한다. */
function syncEditingEnabled() { viewer.setEditingEnabled(activeTab === 'design' && !externalGlbActive); }

/** 외부 GLB를 보는 중: 디자인·박스 탭과 상단 저장·실행 취소·다시 실행은 비활성, 내보내기 탭은 PNG 저장만 활성이다. */
function setExternalUi(on: boolean) {
  for (const id of ['tp-design', 'tp-box']) {
    const el = $(id);
    (el as HTMLElement & { inert: boolean }).inert = on;
    el.classList.toggle('ext-off', on);
    el.querySelector<HTMLElement>('.ext-note')!.hidden = !on;
  }
  for (const id of ['expSvg', 'expFiles']) { const el = $(id); (el as HTMLElement & { inert: boolean }).inert = on; el.style.opacity = on ? '0.45' : ''; }
  $('tp-export').querySelector<HTMLElement>('.ext-note')!.hidden = !on;
  for (const id of ['tabDesign', 'tabBox']) $(id).classList.toggle('ext-off', on);
  for (const id of ['btnTopSave', 'btnTopUndo', 'btnTopRedo']) $<HTMLButtonElement>(id).disabled = on;
  if (on) { tabBeforeExternal = activeTab; if (activeTab === 'design' || activeTab === 'box') setTab('view', false); }
  else { if (tabBeforeExternal) setTab(tabBeforeExternal, false); tabBeforeExternal = null; syncTopHistory(); }
  syncEditingEnabled();
}

function initWorkspace() {
  const mq = window.matchMedia('(max-width: 899px)');
  const tabBtn = (t: TabId) => $<HTMLButtonElement>('tab' + t[0].toUpperCase() + t.slice(1));
  const KEY_TAB = 'sabari.activeTab', KEY_PANEL = 'sabari.panelCollapsed', KEY_FACE = 'sabari.facePanelCollapsed';
  const remember = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장소를 못 쓰면 기억만 안 한다 */ } };
  const recall = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

  // ----- 탭 -----
  setTab = (t, save = true) => {
    activeTab = t;
    for (const x of TABS) {
      const on = x === t;
      tabBtn(x).setAttribute('aria-selected', String(on));
      tabBtn(x).tabIndex = on ? 0 : -1;
      $('tp-' + x).hidden = !on;
    }
    $('panelTitle').textContent = TAB_TITLES[t];
    $('panelScroll').scrollTop = 0;
    if (save) remember(KEY_TAB, t);
    syncEditingEnabled();
  };
  for (const t of TABS) {
    tabBtn(t).onclick = () => { setTab(t); if (document.body.classList.contains('panel-collapsed')) setPanelCollapsed(false); };
    tabBtn(t).onkeydown = (e) => {
      const i = TABS.indexOf(t); let n = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % TABS.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
      else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
      if (n >= 0) { e.preventDefault(); setTab(TABS[n]); tabBtn(TABS[n]).focus(); }
    };
  }
  const saved = recall(KEY_TAB) as TabId | null;
  setTab(saved && TABS.includes(saved) ? saved : 'design', false);
  const onBp = () => $('tabRail').setAttribute('aria-orientation', mq.matches ? 'horizontal' : 'vertical');
  mq.addEventListener('change', onBp); onBp();

  // ----- 왼쪽 패널 접기/펴기(화살표) -----
  const panelToggle = $<HTMLButtonElement>('panelToggle'), panelExpand = $<HTMLButtonElement>('panelExpand');
  setPanelCollapsed = (collapsed, save = true) => {
    document.body.classList.toggle('panel-collapsed', collapsed);
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    panelExpand.hidden = !collapsed;
    if (save) remember(KEY_PANEL, collapsed ? '1' : '0');
  };
  setPanelCollapsed(recall(KEY_PANEL) === '1', false);
  panelToggle.onclick = () => setPanelCollapsed(true);
  panelExpand.onclick = () => setPanelCollapsed(false);

  // ----- 오른쪽 "선택한 면" 패널 접기/펴기 -----
  const fpToggle = $<HTMLButtonElement>('facePanelToggle');
  const setFaceCollapsed = (c: boolean, save = true) => { document.body.classList.toggle('face-panel-collapsed', c); fpToggle.setAttribute('aria-expanded', String(!c)); if (save) remember(KEY_FACE, c ? '1' : '0'); };
  setFaceCollapsed(recall(KEY_FACE) === '1', false);
  fpToggle.onclick = () => setFaceCollapsed(!document.body.classList.contains('face-panel-collapsed'));

  // ----- 상단 바 -----
  const openBtn = $<HTMLButtonElement>('btnTopOpen'), moreBtn = $<HTMLButtonElement>('btnMore');
  const menus: [HTMLButtonElement, HTMLElement][] = [[openBtn, $('openMenu')], [moreBtn, $('moreMenu')]];
  const closeMenus = () => { for (const [b, m] of menus) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); } };
  const toggleMenu = (b: HTMLButtonElement, m: HTMLElement) => { const open = m.hidden; closeMenus(); m.hidden = !open; b.setAttribute('aria-expanded', String(open)); };
  openBtn.onclick = (e) => { e.stopPropagation(); toggleMenu(openBtn, $('openMenu')); };
  moreBtn.onclick = (e) => { e.stopPropagation(); toggleMenu(moreBtn, $('moreMenu')); };
  document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.menu-wrap')) closeMenus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  showMoreMenu = () => { closeMenus(); $('moreMenu').hidden = false; moreBtn.setAttribute('aria-expanded', 'true'); };
  $('btnTopProjOpen').onclick = () => { closeMenus(); $('btnProjOpen').click(); };
  $('btnTopImportFaces').onclick = () => { closeMenus(); $('btnImportFaces').click(); };
  const topDraft = $<HTMLButtonElement>('btnTopDraftLoad'), draft = $<HTMLButtonElement>('btnDraftLoad');
  const syncDraftBtn = () => { topDraft.disabled = draft.disabled; };
  new MutationObserver(syncDraftBtn).observe(draft, { attributes: true, attributeFilter: ['disabled'] }); syncDraftBtn();
  topDraft.onclick = () => { closeMenus(); draft.click(); };
  $('btnOpenGlb').addEventListener('click', closeMenus);
  $('fileGlb').addEventListener('change', closeMenus); // 파일을 고르면 열기 메뉴가 3D 화면 위 알림을 가리지 않게 닫는다
  $('btnTopSave').onclick = () => $('btnProjSave').click();
  $('btnTopPng').onclick = () => $('btnPng').click();
  $('btnTopUndo').onclick = () => { if (!externalGlbActive) { undo(); syncTopHistory(); } };
  $('btnTopRedo').onclick = () => { if (!externalGlbActive) { redo(); syncTopHistory(); } };
  syncTopHistory = () => {
    $<HTMLButtonElement>('btnTopUndo').disabled = externalGlbActive || undoStack.length === 0;
    $<HTMLButtonElement>('btnTopRedo').disabled = externalGlbActive || redoStack.length === 0;
  };
  syncTopHistory();
  document.querySelectorAll<HTMLButtonElement>('[data-proxy]').forEach((b) => { b.onclick = () => { closeMenus(); document.getElementById(b.dataset.proxy!)!.click(); }; });

  // ----- 하단 플로팅 시점(기존 시점 코드 호출) -----
  let standingSide: 'left' | 'right' = 'right';
  $('fvFront').onclick = () => document.querySelector<HTMLButtonElement>('[data-view=front]')!.click();
  $('fvIso').onclick = () => $('btnIso').click();
  $('fvStanding').onclick = () => { standingSide = standingSide === 'left' ? 'right' : 'left'; document.querySelector<HTMLButtonElement>(`.vp-fixed[data-side=${standingSide}]`)!.click(); };
  $('fvFit').onclick = () => $('btnFit').click();

  // ----- 모바일 작업 시트: 손잡이를 눌러 접힘/반/크게 순환, 끌어서 높이 조절 -----
  const handle = $('sheetHandle'), appBody = $('appBody');
  const SHEET = [0, 46, 72]; let sheetStep = 1;
  const applySheet = () => {
    document.body.classList.toggle('sheet-min', sheetStep === 0);
    appBody.style.removeProperty('--sheet-h');
    if (sheetStep > 0) $('panel').style.setProperty('--sheet-h', SHEET[sheetStep] + '%'); else $('panel').style.removeProperty('--sheet-h');
    handle.setAttribute('aria-expanded', String(sheetStep > 0));
  };
  handle.onclick = () => { sheetStep = (sheetStep + 1) % SHEET.length; applySheet(); };
  handle.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle.click(); } };
  let drag: { y: number; h: number } | null = null;
  handle.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, h: $('panel').getBoundingClientRect().height }; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const h = Math.min(appBody.clientHeight * 0.8, Math.max(96, drag.h + (drag.y - e.clientY)));
    document.body.classList.toggle('sheet-min', h <= 110);
    $('panel').style.setProperty('--sheet-h', h + 'px');
  });
  handle.addEventListener('pointerup', () => { drag = null; });
  const faceLine = $('sheetFaceLine');
  const syncFaceLine = () => {
    const rot = ''; // 시안 v6: 회전 각도는 보기 탭 시점 버튼 아래 한 번만(시트 맨 위 면 요약줄에는 넣지 않는다) // 회전 각도는 작업 시트 맨 위 줄 오른쪽에 한 줄로(시트가 접혀 있으면 표시하지 않음)
    faceLine.textContent = `선택한 면 · ${$('faceTitle').textContent} · ${($('faceSize').textContent ?? '').replace('면 크기 ', '')} · ${$('fileInfo').textContent}${rot}`;
  };
  new MutationObserver(syncFaceLine).observe($('rotReadoutText'), { childList: true, characterData: true, subtree: true });
  document.addEventListener('sabari-rotplace', syncFaceLine);
  const mo = new MutationObserver(syncFaceLine);
  for (const id of ['faceTitle', 'faceSize', 'fileInfo']) mo.observe($(id), { childList: true, characterData: true, subtree: true });
  syncFaceLine();
  faceLine.onclick = () => { setTab('design'); if (sheetStep === 0) { sheetStep = 1; applySheet(); } };
  mq.addEventListener('change', () => { document.body.classList.remove('sheet-min'); applySheet(); });

  syncEditingEnabled();
}
let setPanelCollapsed: (collapsed: boolean, save?: boolean) => void = () => {};
let showMoreMenu: () => void = () => {};

// ---------- 칼선(디자인 가이드) · 칼선 이미지 분할 ----------
function renderDielineInfo() {
  const modeText = (d: DielineSave) => (d.mode === 'artboard' ? `아트보드 전체 ${d.artboardMm?.[0]}×${d.artboardMm?.[1]}mm` : d.mode === 'crop' ? `칼선 외곽 크롭 ${d.artboardMm?.[0]}×${d.artboardMm?.[1]}mm` : `여분 ${d.bleedMm}mm`);
  const one = (d: DielineSave | undefined) => (d ? `${d.name ?? '칼선 이미지'} · ${modeText(d)}${d.imageRotation ? ` · ${d.imageRotation}° 돌려 인식` : ''}` : '없음');
  const has = !!(dielines.lid || dielines.base);
  $('dielineInfo').textContent = has ? `뚜껑: ${one(dielines.lid)}, 하단 몸통: ${one(dielines.base)}` : '올린 칼선 이미지 없음';
  $<HTMLButtonElement>('btnSplitEdit').disabled = !has;
  $('btnSplitEdit').title = has ? '' : '칼선 이미지를 먼저 올리면 쓸 수 있습니다'; // 비활성 이유(작업 32B)
}

async function downloadDielineSvg(kind: DieKind) {
  const d = buildDieline(params, kind);
  const label = (id: FaceId) => FACES.find((f) => f.id === id)?.label ?? id;
  const svg = dielineSvg(d, params.bleed, label);
  const r = await saveFile(new Blob([svg], { type: 'image/svg+xml' }), 'svg', defaultStem(kind === 'lid' ? '사바리_뚜껑_칼선가이드' : '사바리_하단_칼선가이드'), download);
  if (!r.saved) return;
  msg('칼선 가이드 SVG를 저장했습니다. 디자인 가이드용이며 제조 칼선이 아닙니다. 최종 칼선은 인쇄소 템플릿을 사용하세요.', 'ok');
}

/** 분할 결과를 면에 적용한다: 5개 면을 한 번의 실행 취소 항목으로 바꾸고, 새 이미지이므로 비율 기준을 현재로 맞춘다. */
async function applySplit(r: SplitResult) {
  const ids = r.faces.map((f) => f.id);
  const decoded: { id: FaceId; blob: Blob; name: string; img: ImageBitmap; iw: number; ih: number }[] = [];
  for (const f of r.faces) { const d = await decode(f.blob); decoded.push({ ...f, ...d }); }
  if (ids.some((id) => groupOf(id) === 'base') && !baseEnabled) setBaseEnabled(true); // 하단 이미지가 생기면 스위치는 켜진다
  pushHistoryMany(ids);
  for (const d of decoded) {
    const f = faces[d.id];
    f.blob = d.blob; f.name = d.name; f.img = d.img; f.iw = d.iw; f.ih = d.ih;
    f.state = { ...defaultState(), fit: 'cover' }; // 분할한 이미지는 면과 같은 비율이므로 면을 꽉 채운다(위치·확대·회전·반전은 이후 그대로 편집 가능)
    apply(d.id);
  }
  lastDieKind = r.kind;
  dielines = { ...dielines, [r.kind]: { blob: r.source, name: r.name, bleedMm: r.bleedMm, kind: r.kind, regions: r.regions, rotations: r.rotations, ...(r.mode === 'artboard' || r.mode === 'crop' ? { mode: r.mode, artboardMm: r.artboardMm } : {}), ...(r.imageRotation ? { imageRotation: r.imageRotation, orientationConfirmed: r.orientConfirmed } : {}) } };
  resetRatioRefs(ids);
  renderDielineInfo();
  setCurrent(ids[0]);
  scheduleDraft();
  const skipNote = r.skipped.length ? ` 빈 영역이라 적용하지 않은 면: ${r.skipped.map((id) => FACES.find((f) => f.id === id)?.label ?? id).join(', ')}.` : '';
  msg(`칼선 이미지를 ${ids.length}개 면으로 나눠 적용했습니다.${skipNote} 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.`, 'ok');
}

// ---------- 시점 (3/4는 R ↔ L 토글) ----------
let lastView: ViewName | null = 'iso';
function showView(v: ViewName, fit = false) {
  viewer.setView(v, fit);
  lastView = v;
  const b = $('btnIso');
  b.textContent = v === 'iso' ? '3/4 시점 R' : v === 'isoL' ? '3/4 시점 L' : '3/4 시점';
  b.setAttribute('aria-pressed', String(v === 'iso' || v === 'isoL'));
}
const toggleIso = () => showView(lastView === 'iso' ? 'isoL' : 'iso');

// ---------- 시작 ----------
// 음영 세기(0~100%): 화면 설정이라 이 브라우저(localStorage)에만 기억하고 .sabari·임시저장·GLB에는 넣지 않는다.
function initShade() {
  const r = $<HTMLInputElement>('shadeR'), n = $<HTMLInputElement>('shadeN');
  const pct = (x: unknown) => { const v = Math.round(Number(x)); return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : null; };
  // 음영 보기/숨기기(작업 15): 숨기면 모든 각도에서 입력 색 그대로의 평면 색(세기 0)이고 세기 슬라이더는 비활성이다. 슬라이더 값은 그대로 기억한다.
  const toggle = $<HTMLButtonElement>('shadeToggle');
  let shadeOn = (loadUi() as { shadeOn?: boolean }).shadeOn !== false;
  let level = 0;
  const apply = () => {
    viewer.setShadeStrength(shadeOn ? level / 100 : 0);
    toggle.setAttribute('aria-pressed', String(shadeOn));
    toggle.textContent = shadeOn ? '음영 숨기기' : '음영 보기';
    r.disabled = n.disabled = !shadeOn;
  };
  toggle.onclick = () => { shadeOn = !shadeOn; saveUi({ shadeOn }); apply(); };
  const set = (x: unknown, save: boolean) => {
    const v = pct(x); if (v === null) return;
    r.value = n.value = String(v); level = v; apply();
    if (save) saveUi({ shade: v });
  };
  const saved = pct(loadUi().shade);
  set(saved ?? Math.round(viewer.getShadeStrength() * 100), false);
  r.oninput = () => set(r.value, true);
  n.onchange = () => set(n.value, true);
  n.oninput = () => { const v = pct(n.value); if (v !== null && n.value !== '') set(v, true); };
}

async function init() {
  try {
    viewer = new Viewer($('viewport'));
  } catch {
    msg('이 브라우저에서는 3D 미리보기를 사용할 수 없습니다. Chrome 또는 Edge를 사용해 주세요.');
    return;
  }
  initUiPrefs();
  initShade();
  $('viewport').addEventListener('pointerdown', () => {
    const a = document.activeElement as HTMLElement | null;
    if (a && ['INPUT', 'SELECT', 'TEXTAREA'].includes(a.tagName)) a.blur();
  }, true);
  viewer.onPick = (id) => setCurrent(id);
  viewer.pickFilter = (id) => groupOf(id) === 'lid' || baseEnabled;
  $<HTMLInputElement>('useBase').onchange = onUseBaseToggle;
  for (const g of ['lid', 'base'] as FaceGroup[]) $('tab_' + g).onclick = () => setCurrent(lastByGroup[g]);
  $('btnNoticeOpen').onclick = () => setLift(OPEN_MM); // 사용자가 직접 누를 때만 연다
  $('btnNoticeBottom').onclick = () => showView('bottom');
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

  // 편집 영역 펼침/접힘 · 외부 GLB 보기
  $('btnExtGlbBack').onclick = () => returnToWork();
  $('btnExtGlbBackView').onclick = () => returnToWork();
  const geHelp = $<HTMLButtonElement>('btnGlbEntryHelp');
  geHelp.onclick = () => { const open = geHelp.getAttribute('aria-expanded') !== 'true'; geHelp.setAttribute('aria-expanded', String(open)); $('glbEntryHelp').hidden = !open; };
  initWorkspace();
  initBackground();
  initNotifyArea();
  {
    // 상태줄(작업 29): 확대 배율, 손 도구 안내. 회전 각도는 #rotReadout 이 같은 줄에 들어 있다.
    const zoomEl = $('zoomReadout'); let lastZoom = -1;
    viewer.addDrawListener(() => { const z = viewer.getZoomPct(); if (z !== lastZoom) { lastZoom = z; zoomEl.textContent = `확대 ${z}%`; } });
    const syncPan = () => {
      const panning = $('viewport').classList.contains('panning');
      $('statusBar').classList.toggle('panning', panning);
      $('panHintTop').hidden = !(panning && getComputedStyle($('statusBar')).display === 'none'); // 패널이 접혔거나 모바일이면 알림 영역에 표시
    };
    new MutationObserver(syncPan).observe($('viewport'), { attributes: true, attributeFilter: ['class'] });
    $('btnNotifyLog').onclick = () => { $('moreMenu').hidden = true; $('btnMore').setAttribute('aria-expanded', 'false'); openNotifyLog(); };
    $('btnNotifyDlgClose').onclick = () => $<HTMLDialogElement>('notifyDlg').close();
  }
  renderTemplateCard();
  initEdgeInspect();

  // 이미지
  const pick = $<HTMLInputElement>('filePick');
  $('btnPick').onclick = () => pick.click();
  pick.onchange = () => { const f = pick.files?.[0]; pick.value = ''; if (f) busy(() => setImage(current, f, f.name), f.size > 8e6 ? '큰 이미지를 처리하는 중…' : '이미지를 처리하는 중…'); };
  document.querySelectorAll<HTMLInputElement>('input[name=fit]').forEach((r) => (r.onchange = () => edit((f) => (f.state.fit = r.value as 'contain' | 'cover' | 'tile'))));
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
    f.blob = null; f.name = null; f.img = null; f.iw = f.ih = 0; f.state = defaultState(); f.under = null; f.underOnTop = false;
    apply(current);
  };
  $('btnReset').onclick = () => {
    const f = faces[current];
    if (!f.img) return;
    pushHistory(current, true);
    f.state = defaultState();
    apply(current);
    resetRatioRefs([current]); // 면을 초기화하면 그 면의 배지는 사라진다
  };
  $('btnUndo').onclick = () => { undo(); };
  layersUi = initLayers({
    faces, current: () => current,
    groupOf: (id) => ({ ids: facesOf(groupOf(id)).map((x) => x.id), label: GROUPS[groupOf(id)].label }),
    pushHistory, pushHistoryMany, apply,
    inspect: async (file) => { await inspectImage(file); },
    run: (fn) => busy(fn),
  });

  // 목업 색상 (input 이벤트로 즉시 반영)
  const cur = () => [$<HTMLInputElement>('colFace').value, $<HTMLInputElement>('colLid').value, $<HTMLInputElement>('colBase').value] as const;
  for (const id of ['colFace', 'colLid', 'colBase']) $<HTMLInputElement>(id).oninput = () => applyColors(...cur(), detailColors);
  $('btnColorReset').onclick = () => applyColors(defaultColors.face, defaultColors.lid, defaultColors.base, {});
  for (const [k, id] of ADV_IDS) {
    const chk = $<HTMLInputElement>('advChk' + id), col = $<HTMLInputElement>('advCol' + id);
    chk.onchange = () => { const d = { ...detailColors }; if (chk.checked) delete d[k]; else d[k] = col.value; applyColors(...cur(), d); };
    col.oninput = () => { applyColors(...cur(), { ...detailColors, [k]: col.value }); };
  }

  // 박스
  $('btnClose').onclick = () => setLift(0);
  $('btnOpen').onclick = () => setLift(OPEN_MM);
  for (const id of ['liftR', 'liftN']) {
    const isRange = id === 'liftR';
    $<HTMLInputElement>(id)[isRange ? 'oninput' : 'onchange'] = (e) => setLift(Number((e.target as HTMLInputElement).value));
  }
  $<HTMLInputElement>('showLid').onchange = (e) => viewer.setPartVisible('lid', (e.target as HTMLInputElement).checked);
  $<HTMLInputElement>('showBase').onchange = (e) => viewer.setPartVisible('base', (e.target as HTMLInputElement).checked);

  // 보기
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => (b.onclick = () => showView(b.dataset.view as ViewName)));
  $('btnIso').onclick = toggleIso; // 3/4 시점: 누를 때마다 R ↔ L
  // ? 도움말(시안 v6): 긴 설명은 컨트롤 사이에 두지 않고 ? 버튼 뒤에 모은다. 원문은 숨겨진 본문에 그대로 있다.
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.helpq'); if (!b) return;
    const body = document.getElementById(b.getAttribute('aria-controls') ?? ''); if (!body) return;
    const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', String(open)); body.hidden = !open;
  });
  { // 시안 v6: "회전 방식" 자유/축 잠금 세그먼트. 축 잠금 버튼(#lockToggle)이 그대로 상태를 가지고, "자유"는 그것을 끄는 버튼이며 둘의 눌림·비활성을 맞춘다.
    const lt = $<HTMLButtonElement>('lockToggle'), free = $<HTMLButtonElement>('lockFree');
    const syncFree = () => { free.setAttribute('aria-pressed', String(lt.getAttribute('aria-pressed') !== 'true')); free.disabled = lt.disabled; };
    free.onclick = () => { if (lt.getAttribute('aria-pressed') === 'true') lt.click(); };
    new MutationObserver(syncFree).observe(lt, { attributes: true, attributeFilter: ['aria-pressed', 'disabled'] }); syncFree();
    // 저장된 시점 목록의 "불러오기" 버튼은 같은 줄 썸네일 버튼의 클릭(기존 불러오기)을 그대로 부른다.
    document.getElementById('vpGrid')?.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('.vp-load'); if (!b) return; const t = b.closest('.vp-card')?.querySelector<HTMLButtonElement>('.vp-thumb'); if (t && !t.disabled) t.click(); });
  }
  // 축 잠금(기본 꺼짐): 켜고 박스 면을 누르면 그 면에 수직인 축으로만 돈다. 화면 전용이라 어디에도 저장하지 않는다(새로고침하면 꺼진다).
  const lockBtn = $<HTMLButtonElement>('lockToggle'), lockHint = $('lockHint');
  let lockHintTimer = 0;
  const axisRow = $('axisRow');
  // 축 선 보기: 켜면 파란 회전축 선과 축을 정한 면의 윤곽선이 보인다. 기본 켜짐, 이 브라우저(localStorage)에만 기억하며 .sabari·임시저장에는 넣지 않는다.
  const AG_KEY = 'sabari.axisGuide';
  let axisGuideOn = (() => { try { return localStorage.getItem(AG_KEY) !== '0'; } catch { return true; } })();
  const agBtn = $<HTMLButtonElement>('axisGuideToggle'), agState = $('axisGuideState');
  const syncAxisGuide = (lockOn: boolean) => {
    agBtn.disabled = !lockOn; agBtn.setAttribute('aria-checked', String(axisGuideOn));
    agState.textContent = lockOn ? (axisGuideOn ? '켜짐' : '꺼짐') : '축 잠금을 켜면 적용됩니다';
  };
  const toggleAxisGuide = () => { if (agBtn.disabled) return; axisGuideOn = !axisGuideOn; try { localStorage.setItem(AG_KEY, axisGuideOn ? '1' : '0'); } catch { /* 저장소를 못 쓰면 기억만 안 한다 */ } viewer.setAxisGuideVisible(axisGuideOn); syncAxisGuide(viewer.isLockOn()); };
  viewer.setAxisGuideVisible(axisGuideOn);
  agBtn.onclick = toggleAxisGuide;
  const AXIS_LABEL: Record<string, string> = { front: '정면', back: '후면', left: '좌측', right: '우측', top: '윗면', bottom: '아래', iso: '3/4' };
  const renderLock = (s: { on: boolean; face: FaceId | null; view: ViewName | null; views: ViewName[]; available: boolean }) => {
    lockBtn.setAttribute('aria-pressed', String(s.on));
    lockBtn.disabled = !s.available;
    syncAxisGuide(s.on);
    axisRow.hidden = !(s.on || !s.available); // 켜면 나타나고, 쓸 수 없는 GLB에서는 비활성으로 보여 준다
    axisRow.querySelectorAll<HTMLButtonElement>('[data-axis]').forEach((b) => { b.disabled = !s.available; b.setAttribute('aria-pressed', String(s.views.includes(b.dataset.axis as ViewName))); });
    const faceLabel = s.face ? FACES.find((f) => f.id === s.face)?.label : null;
    const text = !s.available ? '이 GLB는 면을 알 수 없어 축 잠금을 쓸 수 없습니다. 자유 회전만 사용합니다.' : !s.on ? '' : faceLabel ? `${faceLabel} 기준 축으로 돕니다. 다른 면을 누르거나 회전축 버튼을 누르면 축이 바뀝니다.` : s.view ? `'${AXIS_LABEL[s.view]}' 방향 축으로 돕니다. 다른 회전축 버튼이나 박스의 면을 누르면 축이 바뀝니다.` : '회전축 버튼을 누르거나 박스의 면을 눌러 축을 정하세요';
    lockHint.hidden = !text; lockHint.textContent = text;
  };
  // 각도 바(미세 조절): 축 잠금 + 축이 정해졌을 때만 활성. 바 값은 파일에 저장하지 않는다.
  const angleHint = $('angleDisabledHint'), angleSliderRow = $('angleSliderRow'), angleBtnRow = $('angleBtnRow');
  const angleR = $<HTMLInputElement>('angleR'), angleN = $<HTMLInputElement>('angleN');
  const syncAngleUi = () => {
    const deg = viewer.getLockAngleDeg();
    angleHint.hidden = deg !== null;
    angleSliderRow.hidden = deg === null;
    angleBtnRow.hidden = deg === null;
    if (deg !== null) { angleR.value = deg.toFixed(1); angleN.value = deg.toFixed(1); }
  };
  const setAngle = (deg: number) => { viewer.setLockAngleDeg(Math.min(180, Math.max(-180, deg))); syncAngleUi(); };
  angleR.oninput = () => setAngle(Number(angleR.value));
  angleN.onchange = () => { const v = Number(angleN.value); if (!Number.isNaN(v)) setAngle(v); };
  $('angleZero').onclick = () => setAngle(0);
  $('angleRebase').onclick = () => { viewer.rebaseLockAngle(); syncAngleUi(); };
  document.querySelectorAll<HTMLButtonElement>('#angleBtnRow [data-ang]').forEach((b) => {
    b.onclick = () => { const d = viewer.getLockAngleDeg(); if (d !== null) setAngle(d + Number(b.dataset.ang)); };
  });
  // 회전 상태 한 줄(뷰어 > 보기): 자유 회전이면 박스 자세의 좌우·위아래 각, 축 잠금이면 축 이름과 각도 바 값. 드래그·시점 버튼·축 잠금·저장된 시점 어디서 바뀌어도 실시간 갱신.
  const readoutText = $('rotReadoutText');
  const signDeg = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n * 10) / 10).toFixed(1)}°`;
  const syncReadout = () => {
    const lockDeg = viewer.getLockAngleDeg();
    if (viewer.isLockOn() && lockDeg !== null) {
      const f = viewer.getLockFace(), v = viewer.getLockView();
      const axis = f ? FACES.find((x) => x.id === f)?.label ?? '' : v ? AXIS_LABEL[v] : '';
      readoutText.textContent = `축 잠금 · ${axis} 축 ${signDeg(lockDeg)}`;
    } else if (viewer.isLockOn()) readoutText.textContent = '축 잠금 · 축을 정해 주세요';
    else {
      const e = new THREE.Euler().setFromQuaternion(viewer.boxQuat, 'YXZ');
      readoutText.textContent = `자유 회전 · 좌우 ${signDeg(THREE.MathUtils.radToDeg(e.y))} · 위아래 ${signDeg(THREE.MathUtils.radToDeg(e.x))}`;
    }
  };
  viewer.onBoxQuatChange = () => { syncAngleUi(); syncReadout(); };
  viewer.onLockChange = (s) => { renderLock(s); syncAngleUi(); syncReadout(); };
  syncReadout();
  viewer.onLockHint = (t) => { lockHint.hidden = false; lockHint.textContent = t; clearTimeout(lockHintTimer); lockHintTimer = window.setTimeout(() => renderLock({ on: viewer.isLockOn(), face: viewer.getLockFace(), view: viewer.getLockView(), views: viewer.lockPressedViews(), available: viewer.lockAvailable() }), 2500); };
  lockBtn.onclick = () => viewer.setAxisLock(lockBtn.getAttribute('aria-pressed') !== 'true');
  axisRow.querySelectorAll<HTMLButtonElement>('[data-axis]').forEach((b) => (b.onclick = () => viewer.setLockView(b.dataset.axis as ViewName)));
  renderLock({ on: false, face: null, view: null, views: [], available: true });
  syncAngleUi();
  initViewPresets();
  viewer.onRotateBadge = (text, snapping) => {
    $('statusBar').classList.toggle('snap', !!text && !!snapping);
    const b = $('rotBadge');
    b.hidden = !text;
    if (text) { b.textContent = snapping ? `${text} · ${SNAP_DEG}° 스냅` : text; b.classList.toggle('snap', !!snapping); }
  };
  // 바닥 그림자(화면·PNG 전용): 설정은 이 브라우저(localStorage)에만 기억하고 .sabari·임시저장·GLB에는 넣지 않는다.
  const SH_KEY = 'sabari.floorShadow';
  let shadow: ShadowSettings = { ...DEFAULT_SHADOW };
  try { const raw = localStorage.getItem(SH_KEY); if (raw) shadow = sanitizeShadow(JSON.parse(raw)); } catch { /* 저장소를 못 쓰면 기본값(꺼짐) */ }
  const shToggle = $<HTMLButtonElement>('shadowToggle'), shCtl = $('shadowCtl');
  const shStyleSel = $<HTMLSelectElement>('shStyle');
  const shPairs: [string, keyof ShadowSettings, number][] = [['shStr', 'strength', 100], ['shSoft', 'soft', 100], ['shAz', 'az', 1], ['shEl', 'el', 1]];
  const applyShadow = (persist = true) => {
    shadow = sanitizeShadow(shadow);
    viewer.setFloorShadow(shadow);
    shToggle.setAttribute('aria-pressed', String(shadow.on));
    shToggle.textContent = shadow.on ? '바닥 그림자 숨기기' : '바닥 그림자 보기';
    shCtl.hidden = !shadow.on;
    shStyleSel.value = shadow.style;
    for (const [id, key, k] of shPairs) for (const sfx of ['R', 'N']) $<HTMLInputElement>(id + sfx).value = String(Math.round((shadow[key] as number) * k));
    if (persist) try { localStorage.setItem(SH_KEY, JSON.stringify(shadow)); } catch { /* 무시 */ }
  };
  shToggle.onclick = () => { shadow.on = !shadow.on; applyShadow(); };
  shStyleSel.onchange = () => { shadow.style = shStyleSel.value as ShadowSettings['style']; applyShadow(); };
  for (const [id, key, k] of shPairs) for (const sfx of ['R', 'N']) {
    const el = $<HTMLInputElement>(id + sfx);
    el[sfx === 'R' ? 'oninput' : 'onchange'] = () => { const v = Number(el.value); if (!Number.isNaN(v)) { (shadow[key] as number) = v / k; applyShadow(); } };
  }
  $('shDefault').onclick = () => { shadow = { ...DEFAULT_SHADOW, on: shadow.on }; applyShadow(); };
  $('lightDefault').onclick = () => { shadow.az = DEFAULT_SHADOW.az; shadow.el = DEFAULT_SHADOW.el; applyShadow(); }; // 빛 방향만 현재 그림자 기본값(좌우 225°, 높이 65°)으로
  applyShadow(false);

  $('btnFit').onclick = (e) => { e.preventDefault(); e.stopPropagation(); viewer.fit(); }; // summary 안의 버튼이라 접기가 같이 눌리지 않게 한다

  // 저장 / 열기
  $('btnPng').onclick = savePng;
  // 시안 v6: 선택 목록(data-seg)을 버튼 세그먼트로 보여 준다. 값은 원래 <select>가 그대로 가지고(선택·저장·시험 코드 불변), 버튼은 그 값을 바꾸고 따라간다.
  document.querySelectorAll<HTMLSelectElement>('select[data-seg]').forEach((sel) => {
    const box = document.createElement('div'); box.className = 'seg2'; box.setAttribute('role', 'group'); box.setAttribute('aria-label', sel.getAttribute('aria-label') ?? '');
    const btns = [...sel.options].map((o) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.textContent; b.onclick = () => { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); sync(); }; box.appendChild(b); return { b, o }; });
    const sync = () => btns.forEach(({ b, o }) => b.setAttribute('aria-pressed', String(sel.value === o.value)));
    sel.addEventListener('change', sync); new MutationObserver(sync).observe(sel, { attributes: true, childList: true }); setInterval(sync, 700); // 값이 코드로 바뀌는 경우(프로젝트 열기 등)도 따라간다
    sel.after(box); sync();
  });
  const pngScale = $<HTMLSelectElement>('pngScale');
  try { const v = localStorage.getItem('sabari.pngScale'); if (v && ['1', '2', '4'].includes(v)) pngScale.value = v; } catch { /* 저장소를 못 쓰면 기본값 */ }
  pngScale.onchange = () => { try { localStorage.setItem('sabari.pngScale', pngScale.value); } catch { /* 무시 */ } };
  $('btnGlb').onclick = saveGlb;
  $('btnProjSave').onclick = saveProject;
  $('btnDraftSave').onclick = () => saveDraft(true);
  $('btnDraftLoad').onclick = loadDraft;
  const pf = $<HTMLInputElement>('fileProj');
  $('btnProjOpen').onclick = () => pf.click();
  pf.onchange = () => { const f = pf.files?.[0]; pf.value = ''; if (f) openProject(f); };
  const imp = initImportFaces({
    read: (file) => unpackProject(file),
    currentParams: () => params,
    hasImage: (id) => !!faces[id].img,
    apply: applyImportedFaces,
  });
  const impFile = $<HTMLInputElement>('fileImport');
  $('btnImportFaces').onclick = () => { // 외부 GLB를 보는 중에는 쓸 수 없다. 파일을 고르는 것만으로는 현재 프로젝트가 바뀌지 않는다
    if (externalGlbActive) { msg('외부 GLB를 보는 중에는 면을 가져올 수 없습니다. 작업으로 돌아간 뒤 사용하세요.'); return; }
    impFile.click();
  };
  impFile.onchange = () => {
    const f = impFile.files?.[0]; impFile.value = '';
    if (f) void busy(async () => { await imp.open(f); }, '프로젝트를 읽는 중…');
  };
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
  // (openHelp 는 모듈 수준 함수 — 단축키 · 마우스 조작 대화상자를 연다)
  const typing = (t: HTMLElement) => t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['radio', 'checkbox', 'range', 'button'].includes((t as HTMLInputElement).type));
  const fieldFocus = (t: HTMLElement) => t.tagName === 'INPUT' || t.tagName === 'SELECT'; // 방향키는 슬라이더·입력칸이 쓴다
  let overStage = false; // 마우스가 3D 화면 위에 있는지
  $('stage').addEventListener('pointerenter', () => (overStage = true));
  $('stage').addEventListener('pointerleave', () => (overStage = false));
  const releasePan = () => { viewer.setPanHeld(false); };
  window.addEventListener('blur', releasePan);
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && (!typing(e.target as HTMLElement) || overStage)) { e.preventDefault(); releasePan(); }
  });
  const goView = (v: ViewName) => showView(v);
  const cycleFace = (d: number) => {
    const list = FACES.filter((x) => x.group === 'lid' || baseEnabled);
    const i = list.findIndex((x) => x.id === current);
    setCurrent(list[(i + d + list.length) % list.length].id);
  };
  const nudge = (dx: number, dy: number) => edit((f) => {
    f.state.offsetX = Math.min(1, Math.max(-1, f.state.offsetX + dx));
    f.state.offsetY = Math.min(1, Math.max(-1, f.state.offsetY + dy));
  });
  const zoomImg = (k: number) => edit((f) => (f.state.scale = Math.min(3, Math.max(0.25, f.state.scale * k))));

  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const spaceOnStage = e.code === 'Space' && overStage; // 숫자 입력칸 등에 커서가 남아 있어도 3D 화면 위에서는 손 도구 우선
    if (typing(t) && !spaceOnStage) return;
    if (spaceOnStage && (typing(t) || t.tagName === 'BUTTON')) t.blur(); // 입력칸에 공백이 들어가거나 버튼이 눌리지 않게
    const k = e.key.toLowerCase();
    const editing = !externalGlbActive && !cleanScreen; // 깨끗한 화면 중에는 보이지 않는 편집이 일어나지 않게 한다

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
    if (e.altKey && !externalGlbActive) {
      const m = /^Digit([1-5])$/.exec(e.code);
      if (m) { e.preventDefault(); loadPresetSlot(Number(m[1]) - 1); return; }
      if (e.code === 'Digit6') { e.preventDefault(); goStanding('left'); return; } // 세운 3/4 · 왼쪽 옆면(오른쪽은 버튼만)
    }
    if (e.altKey) return;

    // 시점: 숫자(키패드 포함) 1 정면 · Shift+1 후면 · 3 우측 · Shift+3 좌측 · 7 윗면 · 0/R 3/4
    if (e.code === 'Digit1' || e.code === 'Numpad1') return goView(e.shiftKey ? 'back' : 'front');
    if (e.code === 'Digit3' || e.code === 'Numpad3') return goView(e.shiftKey ? 'left' : 'right');
    if (e.code === 'Digit7' || e.code === 'Numpad7') return goView(e.shiftKey ? 'bottom' : 'top'); // 7 윗면 · Shift+7 아래
    if (e.code === 'Digit0' || e.code === 'Numpad0') return toggleIso(); // 0 = 3/4 시점 (누를 때마다 R ↔ L)
    if (k === 'f') return viewer.fit(); // 위치 초기화(화면에 맞추기)
    if (k === 'g') return toggleAxisGuide(); // 축 선 보기(축 잠금 중에만 동작)
    if (k === 'h') return setCleanScreen(!cleanScreen); // 깨끗한 화면(녹화용)
    if (k === 'b') return cycleBg(); // 배경 순환(흰색 → 투명 → 단색 → 이미지)
    if (k === 'r') return goView('iso'); // 3/4 오른쪽
    if (k === 'l') return goView('isoL'); // 3/4 왼쪽
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

  // 템플릿은 서버·GLB 파일 없이 브라우저에서 파라미터로 만든다
  applyFaceSizes(faceSizes(params));
  resizeFaceCanvases();
  viewer.setTemplate(params);
  dims = initDimsUi({
    get: () => params,
    apply: (p) => { applyParams(p, true); },
    restoreDefault: () => { applyParams(cloneParams(DEFAULT_PARAMS), true, true); },
    restoreBaseline: () => { applyParams(cloneParams(baselineParams), true, true); },
  });
  dims.sync();
  split = initSplitUi({
    params: () => params,
    faceLabel: (id) => FACES.find((f) => f.id === id)?.label ?? id,
    apply: applySplit,
    saved: (k) => dielines[k] ?? null,
  });
  const dieFile = $<HTMLInputElement>('fileDieline');
  $('btnSplitPick').onclick = () => dieFile.click();
  dieFile.onchange = () => {
    const f = dieFile.files?.[0]; dieFile.value = '';
    if (!f) return;
    busy(async () => { await inspectImage(f); await split!.open(f, f.name); });
  };
  $('btnSplitEdit').onclick = () => { // 가장 최근에 쓴 종류의 저장본을 연다(없으면 다른 종류). 대화상자에서 종류를 바꾸면 그 종류의 저장본을 불러온다.
    const d = dielines[lastDieKind] ?? dielines.lid ?? dielines.base;
    if (d) busy(() => split!.open(d.blob, d.name, d));
  };
  $('btnDieLid').onclick = () => downloadDielineSvg('lid');
  $('btnDieBase').onclick = () => downloadDielineSvg('base');
  renderDielineInfo();
  resetRatioRefs();
  $('btnRatioClose').onclick = () => { dismissedEpoch = changeEpoch; renderRatioUi(); };
  $('btnRatioDetail').onclick = () => {
    const open = $('ratioDetail').hidden;
    $('ratioDetail').hidden = !open;
    $('btnRatioDetail').setAttribute('aria-expanded', String(open));
    $('btnRatioDetail').textContent = open ? '접기' : '자세히';
  };
  $('btnRatioRevert').onclick = () => { applyParams(cloneParams(baselineParams), true, true); };
  $('btnRatioAck').onclick = () => { resetRatioRefs([current]); }; // 현재 비율을 이 면의 기준으로 받아들인다
  defaultColors = { face: '#ffffff', lid: viewer.getPartColor('lid'), base: viewer.getPartColor('base') };
  applyColors(defaultColors.face, defaultColors.lid, defaultColors.base, {});
  for (const f of FACES) viewer.setFaceTexture(f.id, null);
  setCurrent('lid_top');
  showView('iso', true);
  await initDraft();
  setDirty(false); // 시작 시 초기 설정은 "변경"이 아니다
  // 테스트·검증용 훅 (UI 동작에는 쓰지 않음)
  (window as unknown as Record<string, unknown>).__sabari = { viewer, faces, setCurrent, getLayout: (k: DieKind) => buildDieline(params, k), getDieline: () => dielines[lastDieKind] ?? dielines.lid ?? dielines.base ?? null, getDielines: () => dielines, getParams: () => cloneParams(params), getBaseline: () => cloneParams(baselineParams), applyParams: (p: BoxParams) => applyParams(p, true) };
}

init();
