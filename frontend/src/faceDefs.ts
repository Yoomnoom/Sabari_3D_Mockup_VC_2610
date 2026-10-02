// 편집 가능한 면의 정의. DOM에 의존하지 않아 테스트에서도 쓴다.
// 크기(mm)는 backend/app/template_gen.py 의 faceSizeMm 와 같아야 한다.

export type FaceGroup = 'lid' | 'base';

export type FaceId =
  | 'lid_top' | 'lid_front' | 'lid_back' | 'lid_left' | 'lid_right'
  | 'base_front' | 'base_back' | 'base_left' | 'base_right' | 'base_bottom';

export interface FaceDef {
  id: FaceId;
  group: FaceGroup;
  label: string; // 제목·안내용 전체 이름
  short: string; // 탭 안의 목록용 짧은 이름
  wMm: number;
  hMm: number;
}

export const FACES: FaceDef[] = [
  { id: 'lid_top', group: 'lid', label: '상단', short: '상단', wMm: 165, hMm: 115 },
  { id: 'lid_front', group: 'lid', label: '앞날개', short: '앞날개', wMm: 165, hMm: 38 },
  { id: 'lid_back', group: 'lid', label: '뒷날개', short: '뒷날개', wMm: 165, hMm: 38 },
  { id: 'lid_left', group: 'lid', label: '왼쪽 날개', short: '왼쪽 날개', wMm: 115, hMm: 38 },
  { id: 'lid_right', group: 'lid', label: '오른쪽 날개', short: '오른쪽 날개', wMm: 115, hMm: 38 },
  // 하단 몸통(160×110×43): 사용자가 "하단 몸통 디자인 사용"을 켠 경우에만 편집 목록에 나타난다.
  { id: 'base_front', group: 'base', label: '하단 앞면', short: '앞면', wMm: 160, hMm: 43 },
  { id: 'base_back', group: 'base', label: '하단 뒷면', short: '뒷면', wMm: 160, hMm: 43 },
  { id: 'base_left', group: 'base', label: '하단 왼쪽 면', short: '왼쪽 면', wMm: 110, hMm: 43 },
  { id: 'base_right', group: 'base', label: '하단 오른쪽 면', short: '오른쪽 면', wMm: 110, hMm: 43 },
  { id: 'base_bottom', group: 'base', label: '하단 바닥', short: '바닥', wMm: 160, hMm: 110 },
];

export const GROUPS: Record<FaceGroup, { label: string; optional: boolean }> = {
  lid: { label: '뚜껑', optional: false },
  base: { label: '하단', optional: true },
};

export const facesOf = (g: FaceGroup): FaceDef[] => FACES.filter((f) => f.group === g);
export const groupOf = (id: FaceId): FaceGroup => FACES.find((f) => f.id === id)!.group;
export const isFaceId = (s: string): s is FaceId => FACES.some((f) => f.id === s);
