# Real-time Narrative System

A system for creating real-time, feedback-driven video narratives from a library of pre-generated clips.

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=your_key_here

# Run with dummy playback (no mpv needed, for testing selection logic)
python orchestrator.py /path/to/manifest.json /path/to/clips --dummy

# Run with real playback (requires mpv)
python orchestrator.py /path/to/manifest.json /path/to/clips
```

## Components

### manifest_loader.py
Loads and queries the clip manifest. Provides filtering by mood, tags, motion intensity, etc.

```python
from manifest_loader import ManifestLoader

loader = ManifestLoader("manifest.json", "/path/to/clips")
print(loader.stats())

# Search
dark_clips = loader.search("dark")
tense_clips = loader.filter_by_mood(["tense", "dramatic"])
```

### selector.py
LLM-based clip selection with configurable coherence levels.

```python
from manifest_loader import ManifestLoader
from selector import Selector

manifest = ManifestLoader("manifest.json")
selector = Selector(manifest)

# Configure
selector.set_coherence(0.3)  # 0=dream logic, 1=strict narrative
selector.set_direction("exploring themes of identity")

# Select clips
result = selector.select(num_selections=3)
print(result["selections"])

# Process feedback
selector.process_feedback("darker, more surreal")
```

### playback.py
Controls mpv via JSON IPC for playlist management.

```python
from playback import PlaybackController

player = PlaybackController(clips_base_path="/path/to/clips")
player.start_mpv()
player.connect()

player.add_to_playlist("clip1.mp4")
player.add_to_playlist("clip2.mp4")
player.play()

status = player.get_status()
print(f"Playing: {status.filename}, {status.position}/{status.duration}s")
```

### orchestrator.py
Main loop that ties everything together.

## Interactive Commands

When running the orchestrator:

- **Any text** - Adds as feedback to influence clip selection
- `/status` - Show current state
- `/coherence <0-1>` - Set coherence level (0=dream, 1=narrative)
- `/direction <text>` - Set narrative direction explicitly
- `/pause` / `/play` - Control playback
- `/next` - Skip current clip
- `/quit` - Exit

## Feedback Keywords

These keywords automatically update the narrative direction:
- `darker`, `lighter`
- `faster`, `slower`
- `abstract`, `narrative`
- `emotional`, `violent`, `peaceful`
- `weird`, `funny`

Or use `/direction` to set it explicitly.

## Manifest Format

Each clip in the manifest should have:

```json
{
  "filename": "clip.mp4",
  "filePath": "clip.mp4",
  "technical": {
    "durationSeconds": 8,
    "width": 720,
    "height": 1280
  },
  "analysis": {
    "description": "What happens in the clip",
    "subjects": ["subject1", "subject2"],
    "setting": "Where it takes place",
    "mood": "Emotional tone",
    "visualStyle": "Visual characteristics",
    "dominantColors": ["color1", "color2"],
    "motionIntensity": "low|medium|high",
    "audio": {
      "hasSpeech": true,
      "speechTranscript": "What is said",
      "hasMusic": false
    },
    "startsClean": true,
    "endsClean": true,
    "suggestedTags": ["tag1", "tag2"]
  }
}
```

## Configuration

In `orchestrator.py`, the `OrchestratorConfig` class controls:

```python
config = OrchestratorConfig(
    min_buffer_seconds=15.0,    # When to trigger new selection
    target_buffer_seconds=30.0,  # Target buffer time
    clips_per_selection=3,       # Clips to select per batch
    poll_interval=1.0,           # How often to check buffer
    use_dummy_playback=False,    # For testing without mpv
)
```

## Requirements

- Python 3.10+
- anthropic (pip install anthropic)
- mpv (for real playback): `apt install mpv` or `brew install mpv`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                           │
│  - Monitors playback buffer                                 │
│  - Triggers selection when buffer low                       │
│  - Routes feedback to selector                              │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌────────┐  ┌──────────┐  ┌──────────────┐
│SELECTOR│  │ PLAYBACK │  │   FEEDBACK   │
│ (LLM)  │  │  (mpv)   │  │   (stdin)    │
└────────┘  └──────────┘  └──────────────┘
    │
    ▼
┌────────┐
│MANIFEST│
│ LOADER │
└────────┘
```
