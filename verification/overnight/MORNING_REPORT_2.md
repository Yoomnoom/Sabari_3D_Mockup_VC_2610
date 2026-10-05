# 야간 작업 대기열 2 최종 보고 (2026-10-05)

## 한눈에
대기열 2의 작업 11~18을 **모두 완료**했다(BLOCKED·SKIPPED 없음). 우선순위 규칙대로 11 → 12 → 17 → 18을 먼저 끝낸 뒤 남은 시간에 13 → 14 → 15 → 16을 구현하고, 작업 18(전체 검증·배포 후보·보고서)을 다시 실행했다. 배포(main 병합·push)는 하지 않았다. 사용자가 직접 확인해야 하는 시각 승인·실기기·GPU 항목은 모두 "미검증"으로 남겼다.

| 작업 | 브랜치 | 상태 | 커밋(병합) | 테스트 결과 | 아침에 직접 확인할 것 | 스크린샷 경로 |
|---|---|---|---|---|---|---|
| 11 바닥 그림자가 안 보임 | task/11-shadow-visibility | ✅ 구현·자동 검증 완료(원인 확인: 서버가 오래된 dist를 서빙, 소스 결함 없음) / ⚠️ 사용자 화면 재현 조건 확인 대기 | 32ff93d (post-11) | 180조건 1,638행 측정 표, 선택선 PNG 0픽셀, 빠른 검증 통과 | 그림자를 켠 화면이 새 빌드를 서빙하는 서버인지, 토글을 켰는지, 카메라가 바닥판 아래가 아닌지 | verification/shadow-visibility/, verification/png-overlay/ |
| 12 UI 개편 1단계 | task/12-ui-revamp-1 | ✅ 구현·자동 검증 완료 / ⚠️ 시안 시각 승인 대기 | 754a6fd (post-12) | ui_parity 사라짐 0, 전체 e2e 47개, Vitest 88, pytest 13, GLB 바이트 동일 | 시안 1~12·16~22·24와 눈으로 비교, 실제 터치 기기에서 모바일 시트 | verification/ui12/ (합성), 시안 캡처는 verification-private/ui-mockup/ |
| 13 배경 기능 | task/13-background | ✅ 구현·자동 검증 완료 / ⚠️ 시안 시각 승인 대기 | 75b2221 (post-13) | background_task13 통과(화면↔PNG ±1, 8000px 1.4초, schema 6), Vitest 93, e2e 49개 | 시안 10·18, 고해상도(dpr 2) 선명도 | verification/bg13/ (합성) |
| 14 경계 점검·투명 PNG 흰선 | task/14-edge-inspect | ✅ 구현·자동 검증 완료(흰선·후광 없음 입증, 수정 없음) / ⚠️ 시안 시각 승인 대기 | 4c88ecd (post-14) | 측정 15행 후광 0·구멍 0·최대 차이 1.38/255, edge_inspect_task14 통과, e2e 50개 | 시안 11, 확대경 선명도 | verification/edge14/ (합성) |
| 15 음영 보기/숨기기·빛 방향 | task/15-lighting | ✅ 구현·자동 검증 완료 / ⚠️ 시안 시각 승인 대기 | 7829f36 (post-15) | lighting_task15 통과(정면 색 오차 ≤1, 비스듬한 면 밝아지지 않음), e2e 51개 | 시안 9, 빛 방향이 그림자에만 적용되는 결정 확인 | verification/light15/ (합성) |
| 16 템플릿 식별·선택 UI | task/16-template-id | ✅ 구현·자동 검증 완료 / ⚠️ 시안 시각 승인 대기 | f0432b4 (post-16) | template_task16 통과, Vitest 96, e2e 52개 | 시안 4 | verification/tpl16/ (합성) |
| 17 UI 개편 2단계 | task/17-ui-revamp-2 | ✅ 구현·자동 검증 완료 / ⚠️ 시안 시각 승인 대기 | 6438343 (post-17) | ui_dialogs_task17 통과, ui_parity 0, e2e 48개 | 시안 3·4·6·12~15·21~28, 네이티브 저장 창 | verification/ui17/ (합성) |
| 18 마무리 | task/18-wrapup, task/18-wrapup-final | ✅ 구현·자동 검증 완료 | 2551466 / a2fae5e (post-18, post-18f) | 아래 "전체 검증" | deploy/candidate-2 검토 후 push 여부 | - |
| 21 칼선 분할 확대·이동 | task/21-dieline-pan | ✅ 구현·자동 검증 완료 / ⚠️ 시안 시각 승인 대기 | 2ad240d / f9a69dc (병합·post-21 해시는 아래 "작업 21" 절) | 확대 오차 9.29→0.141px, 확대 상태 적용 픽셀 오차 0, 바깥 스크롤바 0, Vitest 96, pytest 13, e2e 전부 통과 | 실제 마우스·트랙패드·터치, 실제 한글 입력기, 시안 시각 확인 | verification/dieline-pan/ (합성) |

## 전체 검증 (integration-2 최종, 커밋된 frontend/dist로 실행)
- e2e 스크립트 **52개 전부 종료코드 0**(표: `verification/overnight/regression_final.json`), 창 크기·배율 36조합(`scroll_fix`) 0 bad, Vitest 96/96, pytest 13/13, tsc 0, GLB validator 0/0, `ui_parity` 사라짐 0(563항목, 매핑 16건).
- 경계 픽셀: 기존 캔버스 크기(1040×900)를 재현해 재측정하면 면 간 번짐 **43**(기본 치수)·**14**(변경 치수 합), **비면 메시 번짐 0/0**이다. 새 레이아웃에서는 캔버스가 작아 같은 측정의 픽셀 수만 달라진다 — 회귀 아님.
- 이전 작업 전용 검증(단계 24·26·26b·26c·27a·30, 작업 1~11)과 이번 작업 전용 검증(11~17)은 모두 위 52개에 포함되어 통과했다. `dieline_real2`는 작업 14 중 1회 일시 실패 후 재실행 통과(기존에 기록된 플레이키 테스트).

## 작업 21 — 칼선 분할 대화상자 확대·이동 (재현 표 전/후)
**재현(합성 2739×3343, 6209×4122, 실제 입력 이벤트)** — 전체 표는 `verification/dieline-pan/pan_table_task21.md`.

| 확대 수단 (배율 25/100/200/800% × 위치 10곳) | 전: 최대 오차(이미지 px) | 후: 최대 오차 |
|---|---|---|
| ＋/－/100%/200% 버튼, 키보드 +/− (화면 중심 기준) | 0.151 | 0.110 |
| 휠 (커서 기준) | 1.040 (측정 스크립트가 소수 좌표를 줘서 생긴 오차 포함) | 0.080 |
| Ctrl+휠 (커서 기준) | 1.040 | 0.141 |
| 핀치 (중간점 기준) | **9.290** | 0.141 |

| 항목 | 전 | 후 |
|---|---|---|
| 확대 때 이동값 초기화·왼쪽 위 기준·활성 영역 변경 | 0건 (버튼 계열 위치 1곳은 맞춤 위치와 우연히 같아 표시된 것으로 판단, 전·후 동일) | 0건 |
| 버튼/키 포커스 뒤 Space+드래그 | 버튼은 이동됨, **select는 이동 안 됨** | 모두 이동됨, 확대/맞춤 변화 없음 |
| 영역이 덮은 곳 빈 드래그 | 영역 편집(이동 불가), 손 도구 없음 | 손 도구로 이동 (영역 편집 안 됨) |
| 모서리 도달 수단 | Space·가운데 버튼만 (스크롤바·방향키 없음) | Space·가운데 버튼·스크롤바·방향키 모두 4모서리 도달 |
| 핸들 좌표(200/700/1600%) | 측정 스크립트 오류로 전 값 무효 | 기대 12·3.4·1.5px와 정확히 일치(오차 0), 핸들 화면 크기 18px 일정 |
| 창 크기별 화면 높이 / 바깥 스크롤바 / 하단 버튼 보임 | 1920×1080: 603 / 있음 / 보임, 1366×768: 428 / 있음 / 잘림, 1024×768: 428 / 있음 / 잘림, 390×844: 471 / 있음 / 잘림 | 770 / 없음 / 보임, 458 / 없음 / 보임, 458 / 없음 / 보임, 525 / 없음 / 보임 |
| 확대 상태(597%)에서 적용한 면 이미지 | — | 맞춤에서 적용한 10개 면과 픽셀 오차 0 |
| 선택 영역 보기 / 맞춤 | — | 여백 24px로 맞음, 맞춤은 열었을 때 화면으로 정확히 복귀(오차 0) |
| 큰 이미지 6209×4122 | — | 200% 버튼 36ms, 휠 20회 1.1초(자동화 지연 포함), Space 드래그 20회 0.53초 |

**확인된 원인**: ① 영역이 이미지를 덮으면 빈 곳 드래그가 영역 편집이 되어 이동할 방법이 Space/가운데 버튼뿐이었음 ② Space가 select에서 막힘 ③ 핀치가 중간점을 따라가지 않음 ④ 대화상자가 창보다 커서 바깥 스크롤바·낮은 화면·잘린 목록 ⑤ 처음 맞춤이 푸터 배치 전에 계산됨. **원인이 아니었던 가설**: 확대 기준점 계산(정확했음), 이동값 초기화, 왼쪽 위 기준.
**수정**: 손 도구·스크롤바·방향키·Shift+휠·Alt+방향키(영역 1px/10px), 선택 영역 보기(Z, 목록 더블클릭), Space는 입력칸 외에는 항상 이동(한글 입력기 포함), 확대 뒤 포커스 복귀, 핀치 중간점 추적, 이동 범위 여백 포함, 레이아웃 정리(안내 접기·한 줄 도구줄·푸터 고정). **권장 항목**: 숫자 입력(px·mm)과 실행 취소 구현, 미니맵 미구현.
**전체 회귀(커밋된 dist 기준)**: Vitest 96/96, pytest 13/13, tsc 0, e2e 57행 중 55 통과(`regression_task21_table.md`; 제외 2건은 측정 도구 `dieline_pan_measure_task21`과 구 UI 집계 도구 `stage26c_count`로, 후자는 작업 21 이전 빌드에서도 같은 실패), 창 크기·배율 36조합(`scroll_fix`) 0 bad, GLB sha256 `3fece704…` 이전·이후 동일, GLB validator 0/0, `ui_parity` 사라짐 0(583항목). 분할 대화상자 DOM에 의존한 기존 e2e는 수정이 필요 없었다(바꾼 것은 러너의 제외 목록뿐).
**환경 기록**: 첫 전체 회귀가 시스템 메모리 부족으로 중단되어(30개 완료), 남은 메모리를 확인하며 나머지를 묶음별로 순차 실행했다(묶음 사이 headless 브라우저 정리, 남은 메모리 3.98~5.28GB). 환경 한계로 실패한 스크립트는 없다.
**dist**: `index-CeTPLSDt.js`·`index-cLyKlvvz.css` → `index-DKJ-j0b_.js`·`index-Bbm_NnpP.css`.
**미검증**: 실제 마우스·트랙패드·터치 기기(휠·핀치 감각), 실제 한글 입력기(자동화는 key=Process·code=Space 이벤트로 모사), 실제 GPU, Vercel, 시안 시각 승인.

## deploy/candidate-2
- 브랜치 deploy/candidate-2, **HEAD `84d6aac`**(전체 `84d6aacb576eeeb27151097fa2681173ecd6ecd1`), origin/main(5998721) 기준 squash 1커밋, **origin/main 대비 변경 파일 508개**. push하지 않았다. (작업 17 시점 후보 `8d542b4`는 태그 `deploy-candidate-2-post17`로 보존.)
- 시안 보호: `git ls-files`·`git log --name-only origin/main..HEAD` 모두 inputs/·verification-private/·reference_angle*·real_*·사바리_프로젝트*.sabari·사바리_목업*.glb·dieline-real **0건**(`verification/dieline-real/`은 추적에서 제거). 비밀정보 패턴 0건, 50MB 초과 파일 0건(트리·이력).
- 이 브랜치에서 임시 폴더 빌드와 빠른 검증 통과: tsc 0, Vitest 96, pytest 13, e2e 16종(base10·dieline·mouse·viewkeep·shortcuts·colors·ui_tabs·ui_dialogs·background·edge_inspect·lighting·template·sidebar·stage30·png_scale·floor_shadow_task9)을 **커밋된 frontend/dist로** 실행해 통과, GLB validator 0/0.
- **dist 일치 확인(새 규칙)**: deploy 트리의 소스를 `SABARI_BUILD_HASH=bd4c7e6 SABARI_BUILD_DATE=2026-10-04`(커밋된 dist에 박힌 버전 문자열 값)로 다시 빌드한 결과가 커밋된 `frontend/dist`와 **해시 파일명까지 같다**(`index-CeTPLSDt.js`, `index-cLyKlvvz.css`), 내용도 줄바꿈(CRLF) 차이를 빼면 SHA-256이 같다. 버전 줄은 빌드 시점 git 해시·날짜를 쓰므로 다른 날 다시 빌드하면 해시가 달라진다(재현하려면 위 두 환경변수를 고정). 이 보고서(docs)만 candidate 이후에 integration-2에 추가되었다.
- dist 이력(병합 직전 재빌드 규칙): 작업 11 전 `index-B9W3L802.js`·`index-BrYT7Lvn.css`(작업 5 시점의 오래된 빌드) → 11 `index-0r6UmWuH.js`·`index-BEpqD4se.css` → 12 `index-Sgejt2d3.js`·`index-DVL_GHgd.css` → 17 `index-CYzT_Ifl.js`·`index-Cd0QLVRm.css` → 13 `index-B_WBV9fi.js`·`index-BbBKZ-Kn.css` → 14 `index-CN_s-zGY.js`·`index-Crsd6FIv.css` → 15 `index-D0LAX_s4.js`·`index-DDQKpAaq.css` → 16(최종) `index-CeTPLSDt.js`·`index-cLyKlvvz.css`.

## 앱 서버
- 8765(백엔드 `app.main`, start.bat이 띄우는 서버)와 8766(vite preview)이 작업트리의 `frontend/dist`를 서빙한다. 이 보고서 작성 시점에 둘 다 integration-2 최종 빌드(`index-CeTPLSDt.js`)를 서빙한다. **주소: http://127.0.0.1:8765/** (또는 http://127.0.0.1:8766/). 8767은 응답이 없어 쓰지 않는다(예전에 띄운 별도 preview로 추정, 확인 필요). `start.bat`은 한글 경로 때문에 전체 경로로 감싸 실행해야 한다.
- 배포 방법(실행하지 않음): `deploy/candidate-2`를 검토해 마음에 들면 사용자가 직접 `git push origin deploy/candidate-2` 후 PR/병합하고, Vercel 연결 저장소라면 병합 뒤 자동 배포되거나 `vercel deploy`(미리보기)·`vercel deploy --prod`로 올린다. 배포 전 `frontend/dist`가 최종 소스와 같은지(위 일치 확인)와 환경변수(.env)는 `Yoom_env-setup` 스킬로 점검한다.

## BLOCKED / SKIPPED
- BLOCKED 없음. SKIPPED 없음(우선순위 규칙으로 보류했던 13~16도 같은 세션에서 구현·병합).

## 결정 사항
1. integration-2는 post-10 이후 문서 커밋(MORNING_REPORT·PROGRESS)만 다른 overnight/integration HEAD(bf0dd24)에서 분기했다.
2. 작업 11: 측정 표는 렌더러 메모리·속도 때문에 조건 54 이후를 흰 배경·면 이미지 없이(빠른 모드) 쟀다(토글 이력 45조건에서 흰/투명 차이 최대 84px 확인). 소스는 수정하지 않고 `frontend/dist`를 재빌드했다. 새 규칙에 따라 작업 11~16 각각 병합 직전에 dist를 재빌드·커밋했다(작업 17은 13~16보다 먼저 만들어 기록 순서만 다르다).
3. 작업 12: 기존 e2e 호환을 위해 접이식 섹션의 기본 접힘 상태를 유지(박스 치수·칼선 SVG 접힘, 고급 설정>크기·위치 펼침). 비율 변경 배너는 3D 위 알림 영역에 두고 선택한 면 패널에는 해당 면의 문구와 "확인했어요"를 둔다. 기존 e2e는 `e2e/tab_shim.mjs`(--import: 실제 탭 클릭으로 연다)·3D 화면 기준 좌표(`bgPoint`)로 갱신하고 `panel_split_task4`는 `ui_tabs_task12`로 대체했다.
4. 작업 13: 배경은 박스 뒤의 별도 2D 캔버스에 그리고 PNG "화면 그대로"는 같은 그리기 함수로 합성한다(화면↔PNG ±1). 배경이 단색·이미지면 PNG 기본값은 "화면 그대로". .sabari schemaVersion을 5 → 6으로 올렸다(선택 필드 viewSettings.background, 구버전·미래 버전 처리 유지). 파이썬 백엔드 `project_io.py`는 변경하지 않았다.
5. 작업 14: 투명 PNG 흰선·후광은 측정으로 "없음"을 입증해 코드를 고치지 않았다. 경계 점검은 렌더러와 분리된 DOM 캔버스에만 그린다.
6. 작업 15: 빛 방향을 면 음영에 쓰면 "정면 색 ±1" 불변식이 깨지므로 **음영은 카메라 기준 유지, 빛 방향은 바닥 그림자에만 적용**(UI 문구 명시).
7. 작업 16: 레지스트리 최소 구조만 만들고 선택 변경 동작·다른 템플릿·기존 생성 코드 리팩터링은 하지 않았다.
8. 작업 17: 저장 이름은 기본 ON(레거시 e2e는 tab_shim이 끈다), 자동화 브라우저(`navigator.webdriver`)는 `showSaveFilePicker` 대신 이름 대화상자 경로를 쓴다. 비율 변경 확인은 기존 "확인했어요" 유지.
9. 작업 18: 보고서는 deploy 브랜치에 넣지 않는다(HEAD 해시 고정). deploy/candidate-2는 작업 13~16 반영을 위해 origin/main에서 다시 만들었다(이전 후보는 태그로 보존).

## 미반영(기능 없음) 목록
- 템플릿 선택 변경 동작·책자/카드/접지물 템플릿 자체(작업 16은 "준비 중" 표시까지)
- 시안 상 일부: 면 선택 5개 한 줄 배치(앱은 3열), 스위치 모양의 "하단 몸통 사용"(앱은 기존 체크박스)
- 이미지가 하나도 없을 때 배경만 바꾼 경우의 자동 임시저장(기존 규칙 유지; .sabari 저장에는 항상 포함)
- 파이썬 백엔드(`backend/app/project_io.py`)의 schemaVersion 6 인식(브라우저 앱은 사용하지 않음)

## 미검증 목록
- 실제 GPU(그림자·4배 PNG 프레임 시간), 실제 PC·터치 기기(드래그·핀치·시트 드래그·확대경), Vercel 배포본
- 시안 시각 승인(작업 1 실제 디자인, 작업 6 세운 3/4, 작업 10 그림자 방향, 작업 12~17 UI·배경·경계 점검·조명·템플릿 시안 비교)
- 네이티브 `showSaveFilePicker` 저장 창(자동화 브라우저는 대화상자 경로만 검증)
- 사용자 화면에서 그림자가 안 보이던 구도의 재현(작업 11: 서버가 새 빌드를 서빙하는지·토글·카메라 높이 확인 필요)
- 고해상도(devicePixelRatio 2) 화면에서 배경·확대경 선명도
- 작업 21: 실제 마우스·트랙패드·터치로 칼선 분할 화면 확대·이동 감각, 실제 한글 입력기에서 Space 이동

ALL_DONE
