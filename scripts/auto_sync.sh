#!/bin/bash
set -e

REPO_DIR="/Users/soumyachakraborty/Documents/VERCODE"
cd "$REPO_DIR"

# If previous run was interrupted on an update branch, return cleanly to main
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "[$(date)] Currently on branch '$CURRENT_BRANCH'. Attempting clean recovery to main..."
    git stash -u -m "auto-recovery-$(date +%s)" || true
    git checkout main || git switch -f main
    git pull origin main || true
    git stash pop || true
fi

# Check if there are any git changes (untracked, modified, staged, or deleted)
STATUS_OUTPUT=$(git status --porcelain)
if [[ -n "$STATUS_OUTPUT" ]]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BRANCH_NAME="update-$TIMESTAMP"

    echo "[$(date)] Changes detected. Generating meaningful commit & PR messages..."

    # Use python generator for clean conventional commits and markdown body
    PR_TITLE=$(python3 "$REPO_DIR/scripts/pr_message_generator.py" --title)
    PR_BODY=$(python3 "$REPO_DIR/scripts/pr_message_generator.py" --body)
    COMMIT_MSG="$PR_TITLE"

    echo "[$(date)] Commit message: $COMMIT_MSG"
    echo "[$(date)] Creating feature branch: $BRANCH_NAME"
    git checkout -b "$BRANCH_NAME"
    git add .
    git commit -m "$COMMIT_MSG"

    echo "[$(date)] Pushing branch: $BRANCH_NAME (no direct push to main)"
    git push origin "$BRANCH_NAME"

    echo "[$(date)] Submitting PR..."
    PR_URL=$(gh pr create --base main --head "$BRANCH_NAME" --title "$PR_TITLE" --body "$PR_BODY")
    echo "[$(date)] PR created: $PR_URL"

    # Auto merge PR into main
    echo "[$(date)] Merging PR..."
    gh pr merge "$BRANCH_NAME" --merge --delete-branch
    echo "[$(date)] PR merged and branch deleted successfully."

    # Return to main and fetch latest
    git checkout main
    git pull origin main || true
    echo "[$(date)] Main synchronized."
else
    echo "[$(date)] No changes detected."
fi
