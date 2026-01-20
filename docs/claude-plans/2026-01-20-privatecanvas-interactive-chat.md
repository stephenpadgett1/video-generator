# Plan: Interactive Chat Mode for PrivateCanvas

## Goal
Add an interactive REPL-style chat to PrivateCanvas so you can have back-and-forth conversations with GPT-4o, with persistent session storage.

## Current State
- `chat.ts` sends a single message and exits
- No conversation history maintained
- `CanvasClient` already supports the OpenAI messages array format internally

## Implementation

### 1. Create `src/session.ts` - Session Management

**Features:**
- Save/load conversations to `sessions/` directory as JSON files
- Each session has: id, name, messages[], created, lastUsed
- List available sessions
- Auto-save after each exchange

**Session file structure:**
```json
{
  "id": "abc123",
  "name": "Creative writing session",
  "messages": [{"role": "user", "content": "..."}, ...],
  "created": "2026-01-20T...",
  "lastUsed": "2026-01-20T..."
}
```

### 2. Create `src/interactive.ts` - Interactive Chat CLI

**Features:**
- Readline-based REPL loop (Node's built-in `readline/promises`)
- Streams responses for better UX
- Shows cost after each response
- Special commands:
  - `/quit` - Exit
  - `/clear` - Clear current conversation
  - `/new` - Start new session
  - `/list` - Show saved sessions
  - `/load <id>` - Load a session
  - `/cost` - Show budget status

**Flow:**
```
Welcome to PrivateCanvas
Loaded session: abc123 (3 messages)

> You type a message
[GPT-4o streams response...]

Cost: $0.0003 | Budget: $4.99 remaining

> Next message...
```

### 3. Extend `CanvasClient` (minor change)

Add a `chat()` method that accepts a full messages array (not just a single prompt), so conversation history can be passed in.

### 4. Add npm script

```json
"scripts": {
  "interactive": "tsx src/interactive.ts"
}
```

### Files to Create/Modify
- **Create:** `src/session.ts` - Session persistence layer
- **Create:** `src/interactive.ts` - Interactive chat loop
- **Create:** `sessions/` directory (gitignored)
- **Modify:** `src/client.ts` - Add `chat(messages)` method
- **Modify:** `package.json` - Add `interactive` script
- **Modify:** `.gitignore` - Add `sessions/`

## Verification
1. Run `npm run interactive` in the privatecanvas directory
2. Send a message, get a response
3. Send a follow-up that references the previous message (proves context works)
4. Type `/quit` to exit
5. Run `npm run interactive` again - session should auto-load
6. Verify previous messages are remembered
7. Test `/new`, `/list`, `/load` commands
