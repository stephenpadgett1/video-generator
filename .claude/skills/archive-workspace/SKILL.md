---
name: archive-workspace
description: Archive the current workspace by moving all files from data/workspace/ into a named subfolder under data/workspace-archive/. Use when finished with a project, cleaning up workspace, or archiving current work.
allowed-tools: Bash, Read, Glob
context: fork
---

# Archive Workspace

Archive one project folder from `data/workspace/<slug>/` to `data/workspace-archive/<slug>/`, preserving its internal sub-layout (`refs/`, `frames/`, `clips/`, `final/`, `scratch/`). The per-project workspace convention lives in memory: `feedback_workspace_convention.md`.

## Steps

1. **Inspect workspace** - List `data/workspace/` to see which project folders exist and, if needed, peek inside to confirm which one to archive.

2. **Pick the archive name** - Default to the project folder's own name (e.g., `hellzapoppin4-loading-dock`). Only override if the user wants a different name.

3. **Check for conflicts** - Verify `data/workspace-archive/<name>/` doesn't already exist. If it does, append a number (e.g., `hellzapoppin4-loading-dock-2`).

4. **Move the project folder intact**:
   ```bash
   mkdir -p data/workspace-archive
   mv data/workspace/<slug> data/workspace-archive/<name>
   ```
   Preserves the full sub-layout in one move — no per-file walk needed.

5. **Legacy flat workspace** - If the workspace is still flat (files directly under `data/workspace/`, no project sub-folder), fall back to the original pattern:
   ```bash
   mkdir -p data/workspace-archive/<name>
   find data/workspace/ -maxdepth 1 -not -name '.DS_Store' -not -name '.claude' -not -name 'workspace' -exec mv {} data/workspace-archive/<name>/ \;
   ```

6. **Confirm** - List the archive folder contents and confirm `data/workspace/` no longer contains the project.

## Rules

- Never delete files — only move them
- Skip `.DS_Store` and `.claude/` directory (leave in workspace)
- If the archive name already exists, append a number (e.g., `patterns-wiener-2`)
- Tell the user the archive path when done
