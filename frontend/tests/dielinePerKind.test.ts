import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../src/params';
import { DielineSave, SCHEMA_VERSION, packProject, unpackProject } from '../src/project';

// 노드에는 createImageBitmap 이 없으므로 검사용으로 1×1 비트맵만 흉내 낸다(형식 판별은 헤더 바이트로 한다)
beforeAll(() => { (globalThis as unknown as Record<string, unknown>).createImageBitmap = async () => ({ width: 1, height: 1, close() { /* 없음 */ } }); });

const png = (tag: number) => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tag, tag, tag])], { type: 'image/png' });
const save = (kind: 'lid' | 'base', blob: Blob, extra: Partial<DielineSave> = {}): DielineSave => ({ blob, name: `${kind}.png`, bleedMm: 3, kind, regions: { lid_top: { x: 1, y: 2, w: 30, h: 40 } }, rotations: { lid_top: 90 }, ...extra });
const base = { faces: [], lidLiftMm: 0, background: 'white', colors: { face: '#ffffff', lid: '#ffffff', base: '#ffffff' }, useBaseFaces: false, params: { ...DEFAULT_PARAMS }, viewPresets: [] };
const bytesOf = async (b: Blob) => Array.from(new Uint8Array(await b.arrayBuffer()));

describe('칼선 종류별 저장(.sabari)', () => {
  it('양쪽을 따로 저장·복원하고 같은 원본 바이트는 ZIP에 한 개만 둔다', async () => {
    const same = png(7);
    const blob = await packProject({ ...base, dielines: { lid: save('lid', same, { mode: 'artboard', artboardMm: [525.7, 349] }), base: save('base', png(7), { imageRotation: 90, orientationConfirmed: true }) } });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((f) => f.startsWith('images/dieline'))).toEqual(['images/dieline.png']);
    const pj = JSON.parse(await zip.file('project.json')!.async('string'));
    expect(pj.schemaVersion).toBe(SCHEMA_VERSION);
    expect(pj.dielines.lid.file).toBe(pj.dielines.base.file);
    expect(pj.dieline.kind).toBe('lid'); // 예전 단일 필드(뚜껑 우선)도 기록
    const o = await unpackProject(blob);
    expect(o.dielines?.lid?.mode).toBe('artboard');
    expect(o.dielines?.base?.imageRotation).toBe(90);
    expect(o.dielines?.base?.regions.lid_top).toEqual({ x: 1, y: 2, w: 30, h: 40 });
    expect(await bytesOf(o.dielines!.lid!.blob)).toEqual(await bytesOf(same));
  });
  it('다른 이미지는 따로 두 개 저장하고, 한쪽만 있으면 다른 쪽은 없다', async () => {
    const both = await packProject({ ...base, dielines: { lid: save('lid', png(1)), base: save('base', png(2)) } });
    const z = await JSZip.loadAsync(await both.arrayBuffer());
    expect(Object.keys(z.files).filter((f) => f.startsWith('images/dieline')).sort()).toEqual(['images/dieline.png', 'images/dieline_2.png']);
    const o = await unpackProject(both);
    expect((await bytesOf(o.dielines!.lid!.blob))[8]).toBe(1); expect((await bytesOf(o.dielines!.base!.blob))[8]).toBe(2);
    const onlyBase = await unpackProject(await packProject({ ...base, dielines: { base: save('base', png(3)) } }));
    expect(onlyBase.dielines?.lid).toBeUndefined(); expect(onlyBase.dielines?.base?.kind).toBe('base');
  });
  it('예전 파일(단일 dieline 필드)은 그 kind 의 저장으로 읽고, 미래 버전은 거부한다', async () => {
    const blob = await packProject({ ...base, dielines: { base: save('base', png(4)) } });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const pj = JSON.parse(await zip.file('project.json')!.async('string'));
    delete pj.dielines; pj.schemaVersion = 9;
    zip.file('project.json', JSON.stringify(pj));
    const o = await unpackProject(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));
    expect(o.dielines?.base?.name).toBe('base.png'); expect(o.dielines?.lid).toBeUndefined();
    pj.schemaVersion = 99; zip.file('project.json', JSON.stringify(pj));
    await expect(unpackProject(new Blob([await zip.generateAsync({ type: 'arraybuffer' })]))).rejects.toThrow();
  });
});
