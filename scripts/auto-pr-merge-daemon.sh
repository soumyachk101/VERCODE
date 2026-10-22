#!/usr/bin/env bash

REPO_DIR="/Users/soumyachakraborty/Documents/VERCODE"
cd "$REPO_DIR" || exit 1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Daemon started: Watching for changes every 60s..."

while true; do
  cd "$REPO_DIR" || exit 1

  # Ensure we are tracking origin/main properly
  git fetch origin main >/dev/null 2>&1

  # Check if there are uncommitted changes
  if [[ -n $(git status --porcelain) ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Changes detected! Preparing PR..."
    
    BRANCH="auto-update-$(date +%s)"
    
    # Create branch from latest origin/main
    git checkout -b "$BRANCH"
    git add -A
    
    COMMIT_MSG="auto: sync changes $(date '+%Y-%m-%d %H:%M:%S')"
    git commit -m "$COMMIT_MSG"
    
    echo "Pushing branch $BRANCH..."
    if git push origin "$BRANCH"; then
      echo "Creating PR..."
      PR_URL=$(gh pr create --title "$COMMIT_MSG" --body "Automated PR created by watcher" --base main --head "$BRANCH")
      echo "PR created: $PR_URL"
      
      echo "Merging PR..."
      gh pr merge "$BRANCH" --squash --delete-branch --admin || \
      gh pr merge "$BRANCH" --squash --delete-branch || \
      gh pr merge "$BRANCH" --merge --delete-branch
      
      # Cleanly return to main and pull latest
      git checkout main
      git reset --hard origin/main
      git pull origin main
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done. Main branch is up to date."
    else
      echo "Failed to push $BRANCH"
      git checkout main
    fi
  else
    # No local uncommitted changes, check if main needs sync
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" == "main" ]]; then
      git pull --rebase origin main >/dev/null 2>&1
    else
      git checkout main >/dev/null 2>&1
      git pull --rebase origin main >/dev/null 2>&1
    fi
  fi

  sleep 60
done
