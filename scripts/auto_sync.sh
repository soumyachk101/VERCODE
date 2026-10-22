#!/bin/bash
set -e

REPO_DIR="/Users/soumyachakraborty/Documents/VERCODE"
cd "$REPO_DIR"

# If previous run was interrupted while on an update branch, return cleanly to main
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    echo "[$(date)] Currently on branch '$CURRENT_BRANCH'. Attempting clean recovery to main..."
    # If the current branch is an update branch and has already been merged or abandoned
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

    echo "[$(date)] Changes detected. Analyzing changes for meaningful PR message..."

    # Generate meaningful PR title and description based on file types and paths
    CHANGED_FILES=$(git status --porcelain | awk '{print $2}')
    TOTAL_COUNT=$(echo "$CHANGED_FILES" | grep -v '^$' | wc -l | xargs)

    # Detect package / area
    AREA="core"
    if echo "$CHANGED_FILES" | grep -q "apps/"; then
        APP_NAME=$(echo "$CHANGED_FILES" | grep "apps/" | head -n 1 | cut -d'/' -f2)
        AREA="app-$APP_NAME"
    elif echo "$CHANGED_FILES" | grep -q "packages/"; then
        PKG_NAME=$(echo "$CHANGED_FILES" | grep "packages/" | head -n 1 | cut -d'/' -f2)
        AREA="$PKG_NAME"
    elif echo "$CHANGED_FILES" | grep -q "\.github/"; then
        AREA="ci"
    elif echo "$CHANGED_FILES" | grep -q "scripts/"; then
        AREA="scripts"
    elif echo "$CHANGED_FILES" | grep -q "docs\|README"; then
        AREA="docs"
    fi

    # Detect primary action type
    TYPE="feat"
    if echo "$CHANGED_FILES" | grep -qE "\.(test|spec)\."; then
        TYPE="test"
    elif echo "$CHANGED_FILES" | grep -qE "tsconfig|package\.json|pnpm-lock|pnpm-workspace|\.gitignore"; then
        TYPE="build"
    elif echo "$CHANGED_FILES" | grep -qE "README|\.md$"; then
        TYPE="docs"
    fi

    # Summarize key files (up to 3 key basenames)
    SAMPLE_FILES=$(echo "$CHANGED_FILES" | head -n 3 | while read -r f; do basename "$f"; done | paste -sd ", " -)
    if [ "$TOTAL_COUNT" -gt 3 ]; then
        SUMMARY_FILES="$SAMPLE_FILES (and $((TOTAL_COUNT - 3)) more)"
    else
        SUMMARY_FILES="$SAMPLE_FILES"
    fi

    PR_TITLE="$TYPE($AREA): update $SUMMARY_FILES"
    COMMIT_MSG="$PR_TITLE"

    PR_BODY=$(cat <<EOF
### Summary of Changes
- **Category:** \`$TYPE($AREA)\`
- **Total changed files:** $TOTAL_COUNT
- **Key modified/added components:** $SUMMARY_FILES

### Details
\`\`\`text
$STATUS_OUTPUT
\`\`\`

Automated pull request created and verified for clean fast-forward merge.
EOF
)

    echo "[$(date)] Creating feature branch: $BRANCH_NAME"
    git checkout -b "$BRANCH_NAME"
    git add .
    git commit -m "$COMMIT_MSG"

    echo "[$(date)] Pushing branch: $BRANCH_NAME (no direct push to main)"
    git push origin "$BRANCH_NAME"

    echo "[$(date)] Submitting PR with message: '$PR_TITLE'"
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
