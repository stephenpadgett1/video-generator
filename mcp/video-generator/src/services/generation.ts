import { callClaude, parseClaudeJson } from "../clients/claude.js";
import { analyzeImageWithGemini } from "../clients/gemini.js";
import { generateImage as imagenGenerate } from "../clients/imagen.js";

// Arc type descriptions
export const ARC_TYPES: Record<string, string> = {
  "linear-build": "Steady increase in energy from start to finish",
  "tension-release": "Build tension to a peak, then release",
  wave: "Oscillating energy with peaks and valleys",
  "flat-punctuate": "Consistent baseline energy with sudden spikes",
  bookend: "Strong open and close with lower middle",
};

// Mood visual mappings
export const MOOD_VISUALS: Record<string, string> = {
  hopeful:
    "warm golden light, soft focus, uplifting composition, gentle lens flare",
  melancholic:
    "muted desaturated colors, soft shadows, contemplative framing, overcast lighting",
  tense:
    "high contrast, tight claustrophobic framing, uneasy stillness, sharp shadows",
  peaceful:
    "soft diffused light, balanced composition, gentle movement, pastel tones",
  unsettling:
    "slightly off-center framing, unnatural color grading, lingering static shots, wrong angles",
  triumphant:
    "bright expansive lighting, low angle heroic framing, warm golden hour tones, dynamic composition",
  intimate:
    "shallow depth of field, close framing, warm skin tones, soft directional light",
  desolate:
    "cold blue-grey palette, empty negative space, distant framing, harsh flat lighting",
  mysterious:
    "deep shadows, selective lighting, obscured details, cool undertones with warm accents",
  urgent:
    "handheld energy, quick cuts implied, high saturation, dramatic side lighting",
  contemplative:
    "still camera, balanced symmetry, natural muted tones, even soft lighting",
  chaotic:
    "Dutch angles, high contrast, fragmented composition, mixed color temperatures",
  bittersweet:
    "warm tones with cool shadows, nostalgic soft focus, golden hour fading to blue",
  whimsical:
    "vibrant saturated colors, playful asymmetry, bright even lighting, fantastical elements",
  ominous:
    "deep blacks, silhouettes, underexposed backgrounds, cold color cast, looming compositions",
  serene:
    "soft pastel palette, wide calm compositions, diffused natural light, gentle gradients",
};

export interface ProjectStructure {
  concept: string;
  duration: number;
  arc: string;
  arc_description: string;
  characters: Array<{ id: string; description: string }>;
  environments: Array<{
    id: string;
    description: string;
    primary?: boolean;
  }>;
  shots: Array<{
    shot_id: string;
    role: string;
    energy: number;
    tension: number;
    mood: string;
    duration_target: number;
    position: number;
    characters: string[];
    environment: string | null;
  }>;
}

export interface VeoPromptOptions {
  aspectRatio?: string;
  firstFrameDescription?: string;
  lastFrameDescription?: string;
  previousTakeDescription?: string;
  additionalContext?: string;
  mood?: string;
  productionRules?: Record<string, unknown>;
  dialogue?: Array<{
    speaker: string;
    text: string;
    mood?: string;
    voiceDescription?: string;
  }>;
}

/**
 * Build production constraint text from rules
 */
function buildProductionConstraintText(
  rules: Record<string, unknown>
): string {
  const lines: string[] = [];

  if (rules.camera) {
    const cam = rules.camera as Record<string, string>;
    if (cam.perspective) lines.push(`Camera perspective: ${cam.perspective}`);
    if (cam.movement) lines.push(`Camera movement: ${cam.movement}`);
    if (cam.framing) lines.push(`Framing: ${cam.framing}`);
  }

  if (rules.visual) {
    const vis = rules.visual as Record<string, string>;
    if (vis.lighting) lines.push(`Lighting: ${vis.lighting}`);
    if (vis.palette) lines.push(`Color palette: ${vis.palette}`);
  }

  if (rules.continuity) {
    const cont = rules.continuity as Record<string, string>;
    if (cont.location) lines.push(`Location: ${cont.location}`);
    if (cont.time_flow) lines.push(`Time flow: ${cont.time_flow}`);
  }

  return lines.join("\n");
}

/**
 * Build voice description for dialogue
 */
function buildVoiceDescription(
  speaker: string,
  voiceDescription?: string,
  mood?: string
): string {
  if (voiceDescription) return voiceDescription;
  const moodDesc = mood ? `, ${mood} tone` : "";
  return `natural speaking voice${moodDesc}`;
}

/**
 * Generate shot structure from concept
 */
export async function generateStructure(options: {
  concept: string;
  duration: number;
  arc?: string;
  productionRules?: Record<string, unknown>;
}): Promise<ProjectStructure> {
  const { concept, duration, arc = "tension-release", productionRules } = options;

  const arcDescription = ARC_TYPES[arc];
  if (!arcDescription) {
    throw new Error(
      `Invalid arc type. Must be one of: ${Object.keys(ARC_TYPES).join(", ")}`
    );
  }

  const productionRulesSection = productionRules
    ? `
## Production Rules (MUST RESPECT)
These constraints apply to ALL shots in this piece:
${buildProductionConstraintText(productionRules)}

Design shots that work WITHIN these constraints.
`
    : "";

  const systemPrompt = `You are a shot structure architect for short-form video. Your job is to divide a video concept into shots with appropriate roles and energy levels.

## Character Extraction
First, identify all characters in the concept:
- Characters are people or anthropomorphized entities with agency in the story
- Do NOT include inanimate objects, locations, or abstract concepts as characters
- If no characters are present, return an empty characters array

For each character, provide:
- id: snake_case identifier (e.g., "woman_1", "elderly_man", "young_boy", "robot_dog")
- description: visual appearance suitable for image generation (age, build, clothing, hair, distinguishing features)

## Environment Extraction
Identify all distinct environments/locations in the concept:
- Environments are physical spaces where action takes place
- Only include environments that will appear in multiple shots or need visual consistency
- If no specific environments are identifiable, return an empty environments array

For each environment, provide:
- id: snake_case identifier (e.g., "coffee_shop", "abandoned_warehouse", "moonlit_forest")
- description: architectural/atmospheric features (interior/exterior, materials, lighting, spatial characteristics)
- primary: boolean - true if this is the main location (only one should be primary)

## Role Vocabulary
- establish: Set the scene, introduce the subject
- emphasize: Highlight or intensify important elements
- transition: Bridge between ideas or moments
- punctuate: Create impact, a dramatic beat
- reveal: Unveil something new
- resolve: Conclude, bring closure

## Energy Scale (0-1) - Pace and Intensity
- 0.0-0.2: Very calm, still, quiet
- 0.2-0.4: Low energy, subtle movement
- 0.4-0.6: Moderate energy, active but controlled
- 0.6-0.8: High energy, dynamic
- 0.8-1.0: Peak intensity, maximum impact

## Tension Scale (0-1) - Anticipation and Suspense (SEPARATE from energy)
- 0.0-0.2: Resolved, no suspense, things have settled
- 0.2-0.4: Mild anticipation, something may happen
- 0.4-0.6: Building suspense, audience expects something
- 0.6-0.8: High tension, something MUST happen soon
- 0.8-1.0: Maximum suspense, the moment before release

Note: Tension and energy are INDEPENDENT.

## Mood Vocabulary - Emotional Color (choose one per shot)
hopeful, melancholic, tense, peaceful, unsettling, triumphant, intimate, desolate,
mysterious, urgent, contemplative, chaotic, bittersweet, whimsical, ominous, serene

## Arc Types
- linear-build: Start low, steadily increase energy to finish high
- tension-release: Build energy to a peak around 2/3 through, then drop for resolution
- wave: Oscillate between high and low energy, creating rhythm
- flat-punctuate: Maintain steady baseline with occasional sharp spikes
- bookend: Start and end strong, with lower energy in the middle
${productionRulesSection}
## Output Format
Return a JSON object with:
- concept: the original concept
- duration: total duration in seconds
- arc: the arc type used
- arc_description: human-readable arc description
- characters: array of character objects
- environments: array of environment objects
- shots: array of shot objects with shot_id, role, energy, tension, mood, duration_target, position, characters, environment

Aim for 3-6 shots depending on duration. Shorter pieces (under 15s) should have fewer shots.
Match the energy curve to the specified arc type.

Return ONLY valid JSON, no explanation.`;

  const userMessage = `CONCEPT: ${concept}
DURATION: ${duration} seconds
ARC: ${arc} (${arcDescription})

Generate a shot structure for this piece.`;

  const response = await callClaude({
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1024,
  });

  return parseClaudeJson<ProjectStructure>(response);
}

/**
 * Generate Veo prompt from action description
 */
export async function generateVeoPrompt(options: {
  description: string;
  durationSeconds?: number;
  style?: string;
  veoOptions?: VeoPromptOptions;
}): Promise<string> {
  const { description, durationSeconds, style, veoOptions = {} } = options;

  const {
    aspectRatio,
    firstFrameDescription,
    lastFrameDescription,
    previousTakeDescription,
    additionalContext,
    mood,
    productionRules,
    dialogue,
  } = veoOptions;

  // Build production constraint guidance
  let productionConstraintGuidance = "";
  if (productionRules) {
    const constraintText = buildProductionConstraintText(productionRules);
    if (constraintText) {
      productionConstraintGuidance = `
PRODUCTION CONSTRAINTS (MUST RESPECT):
${constraintText}
These constraints are LOCKED and must be reflected in EVERY shot.`;
    }
  }

  // Build mood guidance
  let moodGuidance = "";
  if (mood && MOOD_VISUALS[mood]) {
    moodGuidance = `
MOOD ATMOSPHERE:
The emotional tone is "${mood}". Incorporate these visual qualities: ${MOOD_VISUALS[mood]}
Ensure lighting, color palette, and composition support this mood.`;
  }

  // Build dialogue guidance
  let dialogueGuidance = "";
  if (dialogue && dialogue.length > 0) {
    const lines = dialogue
      .map((d) => {
        const voiceDesc = buildVoiceDescription(
          d.speaker,
          d.voiceDescription,
          d.mood
        );
        return `- ${d.speaker.toUpperCase()} (${voiceDesc}): "${d.text}"`;
      })
      .join("\n");

    dialogueGuidance = `
DIALOGUE REQUIREMENTS:
The following lines MUST be spoken clearly on camera. Structure your prompt in TWO PARTS:

PART 1 - VISUAL SCENE:
- Describe camera, framing, lighting, atmosphere
- Character positioning and minimal blocking
- Do NOT describe speech or dialogue here
- Keep action simple during dialogue delivery

PART 2 - DIALOGUE (copy this section exactly at the end of your prompt):
---
DIALOGUE:
${lines}

VOICE DIRECTION: Close-mic'd, clear audio, minimal room reverb. Natural speaking pace.
---

CRITICAL: Include the DIALOGUE section exactly as shown above at the END of your prompt.`;
  }

  const audioGuidance = `
AUDIO REQUIREMENTS:
- NO background music or musical score
- Dialogue/speech: INCLUDE if specified in DIALOGUE section
- Sound effects: INCLUDE only sounds directly caused by on-screen action
- Keep audio naturalistic and diegetic`;

  const dialogueStructureNote =
    dialogue && dialogue.length > 0
      ? `
IMPORTANT - DIALOGUE SHOT STRUCTURE:
This shot contains dialogue. You MUST structure your output as:
1. VISUAL DESCRIPTION (camera, lighting, character position - NO mention of speaking)
2. Then copy the DIALOGUE section exactly as provided in DIALOGUE REQUIREMENTS below

Keep visual action minimal during speech.
`
      : "";

  const systemPrompt = `You are a cinematographer writing prompts for Veo, an AI video generator.
${dialogueStructureNote}
Given the action description and context, write a detailed video generation prompt that:
- Describes the motion/action clearly
- Specifies camera movement and angle
- Includes lighting and visual style that supports the mood
- If a starting frame is described, ensure the video begins from that visual state
- If an ending frame is described, guide the action toward that visual state
- Maintains consistency with any previous take context

CRITICAL - CHARACTER CONSISTENCY:
If a CHARACTER description is provided in CONTEXT, you MUST:
1. Start your prompt with the COMPLETE character description in the first sentence
2. Include ALL details verbatim: physical features, specific clothing colors/items, expression
3. Do NOT paraphrase or omit any character details - copy them exactly
${moodGuidance}${productionConstraintGuidance}${dialogueGuidance}${audioGuidance}
Output only the prompt text, no JSON or explanation.`;

  let userMessage = `ACTION: ${description}`;
  if (durationSeconds) userMessage += `\nDURATION: ${durationSeconds} seconds`;
  if (aspectRatio) userMessage += `\nASPECT RATIO: ${aspectRatio}`;
  if (style) userMessage += `\nSTYLE: ${style}`;
  if (firstFrameDescription)
    userMessage += `\nSTARTING FRAME: ${firstFrameDescription}`;
  if (lastFrameDescription)
    userMessage += `\nENDING FRAME: ${lastFrameDescription}`;
  if (previousTakeDescription)
    userMessage += `\nPREVIOUS TAKE: ${previousTakeDescription}`;
  if (additionalContext) userMessage += `\nCONTEXT: ${additionalContext}`;
  userMessage += "\n\nWrite a Veo prompt for this take.";

  return await callClaude({
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1024,
  });
}

/**
 * Generate first/last frame prompts from a Veo prompt
 */
export async function generateFramePrompts(options: {
  veoPrompt: string;
  shotContext?: string;
}): Promise<{ firstFrame: string; lastFrame: string; notes: string }> {
  const { veoPrompt, shotContext } = options;

  const systemPrompt = `You are a cinematographer breaking down a video shot into its opening and closing frames for an AI image generator.

Given a video prompt describing action/motion, produce two image prompts:
1. FIRST FRAME: The scene at the moment before the main action begins. Establish setting, lighting, composition, and any subjects in their starting positions.
2. LAST FRAME: The scene at the moment after the main action completes. Show the end state, results of the action, final positions.

GUIDELINES:
- Remove all motion verbs (walking, moving, flying, etc.) - describe frozen moments
- Preserve: camera angle, lighting style, color palette, visual aesthetic
- Add compositional details appropriate for stills (depth of field, framing, negative space)
- Be specific about subject positions, poses, expressions
- Keep the same level of detail/style as the original prompt
- If the original prompt implies a transformation, first frame = before state, last frame = after state

OUTPUT FORMAT:
Return JSON only, no markdown:
{
  "firstFrame": "detailed image prompt for opening frame",
  "lastFrame": "detailed image prompt for closing frame",
  "notes": "brief explanation of the implied action/transformation between frames"
}`;

  const userMessage = `Video prompt: "${veoPrompt}"

${shotContext ? `Additional context: ${shotContext}` : ""}

Generate the first and last frame image prompts.`;

  const response = await callClaude({
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1024,
  });

  return parseClaudeJson(response);
}

/**
 * Break down a shot into multiple takes for long durations
 */
export async function breakdownShot(options: {
  description: string;
  duration: number;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
  context?: string;
}): Promise<
  Array<{
    take_number: number;
    duration: number;
    action_description: string;
    first_frame_prompt?: string;
    last_frame_prompt?: string;
    notes: string;
  }>
> {
  const { description, duration, firstFramePrompt, lastFramePrompt, context } =
    options;

  const systemPrompt = `You are a cinematographer breaking down a shot into individual takes for AI video generation.

CONSTRAINTS:
- Regular generation durations: ONLY 4, 6, or 8 seconds (no other values)
- Each take must be self-contained with clear action
- First take should start from the first frame description if provided
- Last take should end at the last frame description if provided
- Intermediate takes should flow naturally with clear handoff points

GUIDELINES:
- Prefer longer takes (8s) over multiple shorter takes when possible
- Each take should have distinct action, not just a continuation
- Provide first_frame_prompt for any take that needs specific starting visual
- Provide last_frame_prompt for any take that needs specific ending visual

OUTPUT FORMAT:
Return JSON array, no markdown:
[
  {
    "take_number": 1,
    "duration": 8,
    "action_description": "description of what happens in this take",
    "first_frame_prompt": "optional image prompt for starting frame",
    "last_frame_prompt": "optional image prompt for ending frame",
    "notes": "brief notes about this take"
  }
]`;

  const userMessage = `SHOT DESCRIPTION: ${description}
TOTAL DURATION: ${duration} seconds
${firstFramePrompt ? `STARTING FRAME: ${firstFramePrompt}` : ""}
${lastFramePrompt ? `ENDING FRAME: ${lastFramePrompt}` : ""}
${context ? `CONTEXT: ${context}` : ""}

Break this shot into takes.`;

  const response = await callClaude({
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 1024,
  });

  return parseClaudeJson(response);
}

/**
 * Generate image using Imagen
 */
export async function generateImage(options: {
  prompt: string;
  aspectRatio?: string;
  outputFilename?: string;
}): Promise<{ filename: string; path: string }> {
  return imagenGenerate(options);
}

/**
 * Analyze image to get description (for frame context)
 */
export async function analyzeImage(imagePath: string): Promise<string> {
  return analyzeImageWithGemini({ imagePath });
}
