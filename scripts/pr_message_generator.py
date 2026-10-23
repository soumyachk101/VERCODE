#!/usr/bin/env python3
import sys
import subprocess
import os
from collections import defaultdict

def get_git_status():
    result = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True)
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    return lines

def analyze_changes(lines):
    if not lines:
        return "chore(core): routine maintenance update", "Routine maintenance with no detected changes."

    files = []
    actions = defaultdict(list)
    scope_counts = defaultdict(int)

    for line in lines:
        status = line[:2].strip()
        filepath = line[2:].strip()
        if " -> " in filepath:
            filepath = filepath.split(" -> ")[1].strip()
        
        # Strip trailing slash if directory
        filepath = filepath.rstrip("/")
        if not filepath:
            continue
        files.append((status, filepath))
        
        parts = filepath.split("/")
        first = parts[0]
        if first == "apps" and len(parts) > 1:
            scope = f"app-{parts[1]}"
        elif first == "packages" and len(parts) > 1:
            scope = parts[1]
        elif first.startswith(".") or first in ["ci", "workflows"]:
            scope = "ci"
        elif first in ["scripts", "bin"]:
            scope = "scripts"
        elif first in ["tests", "test", "__tests__"]:
            scope = "test"
        elif first in ["docs", "doc"] or filepath.endswith(".md"):
            scope = "docs"
        elif first in ["src", "lib", "components", "website"]:
            scope = first
        else:
            scope = "core"
        
        scope_counts[scope] += 1

        if status in ["??", "A"]:
            actions["add"].append(filepath)
        elif status == "D":
            actions["delete"].append(filepath)
        elif status == "M":
            actions["modify"].append(filepath)
        else:
            actions["update"].append(filepath)

    all_paths = [f[1] for f in files]
    total_files = len(files)
    test_files_count = sum(1 for p in all_paths if p.endswith((".test.ts", ".spec.ts", ".test.js", ".spec.js")) or "/tests/" in p or p.startswith("tests/"))
    doc_files_count = sum(1 for p in all_paths if p.endswith((".md", ".txt")) or "docs/" in p)
    build_files_count = sum(1 for p in all_paths if os.path.basename(p) in ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.base.json", ".gitignore"])

    if test_files_count == total_files:
        commit_type = "test"
    elif doc_files_count == total_files:
        commit_type = "docs"
    elif build_files_count == total_files:
        commit_type = "build"
    elif actions["delete"] and not actions["add"] and not actions["modify"]:
        commit_type = "refactor"
    elif actions["add"]:
        commit_type = "feat"
    elif actions["modify"]:
        commit_type = "feat"
    elif actions["delete"]:
        commit_type = "refactor"
    else:
        commit_type = "chore"

    # Select the most frequently touched scope
    sorted_scopes = sorted(scope_counts.items(), key=lambda x: x[1], reverse=True)
    scope = sorted_scopes[0][0] if sorted_scopes else "core"

    action_phrases = []
    if actions["add"]:
        base_names = [os.path.basename(p) for p in actions["add"] if os.path.basename(p)]
        if base_names:
            action_phrases.append(f"add {', '.join(base_names[:2])}")
    if actions["modify"]:
        base_names = [os.path.basename(p) for p in actions["modify"] if os.path.basename(p)]
        if base_names:
            action_phrases.append(f"update {', '.join(base_names[:2])}")
    if actions["delete"]:
        base_names = [os.path.basename(p) for p in actions["delete"] if os.path.basename(p)]
        if base_names:
            action_phrases.append(f"remove {', '.join(base_names[:2])}")

    if action_phrases:
        description = "; ".join(action_phrases)
    else:
        sample = [os.path.basename(p[1]) for p in files if os.path.basename(p[1])]
        description = f"update {', '.join(sample[:2])}"

    if len(files) > 2:
        description += f" (+{len(files) - 2} files)"

    commit_title = f"{commit_type}({scope}): {description}"

    body_lines = [
        "### 📌 Pull Request Overview",
        f"- **Type / Scope:** `{commit_type}({scope})`",
        f"- **Total Impacted Files:** {len(files)}",
        "",
        "### 🔍 Changes Summary"
    ]

    if actions["add"]:
        body_lines.append(f"- **New Files ({len(actions['add'])}):**")
        for f in actions["add"][:6]:
            body_lines.append(f"  - `+ {f}`")
        if len(actions["add"]) > 6:
            body_lines.append(f"  - *...and {len(actions['add']) - 6} more new files*")

    if actions["modify"]:
        body_lines.append(f"- **Modified Files ({len(actions['modify'])}):**")
        for f in actions["modify"][:6]:
            body_lines.append(f"  - `~ {f}`")
        if len(actions["modify"]) > 6:
            body_lines.append(f"  - *...and {len(actions['modify']) - 6} more modified files*")

    if actions["delete"]:
        body_lines.append(f"- **Removed Files ({len(actions['delete'])}):**")
        for f in actions["delete"][:6]:
            body_lines.append(f"  - `- {f}`")
        if len(actions["delete"]) > 6:
            body_lines.append(f"  - *...and {len(actions['delete']) - 6} more removed files*")

    body_lines.append("")
    body_lines.append("---")
    body_lines.append("*Automated pull request created with verified branch protection (no direct push to main).*")

    pr_body = "\n".join(body_lines)
    return commit_title, pr_body

if __name__ == "__main__":
    lines = get_git_status()
    title, body = analyze_changes(lines)
    if len(sys.argv) > 1 and sys.argv[1] == "--title":
        print(title)
    elif len(sys.argv) > 1 and sys.argv[1] == "--body":
        print(body)
    else:
        print(f"TITLE: {title}\n\nBODY:\n{body}")
