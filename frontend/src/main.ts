import { FACES, FaceData, FaceId, FaceSnapshot, decode, faces, groupOf, rebake, resizeFaceCanvases, theme } from './faces';
import { FaceGroup, GROUPS, applyFaceSizes, facesOf } from './faceDefs';
import { BoxParams, DEFAULT_PARAMS, RatioChange, cloneParams, faceSizes, formatPct, formatRatio, paramsEqual, ratioChanges, ratioOf, validateParams } from './params';
import { initDimsUi } from './dimsUi';
import { DieKind, buildDieline, dielineSvg } from './dieline';
import { SplitResult, initSplitUi } from './splitUi';
import { Viewer, ViewName } from './viewer';
import { Rotation, defaultState } from './transform';
import { DielineSave, UserError, inspectImage, packProject, unpackProject, OpenedProject } from './project';
import { Draft, delDraft, getDraft, putDraft } from './draft';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const OPEN_MM = 80;

let viewer: Viewer;
let current: FaceId = 'lid_top';
/** "하단 몸통 디자인 사용" 스위치. 기본은 꺼짐이며, 꺼져 있으면 화면·동작이 뚜껑 5면만 있을 때와 같다. */
let baseEnabled = false;
const lastByGroup: Record<FaceGroup, FaceId> = { lid: 'lid_top', base: 'base_front' };
let mode: 'edit' | 'view' = 'edit';
/** 박스 치수 파라미터. 3D·면 크기·텍스처 크기는 모두 여기서 만들어진다. */
let params: BoxParams = cloneParams(DEFAULT_PARAMS);
/** "원래 사이즈로 되돌리기" 기준: 처음 열었을 때 / 프로젝트를 연 시점 / 마지막으로 저장한 시점의 치수 */
let baselineParams: BoxParams = cloneParams(DEFAULT_PARAMS);
let dims: ReturnType<typeof initDimsUi> | null = null;
let split: ReturnType<typeof initSplitUi> | null = null;
/** 마지막으로 올린 칼선 이미지 한 장과 분할 설정(원본 이미지는 .sabari 에 그대로 들어간다) */
let dieline: DielineSave | null = null;

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
// 실행 취소/다시 실행: 한 번의 변경 전 상태(면 스냅샷 묶음 + 스위치 상태)를 쌓는다.
// 같은 면의 연속 조작(드래그·슬라이더)은 0.8초 안이면 한 번으로 묶는다. 하단 면을 한꺼번에 제거하는 것도 한 항목이다.
type Snap = FaceSnapshot & { id: FaceId };
type Entry = { snaps: Snap[]; base: boolean; params: BoxParams };
const undoStack: Entry[] = [];
const redoStack: Entry[] = [];
let lastPushAt = 0;
let lastPushId: FaceId | 'params' | null = null;
const take = (id: FaceId): Snap => { const f = faces[id]; return { id, state: { ...f.state }, blob: f.blob, name: f.name, img: f.img, iw: f.iw, ih: f.ih }; };
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
  to.push(takeEntry(e.snaps.map((x) => x.id)));
  lastPushId = null;
  if (!paramsEqual(e.params, params)) applyParams(e.params, false); // 치수 변경도 실행 취소/다시 실행 대상
  for (const { id, ...rest } of e.snaps) Object.assign(faces[id], { ...rest, state: { ...rest.state } });
  if (e.base !== baseEnabled) setBaseEnabled(e.base, false);
  for (const { id } of e.snaps) apply(id);
  const first = e.snaps[0]?.id;
  if (first && (groupOf(first) === 'lid' || baseEnabled)) setCurrent(first);
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
  const show = n > 0 && dismissedEpoch !== changeEpoch && mode === 'edit'; // GLB 뷰어 모드에서는 보이지 않는다
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
    b.innerHTML = `<span>${fd.short}</span><small>${f.img ? '이미지 있음' : '비어 있음'}</small>${al ? `<span class="badge" title="치수 변경으로 이 면의 비율이 ${formatPct(al.pct)} 달라졌습니다">⚠ 비율 변경</span>` : ''}`;
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
  const isBase = baseEnabled && groupOf(current) === 'base' && mode === 'edit';
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
function onUseBaseToggle() {
  const want = $<HTMLInputElement>('useBase').checked;
  if (want) return setBaseEnabled(true);
  const withImage = facesOf('base').filter((f) => faces[f.id].img).map((f) => f.id);
  if (withImage.length) {
    if (!window.confirm(`하단 이미지 ${withImage.length}개가 제거됩니다.\n계속할까요? (Ctrl+Z로 되돌릴 수 있습니다)`)) {
      $<HTMLInputElement>('useBase').checked = true;
      return;
    }
    pushHistoryMany(withImage);
    for (const id of withImage) {
      const f = faces[id];
      f.blob = null; f.name = null; f.img = null; f.iw = f.ih = 0; f.state = defaultState();
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
    const blob = await packProject({
      faces: FACES.map((x) => ({ id: x.id, state: faces[x.id].state, blob: faces[x.id].blob, name: faces[x.id].name })),
      lidLiftMm: Math.round(viewer.slot === 'editor' ? viewer.getLiftMm() : 0),
      background: $<HTMLSelectElement>('bgSel').value,
      colors: { face: $<HTMLInputElement>('colFace').value, lid: $<HTMLInputElement>('colLid').value, base: $<HTMLInputElement>('colBase').value },
      useBaseFaces: baseEnabled,
      params: cloneParams(params),
      dieline,
    });
    baselineParams = cloneParams(params); // 마지막 저장 시점의 치수가 "원래 사이즈"가 된다
    download(blob, '사바리_프로젝트.sabari');
    msg('프로젝트를 저장했습니다. (다운로드 폴더의 사바리_프로젝트.sabari)', 'ok');
  });
}

async function applyOpened(proj: OpenedProject) {
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
    apply(fdsc.id);
  }
  if (proj.colors) applyColors(proj.colors.face, proj.colors.lid, proj.colors.base);
  // 하단 면에 이미지가 있으면 스위치는 자동으로 켜진다(없던 이전 파일은 꺼짐)
  setBaseEnabled(proj.useBase === true || facesOf('base').some((x) => faces[x.id].img), false);
  setLift(proj.lidLiftMm);
  $<HTMLSelectElement>('bgSel').value = proj.background;
  syncControls();
  dieline = proj.dieline ?? null;
  renderDielineInfo();
  dims?.sync();
  opening = false;
  resetRatioRefs(); // 프로젝트·임시저장을 열 때는 알림을 띄우지 않는다(이번 세션에서 바꾼 경우에만)
  dismissedEpoch = changeEpoch;
  if (note) msg(note);
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
    savedAt: Date.now(), lidLiftMm: Math.round(viewer.getLiftMm()), colors: { face, lid, base }, useBase: baseEnabled, params: cloneParams(params), dieline,
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
  theme.baseBg = base; // 이미지 없는 하단 면·여백·투명 픽셀은 "몸통" 색
  viewer.setFaceBg(face);
  for (const f of FACES) if (faces[f.id].img) apply(f.id); // 여백 색이 바뀌므로 다시 굽는다
  scheduleDraft();
}

// ---------- 박스 / 뷰어 ----------
function setLift(mm: number) {
  const v = Math.min(150, Math.max(0, Math.round(mm)));
  viewer.setLiftMm(v);
  for (const id of ['liftR', 'liftN', 'vLiftR', 'vLiftN']) $<HTMLInputElement>(id).value = String(v);
  updateOpenNotice();
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
  renderRatioUi();
  showView('iso', true);
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
    const dimText = info.params ? ` · 몸통 ${info.params.baseW}×${info.params.baseD}×${info.params.baseH}mm` : '';
    $('glbInfo').textContent = `${file.name} · 메시 ${info.meshes}개 · 이미지가 붙은 재질 ${info.textured}개${dimText}`;
    $('viewLid').hidden = !info.hasLid;
    showView('iso', true);
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
const loadUi = (): { open?: Record<string, boolean>; keys?: boolean; level?: boolean; speed?: number } => {
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

// ---------- 칼선(디자인 가이드) · 칼선 이미지 분할 ----------
function renderDielineInfo() {
  const has = !!dieline;
  $('dielineInfo').textContent = dieline ? `${dieline.name ?? '칼선 이미지'} · ${dieline.kind === 'base' ? '하단 몸통' : '뚜껑'} · 여분 ${dieline.bleedMm}mm` : '올린 칼선 이미지 없음';
  $<HTMLButtonElement>('btnSplitEdit').disabled = !has;
}

function downloadDielineSvg(kind: DieKind) {
  const d = buildDieline(params, kind);
  const label = (id: FaceId) => FACES.find((f) => f.id === id)?.label ?? id;
  const svg = dielineSvg(d, params.bleed, label);
  download(new Blob([svg], { type: 'image/svg+xml' }), kind === 'lid' ? '사바리_뚜껑_칼선가이드.svg' : '사바리_하단_칼선가이드.svg');
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
  dieline = { blob: r.source, name: r.name, bleedMm: r.bleedMm, kind: r.kind, regions: r.regions, rotations: r.rotations };
  resetRatioRefs(ids);
  renderDielineInfo();
  setCurrent(ids[0]);
  scheduleDraft();
  msg(`칼선 이미지를 ${ids.length}개 면으로 나눠 적용했습니다. 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.`, 'ok');
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
async function init() {
  try {
    viewer = new Viewer($('viewport'));
  } catch {
    msg('이 브라우저에서는 3D 미리보기를 사용할 수 없습니다. Chrome 또는 Edge를 사용해 주세요.');
    return;
  }
  initUiPrefs();
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
    resetRatioRefs([current]); // 면을 초기화하면 그 면의 배지는 사라진다
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
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((b) => (b.onclick = () => showView(b.dataset.view as ViewName)));
  $('btnIso').onclick = toggleIso;
  // 수평 유지 회전 (기본 꺼짐 = 자유 회전). 이 브라우저에 기억한다(.sabari 형식은 바꾸지 않는다).
  const lv = $('btnLevel');
  const setLevel = (v: boolean) => { viewer.setLevelRotate(v); lv.setAttribute('aria-pressed', String(v)); saveUi({ level: v }); };
  lv.onclick = () => setLevel(lv.getAttribute('aria-pressed') !== 'true');
  if (loadUi().level) setLevel(true);

  // 각도 · 회전: 표시는 카메라에서 읽어 실시간 갱신하고, 입력하면 카메라를 그 각도로 옮긴다(거리·확대 유지)
  const num = (id: string) => $<HTMLInputElement>(id);
  const syncAngles = () => {
    const a = viewer.getAngles();
    for (const [k, v] of [['az', a.az], ['el', a.el], ['rl', a.roll]] as const) {
      if (document.activeElement !== num(k + 'N')) num(k + 'N').value = String(Math.round(v));
      num(k + 'R').value = String(Math.round(v));
    }
    $('flipInfo').hidden = !a.flipped;
    $('poleInfo').hidden = !a.pole;
  };
  viewer.onCamera = syncAngles;
  const fromInputs = (src: HTMLInputElement) => () => {
    const az = Number(num(src.id.startsWith('az') ? src.id : 'azN').value), el = Number(num('elN').value);
    const a = src.id.startsWith('az') ? Number(src.value) : viewer.getAngles().az;
    const e = src.id.startsWith('el') ? Number(src.value) : viewer.getAngles().el;
    void az; void el;
    if (Number.isFinite(a) && Number.isFinite(e)) viewer.setAngles(a, e);
  };
  for (const id of ['azR', 'azN', 'elR', 'elN']) { const el = num(id); el.oninput = fromInputs(el); }
  for (const id of ['rlR', 'rlN']) { const el = num(id); el.oninput = () => { const v = Number(el.value); if (Number.isFinite(v)) viewer.setRoll(Math.min(180, Math.max(-180, v))); }; }
  $('rotLeft').onclick = () => viewer.rotate90('left');
  $('rotRight').onclick = () => viewer.rotate90('right');
  $('rotUp').onclick = () => viewer.rotate90('up');
  $('rotDown').onclick = () => viewer.rotate90('down');
  $('btnLevelHorizon').onclick = () => { if (!viewer.levelHorizon()) msg('위·아래 시점에서는 기울기를 정할 수 없습니다. 먼저 회전해 주세요.'); };
  $('btnAngleDefault').onclick = () => { showView('iso'); }; // 3/4 시점 + 기울기 0 (setView 가 기울기를 0 으로 되돌린다)
  const setSpeed = (v: number) => { const s = Math.min(8, Math.max(0.5, v)); viewer.rotateSpeed = s; num('spR').value = num('spN').value = String(s); saveUi({ speed: s }); };
  const sp = loadUi().speed;
  setSpeed(typeof sp === 'number' ? sp : 3);
  num('spR').oninput = () => setSpeed(Number(num('spR').value));
  num('spN').onchange = () => { const v = Number(num('spN').value); if (Number.isFinite(v)) setSpeed(v); };
  syncAngles(); // 3/4 시점: 누를 때마다 R ↔ L
  $('btnFit').onclick = (e) => { e.preventDefault(); e.stopPropagation(); viewer.fit(); }; // summary 안의 버튼이라 접기가 같이 눌리지 않게 한다

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
    if (e.code === 'Digit7' || e.code === 'Numpad7') return goView(e.shiftKey ? 'bottom' : 'top'); // 7 윗면 · Shift+7 아래
    if (e.code === 'Digit0' || e.code === 'Numpad0') return toggleIso(); // 0 = 3/4 시점 (누를 때마다 R ↔ L)
    if (k === 'f') return viewer.fit(); // 위치 초기화(화면에 맞추기)
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
  });
  const dieFile = $<HTMLInputElement>('fileDieline');
  $('btnSplitPick').onclick = () => dieFile.click();
  dieFile.onchange = () => {
    const f = dieFile.files?.[0]; dieFile.value = '';
    if (!f) return;
    busy(async () => { await inspectImage(f); await split!.open(f, f.name); });
  };
  $('btnSplitEdit').onclick = () => { if (dieline) busy(() => split!.open(dieline!.blob, dieline!.name, dieline)); };
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
  applyColors(defaultColors.face, defaultColors.lid, defaultColors.base);
  for (const f of FACES) viewer.setFaceTexture(f.id, null);
  setCurrent('lid_top');
  showView('iso', true);
  await initDraft();
  // 테스트·검증용 훅 (UI 동작에는 쓰지 않음)
  (window as unknown as Record<string, unknown>).__sabari = { viewer, faces, setCurrent, getLayout: (k: DieKind) => buildDieline(params, k), getDieline: () => dieline, getParams: () => cloneParams(params), getBaseline: () => cloneParams(baselineParams), applyParams: (p: BoxParams) => applyParams(p, true) };
}

init();
