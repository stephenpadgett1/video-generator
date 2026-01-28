# Session Startup

Orient to the current project state:

1. **Check git status**: What branch are we on? Any uncommitted changes or WIP commits?

2. **Review recent session history**: Read the most recent entries in the session log or CLAUDE.md for context on what was accomplished and where we left off.

3. **Scan recent plans**: Check the following locations for recent plan files (last few days) that might still be in progress:
   - `./.claude/plans/` - Local active plans (primary location)
   - `./docs/claude-plans/` - Archived session plans
   - **Important**: Only read from local project directories. Do NOT read from ~/.claude/plans/ (global plans may contain content from other projects)

4. **Summarize**: Provide a brief orientation:
   - Current branch and its purpose
   - What was last worked on
   - Any incomplete work or known next steps
   - Ask if we're continuing previous work or starting something new