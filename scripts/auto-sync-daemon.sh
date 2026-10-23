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
    changed_files="$(git status --porcelain | awk '{print $NF}')"

    feat_count=0
    fix_count=0
    docs_count=0
    style_count=0

    for file in $changed_files; do
      if [[ "$file" =~ ^docs/ || "$file" =~ \.md$ ]]; then
        ((docs_count++)) || true
      elif [[ "$file" =~ \.(css|scss|sass)$ || "$file" =~ theme\.ts ]]; then
        ((style_count++)) || true
      elif [[ "$file" =~ test ]]; then
        ((fix_count++)) || true
      else
        ((feat_count++)) || true
      fi
    done

    if [[ $feat_count -gt 0 ]]; then
      summary="feat: update application features and services"
      branch_prefix="feat"
    elif [[ $style_count -gt 0 ]]; then
      summary="style: update theme styles and UI layouts"
      branch_prefix="style"
    elif [[ $fix_count -gt 0 ]]; then
      summary="test: update test cases and routes verification"
      branch_prefix="test"
    elif [[ $docs_count -gt 0 ]]; then
      summary="docs: update documentation and specifications"
      branch_prefix="docs"
    else
      summary="chore: auto-sync updates and configuration"
      branch_prefix="chore"
    fi

    pr_title="$summary ($timestamp)"
    pr_branch="auto/${branch_prefix}-${timestamp}"

    # Stage and commit right here (even if currently on a feature/temp branch)
    git add -A
    git commit -m "$pr_title" -m "Automated sync commit:
$(git status --short)" || true

    # Create & push the new branch
    git checkout -b "$pr_branch" || git branch -M "$pr_branch"
    log "Pushing branch $pr_branch to origin..."

    if git push -u origin "$pr_branch" --force; then
      log "Creating PR..."
      pr_url="$(gh pr create --base main --head "$pr_branch" --title "$pr_title" --body "### Automated Sync PR
- Triggered automatically by 1-minute auto-sync daemon.
- Summary: $pr_title" 2>&1 || true)"

      log "PR create output: $pr_url"
      log "Auto-merging PR..."
      gh pr merge "$pr_branch" --merge --admin --delete-branch 2>&1 || gh pr merge "$pr_branch" --merge --auto --delete-branch 2>&1 || true

      log "Syncing main locally..."
      # If there are any stray changes while PR was merging, stash them safely
      git stash --include-untracked 2>/dev/null || true
      git checkout main || true
      git pull origin main || true
      git stash pop 2>/dev/null || true

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
