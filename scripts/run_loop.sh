#!/bin/bash
REPO_DIR="/Users/soumyachakraborty/Documents/VERCODE"
LOG_FILE="$REPO_DIR/scripts/auto_sync.log"

echo "[$(date)] Fresh auto-sync runner loop started." >> "$LOG_FILE"

while true; do
    "$REPO_DIR/scripts/auto_sync.sh" >> "$LOG_FILE" 2>&1 || true
    sleep 60
done
