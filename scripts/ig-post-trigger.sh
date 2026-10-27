#!/bin/bash
# 인스타 발행 트리거 — launchd가 매일 11시(KST) 실행. 서버(igcron)가 실제 발행.
# CRON_SECRET은 커밋 안 하고 .env.local에서 읽는다. 서버 가드(last_post_date)로 중복 방지.
REPO="/Users/wonu/Desktop/muhyeop-map"
LOG="$HOME/ig-post-trigger.log"
SECRET=$(grep -E '^CRON_SECRET' "$REPO/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d ' ')
RESP=$(curl -fsS --max-time 290 -X POST -H "Authorization: Bearer $SECRET" "https://muhyeop.com/api/campaigns?action=igcron" 2>&1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] $RESP" >> "$LOG"
