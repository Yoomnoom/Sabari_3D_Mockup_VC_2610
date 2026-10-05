# 야간 작업 아침 보고 (2026-10-04, 작업 10 시점 갱신(최종))

## 요약
대기열 중 추가 규칙 A, 작업 0~10을 모두 완료하고 overnight/integration에 병합(태그 post-0~post-10)했다. 대기열에 남은 작업은 없다. 작업 7 끝에서 전체 회귀(e2e 43개 스크립트 전부 통과, 36조합 0 bad)를 돌렸고 deploy/clean-candidate를 post-10 기준(squash 커밋 5006275)으로 다시 만들었다. push는 하지 않았다.

## 완료된 작업

### 추가 규칙 A. 백업
- `../sabari-backup-20261004.bundle` 생성·verify 성공 (69,473,717 bytes, 32 refs)

### 작업 0. 색 정확도 (feature/color-accurate 병합)
- 병합 커밋 dc4b1ba, 태그 post-0. 문서 충돌만 있었음(내용 보존), 코드 충돌 없음
- 빠른 검증: Vitest 85/85, pytest 13/13, tsc+build 성공, 핵심 e2e 6종 통과, GLB validator 0/0 — ✅

### 작업 1. 단계 28 — 칼선 크롭 모드 (task/1-dieline28)
- dieline.ts에 CROP_SABARI_160_110_43 상수·cropRegions·cropMismatch 추가, splitUi.ts에 모서리 투명 자동감지(crop 모드) 추가
- 실제 이미지(real_dieline_art.png/real_dieline_crop.png)로 검증: 둘레 밴드 비율 대부분 0%(원본 100%), 좌우 날개의 ~24%는 디자인 자체 금테두리(임계값 미만, 밴드 아님), 크롭 영역 경계 오차 0px
- 몸통 없는 고객 디자인(뚜껑 전용)이 흰색으로 자동 제외되어 기존 안전장치로 요구사항 충족 확인
- .sabari/GLB(gltf-validator 0/0)/PNG 저장 정상, 성능 양호(870ms, heap 9.5MB)
- 병합 1aa60df, 태그 post-1. **실제 디자인 시각 최종 승인은 사용자 승인 대기** (verification-private/dieline-real2/*.png 스크린샷 참고)

### 작업 2. 단계 28c — 칼선 투명 영역 보존 (task/2-dieline28c)
- 원인: splitUi.ts의 cropFace()가 면 크롭 캔버스를 흰색으로 미리 채워 투명 픽셀을 지웠음(bake() 합성 로직 자체는 문제 없었음). 해당 fillRect 한 줄 제거로 수정
- 합성 RGBA 테스트(5면×바탕색 4종 28/3/128/255): 20/20 통과 — 알파0 위치 면 바탕색과 오차0, 반투명 경계 알파 혼합값 일치, 숨은 흰색 유출 없음
- 실사 크롭(real_dieline_crop.png) 면별 흰 픽셀 수(수정 전→후): lid_top 595→666(알파0 미중첩 영역, 무관), lid_front 4309→2702, lid_back 4311→2623, lid_left 819→286(alpha0 10655px 보존), lid_right 850→276(alpha0 10630px 보존). 바탕색 유출 0건
- "before" 스크린샷은 사용자 지시로 생성하지 않음(버그 빌드 재현·안전 차단 우회 금지) — 수치 기록(위 표)으로 대체
- 전체 빠른 검증: Vitest 85/85, pytest 13/13, tsc --noEmit 0 errors, 핵심 e2e 6종 모두 errors:[], dieline_real2(.sabari 복원/GLB validator 0·0/PNG) 통과
- 병합 bdf8796, 태그 post-2

### 작업 3. 단계 28b — 칼선 분할 화면 확대·이동 (병합, post-3)
- 휠·핀치·버튼·키보드 확대(25%~1600%, 커서 중심), Space/가운데 버튼/두 손가락 이동, 핸들 화면 고정 크기, 투명도 슬라이더. e2e/split_zoom_check.mjs 10/10(커서 중심 오차 0.00006px, 100%=1px). 큰 이미지 열기 419ms.

### 작업 4. 단계 29 — 편집/뷰어 위·아래 분리 (병합, post-4)
- 상단 "편집|GLB 뷰어" 전환 제거, 뷰어의 "GLB 열기"로 대체. 스플리터·접기·900px 미만 탭 전환. Chromium `::details-content` 때문에 내용이 넘치던 레이아웃 버그 수정. e2e/panel_split_task4.mjs 통과.

### 작업 5. 단계 30 — 각도 바 + 저장된 시점 (병합, post-5)
- 축 잠금 각도 바(절대값, 기준 자세 오차 1e-9), 저장된 시점 5슬롯(.sabari schemaVersion 5, 썸네일). 불러오기에서 뚜껑 높이를 카메라 계산 앞으로 옮기는 버그 수정. e2e/stage30.mjs 통과.

### 작업 6. 세운 3/4 시점 좌·우 (병합, post-6)
- 탐색 범위(방위각 24~38, 고도 0~4, FOV 22/26/30) 안에서 방위각 32°·고도 0°·FOV 22° 선택(상수는 frontend/src/standingView.ts 한 곳). 좁은 면/큰 면 0.184, 잘림 0, 여백 81px, 좌우 대칭 오차 0, 윗변 기울기 ±5.45°.
- 이 시점에서만 FOV 22를 쓰고 시점 버튼·F·3/4·윗면에서 30으로 복원. 저장된 시점 불러오기에서 FOV를 거리 계산 앞에 적용하도록 수정. 단축키 Alt+6(왼쪽).
- **참고 이미지와 박스 비율이 달라 완전 일치는 불가능, 시각 일치는 사용자 승인 대기** (verification-private/standing-view/side_by_side.png, overlay.png).

### 작업 7. PNG 저장 배율 (병합, post-7)
- PNG 저장 줄에 "화면 크기/2배/4배"(localStorage에만 기억). 한계 min(8192, 장치 한계)를 넘으면 가능한 최대 배율로 낮추고 한국어 안내(큰 창에서 4배 → 3.94배 8192×7089, 저장 실패 없음). 작은 창에서 1160×1200 → 2320×2400 → 4640×4800 정확한 배수, 투명 PNG 가장자리 잘림 없음.
- 면 텍스처(긴 변 2048px)는 약 1.9배부터 병목. 개선은 하지 않았고 제안만: 면 텍스처 최대 변 4096px로 올리는 별도 작업.

### 작업 8. 회전 상태 한 줄 + 왼쪽 패널 접기 (병합, post-8)
- 뷰어 > 보기에 상시 "회전 상태" 한 줄(자유 회전: 박스 자세 좌우·위아래 각, 축 잠금: 축 이름 + 각도). 드래그·시점 버튼·세운 시점·축 잠금·잠금 해제에서 실시간 갱신(표시 각도=박스 자세, 오차 0.06° 이내).
- **결정**: 3D 화면 하단 가운데 알약(#rotBadge)은 드래그 중에만 뜨는 임시 배지와 같은 요소라 요구의 "임시 배지 유지"에 따라 그대로 두었다(상시 알약은 원래 없었다). 시점 버튼은 박스를 기본 자세로 되돌리므로 그 직후 줄은 +0.0°/+0.0°(자세 기준 표시, 카메라 방향은 표시하지 않음). 다르게 원하면 알려 달라.
- 왼쪽 패널 접기/펴기 버튼(3D 화면 왼쪽 아래). 접기 전후 카메라·자세·FOV·뚜껑 수치 오차 1e-12 이내, 새로고침 후 접힘 유지(localStorage sabari.panelCollapsed만), 창 4종×접힘/펼침 박스 잘림 0·가로 스크롤 없음. 전체 회귀 e2e 44개 통과(verification/overnight/regression_post8.json).

### 작업 9. 바닥 그림자 (병합, post-9)
- 뷰어 > 조명에 "바닥 그림자 보기/숨기기" 토글(기본 꺼짐, 텍스트+aria-pressed). 켜면 세기(40%)·부드러움(50%)·빛 좌우(35°)·높이(55°)·기본값 복원이 나타난다. 설정은 localStorage에만 저장(.sabari·임시저장·GLB 불변).
- 구현: 보이지 않는 ShadowMaterial 바닥판 + DirectionalLight, VSM 그림자 맵 2048². 박스 재질은 조명 항을 쓰지 않아 박스 색은 그림자와 무관(켠/끈 화면의 박스 실루엣 안쪽 픽셀 차이 0). 바닥 높이는 viewer.restingBounds() 한 곳(눕힘·세움·뒤집힘·뚜껑 열림·표시 숨김 반영, 접촉 간격 오차 1e-6 이내). 외부 GLB도 동일.
- 꺼진 화면 12종이 변경 전(post-8) 빌드와 픽셀 단위로 동일. 투명 PNG는 반투명 알파·검정 RGB라 마젠타·검정·흰색 합성에서 흰 테두리 0. 아래 시점·뒤집힌 자세에서 바닥판 안 보임.
- **프레임 시간은 헤드리스 소프트웨어 렌더링에서만 측정**(회전 40프레임 중앙값 끔 20.4ms/켬 23.5ms, 평균·95백분위는 렌더러 스파이크로 참고용). **실제 GPU 성능은 미검증.** 기본 컨트롤 수 113→114.
- (작업 10에서 기본 빛 방향을 225°·65°로 바꿔 3/4 시점에서도 그림자가 보이도록 해결했다.)
- 전체 회귀 e2e 45개 통과(verification/overnight/regression_post9.json), Vitest 88/88.

### 작업 10. 그림자 기본 빛 방향 변경 (병합, post-10)
- 이전 기본(좌우 35°·높이 55°)은 그림자가 박스 왼쪽·뒤로 떨어져 3/4 기본 시점에서 거의 가려졌다. 렌더 측정(좌우 0~345° 15° 간격 × 높이 35/50/65° × 3/4·세운 왼쪽·세운 오른쪽·위에서 보기)으로 세 구도 모두 그림자가 박스 앞쪽 오른쪽 아래로 보이고 가려지지 않는 비율이 가장 큰 값을 골랐다: **좌우 225°(뒤 왼쪽)·높이 65°**. "기본값 복원" 버튼도 같은 값(frontend/src/floorShadow.ts 한 곳).
- 박스 밖으로 보이는 그림자 픽셀(이전 → 새): 3/4 5,906 → 138,372, 세운 왼쪽 32,722 → 47,778, 세운 오른쪽 1,251 → 70,552. 위에서 본 면적 대비 비율 0.06 → 2.47 / 0.33 → 0.85 / 0.01 → 1.26. 전후 스크린샷은 합성 면 이미지로만 verification/shadow-default/ 에 있다.
- 그림자 꺼진 화면 12종은 변경 전 빌드와 픽셀 단위로 동일, 켠 상태 박스 색 차이 0, 투명 PNG 흰 테두리 0, GLB·.sabari 불변. 전체 회귀 e2e 45개 통과(verification/overnight/regression_post10.json), Vitest 88/88, pytest 13/13.
- 태그: PROGRESS.md 기준으로 post-4(작업4 병합 커밋 32af5e5), post-5(작업5 병합 커밋 e887cff)를 새로 만들었다. 기존 태그는 건드리지 않았다.

## 전체 회귀 (작업 7 끝)
- e2e 43개 스크립트 전부 종료코드 0(표: verification/overnight/regression_post7.json), scroll_fix 36조합 0 bad, bleed_id 경계 픽셀 43·비면 메시 번짐 0, Vitest 85/85, pytest 13/13, tsc 0, GLB validator 0/0.
- 작업 4에서 #tabView·#tabEdit·#vLiftN·#viewLid가 사라져 오래된 e2e 6개(color_viewer, dims, run, stage24_b, stage26_b, stage26c)가 실패했다. 앱 버그가 아니라 테스트가 낡은 것이며, 탭 클릭 제거·#btnExtGlbBack 사용·없는 요소 건너뛰기로 갱신했다(기능 판정은 그대로).

## 추가 규칙 B. deploy/clean-candidate 브랜치 (post-10 기준으로 재생성)
- origin/main(5998721)에서 다시 분기해 `git merge --squash overnight/integration` 후 단일 커밋(5006275, post-10 기준). 이전 커밋(8f27680)은 reflog에만 남는다.
- 시안 보호: `verification/dieline-real/`를 `git rm --cached`로 제거(.gitignore에 이미 등재). `git ls-files`와 `git log --name-only origin/main..HEAD` 모두 보호 경로 0건. inputs/·verification-private/는 추적되지 않음.
- `git diff --stat origin/main`: 236 files changed, 19798 insertions(+), 4966 deletions(-)
- 이 브랜치에서 임시 폴더 빌드 + 빠른 검증: tsc 0, Vitest 85/85, pytest 13/13, e2e(base10, dieline, mouse, viewkeep, shortcuts, colors, stage30, standing_view, png_scale) 모두 통과, GLB validator 0/0. **push하지 않았다.**

## 남은 대기열 (시작하지 않음)
없음(작업 0~10 완료). 신규 작업 시작 기한은 2026-10-05 03:18.

## 사용자 확인이 필요한 항목
1. 작업 1의 실제 고객 디자인 시각 최종 승인 (verification-private/dieline-real2/)
2. 작업 6 세운 3/4 시점의 참고 이미지 시각 승인 (verification-private/standing-view/)
3. deploy/clean-candidate push 여부
4. 작업 7 제안: 4배 저장 품질용 면 텍스처 해상도 상향 여부
5. 작업 9·10: 실제 GPU에서의 프레임 시간(헤드리스 소프트웨어 렌더링만 측정), 새 기본 빛 방향(225°·65°)의 시각 확인
