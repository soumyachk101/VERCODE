#!/usr/bin/env bash

cd /Users/soumyachakraborty/Documents/VERCODE

while true; do
  sleep 60

  # Check if there are changes (modified, untracked, staged)
  if [ -n "$(git status --porcelain)" ]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BRANCH="update-$TIMESTAMP"
    echo "[$(date)] Changes detected. Processing on branch $BRANCH..."

    git checkout -B "$BRANCH" 2>/dev/null || true
    git add -A
    git commit -m "feat: automatic update $TIMESTAMP with codebase changes" || true
    git push origin "$BRANCH" --force || true

    PR_URL=$(gh pr create --title "Auto update $TIMESTAMP" --body "Automated update PR containing recent workspace changes." --base main --head "$BRANCH" 2>/dev/null || true)
    
    # Merge PR (either the one just created or existing)
    gh pr merge "$BRANCH" --admin --merge || gh pr merge "$BRANCH" --merge || gh pr merge --auto --merge || true

    # Switch back to main and align
    git checkout main 2>/dev/null || git checkout -f main
    git fetch origin main
    git reset --hard origin/main
    echo "[$(date)] Successfully synced and updated main to match origin/main."
  fi
done
