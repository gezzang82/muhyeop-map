#!/bin/bash
# 중복 캠페인 정리 — 더블클릭하면 같은 링크로 2번 등록된 캠페인의 초과분을 삭제합니다.
cd "$(dirname "$0")/.."
echo "중복 캠페인 정리를 시작합니다…"
node scripts/dedup-campaigns.js --apply
echo ""
read -n 1 -s -r -p "완료. 아무 키나 누르면 닫힙니다…"
