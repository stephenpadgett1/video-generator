# Session Closeout

Perform the following closeout sequence:

1. **Document current state**: Update CLAUDE.md or a session log with:
   - What was accomplished this session
   - Where we stopped / what's in progress
   - Any known issues or next steps

2. **Stage and commit working changes**: 
   - Review any uncommitted changes
   - Create a descriptive commit for the current work state
   - If work is incomplete, prefix commit with "WIP:" 

3. **Copy plan files**:
   - Copy any .md files from ~/.claude/plans/ that were modified today to ./docs/claude-plans/ (create directory if needed)
   - Rename them with descriptive names based on their content (e.g., "2025-01-05-auth-refactor-plan.md")

4. **Commit plan files**:
   - Stage the copied plan files
   - Commit with message "docs: add Claude Code session plans from [date]"

5. **Push to origin**:
   - Push current branch to origin

6. **Summary**: Provide a brief summary of what was committed and pushed.

7. **Confirm clean state**:
   - Run `git status` to verify working tree is clean
   - If anything remains unstaged, flag it for the human to review before ending session