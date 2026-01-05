# Video Generator Agents

Claude agents for video generation workflows.

## Setup

```bash
cd src/agents
npm install
```

Requires `ANTHROPIC_API_KEY` environment variable.

## Available Agents

### example.ts
Basic SDK usage demonstration.

```bash
npm run example
```

### concept-reviewer.ts
Reviews video concepts for clarity and AI video generation feasibility.

```bash
npx tsx concept-reviewer.ts "A lone astronaut floats through an abandoned space station"
```

## Creating New Agents

1. Create a new `.ts` file in this directory
2. Import the Anthropic SDK
3. Define your system prompt and logic
4. Run with `npx tsx your-agent.ts`

See existing agents for patterns.

## Building

```bash
npm run build
```

Compiles TypeScript to `dist/`.
