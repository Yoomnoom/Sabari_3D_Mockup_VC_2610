// 편집 가능한 면의 정의. DOM에 의존하지 않아 테스트에서도 쓴다.
// 면 크기(mm)는 여기서 따로 적지 않는다: 박스 치수 파라미터(params.ts faceSizes)에서 계산하며,
// 치수가 바뀌면 applyFaceSizes 로 이 목록의 wMm/hMm 을 갱신한다(다른 모듈은 같은 객체를 계속 본다).

import { DEFAULT_PARAMS, FaceKey, faceSizes } from './params';

export type FaceGroup = 'lid' | 'base';
export type FaceId = FaceKey;

export interface FaceDef {
  id: FaceId;
  group: FaceGroup;
  label: string; // 제목·안내용 전체 이름
  short: string; // 탭 안의 목록용 짧은 이름
  wMm: number;
  hMm: number;
}

const LABELS: [FaceId, FaceGroup, string, string][] = [
  ['lid_top', 'lid', '뚜껑 상단', '상단'],
  ['lid_front', 'lid', '뚜껑 앞 날개', '앞 날개'],
  ['lid_back', 'lid', '뚜껑 뒤 날개', '뒤 날개'],
  ['lid_left', 'lid', '뚜껑 왼쪽 날개', '왼쪽 날개'],
  ['lid_right', 'lid', '뚜껑 오른쪽 날개', '오른쪽 날개'],
  // 하단 몸통: 사용자가 "하단 몸통 디자인 사용"을 켠 경우에만 편집 목록에 나타난다.
  ['base_front', 'base', '하단 앞 날개', '앞 날개'],
  ['base_back', 'base', '하단 뒤 날개', '뒤 날개'],
  ['base_left', 'base', '하단 왼쪽 날개', '왼쪽 날개'],
  ['base_right', 'base', '하단 오른쪽 날개', '오른쪽 날개'],
  ['base_bottom', 'base', '하단', '하단'],
];

const initial = faceSizes(DEFAULT_PARAMS);
export const FACES: FaceDef[] = LABELS.map(([id, group, label, short]) => ({ id, group, label, short, wMm: initial[id][0], hMm: initial[id][1] }));

export const GROUPS: Record<FaceGroup, { label: string; optional: boolean }> = {
  lid: { label: '뚜껑', optional: false },
  base: { label: '하단', optional: true },
};

export function applyFaceSizes(sizes: Record<FaceId, [number, number]>) {
  for (const f of FACES) { [f.wMm, f.hMm] = sizes[f.id]; }
}

export const facesOf = (g: FaceGroup): FaceDef[] => FACES.filter((f) => f.group === g);
/** 화면 목록용 순서: 하단 그룹은 바닥(하단)을 맨 앞에 보인다. 저장·내보내기 순서(FACES)는 바꾸지 않는다. */
export const facesOfDisplay = (g: FaceGroup): FaceDef[] => {
  const l = facesOf(g);
  return g === 'base' ? [...l.filter((f) => f.id === 'base_bottom'), ...l.filter((f) => f.id !== 'base_bottom')] : l;
};
export const groupOf = (id: FaceId): FaceGroup => FACES.find((f) => f.id === id)!.group;
export const isFaceId = (s: string): s is FaceId => FACES.some((f) => f.id === s);
