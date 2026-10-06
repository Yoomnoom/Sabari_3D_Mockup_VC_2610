#!/usr/bin/env bash
# 배포 후보 만들기(작업 34): origin/main 기준 squash 1커밋. push·배포는 하지 않는다.
# 규칙: verification/ 아래는 origin/main 상태 그대로 둔다 — 통합 브랜치에서 새로 생긴·바뀐 verification 산출물(스크린샷·GLB·로그 등)은 후보에 넣지 않는다.
#       (verification/ 를 통째로 지우면 main이 이미 추적하는 571개 파일을 지우는 변경이 되므로 그렇게 하지 않는다.)
# 사용: tools/make_candidate.sh <통합 브랜치> <후보 브랜치> <빌드 해시> <빌드 날짜>   예) tools/make_candidate.sh overnight/integration-4 deploy/candidate-5 2e58c17 2026-10-06
set -euo pipefail
SRC=$1; CAND=$2; HASH=$3; DATE=$4
WT="$(mktemp -d)/cand"
git worktree add -b "$CAND-new" "$WT" origin/main
cd "$WT"
git read-tree --reset -u "$SRC"                       # 통합 브랜치 트리
git rm -r -q --cached verification >/dev/null 2>&1 || true
rm -rf verification
git checkout origin/main -- verification              # verification/ 만 origin/main 그대로
# dist 는 빌드 정보를 고정해 다시 만든다(임시 폴더 빌드와 파일명이 같아야 한다)
# worktree 에는 node_modules 가 없으므로 원본 저장소의 것을 연결한다(추적 대상 아님)
MAIN_ROOT="$(git -C "$WT" rev-parse --path-format=absolute --git-common-dir)/.."
cmd //c mklink //J "$(cygpath -w "$WT/frontend/node_modules")" "$(cygpath -w "$MAIN_ROOT/frontend/node_modules")" >/dev/null 2>&1 || ln -s "$MAIN_ROOT/frontend/node_modules" frontend/node_modules
( cd frontend && SABARI_BUILD_HASH="$HASH" SABARI_BUILD_DATE="$DATE" npm run build )
git add -A -- . ':!frontend/node_modules'
# 점검: 보호 대상·50MB 초과(초과하면 중단)
test "$(git ls-files | grep -ciE '^(verification-private|inputs)/|^\.night/|views\.json' || true)" = 0
git add -A -- . ':!frontend/node_modules'
test "$(git ls-tree -r -l $(git write-tree) | awk '$4>52428800' | wc -l)" = 0
git commit -m "$CAND: 통합 브랜치 $SRC 기준 squash(verification/ 는 origin/main 그대로, 빌드 해시 $HASH, 날짜 $DATE)"
echo "후보 커밋: $(git rev-parse --short HEAD)  크기: $(git ls-tree -r -l HEAD | awk '{s+=$4} END {printf "%.1f MB", s/1048576}')"
