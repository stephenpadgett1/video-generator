import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get the directory of this file for resolving manifest path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

// Base URL for Google Drive folder where clips are hosted
// Users should update this to their own public Google Drive folder URL
const DRIVE_BASE_URL = process.env.DRIVE_BASE_URL || "https://drive.google.com/drive/folders/YOUR_FOLDER_ID";

// =============================================================================
// TYPES
// =============================================================================

interface AudioAnalysis {
  hasSpeech: boolean;
  speechTranscript: string | null;
  hasMusic: boolean;
  musicDescription: string | null;
  ambientSounds: string | null;
}

interface UsableSegment {
  startSeconds: number;
  endSeconds: number;
  quality: string;
  notes: string;
}

interface Discontinuity {
  atSeconds: number;
  type: string;
  description: string;
}

interface ClipAnalysis {
  description: string;
  subjects: string[];
  setting: string;
  mood: string;
  visualStyle: string;
  dominantColors: string[];
  cameraWork: string;
  audio: AudioAnalysis;
  motionIntensity: string;
  usableSegments: UsableSegment[];
  startsClean: boolean;
  endsClean: boolean;
  hasTextOrGraphics: boolean;
  textOrGraphicsNotes: string;
  discontinuities: Discontinuity[];
  technicalNotes: string;
  suggestedTags: string[];
  promptMatch: string | null;
}

interface ClipTechnical {
  durationSeconds: number;
  width: number;
  height: number;
  aspectRatio: string;
  fileSizeBytes: number;
  fileSizeMB: string;
}

interface Clip {
  filename: string;
  filePath: string;
  originalPrompt: string | null;
  technical: ClipTechnical;
  analysis: ClipAnalysis;
  analyzedAt: string;
  error?: string;
}

interface Manifest {
  generatedAt: string;
  model: string;
  totalClips: number;
  clips: (Clip | { filename: string; error: string })[];
}

// =============================================================================
// NULL-SAFE HELPERS
// =============================================================================

// Safely get a string field, returning empty string if undefined/null
function safeStr(value: string | undefined | null): string {
  return value || '';
}

// Safely get an array field, returning empty array if undefined/null
function safeArr<T>(value: T[] | undefined | null): T[] {
  return value || [];
}

// Safely get a boolean field, returning false if undefined/null
function safeBool(value: boolean | undefined | null): boolean {
  return value === true;
}

// =============================================================================
// LOAD MANIFEST
// =============================================================================

function loadManifest(): Manifest {
  const manifestPath = join(__dirname, "..", "manifest.json");
  const data = readFileSync(manifestPath, "utf-8");
  return JSON.parse(data);
}

function getAnalyzedClips(manifest: Manifest): Clip[] {
  return manifest.clips.filter((clip): clip is Clip => 
    "analysis" in clip && clip.analysis !== undefined
  );
}

// =============================================================================
// SEARCH HELPERS
// =============================================================================

function searchClips(
  clips: Clip[],
  options: {
    query?: string;
    subjects?: string[];
    mood?: string;
    visualStyle?: string;
    minDuration?: number;
    maxDuration?: number;
    motionIntensity?: string;
    hasMusic?: boolean;
    hasSpeech?: boolean;
    startsClean?: boolean;
    endsClean?: boolean;
    aspectRatio?: string;
    limit?: number;
  }
): Clip[] {
  let results = clips;

  // Text search across description, subjects, mood, visualStyle, tags
  if (options.query) {
    const queryLower = options.query.toLowerCase();
    results = results.filter((clip) => {
      const searchable = [
        safeStr(clip.analysis?.description),
        safeStr(clip.analysis?.mood),
        safeStr(clip.analysis?.visualStyle),
        safeStr(clip.analysis?.setting),
        ...safeArr(clip.analysis?.subjects),
        ...safeArr(clip.analysis?.suggestedTags),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(queryLower);
    });
  }

  // Filter by subjects (any match)
  if (options.subjects && options.subjects.length > 0) {
    const subjectsLower = options.subjects.map((s) => s.toLowerCase());
    results = results.filter((clip) => {
      const clipSubjects = safeArr(clip.analysis?.subjects);
      return clipSubjects.some((s) => subjectsLower.some((qs) => s.toLowerCase().includes(qs)));
    });
  }

  // Filter by mood (partial match)
  if (options.mood) {
    const moodLower = options.mood.toLowerCase();
    results = results.filter((clip) => safeStr(clip.analysis?.mood).toLowerCase().includes(moodLower));
  }

  // Filter by visual style (partial match)
  if (options.visualStyle) {
    const styleLower = options.visualStyle.toLowerCase();
    results = results.filter((clip) => safeStr(clip.analysis?.visualStyle).toLowerCase().includes(styleLower));
  }

  // Duration filters
  if (options.minDuration !== undefined) {
    results = results.filter((clip) => clip.technical.durationSeconds >= options.minDuration!);
  }
  if (options.maxDuration !== undefined) {
    results = results.filter((clip) => clip.technical.durationSeconds <= options.maxDuration!);
  }

  // Motion intensity
  if (options.motionIntensity) {
    results = results.filter(
      (clip) => safeStr(clip.analysis?.motionIntensity).toLowerCase() === options.motionIntensity!.toLowerCase()
    );
  }

  // Audio filters
  if (options.hasMusic !== undefined) {
    results = results.filter((clip) => safeBool(clip.analysis?.audio?.hasMusic) === options.hasMusic);
  }
  if (options.hasSpeech !== undefined) {
    results = results.filter((clip) => safeBool(clip.analysis?.audio?.hasSpeech) === options.hasSpeech);
  }

  // Clean start/end filters
  if (options.startsClean !== undefined) {
    results = results.filter((clip) => safeBool(clip.analysis?.startsClean) === options.startsClean);
  }
  if (options.endsClean !== undefined) {
    results = results.filter((clip) => safeBool(clip.analysis?.endsClean) === options.endsClean);
  }

  // Aspect ratio
  if (options.aspectRatio) {
    results = results.filter((clip) => clip.technical.aspectRatio === options.aspectRatio);
  }

  // Apply limit
  if (options.limit && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return results;
}

// =============================================================================
// GEMINI AI HELPERS
// =============================================================================

const GEMINI_FLASH_MODEL = "gemini-2.0-flash";
const GEMINI_PRO_MODEL = "gemini-2.5-pro";
const GEMINI_REGION = "us-central1";

// Token cache for gcloud auth
let cachedAccessToken: string | null = null;
let tokenFetchedAt = 0;
const TOKEN_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

function getAccessToken(): string {
  const now = Date.now();
  if (!cachedAccessToken || (now - tokenFetchedAt) > TOKEN_REFRESH_INTERVAL) {
    try {
      cachedAccessToken = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
      tokenFetchedAt = now;
    } catch (err) {
      throw new Error('Failed to get access token. Run: gcloud auth application-default login');
    }
  }
  return cachedAccessToken;
}

function getProjectId(): string {
  const projectId = process.env.GOOGLE_PROJECT_ID;
  if (!projectId) {
    try {
      return execSync('gcloud config get-value project', { encoding: 'utf8' }).trim();
    } catch {
      throw new Error('GOOGLE_PROJECT_ID not set and gcloud project not configured');
    }
  }
  return projectId;
}

interface SlotRequirements {
  mood: string;
  subjects?: string[];
  aspectRatio?: string;
  mustStartClean?: boolean;
  mustEndClean?: boolean;
}

interface AlternativeClip {
  filename: string;
  reasoning: string;
}

interface SelectionResult {
  selected: string | null;
  reasoning: string;
  alternatives: AlternativeClip[];
}

async function selectClipForSlot(
  allClips: Clip[],
  requirements: SlotRequirements
): Promise<SelectionResult> {
  // Step 1: Pre-filter candidates using existing search logic
  const candidates = searchClips(allClips, {
    mood: requirements.mood,
    aspectRatio: requirements.aspectRatio,
    startsClean: requirements.mustStartClean,
    endsClean: requirements.mustEndClean,
    limit: 15
  });

  // Step 2: Check if we have any candidates
  if (candidates.length === 0) {
    return {
      selected: null,
      reasoning: "No clips match basic filters",
      alternatives: []
    };
  }

  // Step 3: Build prompt for Gemini
  const candidatesList = candidates.map(c => {
    const subjects = safeArr(c.analysis?.subjects);
    return `- ${c.filename}: mood="${safeStr(c.analysis?.mood)}", subjects=[${subjects.join(', ')}], description="${safeStr(c.analysis?.description).slice(0, 150)}"`;
  }).join('\n');

  const prompt = `Select the best clip for this slot, plus up to 3 alternatives ranked by fit.

Slot requirements:
- Mood: ${requirements.mood}
- Subjects: ${requirements.subjects?.join(', ') || "any"}

Candidates:
${candidatesList}

Return JSON only:
{
  "selected": "filename" or null,
  "reasoning": "why this is the best choice",
  "alternatives": [
    { "filename": "...", "reasoning": "why this is a viable alternative" },
    { "filename": "...", "reasoning": "..." }
  ]
}
If no clips fit, set selected to null and alternatives to empty array.`;

  // Step 4: Call Gemini Flash
  try {
    const accessToken = getAccessToken();
    const projectId = getProjectId();

    const response = await fetch(
      `https://${GEMINI_REGION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${GEMINI_REGION}/publishers/google/models/${GEMINI_FLASH_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return {
        selected: null,
        reasoning: `Gemini API error: ${response.status} - ${error}`,
        alternatives: []
      };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Step 5: Parse response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        selected: parsed.selected || null,
        reasoning: parsed.reasoning || "No reasoning provided",
        alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : []
      };
    }

    return {
      selected: null,
      reasoning: `Could not parse Gemini response: ${text.slice(0, 100)}`,
      alternatives: []
    };

  } catch (err) {
    return {
      selected: null,
      reasoning: `Error calling Gemini: ${err instanceof Error ? err.message : String(err)}`,
      alternatives: []
    };
  }
}

async function generateVeoPrompt(
  requirements: SlotRequirements,
  prevClip: Clip | null,
  nextClip: Clip | null
): Promise<string> {
  const systemPrompt = `Generate a Veo video generation prompt for a clip with these requirements:

Mood: ${requirements.mood}
Subjects: ${requirements.subjects?.join(', ') || "open to interpretation"}
Format: ${requirements.aspectRatio || "any"}
Duration: approximately 8 seconds
${requirements.mustStartClean ? "Must have a clean opening frame suitable for editing." : ""}
${requirements.mustEndClean ? "Must have a clean ending suitable for editing." : ""}

Context - neighboring clips in sequence:
- Previous: ${prevClip ? safeStr(prevClip.analysis?.description) : "none"}
- Next: ${nextClip ? safeStr(nextClip.analysis?.description) : "none"}

Write a concise, effective prompt for Veo. Focus on visual description, mood, and camera movement. Return ONLY the prompt text, no explanations.`;

  try {
    const accessToken = getAccessToken();
    const projectId = getProjectId();

    const response = await fetch(
      `https://${GEMINI_REGION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${GEMINI_REGION}/publishers/google/models/${GEMINI_PRO_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: systemPrompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return `[Error generating prompt: ${response.status}]`;
    }

    const data = await response.json();
    // Join all parts in case response is split across multiple parts
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p: { text?: string }) => p.text || '').join('');
    return text.trim();

  } catch (err) {
    return `[Error: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

function formatClipSummary(clip: Clip): string {
  const subjects = safeArr(clip.analysis?.subjects);
  return `**${clip.filename}**
- Duration: ${clip.technical.durationSeconds}s | ${clip.technical.aspectRatio}
- Mood: ${safeStr(clip.analysis?.mood) || "N/A"}
- Subjects: ${subjects.length > 0 ? subjects.join(", ") : "N/A"}
- Motion: ${safeStr(clip.analysis?.motionIntensity) || "N/A"}
- Starts clean: ${safeBool(clip.analysis?.startsClean)} | Ends clean: ${safeBool(clip.analysis?.endsClean)}
- Description: ${(safeStr(clip.analysis?.description) || "No description").slice(0, 200)}...`;
}

function formatClipFull(clip: Clip): string {
  const subjects = safeArr(clip.analysis?.subjects);
  const colors = safeArr(clip.analysis?.dominantColors);
  const tags = safeArr(clip.analysis?.suggestedTags);
  const segments = safeArr(clip.analysis?.usableSegments);
  const discontinuities = safeArr(clip.analysis?.discontinuities);
  
  return `# ${clip.filename}

## Technical Details
- Duration: ${clip.technical.durationSeconds} seconds
- Resolution: ${clip.technical.width}x${clip.technical.height}
- Aspect Ratio: ${clip.technical.aspectRatio}
- File Size: ${clip.technical.fileSizeMB} MB

## Analysis
**Description:** ${safeStr(clip.analysis?.description) || "N/A"}

**Subjects:** ${subjects.length > 0 ? subjects.join(", ") : "N/A"}

**Setting:** ${safeStr(clip.analysis?.setting) || "N/A"}

**Mood:** ${safeStr(clip.analysis?.mood) || "N/A"}

**Visual Style:** ${safeStr(clip.analysis?.visualStyle) || "N/A"}

**Dominant Colors:** ${colors.length > 0 ? colors.join(", ") : "N/A"}

**Camera Work:** ${safeStr(clip.analysis?.cameraWork) || "N/A"}

**Motion Intensity:** ${safeStr(clip.analysis?.motionIntensity) || "N/A"}

## Audio
- Has Speech: ${clip.analysis?.audio?.hasSpeech ?? "N/A"}${clip.analysis?.audio?.speechTranscript ? ` ("${clip.analysis.audio.speechTranscript}")` : ""}
- Has Music: ${clip.analysis?.audio?.hasMusic ?? "N/A"}${clip.analysis?.audio?.musicDescription ? ` (${clip.analysis.audio.musicDescription})` : ""}
- Ambient Sounds: ${clip.analysis?.audio?.ambientSounds || "None noted"}

## Usability
- Starts Clean: ${safeBool(clip.analysis?.startsClean)}
- Ends Clean: ${safeBool(clip.analysis?.endsClean)}
- Has Text/Graphics: ${safeBool(clip.analysis?.hasTextOrGraphics)}${clip.analysis?.textOrGraphicsNotes ? ` (${clip.analysis.textOrGraphicsNotes})` : ""}

### Usable Segments
${segments.length > 0 ? segments.map((seg) => `- ${seg.startSeconds}s-${seg.endSeconds}s (${seg.quality}): ${seg.notes}`).join("\n") : "None specified"}

### Discontinuities
${discontinuities.length > 0 ? discontinuities.map((d) => `- @${d.atSeconds}s [${d.type}]: ${d.description}`).join("\n") : "None"}

## Tags
${tags.length > 0 ? tags.join(", ") : "N/A"}

## Technical Notes
${safeStr(clip.analysis?.technicalNotes) || "N/A"}`;
}

// =============================================================================
// CREATE MCP SERVER
// =============================================================================

const server = new McpServer({
  name: "veo-clips-library",
  version: "1.0.0",
});

// Load manifest at startup
const manifest = loadManifest();
const clips = getAnalyzedClips(manifest);

console.error(`Loaded ${clips.length} analyzed clips from manifest (${manifest.totalClips} total)`);

// =============================================================================
// TOOLS
// =============================================================================

// Tool: Search clips with various filters
server.registerTool(
  "search_clips",
  {
    title: "Search Video Clips",
    description: `Search the Veo AI-generated video clip library. You can search by:
- Free text query (searches descriptions, subjects, mood, style, tags)
- Specific subjects (e.g., "robot", "nature", "person")
- Mood (e.g., "ominous", "peaceful", "energetic")
- Visual style (e.g., "cinematic", "retro", "dark")
- Duration range
- Motion intensity (low/medium/high)
- Audio properties (has music, has speech)
- Edit compatibility (starts clean, ends clean)
- Aspect ratio

Returns summaries of matching clips. Use get_clip_details for full information.`,
    inputSchema: {
      query: z.string().optional().describe("Free text search across all clip metadata"),
      subjects: z.array(z.string()).optional().describe("Filter by subjects (any match)"),
      mood: z.string().optional().describe("Filter by mood (partial match)"),
      visualStyle: z.string().optional().describe("Filter by visual style (partial match)"),
      minDuration: z.number().optional().describe("Minimum duration in seconds"),
      maxDuration: z.number().optional().describe("Maximum duration in seconds"),
      motionIntensity: z.enum(["low", "medium", "high"]).optional().describe("Filter by motion intensity"),
      hasMusic: z.boolean().optional().describe("Filter by presence of music"),
      hasSpeech: z.boolean().optional().describe("Filter by presence of speech"),
      startsClean: z.boolean().optional().describe("Filter for clips that start cleanly (good for editing)"),
      endsClean: z.boolean().optional().describe("Filter for clips that end cleanly (good for editing)"),
      aspectRatio: z.string().optional().describe("Filter by aspect ratio (e.g., '720:1280' for vertical)"),
      limit: z.number().optional().default(10).describe("Maximum number of results (default 10)"),
    },
  },
  async (args) => {
    const results = searchClips(clips, args);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No clips found matching your criteria. Try broadening your search.",
          },
        ],
      };
    }

    const summaries = results.map(formatClipSummary).join("\n\n---\n\n");
    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} clip(s):\n\n${summaries}`,
        },
      ],
    };
  }
);

// Tool: Get full details for a specific clip
server.registerTool(
  "get_clip_details",
  {
    title: "Get Clip Details",
    description: "Get complete metadata and analysis for a specific clip by filename.",
    inputSchema: {
      filename: z.string().describe("The filename of the clip to retrieve"),
    },
  },
  async ({ filename }) => {
    const clip = clips.find((c) => c.filename === filename || c.filename.includes(filename));

    if (!clip) {
      return {
        content: [
          {
            type: "text",
            text: `Clip not found: "${filename}". Use search_clips to find available clips.`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: formatClipFull(clip),
        },
      ],
    };
  }
);

// Tool: List all unique subjects/tags in the library
server.registerTool(
  "list_subjects",
  {
    title: "List Available Subjects",
    description: "List all unique subjects found across the clip library, with counts.",
    inputSchema: {},
  },
  async () => {
    const subjectCounts = new Map<string, number>();

    for (const clip of clips) {
      const subjects = safeArr(clip.analysis?.subjects);
      for (const subject of subjects) {
        const lower = subject.toLowerCase();
        subjectCounts.set(lower, (subjectCounts.get(lower) || 0) + 1);
      }
    }

    const sorted = Array.from(subjectCounts.entries()).sort((a, b) => b[1] - a[1]);

    const output = sorted.map(([subject, count]) => `- ${subject}: ${count} clip(s)`).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `# Subjects in Library (${sorted.length} unique)\n\n${output}`,
        },
      ],
    };
  }
);

// Tool: List all unique moods in the library
server.registerTool(
  "list_moods",
  {
    title: "List Available Moods",
    description: "List all unique mood descriptors found across the clip library.",
    inputSchema: {},
  },
  async () => {
    const moodSet = new Set<string>();

    for (const clip of clips) {
      // Moods are comma-separated strings like "Sci-fi, futuristic, ominous"
      const moodStr = safeStr(clip.analysis?.mood);
      if (moodStr) {
        const moods = moodStr.split(',').map((m) => m.trim().toLowerCase()).filter((m) => m.length > 0);
        moods.forEach((m) => moodSet.add(m));
      }
    }

    const sorted = Array.from(moodSet).filter((m) => m.length > 0).sort();

    return {
      content: [
        {
          type: "text",
          text: `# Moods in Library (${sorted.length} unique)\n\n${sorted.join(", ")}`,
        },
      ],
    };
  }
);

// Tool: Get library statistics
server.registerTool(
  "get_library_stats",
  {
    title: "Get Library Statistics",
    description: "Get overall statistics about the video clip library.",
    inputSchema: {},
  },
  async () => {
    const totalDuration = clips.reduce((sum, c) => sum + (c.technical?.durationSeconds || 0), 0);
    const totalSize = clips.reduce((sum, c) => sum + (c.technical?.fileSizeBytes || 0), 0);

    const aspectRatios = new Map<string, number>();
    const motionLevels = new Map<string, number>();

    for (const clip of clips) {
      const ar = clip.technical?.aspectRatio || "unknown";
      aspectRatios.set(ar, (aspectRatios.get(ar) || 0) + 1);
      const motion = safeStr(clip.analysis?.motionIntensity).toLowerCase() || "unknown";
      motionLevels.set(motion, (motionLevels.get(motion) || 0) + 1);
    }

    const stats = `# Veo Clips Library Statistics

## Overview
- Total Clips: ${clips.length} (${manifest.totalClips} in manifest, ${manifest.totalClips - clips.length} with errors)
- Total Duration: ${Math.round(totalDuration / 60)} minutes (${totalDuration} seconds)
- Total Size: ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB
- Generated: ${manifest.generatedAt}
- Analysis Model: ${manifest.model}

## Aspect Ratios
${Array.from(aspectRatios.entries())
  .map(([ratio, count]) => `- ${ratio}: ${count} clips`)
  .join("\n")}

## Motion Intensity
${Array.from(motionLevels.entries())
  .map(([level, count]) => `- ${level}: ${count} clips`)
  .join("\n")}

## Edit Compatibility
- Starts Clean: ${clips.filter((c) => safeBool(c.analysis?.startsClean)).length} clips
- Ends Clean: ${clips.filter((c) => safeBool(c.analysis?.endsClean)).length} clips
- Both Clean: ${clips.filter((c) => safeBool(c.analysis?.startsClean) && safeBool(c.analysis?.endsClean)).length} clips

## Audio
- Has Music: ${clips.filter((c) => safeBool(c.analysis?.audio?.hasMusic)).length} clips
- Has Speech: ${clips.filter((c) => safeBool(c.analysis?.audio?.hasSpeech)).length} clips
`;

    return {
      content: [
        {
          type: "text",
          text: stats,
        },
      ],
    };
  }
);

// Tool: Find clips that would cut well together
server.registerTool(
  "find_edit_compatible_clips",
  {
    title: "Find Edit-Compatible Clips",
    description: `Find clips that would work well for editing together. 
Looks for clips that:
- End cleanly (for the "from" clip) 
- Start cleanly (for the "to" clip)
- Have compatible moods or visual styles
Useful for building sequences.`,
    inputSchema: {
      fromClip: z.string().optional().describe("Filename of the clip you want to cut FROM (finds clips that follow well)"),
      toClip: z.string().optional().describe("Filename of the clip you want to cut TO (finds clips that lead into it)"),
      mood: z.string().optional().describe("Mood to match"),
      limit: z.number().optional().default(5).describe("Maximum results"),
    },
  },
  async ({ fromClip, toClip, mood, limit = 5 }) => {
    let results: Clip[] = [];

    if (fromClip) {
      // Find clips that would follow well after fromClip
      const sourceClip = clips.find((c) => c.filename.includes(fromClip));
      if (!sourceClip) {
        return {
          content: [{ type: "text", text: `Clip not found: ${fromClip}` }],
        };
      }

      // Source should end clean, candidates should start clean
      if (!safeBool(sourceClip.analysis?.endsClean)) {
        return {
          content: [
            {
              type: "text",
              text: `Warning: "${sourceClip.filename}" doesn't end cleanly, cuts may be rough.\n\nSearching for clips that start clean anyway...`,
            },
          ],
        };
      }

      results = clips.filter((c) => c.filename !== sourceClip.filename && safeBool(c.analysis?.startsClean));

      // Optionally filter by mood similarity
      if (mood || safeStr(sourceClip.analysis?.mood)) {
        const targetMood = safeStr(mood || sourceClip.analysis?.mood).toLowerCase();
        const firstMood = targetMood.split(",")[0].trim();
        if (firstMood) {
          results = results.filter((c) => safeStr(c.analysis?.mood).toLowerCase().includes(firstMood));
        }
      }
    } else if (toClip) {
      // Find clips that would lead into toClip
      const targetClip = clips.find((c) => c.filename.includes(toClip));
      if (!targetClip) {
        return {
          content: [{ type: "text", text: `Clip not found: ${toClip}` }],
        };
      }

      if (!safeBool(targetClip.analysis?.startsClean)) {
        return {
          content: [
            {
              type: "text",
              text: `Warning: "${targetClip.filename}" doesn't start cleanly, cuts may be rough.\n\nSearching for clips that end clean anyway...`,
            },
          ],
        };
      }

      results = clips.filter((c) => c.filename !== targetClip.filename && safeBool(c.analysis?.endsClean));

      if (mood || safeStr(targetClip.analysis?.mood)) {
        const targetMood = safeStr(mood || targetClip.analysis?.mood).toLowerCase();
        const firstMood = targetMood.split(",")[0].trim();
        if (firstMood) {
          results = results.filter((c) => safeStr(c.analysis?.mood).toLowerCase().includes(firstMood));
        }
      }
    } else {
      // Just find generally edit-friendly clips
      results = clips.filter((c) => safeBool(c.analysis?.startsClean) && safeBool(c.analysis?.endsClean));
      if (mood) {
        results = results.filter((c) => safeStr(c.analysis?.mood).toLowerCase().includes(mood.toLowerCase()));
      }
    }

    results = results.slice(0, limit);

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No edit-compatible clips found matching criteria." }],
      };
    }

    const summaries = results.map(formatClipSummary).join("\n\n---\n\n");
    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} edit-compatible clip(s):\n\n${summaries}`,
        },
      ],
    };
  }
);

// Tool: Get raw JSON for a clip (for programmatic use)
server.registerTool(
  "get_clip_json",
  {
    title: "Get Clip JSON",
    description: "Get the raw JSON metadata for a clip. Useful for programmatic processing.",
    inputSchema: {
      filename: z.string().describe("The filename of the clip"),
    },
  },
  async ({ filename }) => {
    const clip = clips.find((c) => c.filename === filename || c.filename.includes(filename));

    if (!clip) {
      return {
        content: [{ type: "text", text: `Clip not found: "${filename}"` }],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(clip, null, 2),
        },
      ],
    };
  }
);

// Tool: List available sequence types
server.registerTool(
  "list_sequence_types",
  {
    title: "List Sequence Types",
    description: "List available sequence type definitions for building clip sequences.",
    inputSchema: {},
  },
  async () => {
    const sequenceTypes = [
      {
        name: "mood_journey",
        description: "A sequence that transitions through specified moods, creating an emotional arc.",
        params: {
          moods: "string[] - Sequence of moods to traverse",
          clipsPerMood: "number (optional, default 1) - Clips per mood phase"
        }
      }
    ];

    const output = sequenceTypes.map(st =>
      `**${st.name}**\n${st.description}\n\nParameters:\n${Object.entries(st.params).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    ).join('\n\n---\n\n');

    return {
      content: [
        {
          type: "text",
          text: `# Available Sequence Types\n\n${output}`,
        },
      ],
    };
  }
);

// Tool: Build a sequence with AI-powered clip selection
server.registerTool(
  "build_sequence",
  {
    title: "Build Sequence",
    description: `Build a sequence of clips based on a sequence type definition.
Uses AI (Gemini Flash) to select the best clip for each slot from the library.
Returns JSON with filled slots, gaps (unfilled slots), and total duration.`,
    inputSchema: {
      type: z.literal("mood_journey").describe("The sequence type to build"),
      moods: z.array(z.string()).describe("Sequence of moods to traverse"),
      clipsPerMood: z.number().optional().describe("Clips per mood phase (default 1)"),
      subjects: z.array(z.string()).optional().describe("Preferred subjects for clip selection"),
      duration: z.object({
        target: z.number(),
        tolerance: z.number().optional()
      }).optional().describe("Target duration constraints (not yet implemented)"),
      aspectRatio: z.string().optional().describe("Required aspect ratio (e.g., '720:1280')"),
      mustStartClean: z.boolean().optional().describe("First clip must start cleanly"),
      mustEndClean: z.boolean().optional().describe("Last clip must end cleanly"),
    },
  },
  async (args) => {
    const { moods, clipsPerMood = 1, subjects, duration, aspectRatio, mustStartClean, mustEndClean } = args;

    interface ClipInfo {
      filename: string;
      duration: number;
      mood: string;
      subjects: string[];
    }

    interface AlternativeInfo extends ClipInfo {
      reasoning: string;
    }

    interface FilledSlot {
      id: string;
      label: string;
      requirements: SlotRequirements;
      clip: ClipInfo | null;
      reasoning: string | null;
      alternatives: AlternativeInfo[];
    }

    interface Gap {
      slotId: string;
      slotLabel: string;
      prompt: string;
      priority: "high";
    }

    const MAX_SLOTS = 12;  // Limit to prevent excessive API calls

    const filledSlots: FilledSlot[] = [];
    const usedClips: Set<string> = new Set();
    const gapIndices: number[] = [];
    const warnings: string[] = [];
    let totalDuration = 0;
    let slotIndex = 0;
    const totalSlots = moods.length * clipsPerMood;

    if (totalSlots > MAX_SLOTS) {
      warnings.push(`Requested ${totalSlots} slots exceeds limit of ${MAX_SLOTS}. Results will be truncated.`);
    }

    for (const mood of moods) {
      for (let i = 0; i < clipsPerMood; i++) {
        // Enforce slot limit
        if (slotIndex >= MAX_SLOTS) break;

        const isFirst = slotIndex === 0;
        const isLast = slotIndex === Math.min(totalSlots, MAX_SLOTS) - 1;
        const slotId = `slot_${slotIndex}`;

        // Build requirements for this slot
        const requirements: SlotRequirements = { mood };
        if (subjects && subjects.length > 0) requirements.subjects = subjects;
        if (aspectRatio) requirements.aspectRatio = aspectRatio;
        if (mustStartClean && isFirst) requirements.mustStartClean = true;
        if (mustEndClean && isLast) requirements.mustEndClean = true;

        // Filter out already-used clips from candidates
        const availableClips = clips.filter(c => !usedClips.has(c.filename));

        // Select best clip for this slot
        const selection = await selectClipForSlot(availableClips, requirements);

        if (selection.selected) {
          // Find the selected clip to get its metadata
          const selectedClip = clips.find(c => c.filename === selection.selected);

          if (selectedClip) {
            usedClips.add(selection.selected);
            totalDuration += selectedClip.technical.durationSeconds;

            // Build alternatives array, excluding used clips
            const alternatives: AlternativeInfo[] = selection.alternatives
              .filter(alt => !usedClips.has(alt.filename))
              .slice(0, 3)
              .map(alt => {
                const altClip = clips.find(c => c.filename === alt.filename);
                if (!altClip) return null;
                return {
                  filename: alt.filename,
                  duration: altClip.technical.durationSeconds,
                  mood: safeStr(altClip.analysis?.mood),
                  subjects: safeArr(altClip.analysis?.subjects),
                  reasoning: alt.reasoning
                };
              })
              .filter((alt): alt is AlternativeInfo => alt !== null);

            filledSlots.push({
              id: slotId,
              label: mood,
              requirements,
              clip: {
                filename: selectedClip.filename,
                duration: selectedClip.technical.durationSeconds,
                mood: safeStr(selectedClip.analysis?.mood),
                subjects: safeArr(selectedClip.analysis?.subjects)
              },
              reasoning: selection.reasoning,
              alternatives
            });
          } else {
            // Selected clip not found (shouldn't happen)
            warnings.push(`${slotId}: Selected clip "${selection.selected}" not found in library`);
            gapIndices.push(slotIndex);
            filledSlots.push({
              id: slotId,
              label: mood,
              requirements,
              clip: null,
              reasoning: selection.reasoning,
              alternatives: []
            });
          }
        } else {
          // No clip selected - this is a gap
          gapIndices.push(slotIndex);
          filledSlots.push({
            id: slotId,
            label: mood,
            requirements,
            clip: null,
            reasoning: selection.reasoning,
            alternatives: []
          });
        }

        slotIndex++;
      }
      // Break outer loop if limit reached
      if (slotIndex >= MAX_SLOTS) break;
    }

    // Generate Veo prompts for gaps (in parallel)
    const gapPromises = gapIndices.map(async (gapIdx) => {
      const slot = filledSlots[gapIdx];

      // Find neighbor clips for context
      let prevClip: Clip | null = null;
      let nextClip: Clip | null = null;

      // Look backward for previous filled clip
      for (let i = gapIdx - 1; i >= 0; i--) {
        if (filledSlots[i].clip) {
          prevClip = clips.find(c => c.filename === filledSlots[i].clip!.filename) || null;
          break;
        }
      }

      // Look forward for next filled clip
      for (let i = gapIdx + 1; i < filledSlots.length; i++) {
        if (filledSlots[i].clip) {
          nextClip = clips.find(c => c.filename === filledSlots[i].clip!.filename) || null;
          break;
        }
      }

      // Generate Veo prompt using Gemini Pro
      const prompt = await generateVeoPrompt(slot.requirements, prevClip, nextClip);

      return {
        slotId: slot.id,
        slotLabel: slot.label,
        prompt,
        priority: "high" as const
      };
    });

    const gaps: Gap[] = await Promise.all(gapPromises);

    // Check for gaps warning
    if (gaps.length > 0) {
      warnings.push(`${gaps.length} gap${gaps.length > 1 ? 's' : ''} need${gaps.length === 1 ? 's' : ''} clips generated`);
    }

    // Check duration against target
    if (duration?.target) {
      const tolerance = duration.tolerance ?? 0;
      const minDuration = duration.target - tolerance;
      const maxDuration = duration.target + tolerance;

      if (totalDuration < minDuration) {
        const needed = Math.ceil(duration.target - totalDuration);
        warnings.push(`Total duration ${totalDuration}s, target was ${duration.target}s - need ${needed} more seconds of clips`);
      } else if (totalDuration > maxDuration) {
        warnings.push(`Total duration ${totalDuration}s exceeds target ${duration.target}s`);
      }
    }

    const result = {
      slots: filledSlots,
      gaps,
      totalDuration,
      warnings
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// Tool: Call the video generator API
server.registerTool(
  "call_video_generator_api",
  {
    title: "Call Video Generator API",
    description: "Make HTTP requests to the video generator API running at localhost:3000. Use this to access endpoints like /api/generate-frame-prompts, /api/breakdown-shot, /api/veo/generate, etc.",
    inputSchema: {
      endpoint: z.string().describe("API endpoint path (e.g., '/api/generate-frame-prompts')"),
      method: z.enum(["GET", "POST"]).optional().default("POST").describe("HTTP method (default: POST)"),
      body: z.record(z.string(), z.any()).optional().describe("Request body for POST requests"),
    },
  },
  async (args) => {
    const { endpoint, method = "POST", body } = args;
    const url = `http://localhost:3000${endpoint}`;

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
      };

      if (method === "POST" && body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Error ${response.status}: ${errorText}`,
            },
          ],
        };
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  }
);

// =============================================================================
// RESOURCES
// =============================================================================

// Expose the full manifest as a resource
server.resource(
  "manifest",
  "veo://manifest",
  {
    title: "Full Manifest",
    description: "The complete manifest JSON with all clip metadata",
    mimeType: "application/json",
  },
  async () => ({
    contents: [
      {
        uri: "veo://manifest",
        mimeType: "application/json",
        text: JSON.stringify(manifest, null, 2),
      },
    ],
  })
);

// =============================================================================
// RUN SERVER
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Veo Clips MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
