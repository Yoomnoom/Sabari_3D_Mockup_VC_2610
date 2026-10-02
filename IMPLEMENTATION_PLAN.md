# 구현 계획 및 검증 기록 — 사바리 목업 스튜디오

기준 문서: `PRD.md` (v1.1, 5면 기준 수정본). 최종 갱신: 2026-10-03.
범례: ✅ 실행 검증됨 / ⚠️ 구현했으나 미검증 / ❌ 미구현

## 0. 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 편집 영역 | 5면: `lid_top`, `lid_front`, `lid_back`, `lid_left`, `lid_right` | 요청이 PRD의 "상단만 MVP"보다 우선 |
| 템플릿 | `inputs/sabari_closed.glb`를 쓰지 않고 `backend/app/template_gen.py`가 GLB를 코드로 생성 (Blender 불필요) | 원본은 UV·인덱스가 없고 면이 분리되지 않음 |
| 이미지 처리 | 면마다 캔버스(긴 변 2048px)에 변환값을 구워 `CanvasTexture`로 사용. 미리보기와 GLB 내보내기가 같은 캔버스를 공유 | KHR_texture_transform 비의존, 미리보기 = 결과물 |
| GLB 내보내기 | 브라우저 `GLTFExporter` (PRD §14 허용). 별도 서버 API 없음 | 서버에서 다시 굽는 것보다 미리보기와 결과가 일치 |
| 프로젝트 파일 | `.sabari` = ZIP(`project.json` + `images/<면>.<확장자>` 원본 바이트 그대로). 서버가 pydantic으로 검증 | 다른 PC에서 재편집 |
| 프런트 | Vite + TypeScript + three.js (React/R3F 미사용) | PRD 권장 스택은 "권장"이며 빌드가 가볍고 오프라인 번들이 단순함 |
| 배포 | `frontend/dist`를 미리 빌드해 포함 → 사용자 PC에 Node 불필요 | 요구사항 |

### 템플릿 구조 (실측 치수: 몸통 160×110×43, 뚜껑 165×115×38, 합지 2mm, 단위 m, Y-up)

노드/메시/재질 이름이 같다: `lid_top`, `lid_front`, `lid_back`, `lid_left`, `lid_right`(각각 UV 0..1 = 면 전체), `lid_rim`(뚜껑 하단 두께면, 단색·UV 없음), `lid_inner`(뚜껑 안쪽, 단색), `Base`(몸통, 단색). 뚜껑은 `Lid` 노드 아래에 있고 `translation.y`로 열림.
좌표: +X 오른쪽, +Z 앞(정면), −Z 뒤. UV는 glTF 규격(v=0이 이미지 위). `lid_top`은 위에서 내려다본 상태에서 이미지 위쪽 = 박스 뒤쪽.

### 칼선(.ai) 대응 (PyMuPDF로 읽음, `verification/dieline_render.png`)

도면 왼쪽 "상" 뚜껑 칼선: 중앙 패널 117.4×167.4mm(= 뚜껑 115×165 + 2.4), 사방 날개(접이선 안쪽 깊이 38mm + 풀칠/접어 넣는 여분 약 20mm). 제조 정밀도·접힘·탭은 구현하지 않았고 비율 기준으로만 사용했다. 아래 대응은 도면을 시계방향 90° 돌려 3D 위에서 내려다본 상태에 맞춘 **참고용 대응**이다(회전 방향은 임의 선택).

- 3D 앞날개(`lid_front`, 165mm 긴 면) = 칼선 중앙 패널의 **오른쪽 긴 날개(167.4mm변)**
- 3D 뒷날개(`lid_back`, 165mm 긴 면) = 칼선 중앙 패널의 **왼쪽 긴 날개(167.4mm변)**
- 3D 왼쪽 날개(`lid_left`, 115mm 짧은 면) = 칼선 중앙 패널의 **아래쪽 짧은 날개(117.4mm변)**
- 3D 오른쪽 날개(`lid_right`, 115mm 짧은 면) = 칼선 중앙 패널의 **위쪽 짧은 날개(117.4mm변)**
- 3D 상단(`lid_top`) = 칼선 중앙 패널 (165×115 ↔ 167.4×117.4)

## 1. 단계별 기록

### 단계 1 — 템플릿 GLB 생성 ✅
- 실행: `cd backend && ..\.venv\Scripts\python -m app.template_gen ..\assets\templates\sabari_160x110x43_v2.glb`
- 검증: `pytest backend/tests/test_template.py` — 삼각형 방향과 법선 일치, 5면 UV가 0..1 전체, 메시/재질 이름, `lid_rim`은 UV 없음, 닫힌 외형 165×115×45mm. gltf-validator: 오류 0 / 경고 0 (`node e2e/validate_glb.mjs assets/templates/sabari_160x110x43_v2.glb`).

### 단계 2 — 백엔드(FastAPI) ✅
- 기능: `/api/health`, `/api/templates`, `/api/template.glb`, `/api/images/inspect`, `/api/projects/save`, `/api/projects/open`, `frontend/dist` 정적 제공, 127.0.0.1 바인딩.
- 검증: `pytest backend/tests` **10건 통과** — 실제 디코딩 검사, 비이미지/GIF 거부, 한글 파일명 왕복, 원본 바이트 보존, 버전/스키마 불일치 거부, 경로 순회(`../`) 거부, 깨진 ZIP 거부.

### 단계 3 — 프런트(뷰어·편집) ✅
- 기능: 5면 선택(버튼/3D 클릭), 면별 이미지 선택·드래그앤드롭, 이동 X·Y, 확대 25~300%, 회전 90°왼/오른/180°, 좌우·상하 반전, 전체 보이기/면 채우기, 이미지 제거·초기화(1단계 되돌리기), 열기/닫기·뚜껑 높이, 뚜껑/몸통 표시, 6개 시점, PNG(흰색/투명), GLB 저장, 프로젝트 저장/열기, GLB 뷰어 모드.
- 검증: `cd frontend && npx vitest run` **5건 통과**(변환 계산: contain/cover/회전/배율·오프셋/텍스처 크기).

### 단계 4 — Playwright 실행 검증 ✅
실행: 서버 기동 후 `node e2e/run.mjs` → `verification/e2e_results.json` + 스크린샷. 헤드리스 Chromium(SwiftShader, 소프트웨어 렌더링)에서 실행.

| 항목 | 결과 |
|---|---|
| 5면 각각 이미지 적용 | 5/5 적용 (`02_five_faces_iso.png`) |
| 박스 회전 번짐 검사 | 9개 카메라 각도(4개 대각, 4개 정면축, 윗면)에서 면마다 고유 색 픽셀이 해당 면의 투영 다각형 밖에 있는 개수를 셈. 합계 **32픽셀 / 약 120만 샘플** (최대 한 면 11px = 해당 면의 0.02%, 면 경계 안티앨리어싱 수준). 정면축 4각도는 다른 면 색이 0 |
| 마우스 회전·확대 | 카메라 위치 변화 확인 |
| 면 클릭 선택 | 윗면 클릭 → `lid_top` (※ 초기 버전에서 하이라이트 선이 클릭을 가로채는 버그를 발견해 수정) |
| 조절 | 상단 180°+배율 120%+X 10%+좌우반전+면 채우기 상태 반영, 왼쪽 90°×4 = 원위치, 제거→되돌리기 복원 (`06_top_edited.png`) |
| 열기/닫기 | 80mm 열림: 뚜껑 최저 y 87mm > 몸통 최고 y 43mm(겹침 없음), 닫기 시 0 (`07_open.png`) |
| PNG 저장 | 흰 배경: 네 모서리 (255,255,255,255) / 투명: 네 모서리 alpha 0. 체크무늬 없음. 2080×1720px |
| GLB 저장 후 검증 | 약 292KB. **gltf-validator 오류 0, 경고 0**. 이미지 5개 모두 `image/png`로 bufferView에 임베드, 외부 URI 0, `extensionsUsed` 비어 있음(KHR_texture_transform 미사용) — `verification/exported_sabari_mockup_validation.json` |
| GLB 재로드 | 새 브라우저 컨텍스트의 "GLB 뷰어" 모드에서 이 GLB 하나만 열어 5면 이미지가 붙은 채 표시 (`10_viewer_loaded_glb.png`, `10c_viewer_back_closed.png`). 열린 채 저장한 GLB는 슬라이더에 실제 높이가 표시됨 (※ 처음에는 0으로 표시되는 버그를 발견해 수정) |
| 프로젝트 저장 후 재열기 | 새 브라우저 컨텍스트에서 `.sabari` 열기 → 5면 변환값 JSON 완전 일치, 뚜껑 높이 80mm 유지, 원본 파일명 유지 (`09_project_reopened.png`) |
| 오류 UI | 가짜 PNG → "이미지를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요." 화면 표시 |
| 외부 요청 | 127.0.0.1 외 요청을 모두 차단한 상태로 전체 흐름 통과, 시도된 외부 요청 0건 (CDN 없음) |

### 단계 5 — Windows 실행 ✅(일부 ⚠️)
- 실제 실행함(이 PC, Windows 10, Python 3.14, **한글·공백·괄호가 들어간 경로** `...\사바리 테스트 (설치)`에 `.venv`/`node_modules` 없이 복사한 폴더):
  - `install.bat nopause` → 가상환경 생성 + 패키지 설치 성공, 종료 코드 0.
  - `start.bat` → 서버 기동, `/api/health` 200, `/` 200, `/api/template.glb` 200, 기본 브라우저(Chrome)에 "사바리 목업 스튜디오" 창이 자동으로 열림.
  - 이 경로에서 발견한 문제: `NoDefaultCurrentDirectoryInExePath` 환경에서 `call install.bat`이 실패 → `call "%~dp0install.bat"`로 수정.
- ⚠️ 미검증: Python이 **없는** PC에서의 안내 분기(`:nopython`), Node/Python이 전혀 없는 새 PC, Python 3.10~3.13, Edge. 위 분기는 코드만 작성됨.
- ⚠️ install.bat의 pip 설치 단계는 **최초 1회 인터넷이 필요**하다(오프라인 설치용 휠 동봉은 안 함). 설치 후 앱 사용은 인터넷 불필요.
- 임베디드 Python 자동 다운로드는 구현하지 않았다(안내 방식 선택).

## 2. 미완료 / 미검증 / 범위 밖

- ❌ 박스 치수 수정 UI(FR-09), 원근/정투영 전환, 그림자 강도, 하단 몸통(base) 면별 이미지, `.ai` 직접 불러오기, 코팅·박·형압.
- ⚠️ 키보드 단축키(1·3·7·0·R·O·Ctrl+S) 구현했으나 자동 검증 안 함.
- ⚠️ 성능 목표(3200×2200 적용 3초 이내, 30fps)는 측정하지 않음. 소프트웨어 렌더링 환경에서만 실행.
- ⚠️ 실제 GPU/Edge에서의 렌더링, 알파 있는 PNG·WebP·12000px 초과 이미지의 화면 확인은 미검증(서버 단위 테스트의 형식 검사만 통과).
- ⚠️ Windows 배포 ZIP은 만들지 않았다.
- 동작상 제한: 회전은 90° 단위만, 반전은 회전 후 화면 기준, "이미지 전체 보이기"의 여백과 투명 픽셀은 흰색으로 채움, GLB는 저장 시점의 열림 높이를 그대로 담음.

## 3. 실행 방법 요약

- 사용자: `install.bat` 한 번 → `start.bat` → 브라우저(http://127.0.0.1:8765).
- 개발자: `cd frontend && npm i && npm run build`(dist 갱신), `cd backend && ..\.venv\Scripts\python -m pytest tests`, 서버 실행 후 `node e2e/run.mjs`.
