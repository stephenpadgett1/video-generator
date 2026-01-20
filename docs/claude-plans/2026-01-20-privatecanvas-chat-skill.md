# PrivateCanvas: Claude Code Chat Skill

## Goal
Create a `/canvas` skill invokable from Claude Code that lets you chat with GPT-4o using the PrivateCanvas client.

## Architecture

```
User types: /canvas Write me a poem about rain

Claude Code invokes skill → skill instructs Claude to run CLI
                         → CLI calls GPT-4o via PrivateCanvas client
                         → Response displayed to user
```

## Files to Create/Modify

### 1. CLI Chat Tool
**File:** `data/projects/privatecanvas/src/chat.ts`

Simple CLI that:
- Takes prompt as command-line argument
- Optionally accepts system message via `--system` flag
- Sends to GPT-4o, outputs response
- Shows cost/usage info at end

```bash
# Usage
npx tsx src/chat.ts "Write a poem about rain"
npx tsx src/chat.ts --system "You are a poet" "Write about rain"
```

### 2. Claude Code Skill
**File:** `.claude/commands/canvas.md`

Skill definition that instructs Claude to:
- Run the chat CLI with user's message
- Display the GPT-4o response
- Show remaining budget

### 3. Package.json Script
**File:** `data/projects/privatecanvas/package.json`

Add `chat` script for convenience:
```json
"scripts": {
  "chat": "tsx src/chat.ts"
}
```

## Implementation Details

### chat.ts Structure
```typescript
import "dotenv/config";
import { CanvasClient, DailyLimitExceededError } from "./client.js";
import { parseArgs } from "util";

// Parse --system flag and positional prompt
// Create client, send message, print response
// Print cost and remaining budget
```

### canvas.md Skill
```yaml
---
description: Chat with GPT-4o via PrivateCanvas
argument-hint: <your message>
---
```

Instructions tell Claude to:
1. Run `npm run chat -- "$ARGUMENTS"` in the privatecanvas directory
2. Display the response
3. Handle errors gracefully

## Verification
1. Test CLI directly: `cd data/projects/privatecanvas && npm run chat -- "Hello"`
2. Test skill: Type `/canvas Hello` in Claude Code
3. Verify cost tracking updates in `logs/usage.json`
