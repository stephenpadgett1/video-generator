# Veo Clips MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that provides AI assistants with searchable access to a library of AI-generated video clips from Google Veo.

## What is this?

A read-only library of AI-generated video clips with rich, searchable metadata. The MCP server lets AI assistants query the library to find clips by subject, mood, visual style, and more—then users can download the actual files from Google Drive.

**Video files**: https://drive.google.com/drive/folders/1QcWDtX4-2MMnwe-lHZ8HkfYrKti36BD1

## Available Tools

| Tool | Description |
|------|-------------|
| `search_clips` | Search by text query, subjects, mood, style, duration, motion, audio, edit compatibility |
| `get_clip_details` | Get full metadata and analysis for a specific clip |
| `get_clip_json` | Get raw JSON for programmatic use |
| `list_subjects` | List all subjects in the library with counts |
| `list_moods` | List all mood descriptors |
| `get_library_stats` | Overall library statistics |
| `find_edit_compatible_clips` | Find clips that cut well together |

## Installation

### Prerequisites

- Node.js 18+
- An MCP-compatible client (Claude Desktop, VS Code, Cursor, etc.)

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/veo-clips-mcp
cd veo-clips-mcp
npm install
npm run build
```

### Configure your MCP client

**Claude Desktop** — Add to `claude_desktop_config.json`:

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

Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**VS Code**:
```bash
code --add-mcp '{"name":"veo-clips","type":"stdio","command":"node","args":["/path/to/veo-clips-mcp/dist/server.js"]}'
```

**Claude Code**:
```bash
claude mcp add veo-clips node /path/to/veo-clips-mcp/dist/server.js
```

After configuring, restart your client. You should see the tools become available.

## Usage

Once connected, ask your AI assistant things like:

- "What's in the video clip library?"
- "Search for robot clips with an ominous mood"
- "Find vertical clips under 6 seconds that start and end cleanly"
- "Show me clips with high motion intensity"
- "Get details for 16mm_film_projection_202512042015_c2y8d.mp4"
- "Find clips that would cut well after [filename]"

### Example: search_clips

Query:
```json
{
  "query": "cinematic",
  "mood": "ominous", 
  "startsClean": true,
  "endsClean": true,
  "limit": 3
}
```

Response:
```
Found 3 clip(s):

**1920s_ireland_setting_202512220458_v5kkp.mp4**
- Duration: 8s | 1280:720
- Mood: Ominous, mysterious, gothic, suspenseful
- Subjects: vintage car, mansion, forest, rain, driveway
- Motion: medium
- Starts clean: true | Ends clean: true
- Description: A point-of-view shot from the hood of a vintage car as it drives down a muddy, tree-lined path towards a large, old mansion in the rain...

**A_squad_of_202512090903_x5vl7.mp4**
- Duration: 8s | 1280:720
- Mood: Ominous, threatening, dystopian, apocalyptic, grim
- Subjects: robots, androids, cyborgs, robot army, ruins, destroyed city, fire
- Motion: low
- Starts clean: true | Ends clean: true
- Description: An army of menacing, Terminator-like robots with glowing red eyes marches forward through the rainy, fiery ruins of a destroyed city...
```

### Downloading Clips

1. Use the MCP tools to find clips you want
2. Note the filename(s)
3. Go to the [Google Drive folder](https://drive.google.com/drive/folders/1QcWDtX4-2MMnwe-lHZ8HkfYrKti36BD1)
4. Search (Ctrl/Cmd+F) for the filename and download

## Clip Metadata Schema

Each clip includes AI-generated analysis:

```typescript
{
  filename: string;
  technical: {
    durationSeconds: number;
    width: number;
    height: number;
    aspectRatio: string;        // e.g., "720:1280" (vertical), "1280:720" (horizontal)
    fileSizeBytes: number;
  };
  analysis: {
    description: string;        // Full description of the clip content
    subjects: string[];         // People, objects, concepts in the clip
    setting: string;            // Location/environment description
    mood: string;               // Emotional tone (e.g., "ominous, mysterious")
    visualStyle: string;        // Aesthetic description
    dominantColors: string[];
    cameraWork: string;         // Camera movement/framing description
    audio: {
      hasSpeech: boolean;
      speechTranscript: string | null;
      hasMusic: boolean;
      musicDescription: string | null;
      ambientSounds: string;
    };
    motionIntensity: "low" | "medium" | "high";
    startsClean: boolean;       // Good for editing - clean start
    endsClean: boolean;         // Good for editing - clean end
    usableSegments: Array<{
      startSeconds: number;
      endSeconds: number;
      quality: string;
      notes: string;
    }>;
    discontinuities: Array<{    // Jump cuts, artifacts, glitches
      atSeconds: number;
      type: string;
      description: string;
    }>;
    suggestedTags: string[];
  };
}
```

## License

MIT — Use these clips freely in your projects.

## Credits

- Clips generated using [Google Veo](https://deepmind.google/technologies/veo/)
- Metadata analysis by [Gemini](https://deepmind.google/technologies/gemini/)
- MCP implementation using [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
