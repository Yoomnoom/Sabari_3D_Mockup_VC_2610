import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/params';
import { FACES } from '../src/faceDefs';
import { SCHEMA_VERSION, packProject, unpackProject } from '../src/project';
import { defaultState, defaultUnderlay } from '../src/transform';

beforeAll(() => { (globalThis as unknown as Record<string, unknown>).createImageBitmap = async () => ({ width: 1, height: 1, close() { /* 없음 */ } }); });
const png = (t: number) => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, t, t])], { type: 'image/png' });
const layer = (t: number, over = {}) => ({ blob: png(t), name: `u${t}.png`, state: { ...defaultUnderlay(), ...over } });
const faces = (unders: ReturnType<typeof layer>[], onTop = false) => FACES.map((f) => ({ id: f.id, state: defaultState(), blob: f.id === 'lid_top' ? png(1) : null, name: f.id === 'lid_top' ? 'a.png' : null, unders: f.id === 'lid_top' ? unders : [], underOnTop: f.id === 'lid_top' ? onTop : false }));
const base = { lidLiftMm: 0, background: 'white', colors: { face: '#ffffff', lid: '#ffffff', base: '#ffffff' }, useBaseFaces: false, params: { ...DEFAULT_PARAMS }, dielines: {}, viewPresets: [] };

describe('바탕 레이어 여러 장(저장 형식 v12)', () => {
  it('레이어 3장의 순서·변환값·불투명도·보이기·위아래 순서·원본 바이트가 저장→열기에서 복원된다', async () => {
    const blob = await packProject({ ...base, faces: faces([layer(2, { fit: 'tile', opacity: 0.4, visible: false, scale: 1.5 }), layer(3, { offsetX: 0.25, rotationDeg: 90 }), layer(4)], true) });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(['images/underlay_lid_top_1.png', 'images/underlay_lid_top_2.png', 'images/underlay_lid_top_3.png'].every((f) => zip.file(f))).toBe(true);
    const pj = JSON.parse(await zip.file('project.json')!.async('string'));
    expect(pj.schemaVersion).toBe(SCHEMA_VERSION); expect(SCHEMA_VERSION).toBe(12);
    expect(pj.surfaces.lid_top.underlays).toHaveLength(3); expect(pj.surfaces.lid_top.underlay).toBeUndefined();
    const u = (await unpackProject(blob)).faces.lid_top;
    expect(u.unders).toHaveLength(3);
    expect(u.unders![0].state).toMatchObject({ fit: 'tile', opacity: 0.4, visible: false, scale: 1.5 });
    expect(u.unders![1].state).toMatchObject({ offsetX: 0.25, rotationDeg: 90 });
    expect(u.underOnTop).toBe(true);
    expect((await u.unders![2].blob.arrayBuffer()).byteLength).toBe(10);
  });
  it('옛 파일(바탕 한 장, 버전 11)은 레이어 1장으로 열린다', async () => {
    const blob = await packProject({ ...base, faces: faces([layer(2, { opacity: 0.5 })]) });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const pj = JSON.parse(await zip.file('project.json')!.async('string'));
    const l0 = pj.surfaces.lid_top.underlays[0]; delete pj.surfaces.lid_top.underlays; delete pj.surfaces.lid_top.underlayOnTop;
    pj.surfaces.lid_top.underlay = { ...l0, onTop: true }; pj.schemaVersion = 11;
    zip.file('project.json', JSON.stringify(pj));
    const o = await unpackProject(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));
    expect(o.faces.lid_top.unders).toHaveLength(1); expect(o.faces.lid_top.unders![0].state.opacity).toBe(0.5); expect(o.faces.lid_top.underOnTop).toBe(true);
  });
  it('바탕 필드가 없는 파일은 바탕 없이 열리고 미래 버전은 거부된다', async () => {
    const blob = await packProject({ ...base, faces: faces([]) });
    expect((await unpackProject(blob)).faces.lid_top.unders).toBeUndefined();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const pj = JSON.parse(await zip.file('project.json')!.async('string')); pj.schemaVersion = 99; zip.file('project.json', JSON.stringify(pj));
    await expect(unpackProject(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow();
  });
  it('면에는 최대 8장까지만 열린다', async () => {
    const blob = await packProject({ ...base, faces: faces(Array.from({ length: 10 }, (_, i) => layer(i + 2))) });
    expect((await unpackProject(blob)).faces.lid_top.unders).toHaveLength(8);
  });
});
