1. install.bat을 한 번 실행합니다.
2. start.bat을 실행합니다.
3. 브라우저에서 상단 이미지를 선택합니다.

# 사바리 목업 스튜디오

160×110×43mm 사바리 박스(뚜껑 165×115×38mm)에 디자인 이미지를 입혀 3D로 확인하는 로컬 프로그램입니다. Blender 불필요, 인터넷 없이 사용 가능(설치 때 1회만 인터넷 필요), Node 불필요.

- 편집 면: 뚜껑 5개(상단, 앞날개, 뒷날개, 왼쪽 날개, 오른쪽 날개)는 항상, **하단 몸통 5개(앞·뒤·왼쪽·오른쪽·바닥)는 "하단 몸통 디자인 사용" 스위치를 켠 경우에만** (기본 꺼짐). 면마다 이미지·위치·확대·회전·반전·맞춤 독립. 하단은 뚜껑을 열어야 보입니다.
- 저장: `.sabari` 프로젝트(원본 이미지 포함) / GLB(이미지 임베드) / 현재 각도 PNG
- 뷰어 모드: 내보낸 GLB를 불러와 확인

사용법은 [사용방법.md](사용방법.md), 설계·검증 기록은 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), 제품 명세는 [PRD.md](PRD.md).

## 하단 몸통 디자인 (선택 기능)

왼쪽 "면 선택"의 **하단 몸통 디자인 사용** 스위치를 켜면 `뚜껑 / 하단` 탭이 생기고 하단 5면을 편집할 수 있습니다. 끄면 뚜껑 5면만 보입니다(기본). 하단 이미지가 있을 때 끄면 확인 창이 뜨고, `Ctrl+Z`로 되돌릴 수 있습니다. 하단 면은 뚜껑을 열어야(또는 `아래` 시점에서) 보입니다. 이전에 저장한 5면 `.sabari`·GLB도 그대로 열립니다.

## 박스 치수 · 비율 알림 · 칼선 (가이드용)

- `박스 치수` 섹션에서 완성 외경 또는 싸바리지(전개) 크기 기준으로 치수를 입력하면 3D·면 크기·텍스처가 바로 바뀝니다(실행 취소 가능). **싸바리지 여유·접어 넣는 폭·재단 여분은 칼선 샘플에서 읽은 가정값이며 제조 규격이 아닙니다.**
- 치수 변경으로 이미지가 있는 면의 비율이 ±5% 이상 달라지면 알림(배너·배지·패널 줄)이 뜹니다.
- `칼선` 섹션: 현재 치수의 칼선을 SVG로 내려받고(**디자인 가이드용, 제조 칼선 아님. 최종 칼선은 인쇄소 템플릿 사용**), 칼선 위에서 만든 이미지 한 장을 면별로 자동 분할합니다.
- 템플릿(3D 메시·UV)은 브라우저에서 파라미터로 생성합니다. `backend/app/template_gen.py`는 로컬 실행·테스트용으로 남기며, 기본값에서 TypeScript 생성물과 바이트 단위로 같은지 vitest가 확인합니다.
- 검증 스크립트: `e2e/dims.mjs`, `ratio.mjs`, `dieline.mjs`, `bleed_id.mjs`, 칼선 샘플 대조는 `tools/measure_dieline.py` → `tools/compare_dieline.py`.

## 화면 기준 박스 회전

왼쪽 드래그(한 손가락 터치 포함)는 카메라가 아니라 박스를 돌립니다. 카메라는 고정이고 박스만 화면 전용 pivot으로 회전하므로 윗면·아랫면 시점에서도 문처럼 돌아 날개면이 보이고, 극점 제한 없이 계속 돌 수 있습니다. 기본은 방향 선택 없는 자유 회전(대각선 포함)이고, 보기의 `축 잠금`을 켜면 나타나는 회전축 버튼(정면·후면·좌측·우측·윗면·아래·3/4 = 그 방향을 바라보는 박스 축, 마주 보는 버튼은 같은 축)이나 박스 면 클릭(그 면에 수직인 축)으로 축을 정하면 그 축으로만 돕니다. `Ctrl`은 15° 스냅입니다. 박스 자세는 `.sabari`·임시저장·GLB에 들어가지 않고(GLB 노드 변환 불변), 시점 버튼은 기본 자세로 되돌립니다. 검증: `node e2e/stage24.mjs`, `node e2e/stage24_b.mjs`, `node e2e/stage24_views.mjs <출력>`.

## 칼선 이미지 분할: 아트보드 전체 이미지·인쇄소 칼선

`칼선 (디자인 가이드)`의 `칼선 이미지 한 장 올리기`는 두 방식이 있습니다. 기본은 박스 치수로 만든 칼선(재단선 + 재단 여분). 이미지가 **아트보드 전체**(예: 525.7×349.0mm, 약 11.81px/mm)이면 `칼선 기준`이 자동으로 `아트보드 전체 이미지 · 싸바리 160×110×43 인쇄소 칼선(2025-10-27)`이 되며(직접 바꿀 수 있음, 아트보드 크기 입력 가능) 재단 여분은 0입니다. 내보낼 때 **칼선·안내선 레이어를 숨기고 sRGB PNG**로 내보내세요. 몸통 쪽이 비어(흰색) 있으면 그 면은 기본으로 적용하지 않습니다. 6209×4122px(약 10MB)도 열립니다. 검증: `node e2e/dieline_real.mjs`, `node e2e/dieline_real_b.mjs`(합성 이미지는 `python tools/make_synth_artboard.py`).
## 뷰어 색 정확도

3D 뷰어는 조명 계산 대신 "넣은 색 × 음영 계수"로 그립니다. 카메라를 마주 보는 면은 입력 색이 그대로(±1) 보이고, 음영은 색을 밝히지 않으며 각도가 클수록 어두워집니다. 보기의 `조명 (음영)` > `음영 세기`(기본 30%, 0%면 평면 색)로 조절하고, 이 설정은 이 브라우저에만 기억합니다. GLB 내보내기(재질 baseColor·텍스처)와 .sabari 형식은 변하지 않았습니다. 구현은 `frontend/src/shading.ts`, 검증은 `e2e/color_accuracy.mjs` 등(`verification/color-accurate/`).

## 구성

```
backend/app/    FastAPI 서버, 템플릿 GLB 생성기(template_gen.py), 이미지 검증, 프로젝트 ZIP
frontend/       Vite + TypeScript + three.js 소스, dist/ = 미리 빌드한 결과 (배포 포함)
assets/         templates/(코드로 생성한 템플릿 GLB), samples/(5면 샘플 이미지)
e2e/            Playwright 검증 스크립트, GLB 검증 스크립트
verification/   검증 스크린샷·결과 JSON
```

## 개발

```
.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
cd backend && ..\.venv\Scripts\python -m pytest tests          # 서버/템플릿 테스트
cd frontend && npm i && npx vitest run && npm run build        # 변환 테스트 + dist 재빌드
..\.venv\Scripts\python -m app.template_gen ..\assets\templates\sabari_160x110x43_v2.glb   # 템플릿 재생성 (backend 폴더에서)
python tools\make_samples.py                                   # 샘플 이미지 재생성
node e2e\run.mjs                                               # 서버 실행 후 E2E (뚜껑 5면 기본 흐름)
node e2e\base10.mjs                                            # 하단 5면(선택 기능) 10면 검증: 번짐·저장·호환·끄기
node e2e\viewkeep.mjs                                          # 시점 변경 시 확대 유지 / 위치 초기화
node e2e\validate_glb.mjs <파일.glb>                            # gltf-validator
```

GLB 저장은 서버 API 없이 브라우저의 `GLTFExporter`로 처리합니다(PRD §14 허용). 면별 변환값은 캔버스에 구워 PNG 텍스처로 임베드하며 KHR_texture_transform을 쓰지 않습니다.

## 새 템플릿 추가 절차 (작업 16에서 만든 최소 구조)
지금은 "사바리 박스 160×110×43" 하나만 쓸 수 있고 책자·카드·접지물은 "준비 중"으로만 보입니다. 새 템플릿을 더하려면:
1. `frontend/src/templates.ts`의 `TEMPLATES`에 `{ id, label, ready: true }` 항목을 추가합니다(id는 `.sabari`의 `templateId`가 됩니다. 예전 id를 같은 템플릿으로 취급하려면 `legacyIds`).
2. 템플릿 메시·UV 생성 코드를 `templateMesh.ts`/`templateGlb.ts`와 같은 방식으로 추가하고, 면 정의(`faceDefs.ts`)·칼선 배치(`dieline.ts`)를 템플릿별로 연결합니다(이번 작업에서는 기존 생성 코드를 바꾸지 않았습니다).
3. `project.ts`의 열기 검사는 `resolveTemplate()`로 id를 확인하므로, 새 id가 레지스트리에 있으면 열리고 없으면 "지원하지 않는 템플릿의 프로젝트입니다. (id)" 오류가 뜹니다.
4. 템플릿 선택 상자(박스 탭 맨 위)는 레지스트리에서 자동으로 만들어지며, 사용 가능한 템플릿이 둘 이상이 되면 선택 변경 동작(`main.ts renderTemplateCard`)을 구현해야 합니다.
5. `e2e/template_task16.mjs`와 같은 방식으로 저장·복원·알 수 없는 id 거부를 검증합니다.
