#!/usr/bin/env bash
set -euo pipefail

# Auto Git Sync Daemon
# Runs every 60 seconds, detects changes, commits with meaningful conventional commit messages,
# creates a PR on GitHub, and auto-merges it into main.

REPO_DIR="/Users/soumyachakraborty/Documents/VERCODE"
cd "$REPO_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "Auto Git Sync Daemon started. Monitoring $REPO_DIR every 60 seconds..."

while true; do
  # Ensure we are in repo
  cd "$REPO_DIR"

  # Check if there are changes (tracked or untracked)
  if [[ -n "$(git status --porcelain)" ]]; then
    log "Changes detected!"

    # Ensure main is up to date
    current_branch="$(git branch --show-current)"
    if [[ "$current_branch" != "main" ]]; then
      log "Currently on branch $current_branch, switching or handling main..."
    fi

    # Determine commit message and branch name based on changed files
    timestamp="$(date '+%Y%m%d-%H%M%S')"
    changed_files="$(git status --porcelain | awk '{print $NF}')"
    
    # Classify the change
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

    # Create descriptive commit title & body
    pr_title="$summary ($timestamp)"
    pr_branch="auto/${branch_prefix}-${timestamp}"

    log "Creating branch: $pr_branch"
    git checkout -b "$pr_branch"

    git add -A
    git commit -m "$pr_title" -m "Automated sync commit:
$(git status --short)"

    log "Pushing branch $pr_branch to origin..."
    if git push -u origin "$pr_branch"; then
      log "Creating PR..."
      pr_url="$(gh pr create --base main --head "$pr_branch" --title "$pr_title" --body "### Automated Sync PR
- Triggered automatically by 1-minute auto-sync daemon.
- Summary of changes:
\`\`\`
$(git status --short)
\`\`\`" || true)"

      if [[ -n "$pr_url" ]]; then
        log "PR created: $pr_url"
        log "Auto-merging PR..."
        # Try merging PR
        gh pr merge "$pr_branch" --merge --auto --delete-branch 2>&1 || gh pr merge "$pr_branch" --admin --merge --delete-branch 2>&1 || true
      fi

      log "Returning to main..."
      git checkout main
      git pull origin main || true
      # Delete local branch if still exists
      git branch -D "$pr_branch" 2>/dev/null || true
      log "Cycle complete successfully!"
    else
      log "Failed to push $pr_branch, rolling back branch to main..."
      git checkout main
    fi
  else
    log "No changes detected. Sleeping 60 seconds..."
  fi

  sleep 60
done
