#!/usr/bin/env bash

# Auto PR and Merge daemon
# Scans git repo every 60 seconds.
REPO_DIR="/Users/soumyachakraborty/Documents/VERCODE"
cd "$REPO_DIR" || exit 1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting auto git scan watcher (interval: 60s)..."

while true; do
  cd "$REPO_DIR" || exit 1
  
  # Check if there are changes (tracked or untracked)
  if [[ -n $(git status --porcelain) ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Changes detected!"
    
    BRANCH="auto-update-$(date +%s)"
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ -z "$CURRENT_BRANCH" ]]; then
      CURRENT_BRANCH="main"
    fi

    # Create new branch
    git checkout -b "$BRANCH"
    
    # Stage and commit all changes
    git add -A
    COMMIT_MSG="auto: sync changes $(date '+%Y-%m-%d %H:%M:%S')"
    git commit -m "$COMMIT_MSG"
    
    # Push branch
    echo "Pushing branch $BRANCH..."
    if git push origin "$BRANCH"; then
      # Create PR and auto-merge
      echo "Creating PR..."
      PR_URL=$(gh pr create --title "$COMMIT_MSG" --body "Automated PR created by watcher" --base main --head "$BRANCH" 2>&1)
      echo "$PR_URL"
      
      # Try merging the PR
      echo "Merging PR..."
      gh pr merge "$BRANCH" --squash --delete-branch --admin || gh pr merge "$BRANCH" --squash --delete-branch || gh pr merge "$BRANCH" --merge
      
      # Switch back to main and pull latest
      git checkout main
      git pull origin main
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] PR merged and main updated successfully."
    else
      echo "Failed to push $BRANCH"
      git checkout "$CURRENT_BRANCH"
    fi
  else
    # Also check if main has unpushed commits
    UNPUSHED=$(git log origin/main..main --oneline 2>/dev/null)
    if [[ -n "$UNPUSHED" ]]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Unpushed commits on main detected. Pushing to origin/main..."
      git push origin main
    fi
  fi

  sleep 60
done
