#!/bin/bash
# Turso DB 읽기/쓰기 사용량 일일 체크.
# - 앱 DB 읽기 한도와 무관한 관리용(control-plane) 조회라 읽기 quota를 소모하지 않음.
# - 실행할 때마다 오늘 누적치를 기록하고, 직전 기록 대비 '증가분(그 사이 소비량)'을 함께 보여줌.
# 사용법: bash scripts/db-usage.sh   (DB 이름은 아래 DB로 고정, 필요시 인자로 변경)

set -euo pipefail
DB="${1:-muhyeop-map}"
LIMIT_READ=500000000   # starter 플랜 rows read 월 한도(대시보드 값과 다르면 수정)
TURSO="$(command -v turso || echo "$HOME/.turso/turso")"
LOG="$(dirname "$0")/.db-usage-log.tsv"

OUT="$("$TURSO" db inspect "$DB" 2>&1)"
READ=$(echo "$OUT"  | grep -i "rows read"    | grep -oE '[0-9]+' | head -1)
WRITE=$(echo "$OUT" | grep -i "rows written" | grep -oE '[0-9]+' | head -1)
STORAGE=$(echo "$OUT" | grep -i "space used" | sed -E 's/.*: *//')

if [ -z "${READ:-}" ]; then echo "사용량 조회 실패:"; echo "$OUT"; exit 1; fi

NOW="$(date '+%Y-%m-%d %H:%M')"
PCT=$(awk -v r="$READ" -v l="$LIMIT_READ" 'BEGIN{printf "%.1f", r/l*100}')

# 직전 기록과 비교(증가분)
DELTA_MSG=""
if [ -f "$LOG" ]; then
  LAST="$(tail -1 "$LOG")"
  LAST_READ=$(echo "$LAST" | awk -F'\t' '{print $2}')
  LAST_TS=$(echo "$LAST" | awk -F'\t' '{print $1}')
  if [ -n "${LAST_READ:-}" ]; then
    D=$((READ - LAST_READ))
    DM=$(awk -v d="$D" 'BEGIN{printf "%.2f", d/1000000}')
    DELTA_MSG="  (직전 기록[$LAST_TS] 이후 +${DM}M 읽음)"
  fi
fi

printf "%s\t%s\t%s\n" "$NOW" "$READ" "$WRITE" >> "$LOG"

RM=$(awk -v r="$READ"  'BEGIN{printf "%.1f", r/1000000}')
WM=$(awk -v w="$WRITE" 'BEGIN{printf "%.1f", w/1000000}')
echo "━━━ Turso 사용량 ($DB) · $NOW ━━━"
echo "  rows read : ${RM}M / 500M  = ${PCT}%${DELTA_MSG}"
echo "  rows write: ${WM}M / 10M"
echo "  storage   : ${STORAGE}"
if awk -v p="$PCT" 'BEGIN{exit !(p>=80)}'; then echo "  ⚠️  읽기 80% 이상 — 주의"; fi
