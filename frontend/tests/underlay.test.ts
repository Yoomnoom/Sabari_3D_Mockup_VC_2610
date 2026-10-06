import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/params';
import { FACES } from '../src/faceDefs';
import { SCHEMA_VERSION, packProject, unpackProject } from '../src/project';
import { defaultState, defaultUnderlay } from '../src/transform';

beforeAll(() => { (globalThis as unknown as Record<string, unknown>).createImageBitmap = async () => ({ width: 1, height: 1, close() { /* 없음 */ } }); });
const png = (t: number) => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, t, t])], { type: 'image/png' });
const faces = (withUnder: boolean) => FACES.map((f) => ({ id: f.id, state: defaultState(), blob: f.id === 'lid_top' ? png(1) : null, name: f.id === 'lid_top' ? 'a.png' : null, under: withUnder && f.id === 'lid_top' ? { blob: png(2), name: 'u.png', state: { ...defaultUnderlay(), fit: 'tile' as const, opacity: 0.4, visible: false, scale: 1.5 }, onTop: true } : null }));
const base = { lidLiftMm: 0, background: 'white', colors: { face: '#ffffff', lid: '#ffffff', base: '#ffffff' }, useBaseFaces: false, params: { ...DEFAULT_PARAMS }, dielines: {}, viewPresets: [] };

describe('바탕 이미지(작업 26) 저장', () => {
  it('저장→열기에서 변환값·불투명도·보이기·순서·원본 바이트가 복원된다', async () => {
    const blob = await packProject({ ...base, faces: faces(true) });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('images/underlay_lid_top.png')).toBeTruthy();
    expect(JSON.parse(await zip.file('project.json')!.async('string')).schemaVersion).toBe(SCHEMA_VERSION);
    const o = await unpackProject(blob);
    const u = o.faces.lid_top.under!;
    expect(u.state).toMatchObject({ fit: 'tile', opacity: 0.4, visible: false, scale: 1.5 });
    expect(u.onTop).toBe(true);
    expect((await u.blob.arrayBuffer()).byteLength).toBe(10);
    expect(o.faces.lid_front.under).toBeUndefined();
  });
  it('바탕 필드가 없는 파일은 바탕 없이 열리고 미래 버전은 거부된다', async () => {
    const blob = await packProject({ ...base, faces: faces(false) });
    expect((await unpackProject(blob)).faces.lid_top.under).toBeUndefined();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const pj = JSON.parse(await zip.file('project.json')!.async('string')); pj.schemaVersion = 99; zip.file('project.json', JSON.stringify(pj));
    await expect(unpackProject(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow();
  });
});
