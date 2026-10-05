// 작업 16: 템플릿 식별 레지스트리(최소 구조). 지금은 사바리 박스 하나만 쓸 수 있고, 나머지는 "준비 중"으로 보여 주기만 한다.
// 새 템플릿을 더하는 절차는 README.md "새 템플릿 추가 절차"를 따른다. 기존 템플릿 생성 코드(templateMesh/templateGlb)는 건드리지 않는다.
export interface TemplateDef {
  id: string; // .sabari의 templateId
  label: string; // 선택 상자에 보이는 이름
  ready: boolean; // false면 "준비 중"(비활성)
  legacyIds?: string[]; // 같은 템플릿으로 취급하는 예전 id
}

export const SABARI_BOX_ID = 'sabari-160-110-43-v2';
/** templateId 필드가 없는 이전 .sabari는 이 id의 템플릿으로 간주한다. */
export const MISSING_TEMPLATE_ID = 'sabari-160-110-43-v1';

export const TEMPLATES: TemplateDef[] = [
  { id: SABARI_BOX_ID, label: '사바리 박스 160×110×43', ready: true, legacyIds: [MISSING_TEMPLATE_ID] },
  { id: 'booklet', label: '책자', ready: false },
  { id: 'card', label: '카드', ready: false },
  { id: 'fold', label: '접지물', ready: false },
];

/** 파일의 templateId를 지금 쓸 수 있는 템플릿으로 바꾼다. 알 수 없거나 준비 중인 id는 null. */
export function resolveTemplate(id: unknown): TemplateDef | null {
  const key = id === undefined || id === null ? MISSING_TEMPLATE_ID : id;
  if (typeof key !== 'string') return null;
  return TEMPLATES.find((t) => t.ready && (t.id === key || (t.legacyIds ?? []).includes(key))) ?? null;
}
