# Veo Clips MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that provides AI assistants with searchable access to a library of AI-generated video clips from Google Veo.

## What is this?

This is a "Take a Clip, Leave a Clip" style open library of AI-generated video clips. The MCP server exposes rich metadata about each clip, enabling AI assistants to:

- **Search** clips by subject, mood, visual style, duration, and more
- **Find edit-compatible clips** that cut together well
- **Get detailed analysis** including usable segments, discontinuities, audio content
- **Access raw JSON** for programmatic workflows

Think of it as an AI-native asset library where the manifest *is* the interface.

## Features

### Tools

| Tool | Description |
|------|-------------|
| `search_clips` | Search by text query, subjects, mood, style, duration, motion, audio, edit compatibility |
| `get_clip_details` | Get full metadata and analysis for a specific clip |
| `get_clip_json` | Get raw JSON for programmatic use |
| `list_subjects` | List all subjects in the library with counts |
| `list_moods` | List all mood descriptors |
| `get_library_stats` | Overall library statistics |
| `find_edit_compatible_clips` | Find clips that cut well together |

### Resources

| Resource | Description |
|----------|-------------|
| `veo://manifest` | Full manifest JSON with all clip metadata |

## Installation

### Prerequisites

- Node.js 18+
- An MCP-compatible client (Claude Desktop, VS Code, Cursor, etc.)

### Setup

```bash
# Clone or download this repository
git clone https://github.com/YOUR_USERNAME/veo-clips-mcp
cd veo-clips-mcp

# Install dependencies
npm install

# Build
npm run build
```

### Configure your MCP client

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "veo-clips": {
      "command": "node",
      "args": ["/path/to/veo-clips-mcp/dist/server.js"]
    }
  }
}
```

#### VS Code

```bash
code --add-mcp '{"name":"veo-clips","type":"stdio","command":"node","args":["/path/to/veo-clips-mcp/dist/server.js"]}'
```

#### Claude Code

```bash
claude mcp add veo-clips node /path/to/veo-clips-mcp/dist/server.js
```

## Usage Examples

Once connected, you can ask your AI assistant things like:

- "Search for robot clips with an ominous mood"
- "Find clips that would cut well after this one: [filename]"
- "What subjects are available in the clip library?"
- "Show me vertical video clips under 6 seconds that start and end cleanly"
- "Get the full details for 16mm_film_projection_202512042015_c2y8d.mp4"

## Clip Metadata Schema

Each clip includes rich AI-generated analysis:

```typescript
{
  filename: string;
  technical: {
    durationSeconds: number;
    width: number;
    height: number;
    aspectRatio: string;
    fileSizeBytes: number;
  };
  analysis: {
    description: string;
    subjects: string[];
    setting: string;
    mood: string;
    visualStyle: string;
    dominantColors: string[];
    cameraWork: string;
    audio: {
      hasSpeech: boolean;
      speechTranscript: string | null;
      hasMusic: boolean;
      musicDescription: string | null;
      ambientSounds: string;
    };
    motionIntensity: "low" | "medium" | "high";
    usableSegments: Array<{
      startSeconds: number;
      endSeconds: number;
      quality: string;
      notes: string;
    }>;
    startsClean: boolean;
    endsClean: boolean;
    discontinuities: Array<{
      atSeconds: number;
      type: string;
      description: string;
    }>;
    suggestedTags: string[];
  };
}
```

## Accessing the Actual Video Files

The manifest contains metadata only. To access the actual video files:

1. **Public Google Drive folder**: [LINK TO BE ADDED]
2. Use the `filename` from the metadata to locate the specific clip
3. Download or stream as needed

## Contributing Your Own Clips

This is intended to be a community resource. To contribute:

1. Generate clips using Google Veo (or other AI video generators)
2. Run the analysis script to generate metadata (see `/scripts/analyze.js`)
3. Submit a PR with your clips and updated manifest

## Development

```bash
# Run in development mode (with hot reload)
npm run dev

# Test with MCP Inspector
npm run inspector

# Build for production
npm run build
```

## Technical Details

- Built with the official [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- Uses stdio transport for maximum compatibility
- Manifest is loaded at startup for fast queries
- No external API calls - all data is local

## License

MIT - Use these clips freely in your projects.

## Credits

- Clips generated using [Google Veo](https://deepmind.google/technologies/veo/)
- Metadata analysis by [Gemini](https://deepmind.google/technologies/gemini/)
- MCP server implementation using [Model Context Protocol](https://modelcontextprotocol.io)
