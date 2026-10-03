# 단계 23-0 — 단계 17 기준 복구 및 회귀 검증

검증일: 2026-10-03 (Asia/Seoul). 기준 소스를 다시 빌드한 로컬 서버 `http://127.0.0.1:8873/`에서 Chromium/SwiftShader로 실행했다.

1. 보관 브랜치: `archive/rotation-experiment-20261003`; 보관 태그: `archive-rotation-experiment-20261003`. 두 참조 모두 WIP 커밋 `19fe415d83872ac0377424556bfb9e95bbac4a14`를 가리킨다. 원래 HEAD는 `ca71e7d`였으며 staged/unstaged/untracked 변경을 `git add -A`로 보존했다. 삭제·reset·clean·빈 커밋은 수행하지 않았다.
2. 새 작업 브랜치: `rebuild/compact-view-submit-angle`.
3. 기준 커밋: `6c9165698a79e13be97dcb4f1db695dd2ea00ac7`. 애플리케이션 소스 변경 없이 검증했다. 빌드 산출물과 검증 산출물은 작업 폴더에 남겼다.
4. 테스트 결과:

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| Vitest | ✅ 59/59, 5개 파일 | `npm.cmd test` |
| pytest | ✅ 13/13 | `../.venv/Scripts/python.exe -m pytest tests` (backend) |
| TypeScript / Vite 빌드 | ✅ 통과 | `npm.cmd run build` |
| 정면·후면·좌측·우측·윗면·아랫면·3/4 | ✅ 7/7 | `views.mjs`, `views.json`; `iso_faces.log`의 R/L 면 방향 |
| 마우스 회전·휠 확대·화면 이동 | ✅ 통과 | `mouse.log`, `run.log`, `shortcuts.log`, `viewkeep.log` |
| 면 클릭 선택 | ✅ 통과 | `mouse.log`: 윗면 선택·배경 클릭 해제 |
| Shift+드래그 이미지 이동 | ✅ 통과 | `mouse.log`: offset 변경, 카메라 유지 |
| 뚜껑 열기·닫기 | ✅ 통과 | `run.log`: 열림 80mm, 닫힘 0mm, 열린 뚜껑과 몸통의 AABB 분리 |
| 하단 몸통 면 선택 | ✅ 통과 | `base10.log`: 열린 몸통 앞면 클릭; `closed_click.log`: 닫힌 바닥 클릭 |
| 치수 변경 | ✅ 통과 | `dims.log`: 43→60mm, 메시·UV 크기·GLB·복원, 잘못된 값 거부 |
| 비율 경고 | ✅ 통과 | `ratio.log`: 큰 변경 알림, 작은 변경 무알림, undo/redo·확인·이미지 교체 |
| 칼선 분할 | ✅ 통과 | `dieline.log`: 뚜껑 5면 및 하단 5면 색·방향, 영역 편집·원본 저장·복원 |
| SVG 내보내기 | ✅ 통과 | `dieline.log`: 1:1 치수, 접기/재단 레이어, 변경 치수 일치 |
| PNG 저장 | ✅ 통과 | `run.log`: 2080×1720 PNG, 흰색 모서리 RGBA 255/255/255/255, 투명 모서리 0/0/0/0 |
| GLB 저장·다시 열기 | ✅ 통과 | `run.log`, `base10.log`, `dims.log` |
| GLB validator | ✅ 3/3, 오류 0·경고 0 | `glb5.log`, `glb10.log`, `glb-dims.log`; 텍스처 내장 |
| .sabari 저장·다시 열기 | ✅ 통과 | `run.log`: 면 상태 동일; `base10.log`: 10면·열림·스위치 복원 |
| 임시저장 복원 | ✅ 통과 | `draft.log`: `restored_equal=true`; `base10.log`, `dims.log`, `legacy_draft.log` |
| 기존 e2e 전체 | ✅ 20/20 정상 종료, 기록값 확인 | `runs.json`, 각 `.log` (일부 스크립트는 assert 없이 관측값을 기록함) |
| 창 크기·배율 | ✅ 36/36 | `scroll_fix.log`: `tested=36`, `bad=[]` |
| 실제 GPU·Edge·사용자 PC 수동 조작 | ⚠️ 미검증 | 헤드리스 소프트웨어 렌더링으로 실행 |
| 실제 Windows Chrome 브라우저 배율 100/125/150% | ⚠️ 미검증 | e2e의 deviceScaleFactor 조합은 실제 브라우저 UI 배율과 다름 |
| 닫힌 박스의 좁게 노출된 하단 띠 직접 클릭 | ⚠️ 미검증 | 닫힌 하단 중심과 바닥, 열린 하단 앞면만 검증 |

기존 e2e 실행: `base10`, `bleed_id`, `closed_click`, `collapse`, `colors`, `dieline`, `dims`, `draft`, `iso_faces`, `legacy_draft`, `mouse`, `movemode`, `ratio`, `run`, `scroll_fix`, `sharp`, `shortcuts`, `shot_panel`, `space_repro`, `viewkeep`. 별도 `validate_glb`를 저장한 GLB 3종에 실행했다.

5. 단계 17에서도 발생하는 기존 문제·제한:

- 경계 픽셀 검사: `run`의 기존 폴리곤 방식 32px, `base10` 폴리곤 방식 1,350px. 메시 ID 방식은 기본 치수 43/447,082px, 변경 치수 14/495,817px이며 단색 부품으로의 번짐은 모두 0px. 단계 17 문서에 기록된 경계 판정과 동일하다. 이를 새 회전 기능의 회귀로 분류하지 않는다.
- 닫힌 박스에서 하단 앞면 중심을 클릭하면 가리고 있는 `lid_front`가 선택된다. 하단 디자인을 켜도 동일하며, 아래에서 클릭한 `base_bottom`은 선택된다.
- 기존 백엔드 프로젝트 경로는 schemaVersion 2만 처리한다. 프런트엔드 v4 프로젝트는 브라우저 저장/열기 경로를 사용한다. 이는 단계 17 문서 및 코드에 남아 있는 제한이며, 이번에 v4 백엔드 업로드는 ⚠️ 미검증.
- 손상된 이미지 입력 시 사용자 오류 안내와 console.error가 함께 기록된다 (`run.log`). 의도적으로 잘못된 이미지 파일을 넣은 오류 처리 검증이며, 정상 편집·복원 경로에서는 pageerror가 없었다.
- pytest 경고: Starlette/httpx 사용 중단 예정 경고와 pytest 캐시 쓰기 경고. 13개 테스트의 결과는 모두 통과했다.

6. 다음 단계 진행 가능 여부: **가능**. 요청한 기능의 로컬 자동 회귀 검증에 실패는 없다. 위 수동·실기기 항목은 미검증으로 남긴다. 새 회전 기능·제출 각도·UI 정리·PNG 배율 작업은 시작하지 않았다.
