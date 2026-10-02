import { FACES, FaceData, FaceId, decode, faces, rebake } from './faces';
import { Viewer, ViewName } from './viewer';
import { Rotation, defaultState } from './transform';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SCHEMA_VERSION = 2;
const TEMPLATE_ID = 'sabari-160-110-43-v2';
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
async function inspectOnServer(file: Blob, name: string) {
  const fd = new FormData();
  fd.append('file', file, name);
  let r: Response;
  try {
    r = await fetch('/api/images/inspect', { method: 'POST', body: fd });
  } catch {
    throw new Error('앱 서버에 연결하지 못했습니다. start.bat으로 실행했는지 확인해 주세요.');
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? '이미지를 검사하지 못했습니다.');
  return j as { width: number; height: number; warnings: string[] };
}

function snapshot(f: FaceData) {
  f.undo = { state: { ...f.state }, blob: f.blob, name: f.name, img: f.img, iw: f.iw, ih: f.ih };
}

async function setImage(id: FaceId, file: Blob, name: string) {
  const info = await inspectOnServer(file, name);
  const { img, iw, ih } = await decode(file).catch(() => { throw new Error('이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.'); });
  const f = faces[id];
  snapshot(f);
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
    b.innerHTML = `<span>${fd.label}</span><small>${f.img ? '이미지 있음' : '비어 있음'} · ${fd.wMm}×${fd.hMm}mm</small>`;
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
  $('btnUndo').hidden = !f.undo;
}
function setPair(k: string, v: number) {
  $<HTMLInputElement>(k + 'R').value = String(Math.round(v));
  $<HTMLInputElement>(k + 'N').value = String(Math.round(v));
}

function edit(fn: (f: FaceData) => void) {
  const f = faces[current];
  if (!f.img) return;
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
function projectJson(): string {
  const surfaces: Record<string, unknown> = {};
  for (const fd of FACES) {
    const s = faces[fd.id].state;
    surfaces[fd.id] = { fit: s.fit, rotationDeg: s.rotationDeg, flipX: s.flipX, flipY: s.flipY, scale: s.scale, offsetX: s.offsetX, offsetY: s.offsetY };
  }
  return JSON.stringify({
    schemaVersion: SCHEMA_VERSION, templateId: TEMPLATE_ID,
    box: { lidLiftMm: Math.round(viewer.slot === 'editor' ? viewer.getLiftMm() : 0) },
    background: $<HTMLSelectElement>('bgSel').value, surfaces,
  });
}

async function saveProject() {
  await busy(async () => {
    const fd = new FormData();
    fd.append('project', projectJson());
    const withImg = FACES.filter((x) => faces[x.id].blob);
    fd.append('faces', JSON.stringify(withImg.map((x) => x.id)));
    for (const x of withImg) fd.append('files', faces[x.id].blob!, faces[x.id].name ?? 'image');
    const r = await fetch('/api/projects/save', { method: 'POST', body: fd });
    if (!r.ok) throw new Error((await r.json()).error ?? '프로젝트 저장에 실패했습니다.');
    download(await r.blob(), '사바리_프로젝트.sabari');
    msg('프로젝트를 저장했습니다. (다운로드 폴더의 사바리_프로젝트.sabari)', 'ok');
  });
}

async function openProject(file: File) {
  await busy(async () => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/projects/open', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? '프로젝트를 열지 못했습니다.');
    for (const fdsc of FACES) {
      const f = faces[fdsc.id];
      const s = j.project.surfaces[fdsc.id];
      f.undo = null;
      f.state = s ? { fit: s.fit, rotationDeg: s.rotationDeg, flipX: s.flipX, flipY: s.flipY, scale: s.scale, offsetX: s.offsetX, offsetY: s.offsetY } : defaultState();
      const im = j.images[fdsc.id];
      if (im) {
        const bytes = Uint8Array.from(atob(im.base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: im.mime });
        const d = await decode(blob);
        f.blob = blob; f.name = im.name; f.img = d.img; f.iw = d.iw; f.ih = d.ih;
      } else {
        f.blob = null; f.name = null; f.img = null; f.iw = f.ih = 0;
      }
      apply(fdsc.id);
    }
    setLift(j.project.box.lidLiftMm);
    $<HTMLSelectElement>('bgSel').value = j.project.background;
    syncControls();
    msg('프로젝트를 열었습니다.', 'ok');
  });
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

// ---------- 박스 / 뷰어 ----------
function setLift(mm: number) {
  const v = Math.min(150, Math.max(0, Math.round(mm)));
  viewer.setLiftMm(v);
  for (const id of ['liftR', 'liftN', 'vLiftR', 'vLiftN']) $<HTMLInputElement>(id).value = String(v);
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

// ---------- 시작 ----------
async function init() {
  try {
    viewer = new Viewer($('viewport'));
  } catch {
    msg('이 브라우저에서는 3D 미리보기를 사용할 수 없습니다. Chrome 또는 Edge를 사용해 주세요.');
    return;
  }
  viewer.onPick = (id) => setCurrent(id);
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
    snapshot(f);
    f.blob = null; f.name = null; f.img = null; f.iw = f.ih = 0; f.state = defaultState();
    apply(current);
  };
  $('btnReset').onclick = () => {
    const f = faces[current];
    if (!f.img) return;
    snapshot(f);
    f.state = defaultState();
    apply(current);
  };
  $('btnUndo').onclick = () => {
    const f = faces[current];
    const u = f.undo;
    if (!u) return;
    f.undo = null;
    Object.assign(f, { state: u.state, blob: u.blob, name: u.name, img: u.img, iw: u.iw, ih: u.ih });
    apply(current);
  };

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
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'radio' && (t as HTMLInputElement).type !== 'checkbox' && (t as HTMLInputElement).type !== 'range') return;
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); if (mode === 'edit') saveProject(); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    const views: Record<string, ViewName> = { '1': 'front', '3': 'right', '7': 'top', '0': 'iso', r: 'iso' };
    if (views[k]) viewer.setView(views[k]);
    else if (k === 'o' && viewer.hasLid()) setLift(viewer.getLiftMm() > 0 ? 0 : OPEN_MM);
  });

  await busy(() => viewer.loadTemplate('/api/template.glb'));
  for (const f of FACES) viewer.setFaceTexture(f.id, null);
  setCurrent('lid_top');
  viewer.setView('iso');
  // 테스트·검증용 훅 (UI 동작에는 쓰지 않음)
  (window as unknown as Record<string, unknown>).__sabari = { viewer, faces, setCurrent };
}

init();
