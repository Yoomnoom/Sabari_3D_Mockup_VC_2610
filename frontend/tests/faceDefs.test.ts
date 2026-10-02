import { describe, expect, it } from 'vitest';
import { FACES, GROUPS, facesOf, groupOf, isFaceId } from '../src/faceDefs';

describe('faceDefs (뚜껑 5면 + 하단 5면)', () => {
  it('면은 10개이고 뚜껑 5 / 하단 5로 나뉜다', () => {
    expect(FACES).toHaveLength(10);
    expect(facesOf('lid').map((f) => f.id)).toEqual(['lid_top', 'lid_front', 'lid_back', 'lid_left', 'lid_right']);
    expect(facesOf('base').map((f) => f.id)).toEqual(['base_front', 'base_back', 'base_left', 'base_right', 'base_bottom']);
  });
  it('하단만 선택 기능이다 (뚜껑은 항상 켜짐)', () => {
    expect(GROUPS.lid.optional).toBe(false);
    expect(GROUPS.base.optional).toBe(true);
  });
  it('면 크기(mm)는 템플릿 치수(몸통 160×110×43, 뚜껑 165×115×38)와 같다', () => {
    const size = (id: string) => { const f = FACES.find((x) => x.id === id)!; return [f.wMm, f.hMm]; };
    expect(size('lid_top')).toEqual([165, 115]);
    expect(size('lid_front')).toEqual([165, 38]);
    expect(size('lid_left')).toEqual([115, 38]);
    expect(size('base_front')).toEqual([160, 43]);
    expect(size('base_back')).toEqual([160, 43]);
    expect(size('base_left')).toEqual([110, 43]);
    expect(size('base_right')).toEqual([110, 43]);
    expect(size('base_bottom')).toEqual([160, 110]);
  });
  it('id 판별과 그룹 조회', () => {
    expect(groupOf('base_bottom')).toBe('base');
    expect(groupOf('lid_top')).toBe('lid');
    expect(isFaceId('base_front')).toBe(true);
    expect(isFaceId('base')).toBe(false); // 예전 단일 "base" 는 면이 아니다
  });
});
