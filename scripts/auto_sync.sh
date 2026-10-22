#!/bin/bash
set -e

REPO_DIR="/Users/soumyachakraborty/Documents/VERCODE"
cd "$REPO_DIR"

# Check if there are any git changes (untracked, modified, staged, or deleted)
if [[ -n $(git status --porcelain) ]]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BRANCH_NAME="auto-update-$TIMESTAMP"
    COMMIT_MSG="chore: automated sync update ($TIMESTAMP)"

    echo "[$(date)] Changes detected. Processing auto-sync via PR..."

    # Ensure main is up to date
    git checkout main
    git pull origin main --rebase || true

    # Create new feature branch
    git checkout -b "$BRANCH_NAME"
    git add .
    git commit -m "$COMMIT_MSG"

    # Push feature branch (never push directly to main)
    git push origin "$BRANCH_NAME"

    # Create PR via GitHub CLI
    PR_URL=$(gh pr create --base main --head "$BRANCH_NAME" --title "$COMMIT_MSG" --body "Automated branch sync PR created by auto-sync daemon.")
    echo "[$(date)] PR created: $PR_URL"

    # Auto merge PR
    gh pr merge "$BRANCH_NAME" --merge --delete-branch
    echo "[$(date)] PR merged and branch deleted successfully."

    # Switch back to main and pull latest
    git checkout main
    git pull origin main
else
    echo "[$(date)] No changes detected."
fi
