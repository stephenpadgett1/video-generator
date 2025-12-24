# Video Pipeline Local

A local web application for AI-assisted video production, integrating multiple AI services for end-to-end short-form video creation.

## Features

- **Project Generation**: Use Claude to generate shot lists with Veo prompts and VO scripts from a creative brief
- **Video Generation**: Generate video clips using Google Veo 3.1 via Vertex AI
- **Reference Shots**: Use frames from earlier shots to maintain visual continuity across clips
- **Voiceover Generation**: Generate VO takes using ElevenLabs
- **AI Video Analysis**: Analyze generated clips using Gemini 2.5 Flash
- **AI Review**: Claude reviews options and selects the best take (with frame extraction)
- **Auto VO Selection**: Automatically selects VO takes that fit within clip duration
- **Video Assembly**: Concatenate selected clips with VO using ffmpeg

## Prerequisites

- Node.js 18+
- ffmpeg installed and available in PATH
- API credentials for:
  - Claude (Anthropic API key)
  - ElevenLabs (API key)
  - Google Cloud (Service account JSON with Vertex AI access)

## Setup

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/video-pipeline-local.git
cd video-pipeline-local
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node server.js
```

4. Open http://localhost:3000 in your browser

5. Click the ⚙️ Settings button and configure:
   - Claude API Key
   - ElevenLabs API Key  
   - Veo Service Account Path (path to your GCP service account JSON file)

## Google Cloud Setup

1. Create a GCP project
2. Enable the Vertex AI API
3. Create a service account with the `roles/aiplatform.user` role
4. Download the service account JSON key file
5. Enter the path to this file in Settings

## Usage

1. **Generate or Load a Project**: Enter a creative brief and click "Generate Project", or use the default "Hold Music" project
2. **Generate Clips**: For each shot, click "Generate with Veo" to create video options
3. **Generate VO**: For shots with voiceover, click "Generate VO" to create takes
4. **Describe & Review**: Use "Describe" to get AI analysis of clips, then "Run AI Review" to auto-select the best option
5. **Assemble**: Once shots are selected, click "Assemble Video" to create the final cut

## Project Structure

```
video-pipeline-local/
├── server.js          # Express server with API proxies
├── public/
│   ├── index.html     # Main HTML page
│   └── app.jsx        # React application (served via Babel standalone)
├── package.json
└── data/              # Created at runtime (gitignored)
    ├── config.json    # API keys and settings
    ├── projects/      # Saved project files
    ├── audio/         # Generated VO files
    ├── video/         # Generated video clips
    └── exports/       # Assembled videos
```

## Work in Progress

This is an active development project. Current limitations:
- Single project at a time
- No batch operations
- Basic error handling
- Designed for 9:16 vertical short-form video

## Credits

Built with Claude (Anthropic), as part of an ongoing video art project exploring AI-assisted creative workflows.

## License

MIT
