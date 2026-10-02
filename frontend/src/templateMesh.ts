// 사바리 박스 템플릿 메시를 파라미터에서 만든다. backend/app/template_gen.py 의 TypeScript 이식판이다.
// 기본 파라미터에서는 Python 이 만든 template.glb 와 같은 결과여야 한다(frontend/tests/templateParity.test.ts 가 확인).
//
// 좌표계: glTF 규격(Y-up, 단위 m). 몸통 바닥이 y=0, XZ 는 중앙 정렬. +X 오른쪽, +Z 앞(정면), −Z 뒤.
// 편집면은 UV 0..1 전체가 면 하나와 1:1 이다. glTF 규격대로 v=0 이 이미지 위쪽이다.
//   lid_top: 위에서 내려다본 이미지 위쪽 = 뒤(−Z) / base_bottom: 아래에서 올려다본 이미지 위쪽 = 앞(+Z) / 옆면: 이미지 위쪽 = 위(+Y)

import { BoxParams, derive } from './params';

export const MM = 0.001;
export const LID_FACES = ['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right'] as const;
export const BASE_FACES = ['base_front', 'base_back', 'base_left', 'base_right', 'base_bottom'] as const;
export const EDIT_FACES: readonly string[] = [...LID_FACES, ...BASE_FACES];
export const TEMPLATE_ID = 'sabari-160-110-43-v2';

type V3 = [number, number, number];

export interface Part {
  name: string;
  group: 'lid' | 'base';
  /** 편집면이면 UV 를 가진다. rim/inner 는 단색이라 UV 가 없다. */
  editable: boolean;
  pos: number[]; // 평탄화된 xyz (m)
  nrm: number[];
  uv: number[]; // 평탄화된 uv (편집면만)
  idx: number[];
  color: V3; // 선형 baseColorFactor
}

const COLORS: Record<string, V3> = {
  lid_top: [0.97, 0.97, 0.96], lid_front: [0.97, 0.97, 0.96], lid_back: [0.97, 0.97, 0.96],
  lid_left: [0.97, 0.97, 0.96], lid_right: [0.97, 0.97, 0.96],
  lid_rim: [0.78, 0.76, 0.72], lid_inner: [0.90, 0.88, 0.84],
  base_front: [0.86, 0.84, 0.80], base_back: [0.86, 0.84, 0.80], base_left: [0.86, 0.84, 0.80],
  base_right: [0.86, 0.84, 0.80], base_bottom: [0.86, 0.84, 0.80],
  base_rim: [0.86, 0.84, 0.80], base_inner: [0.86, 0.84, 0.80],
};

class MeshBuilder {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; idx: number[] = [];
  /** p: 바깥에서 봤을 때 반시계(CCW) 순서의 꼭짓점 4개, n: 바깥 법선 */
  quad(p: V3[], n: V3, uvs?: [number, number][]) {
    const i = this.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      this.pos.push(...p[k]); this.nrm.push(...n);
      this.uv.push(...(uvs ? uvs[k] : [0, 0]));
    }
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
}

type FaceKind = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

function boxFaces(w: number, d: number, y0: number, y1: number): Record<FaceKind, [V3[], V3]> {
  const x = w / 2, z = d / 2;
  return {
    top: [[[-x, y1, -z], [-x, y1, z], [x, y1, z], [x, y1, -z]], [0, 1, 0]],
    bottom: [[[-x, y0, z], [-x, y0, -z], [x, y0, -z], [x, y0, z]], [0, -1, 0]],
    front: [[[-x, y0, z], [x, y0, z], [x, y1, z], [-x, y1, z]], [0, 0, 1]],
    back: [[[x, y0, -z], [-x, y0, -z], [-x, y1, -z], [x, y1, -z]], [0, 0, -1]],
    left: [[[-x, y0, -z], [-x, y0, z], [-x, y1, z], [-x, y1, -z]], [-1, 0, 0]],
    right: [[[x, y0, z], [x, y0, -z], [x, y1, -z], [x, y1, z]], [1, 0, 0]],
  };
}

function uvFor(face: FaceKind, p: V3[], w: number, d: number, y0: number, y1: number): [number, number][] {
  return p.map(([x, y, z]) => {
    if (face === 'top') return [(x + w / 2) / w, (z + d / 2) / d];
    if (face === 'bottom') return [(x + w / 2) / w, (d / 2 - z) / d];
    if (face === 'front') return [(x + w / 2) / w, (y1 - y) / (y1 - y0)];
    if (face === 'back') return [(w / 2 - x) / w, (y1 - y) / (y1 - y0)];
    if (face === 'left') return [(z + d / 2) / d, (y1 - y) / (y1 - y0)];
    return [(d / 2 - z) / d, (y1 - y) / (y1 - y0)]; // right
  }) as [number, number][];
}

/** 수평 고리(두께면) 사다리꼴 4개. up=true 면 법선 +Y. */
function ring(mb: MeshBuilder, ow: number, od: number, iw: number, idp: number, y: number, up: boolean) {
  const ox = ow / 2, oz = od / 2, ix = iw / 2, iz = idp / 2;
  const n: V3 = up ? [0, 1, 0] : [0, -1, 0];
  const segs: V3[][] = [
    [[-ox, y, -oz], [-ix, y, -iz], [ix, y, -iz], [ox, y, -oz]],
    [[ox, y, -oz], [ix, y, -iz], [ix, y, iz], [ox, y, oz]],
    [[ox, y, oz], [ix, y, iz], [-ix, y, iz], [-ox, y, oz]],
    [[-ox, y, oz], [-ix, y, iz], [-ix, y, -iz], [-ox, y, -oz]],
  ];
  for (const s of segs) mb.quad(up ? s : [...s].reverse(), n);
}

/** 안쪽 4벽(법선이 안쪽을 향함) */
function innerWalls(mb: MeshBuilder, iw: number, idp: number, y0: number, y1: number) {
  const x = iw / 2, z = idp / 2;
  mb.quad([[x, y0, z], [-x, y0, z], [-x, y1, z], [x, y1, z]], [0, 0, -1]);
  mb.quad([[-x, y0, -z], [x, y0, -z], [x, y1, -z], [-x, y1, -z]], [0, 0, 1]);
  mb.quad([[x, y0, -z], [x, y0, z], [x, y1, z], [x, y1, -z]], [-1, 0, 0]);
  mb.quad([[-x, y0, z], [-x, y0, -z], [-x, y1, -z], [-x, y1, z]], [1, 0, 0]);
}

/** 템플릿 부품 목록. 순서는 Python 생성기와 같다(뚜껑 5면, lid_rim, lid_inner, 하단 5면, base_rim, base_inner). */
export function buildParts(p: BoxParams): Part[] {
  const d = derive(p);
  const bw = p.baseW * MM, bd = p.baseD * MM, bh = p.baseH * MM;
  const lw = d.lidW * MM, ld = d.lidD * MM, lh = p.lidH * MM;
  const t = p.board * MM;
  const ly1 = bh + t; // 뚜껑은 몸통 위에 얹힌 상태: 천장 안쪽이 몸통 윗면 높이와 같다
  const ly0 = ly1 - lh;

  const out: Part[] = [];
  const push = (name: string, mb: MeshBuilder, editable: boolean) =>
    out.push({ name, group: name.startsWith('base_') ? 'base' : 'lid', editable, pos: mb.pos, nrm: mb.nrm, uv: editable ? mb.uv : [], idx: mb.idx, color: COLORS[name] });

  const lf = boxFaces(lw, ld, ly0, ly1);
  const lidMap: [string, FaceKind][] = [['lid_top', 'top'], ['lid_front', 'front'], ['lid_back', 'back'], ['lid_left', 'left'], ['lid_right', 'right']];
  for (const [name, key] of lidMap) {
    const mb = new MeshBuilder(); const [vp, n] = lf[key];
    mb.quad(vp, n, uvFor(key, vp, lw, ld, ly0, ly1)); push(name, mb, true);
  }
  const rim = new MeshBuilder(); ring(rim, lw, ld, lw - 2 * t, ld - 2 * t, ly0, false); push('lid_rim', rim, false);
  const inner = new MeshBuilder();
  { const iw = lw - 2 * t, idp = ld - 2 * t, x = iw / 2, z = idp / 2;
    inner.quad([[-x, ly1 - t, -z], [x, ly1 - t, -z], [x, ly1 - t, z], [-x, ly1 - t, z]], [0, -1, 0]);
    innerWalls(inner, iw, idp, ly0, ly1 - t); }
  push('lid_inner', inner, false);

  const bf = boxFaces(bw, bd, 0.0, bh);
  const baseMap: [string, FaceKind][] = [['base_front', 'front'], ['base_back', 'back'], ['base_left', 'left'], ['base_right', 'right'], ['base_bottom', 'bottom']];
  for (const [name, key] of baseMap) {
    const mb = new MeshBuilder(); const [vp, n] = bf[key];
    mb.quad(vp, n, uvFor(key, vp, bw, bd, 0.0, bh)); push(name, mb, true);
  }
  const brim = new MeshBuilder(); ring(brim, bw, bd, bw - 2 * t, bd - 2 * t, bh, true); push('base_rim', brim, false);
  const binner = new MeshBuilder();
  innerWalls(binner, bw - 2 * t, bd - 2 * t, t, bh);
  { const x = (bw - 2 * t) / 2, z = (bd - 2 * t) / 2;
    binner.quad([[-x, t, z], [x, t, z], [x, t, -z], [-x, t, -z]], [0, 1, 0]); }
  push('base_inner', binner, false);
  return out;
}
