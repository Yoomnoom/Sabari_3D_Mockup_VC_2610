// 템플릿을 GLB 바이트로 직렬화한다 (backend/app/template_gen.py build_glb 의 이식판).
// 앱 화면은 three.js 객체를 직접 만들고(viewer.setTemplate), 이 모듈은 테스트·검증 도구(gltf-validator)용이다.
import { BoxParams, derive, faceSizes } from './params';
import { BASE_FACES, EDIT_FACES, LID_FACES, Part, TEMPLATE_ID, buildParts } from './templateMesh';

const pad4 = (n: number) => n + ((4 - (n % 4)) % 4);

export function buildTemplateGlb(p: BoxParams, parts: Part[] = buildParts(p)): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const views: unknown[] = [], accessors: unknown[] = [], meshes: unknown[] = [], materials: unknown[] = [], nodes: Record<string, unknown>[] = [];

  const addView = (data: ArrayBuffer, target: number) => {
    const bytes = new Uint8Array(data);
    const padded = new Uint8Array(pad4(bytes.length));
    padded.set(bytes);
    views.push({ buffer: 0, byteOffset: total, byteLength: bytes.length, target });
    chunks.push(padded); total += padded.length;
    return views.length - 1;
  };
  const addAcc = (view: number, componentType: number, count: number, type: string, min?: number[], max?: number[]) => {
    const a: Record<string, unknown> = { bufferView: view, componentType, count, type };
    if (min) { a.min = min; a.max = max; }
    accessors.push(a);
    return accessors.length - 1;
  };

  const lidChildren: number[] = [], baseChildren: number[] = [];
  for (const part of parts) {
    const n = part.pos.length / 3;
    const mn = [0, 1, 2].map((k) => Math.min(...part.pos.filter((_, i) => i % 3 === k)));
    const mx = [0, 1, 2].map((k) => Math.max(...part.pos.filter((_, i) => i % 3 === k)));
    const posAcc = addAcc(addView(new Float32Array(part.pos).buffer, 34962), 5126, n, 'VEC3', mn, mx);
    const nrmAcc = addAcc(addView(new Float32Array(part.nrm).buffer, 34962), 5126, n, 'VEC3');
    const attrs: Record<string, number> = { POSITION: posAcc, NORMAL: nrmAcc };
    if (part.editable) attrs.TEXCOORD_0 = addAcc(addView(new Float32Array(part.uv).buffer, 34962), 5126, n, 'VEC2');
    const idxAcc = addAcc(addView(new Uint16Array(part.idx).buffer, 34963), 5123, part.idx.length, 'SCALAR');
    const [r, g, b] = part.color;
    materials.push({ name: part.name, pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: false });
    meshes.push({ name: part.name, primitives: [{ attributes: attrs, indices: idxAcc, material: materials.length - 1 }] });
    nodes.push({ name: part.name, mesh: meshes.length - 1 });
    (part.group === 'base' ? baseChildren : lidChildren).push(nodes.length - 1);
  }
  nodes.push({ name: 'Lid', children: lidChildren, translation: [0, 0, 0] });
  const lidIdx = nodes.length - 1;
  nodes.push({ name: 'Base', children: baseChildren });
  const baseIdx = nodes.length - 1;

  const d = derive(p);
  const sizes = faceSizes(p);
  const root = {
    asset: { version: '2.0', generator: 'Sabari Mockup Studio template (ts)' },
    scene: 0,
    scenes: [{ nodes: [baseIdx, lidIdx] }],
    nodes, meshes, materials, accessors, bufferViews: views,
    buffers: [{ byteLength: total }],
    extras: {
      templateId: TEMPLATE_ID, units: 'meters', up: 'Y',
      nominal_base_mm: [p.baseW, p.baseD, p.baseH],
      mockup_lid_mm: [d.lidW, d.lidD, p.lidH],
      board_thickness_assumed_mm: p.board,
      clearance_per_side_mm: p.lidClearance,
      editableFaces: [...LID_FACES], optionalFaces: [...BASE_FACES],
      faceSizeMm: Object.fromEntries(EDIT_FACES.map((id) => [id, sizes[id as keyof typeof sizes]])),
      params: { ...p }, // 이 GLB 를 만든 치수 파라미터 (가정값 포함, 제조 규격 아님)
      note: '목업용 가정 치수이며 제조 치수가 아님.',
    },
  };
  const json = new TextEncoder().encode(JSON.stringify(root));
  const jsonPadded = new Uint8Array(pad4(json.length)).fill(0x20); jsonPadded.set(json);
  const bin = new Uint8Array(total);
  let off = 0; for (const c of chunks) { bin.set(c, off); off += c.length; }

  const out = new Uint8Array(12 + 8 + jsonPadded.length + 8 + bin.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true);
  dv.setUint32(12, jsonPadded.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jsonPadded, 20);
  const b0 = 20 + jsonPadded.length;
  dv.setUint32(b0, bin.length, true); dv.setUint32(b0 + 4, 0x004e4942, true); out.set(bin, b0 + 8);
  return out;
}

/** GLB 의 JSON 청크를 읽는다(테스트용). */
export function readGlbJson(glb: Uint8Array): Record<string, any> {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
}

export function readGlbBin(glb: Uint8Array): Uint8Array {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jl = dv.getUint32(12, true);
  const b0 = 20 + jl;
  return glb.subarray(b0 + 8, b0 + 8 + dv.getUint32(b0, true));
}
