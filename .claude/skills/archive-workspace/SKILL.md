---
name: archive-workspace
description: Archive the current workspace by moving all files from data/workspace/ into a named subfolder under data/workspace-archive/. Use when finished with a project, cleaning up workspace, or archiving current work.
allowed-tools: Bash, Read, Glob
context: fork
---

# Archive Workspace

Move all files from `data/workspace/` into `data/workspace-archive/<name>/`, choosing an appropriate archive name based on the workspace contents.

## Steps

1. **Inspect workspace** - List files in `data/workspace/` to understand what was being worked on.

2. **Determine archive name** - Choose a short, descriptive kebab-case folder name based on the content (e.g., `alphaville-moon`, `patterns-wiener`, `fox-seed-test`). Use the project/video theme, not dates or generic names.

3. **Check for conflicts** - Verify the archive name doesn't already exist in `data/workspace-archive/`.

4. **Move files** - Create the archive folder and move all files (excluding `.DS_Store` and `.claude/`):
   ```bash
   mkdir -p data/workspace-archive/<name>
   # Move all files except .DS_Store and .claude
   find data/workspace/ -maxdepth 1 -not -name '.DS_Store' -not -name '.claude' -not -name 'workspace' -exec mv {} data/workspace-archive/<name>/ \;
   ```

5. **Confirm** - List the archive folder contents and confirm the workspace is clean.

## Rules

- Never delete files — only move them
- Skip `.DS_Store` and `.claude/` directory (leave in workspace)
- If the archive name already exists, append a number (e.g., `patterns-wiener-2`)
- Tell the user the archive path when done
