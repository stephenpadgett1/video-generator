# Session Closeout

Perform the following closeout sequence:

1. **Document current state**: Update CLAUDE.md or a session log with:
   - What was accomplished this session
   - Where we stopped / what's in progress
   - Any known issues or next steps

2. **Scan for sensitive/unrelated content**:
   Before staging anything, scan all files about to be committed:

   a. **Check for secrets** - Search staged files and plan files for:
      - API keys, tokens (patterns like `sk-`, `sk_`, `api_key`, `apikey`, `token`)
      - Passwords, secrets, credentials
      - Service account JSON files
      - `.env` file contents

   b. **Check for unrelated project content** - Look for files that don't belong:
      - References to other project names (e.g., "privatecanvas", unrelated codebases)
      - Content obviously unrelated to video-generator (physics, unrelated business docs)
      - Personal notes, journals, or private communications

   c. **If anything suspicious is found**:
      - List each finding with file path and concern
      - Use AskUserQuestion to confirm: "These files contain potentially sensitive or unrelated content. Should I: (1) Exclude them from commit, (2) Include anyway, (3) Let me review each individually"
      - Do NOT proceed with commit until user confirms

3. **Stage and commit working changes**:
   - Review any uncommitted changes
   - Create a descriptive commit for the current work state
   - If work is incomplete, prefix commit with "WIP:"

4. **Copy plan files**:
   - Copy any .md files from ./.claude/plans/ (local project plans) that were modified today to ./docs/claude-plans/ (create directory if needed)
   - **Important**: Only use the local ./.claude/plans/ directory. Do NOT read from ~/.claude/plans/ (global plans may contain content from other projects)
   - Rename them with descriptive names based on their content (e.g., "2025-01-05-auth-refactor-plan.md")
   - **Re-scan copied plan files** for sensitive content before staging (plan files often contain implementation details that may reference secrets or wrong projects)

5. **Commit plan files**:
   - Stage the copied plan files
   - Commit with message "docs: add Claude Code session plans from [date]"

6. **Pre-push review**:
   - Show a summary of all commits about to be pushed (`git log origin/main..HEAD --oneline`)
   - List any new files being introduced
   - If any files were flagged during the sensitive content scan but included anyway, remind the user here
   - Use AskUserQuestion: "Ready to push these commits to origin? (Yes / No, let me review first)"

7. **Push to origin**:
   - Only after user confirms, push current branch to origin

8. **Summary**: Provide a brief summary of what was committed and pushed.

9. **Confirm clean state**:
   - Run `git status` to verify working tree is clean
   - If anything remains unstaged, flag it for the human to review before ending session