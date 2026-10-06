import { beforeEach, describe, expect, it } from 'vitest';
import { NOTE_HISTORY_MAX, NOTE_LEVELS, clearNoteHistory, mayReplace, noteHistory, pickVisible, recordNote } from '../src/notify';

describe('알림 기록·대체 규칙(작업 29)', () => {
  beforeEach(() => clearNoteHistory());
  it('최근 20개만 최신 순으로 기억한다', () => {
    for (let i = 0; i < 25; i++) recordNote(`n${i}`, i % 2 ? 'error' : 'ok', i);
    const h = noteHistory();
    expect(h).toHaveLength(NOTE_HISTORY_MAX);
    expect(h[0].text).toBe('n24');
    expect(h.at(-1)!.text).toBe('n5');
  });
  it('진행 중인 오류는 새 성공·안내로 대체하지 않는다', () => {
    expect(mayReplace('error', 'ok')).toBe(false);
    expect(mayReplace('error', 'error')).toBe(true);
    expect(mayReplace('ok', 'ok')).toBe(true);
    expect(mayReplace(null, 'ok')).toBe(true);
  });
  it('알림 영역은 우선순위대로 한 개만 고른다', () => {
    expect(pickVisible({})).toBeNull();
    expect(pickVisible({ ext: true })).toBe('ext');
    expect(pickVisible({ ext: true, draft: true })).toBe('draft');
    expect(pickVisible({ ext: true, draft: true, 'msg-ok': true })).toBe('msg-ok');
    expect(pickVisible({ ext: true, 'msg-error': true, 'msg-ok': true })).toBe('msg-error');
  });
  it('4단계: 아이콘·글자가 모두 있고 오류·주의는 자동으로 사라지지 않는다', () => {
    for (const k of ['info', 'warn', 'error', 'ok'] as const) { expect(NOTE_LEVELS[k].label.length).toBeGreaterThan(0); expect(NOTE_LEVELS[k].icon.length).toBeGreaterThan(0); }
    expect(NOTE_LEVELS.error.autoHide).toBe(false); expect(NOTE_LEVELS.warn.autoHide).toBe(false);
    expect(NOTE_LEVELS.ok.autoHide && NOTE_LEVELS.info.autoHide).toBe(true);
  });
  it('주의는 오류가 아니면 안내·성공에 대체되지 않고 오류는 오류만 대체한다', () => {
    expect(mayReplace('warn', 'ok')).toBe(false); expect(mayReplace('warn', 'info')).toBe(false); expect(mayReplace('warn', 'error')).toBe(true);
    expect(mayReplace('error', 'warn')).toBe(false); expect(mayReplace('info', 'ok')).toBe(true);
  });
});
