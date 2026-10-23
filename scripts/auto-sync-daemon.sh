#!/usr/bin/env bash
set -uo pipefail

# Resilient Auto Git Sync Daemon
# Runs every 60 seconds, commits any pending changes, opens a PR, merges it to main,
# and gracefully handles git branch switches without crashing on in-flight edits.

REPO_DIR="/Users/soumyachakraborty/Documents/VERCODE"
cd "$REPO_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Resilient Auto Git Sync Daemon started. Monitoring $REPO_DIR every 60 seconds..."

while true; do
  cd "$REPO_DIR"

  # Check if there are uncommitted changes or untracked files
  if [[ -n "$(git status --porcelain)" ]]; then
    log "Changes detected!"

    timestamp="$(date '+%Y%m%d-%H%M%S')"
    pr_title="$(python3 "$REPO_DIR/scripts/pr_message_generator.py" --title 2>/dev/null || echo "chore: auto-sync update ($timestamp)")"
    pr_body="$(python3 "$REPO_DIR/scripts/pr_message_generator.py" --body 2>/dev/null || echo "Automated sync PR ($timestamp)")"

    # Extract clean branch prefix from conventional commit type if available
    branch_type="$(echo "$pr_title" | sed -E 's/^([a-zA-Z_-]+)(\(.*\))?:.*/\1/' | tr '[:upper:]' '[:lower:]')"
    if [[ -z "$branch_type" || "$branch_type" == "$pr_title" ]]; then
      branch_type="update"
    fi
    pr_branch="auto/${branch_type}-${timestamp}"

    # Stage and commit right here (even if currently on a feature/temp branch)
    git add -A
    git commit -m "$pr_title" -m "$pr_body" || true

    # Create & push the new branch
    git checkout -b "$pr_branch" || git branch -M "$pr_branch"
    log "Pushing branch $pr_branch to origin..."

    git push -u origin "$pr_branch" --force 2>&1 || true

    # Verify if branch exists on remote
    if git ls-remote --heads origin "$pr_branch" | grep -q "$pr_branch"; then
      log "Creating PR..."
      pr_url="$(gh pr create --base main --head "$pr_branch" --title "$pr_title" --body "$pr_body" 2>&1 || true)"

      log "PR create output: $pr_url"
      log "Auto-merging PR..."
      gh pr merge "$pr_branch" --merge --admin --delete-branch 2>&1 || gh pr merge "$pr_branch" --merge --auto --delete-branch 2>&1 || true

      log "Syncing main locally..."
      git checkout main || true
      git pull origin main || true
      git branch -D "$pr_branch" 2>/dev/null || true
      log "Cycle complete successfully!"
    else
      log "Failed to push $pr_branch. Will retry next minute."
    fi
  else
    log "No changes detected. Sleeping 60 seconds..."
  fi

  sleep 60
done
