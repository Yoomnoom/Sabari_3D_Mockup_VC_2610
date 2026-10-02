// 브라우저 안에서 처리하는 이미지 검사와 .sabari(ZIP) 저장/열기. backend/app/project_io.py 와 같은 파일 형식이다.
import JSZip from 'jszip';
import { FACES, FaceId } from './faceDefs';
import { SurfaceState } from './transform';

export const SCHEMA_VERSION = 3; // 3: 하단 5면 + 스위치(useBaseFaces). 2(뚜껑 5면)도 그대로 열린다.
const READABLE_VERSIONS = [2, 3];
export const TEMPLATE_ID = 'sabari-160-110-43-v2';
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 32;

export class UserError extends Error {}

export interface ImageInfo { mime: string; ext: string; warnings: string[] }

/** 확장자가 아니라 파일 내용(시그니처)과 실제 디코딩으로 판별한다. */
export async function inspectImage(blob: Blob): Promise<ImageInfo & { width: number; height: number }> {
  if (blob.size > MAX_BYTES) throw new UserError('이미지가 50MB를 초과합니다. 더 작은 파일을 사용해 주세요.');
  const h = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = (a: number, b: number) => String.fromCharCode(...h.slice(a, b));
  let mime = '', ext = '';
  if (h[0] === 0x89 && ascii(1, 4) === 'PNG') { mime = 'image/png'; ext = '.png'; }
  else if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) { mime = 'image/jpeg'; ext = '.jpg'; }
  else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') { mime = 'image/webp'; ext = '.webp'; }
  else {
    // 읽을 수 있는 다른 형식(GIF 등)인지 구분해 안내 문구를 고른다.
    const ok = await createImageBitmap(blob).then((b) => (b.close(), true), () => false);
    throw new UserError(ok ? 'PNG, JPG 또는 WebP 이미지를 선택해 주세요.' : '이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.');
  }
  const bmp = await createImageBitmap(blob).catch(() => { throw new UserError('이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.'); });
  const { width, height } = bmp;
  bmp.close();
  const warnings = Math.max(width, height) > 12000
    ? ['가장 긴 변이 12000px를 넘어 미리보기용 복사본만 축소해 사용합니다. 원본은 그대로 보존됩니다.'] : [];
  return { mime, ext, warnings, width, height };
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : d);

function parseSurface(v: unknown): { state: SurfaceState; sourceFile: string | null; originalName: string | null } {
  const s = (v ?? {}) as Record<string, unknown>;
  const rot = s.rotationDeg ?? 0;
  if (![0, 90, 180, 270].includes(rot as number)) throw new UserError('프로젝트 파일 형식이 올바르지 않습니다: rotationDeg');
  if (s.fit !== undefined && s.fit !== 'contain' && s.fit !== 'cover') throw new UserError('프로젝트 파일 형식이 올바르지 않습니다: fit');
  return {
    state: {
      fit: (s.fit as 'contain' | 'cover') ?? 'contain', rotationDeg: rot as 0 | 90 | 180 | 270,
      flipX: s.flipX === true, flipY: s.flipY === true,
      scale: num(s.scale, 0.25, 3, 1), offsetX: num(s.offsetX, -1, 1, 0), offsetY: num(s.offsetY, -1, 1, 0),
    },
    sourceFile: typeof s.sourceFile === 'string' ? s.sourceFile : null,
    originalName: typeof s.originalName === 'string' ? s.originalName : null,
  };
}

export interface SaveFace { id: FaceId; state: SurfaceState; blob: Blob | null; name: string | null }

export interface Colors { face: string; lid: string; base: string }
const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);

export async function packProject(faces: SaveFace[], lidLiftMm: number, background: string, colors: Colors, useBaseFaces: boolean): Promise<Blob> {
  const zip = new JSZip();
  const surfaces: Record<string, unknown> = {};
  for (const f of faces) {
    let sourceFile: string | null = null;
    if (f.blob) {
      const info = await inspectImage(f.blob);
      sourceFile = `images/${f.id}${info.ext}`;
      zip.file(sourceFile, f.blob, { compression: 'STORE' }); // 원본 바이트 그대로
    }
    surfaces[f.id] = { ...f.state, sourceFile, originalName: f.name };
  }
  zip.file('project.json', JSON.stringify({ schemaVersion: SCHEMA_VERSION, templateId: TEMPLATE_ID, box: { lidLiftMm }, colors, useBaseFaces, background, surfaces }, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export interface OpenedProject {
  lidLiftMm: number;
  background: 'white' | 'transparent';
  colors: Colors | null; // 없으면(이전 프로젝트) 기본값 유지
  useBase?: boolean; // 하단 몸통 디자인 사용 스위치. 하단 면에 이미지가 있으면 항상 true (이전 임시저장에는 없을 수 있음)
  faces: Record<FaceId, { state: SurfaceState; blob: Blob | null; name: string | null }>;
}

export async function unpackProject(file: Blob): Promise<OpenedProject> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer()).catch(() => { throw new UserError('프로젝트 파일(.sabari)을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.'); });
  if (Object.keys(zip.files).length > MAX_ENTRIES) throw new UserError('프로젝트 파일이 너무 크거나 항목이 많습니다.');
  const pj = zip.file('project.json');
  if (!pj) throw new UserError('project.json이 없는 파일입니다.');
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(await pj.async('string')); } catch { throw new UserError('프로젝트 데이터를 읽지 못했습니다.'); }
  if (!raw || !READABLE_VERSIONS.includes(raw.schemaVersion as number)) throw new UserError('이 프로젝트는 현재 버전에서 열 수 없습니다. 앱을 업데이트해 주세요.');
  if ((raw.templateId ?? TEMPLATE_ID) !== TEMPLATE_ID) throw new UserError('지원하지 않는 템플릿의 프로젝트입니다.');
  const surfaces = (raw.surfaces ?? {}) as Record<string, unknown>;
  const unknown = Object.keys(surfaces).filter((k) => !FACES.some((f) => f.id === k));
  if (unknown.length) throw new UserError(`알 수 없는 면이 있습니다: ${unknown.join(', ')}`);

  const out = {} as OpenedProject['faces'];
  for (const f of FACES) {
    const p = parseSurface(surfaces[f.id]);
    let blob: Blob | null = null;
    if (p.sourceFile) {
      // 경로 순회 차단: images/ 아래 단일 파일명만 허용
      if (!/^images\/[^/\\]+$/.test(p.sourceFile) || p.sourceFile.includes('..')) throw new UserError('프로젝트 안에 허용되지 않는 경로가 있습니다.');
      const entry = zip.file(p.sourceFile);
      if (!entry) throw new UserError(`${f.id} 이미지가 파일 안에 없습니다.`);
      const bytes = (await entry.async('arraybuffer')) as ArrayBuffer;
      const info = await inspectImage(new Blob([bytes]));
      blob = new Blob([bytes], { type: info.mime });
    }
    out[f.id] = { state: p.state, blob, name: blob ? (p.originalName ?? p.sourceFile) : null };
  }
  const box = (raw.box ?? {}) as Record<string, unknown>;
  const c = raw.colors as Record<string, unknown> | undefined;
  const colors = c ? { face: hex(c.face, '#ffffff'), lid: hex(c.lid, '#ffffff'), base: hex(c.base, '#ffffff') } : null;
  const hasBaseImage = FACES.some((f) => f.group === 'base' && out[f.id].blob);
  return { useBase: raw.useBaseFaces === true || hasBaseImage, colors, lidLiftMm: num(box.lidLiftMm, 0, 150, 0), background: raw.background === 'transparent' ? 'transparent' : 'white', faces: out };
}
