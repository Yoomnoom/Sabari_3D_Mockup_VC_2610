import { describe, expect, it } from 'vitest';
import { MISSING_TEMPLATE_ID, SABARI_BOX_ID, TEMPLATES, resolveTemplate } from '../src/templates';

describe('템플릿 레지스트리', () => {
  it('사바리 박스만 쓸 수 있고 나머지는 준비 중이다', () => {
    expect(TEMPLATES.filter((t) => t.ready).map((t) => t.id)).toEqual([SABARI_BOX_ID]);
    expect(TEMPLATES.filter((t) => !t.ready).map((t) => t.label)).toEqual(['책자', '카드', '접지물']);
  });
  it('id가 없으면 사바리 박스(v1)로 간주한다', () => {
    expect(MISSING_TEMPLATE_ID).toBe('sabari-160-110-43-v1');
    expect(resolveTemplate(undefined)?.id).toBe(SABARI_BOX_ID);
    expect(resolveTemplate(null)?.id).toBe(SABARI_BOX_ID);
    expect(resolveTemplate('sabari-160-110-43-v1')?.id).toBe(SABARI_BOX_ID);
    expect(resolveTemplate(SABARI_BOX_ID)?.id).toBe(SABARI_BOX_ID);
  });
  it('알 수 없는 id·준비 중인 id·숫자는 거부한다', () => {
    expect(resolveTemplate('mystery-box-v9')).toBeNull();
    expect(resolveTemplate('booklet')).toBeNull();
    expect(resolveTemplate(42)).toBeNull();
  });
});
