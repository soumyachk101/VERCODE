#!/usr/bin/env bash
set -e

cd /Users/soumyachakraborty/Documents/VERCODE

while true; do
  sleep 60
  
  # Ensure we are on main and up to date before checking changes
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [ "$CURRENT_BRANCH" != "main" ]; then
    continue
  fi

  # Check if there are changes (modified, untracked, staged)
  if [ -n "$(git status --porcelain)" ]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BRANCH="update-$TIMESTAMP"
    echo "[$(date)] Changes detected. Creating branch $BRANCH..."
    
    git checkout -b "$BRANCH"
    git add .
    git commit -m "feat: automatic update $TIMESTAMP with codebase changes" || true
    git push origin "$BRANCH"
    
    gh pr create --title "Auto update $TIMESTAMP" --body "Automated update PR containing recent workspace changes." --base main --head "$BRANCH" || true
    gh pr merge --auto --merge || gh pr merge --merge || true
    
    git checkout main
    git pull origin main
    echo "[$(date)] Successfully merged PR for $BRANCH into main."
  fi
done
