/**
 * 알림 기록(작업 29). 화면에 어떤 알림을 보일지는 main.ts 의 msg()·알림 영역이 정하고, 여기서는 "최근 알림 20개"만 기억한다.
 * 깨끗한 화면(H) 중의 알림도 기록에는 남는다. 저장 파일·임시저장에는 넣지 않는다(이 세션 메모리).
 */
/** 알림 4단계(docs/UI_INFO_HIERARCHY.md 4절): 정보·주의·오류·성공. 색만으로 구분하지 않도록 아이콘과 글자를 함께 쓴다. 'ok'는 예전부터 쓰던 "성공" 이름 그대로다. */
export type NoteKind = 'info' | 'warn' | 'error' | 'ok';
export const NOTE_LEVELS: Record<NoteKind, { label: string; icon: string; role: 'alert' | 'status'; autoHide: boolean }> = {
  info: { label: '안내', icon: 'ℹ', role: 'status', autoHide: true },
  warn: { label: '주의', icon: '⚠', role: 'status', autoHide: false },
  error: { label: '오류', icon: '✖', role: 'alert', autoHide: false },
  ok: { label: '완료', icon: '✔', role: 'status', autoHide: true },
};
export interface NoteRecord { at: number; text: string; kind: NoteKind }
export const NOTE_HISTORY_MAX = 20;
const history: NoteRecord[] = [];

export function recordNote(text: string, kind: NoteKind, at = Date.now()): void {
  history.unshift({ at, text, kind });
  if (history.length > NOTE_HISTORY_MAX) history.length = NOTE_HISTORY_MAX;
}
export const noteHistory = (): NoteRecord[] => history.slice();
export const clearNoteHistory = (): void => { history.length = 0; };

/** 새 알림이 지금 보이는 알림을 대체해도 되는가: 진행 중인 오류는 새 성공·안내로 대체하지 않는다(새 알림은 기록에만 남는다). */
export function mayReplace(current: NoteKind | null, next: NoteKind): boolean {
  if (current === 'error') return next === 'error';
  if (current === 'warn') return next === 'error' || next === 'warn';
  return true;
}
/** 알림 영역에서 한 번에 한 개만 보이게 하는 우선순위(앞이 먼저): 오류 > 안내 > 임시저장 > 손 도구 안내 > 외부 GLB 상태 */
export const NOTE_PRIORITY = ['msg-error', 'msg-ok', 'draft', 'pan', 'ext'] as const;
export type NoteSlot = (typeof NOTE_PRIORITY)[number];
export function pickVisible(shown: Partial<Record<NoteSlot, boolean>>): NoteSlot | null {
  return NOTE_PRIORITY.find((k) => shown[k]) ?? null;
}
