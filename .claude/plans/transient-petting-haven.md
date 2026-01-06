# Implementation Plan: POST /api/lock-character

## Overview
Add a new endpoint that generates a neutral reference image for a character and extracts a concise, immutable visual description for use in Veo prompts.

## Input/Output

**Input:**
```json
{
  "character": { "id": "woman_1", "description": "a young professional woman" },
  "style": "cinematic, natural lighting"  // optional
}
```

**Output:**
```json
{
  "character_id": "woman_1",
  "base_image_path": "/generated-images/character_woman_1_base.png",
  "locked_description": "East Asian woman, late 20s, shoulder-length black hair, slim build, oval face."
}
```

---

## Implementation Steps

### Step 1: Add endpoint skeleton
**File:** `server.js` (add after existing character-related endpoints, ~line 2150)

```javascript
app.post('/api/lock-character', async (req, res) => {
  const config = loadConfig();

  try {
    const { character, style } = req.body;

    // Validate input
    if (!character || !character.id || !character.description) {
      return res.status(400).json({
        error: 'character object with id and description is required'
      });
    }

    const { accessToken, projectId } = await getVeoAccessToken(config);

    // Steps 2-4 go here...

  } catch (err) {
    console.error('Lock character error:', err);
    res.status(500).json({ error: err.message });
  }
});
```

### Step 2: Generate neutral reference image via Imagen

**Prompt design** (critical for good results):
```
Full-body portrait of ${character.description}.
Standing in a neutral pose, plain gray background,
soft even lighting, facing camera, simple clothing.
${style ? style : ''}
```

**Key considerations:**
- Plain background prevents visual noise
- Neutral pose ensures full body is visible
- "Facing camera" ensures facial features are captured
- "Simple clothing" prevents distracting patterns

**Implementation:**
```javascript
// Build Imagen prompt for neutral reference
const imagenPrompt = `Full-body portrait of ${character.description}. Standing in a neutral pose, plain gray background, soft even lighting, facing camera, simple clothing.${style ? ' ' + style : ''}`;

const imagenResponse = await fetch(
  `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      instances: [{ prompt: imagenPrompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '9:16'  // Full body portrait ratio
      }
    })
  }
);

if (!imagenResponse.ok) {
  const errorText = await imagenResponse.text();
  throw new Error(`Imagen API error: ${imagenResponse.status} - ${errorText}`);
}

const imagenData = await imagenResponse.json();
const base64Image = imagenData.predictions?.[0]?.bytesBase64Encoded;

if (!base64Image) {
  throw new Error('No image generated from Imagen');
}
```

### Step 3: Save image with character-specific filename

**Filename pattern:** `character_${character.id}_base.png`

```javascript
const imagesDir = path.join(__dirname, 'generated-images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

const filename = `character_${character.id}_base.png`;
const filepath = path.join(imagesDir, filename);
fs.writeFileSync(filepath, Buffer.from(base64Image, 'base64'));
console.log('Saved character base image to:', filepath);
```

### Step 4: Analyze with Gemini Flash to extract immutable features

**Custom Gemini prompt** (do NOT reuse generic `analyzeImageWithGemini`):

The existing helper uses a generic "describe this image" prompt. For locked descriptions, we need a specialized prompt that:
1. Extracts ONLY immutable visual features
2. Returns 1-1.5 sentences max
3. Focuses on continuity-breaking features

**Prompt:**
```
Analyze this reference image of a character. Extract ONLY the immutable physical features that must stay consistent across video shots.

Include: approximate age, ethnicity/skin tone, gender presentation, hair color and style, body build, and ONE distinctive feature if present.

Exclude: clothing, expression, pose, background, lighting, accessories.

Output format: A single sentence, 15-25 words max. Example: "East Asian woman, late 20s, shoulder-length black hair, slim build, oval face."
```

**Implementation:**
```javascript
// Build custom Gemini request for character feature extraction
const geminiRequestBody = {
  contents: [{
    role: 'user',
    parts: [
      {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image  // Reuse the base64 we already have
        }
      },
      {
        text: `Analyze this reference image of a character. Extract ONLY the immutable physical features that must stay consistent across video shots.

Include: approximate age, ethnicity/skin tone, gender presentation, hair color and style, body build, and ONE distinctive feature if present.

Exclude: clothing, expression, pose, background, lighting, accessories.

Output format: A single sentence, 15-25 words max. Example: "East Asian woman, late 20s, shoulder-length black hair, slim build, oval face."`
      }
    ]
  }],
  generationConfig: {
    temperature: 0.2,  // Low temperature for consistent extraction
    maxOutputTokens: 100  // Keep response short
  }
};

const geminiResponse = await fetch(
  `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(geminiRequestBody)
  }
);

if (!geminiResponse.ok) {
  const errorText = await geminiResponse.text();
  throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
}

const geminiData = await geminiResponse.json();
let lockedDescription = '';
if (geminiData.candidates?.[0]?.content?.parts) {
  lockedDescription = geminiData.candidates[0].content.parts
    .map(p => p.text || '')
    .join('')
    .trim();
}

if (!lockedDescription) {
  throw new Error('Failed to extract character description from Gemini');
}
```

### Step 5: Return response

```javascript
res.json({
  character_id: character.id,
  base_image_path: `/generated-images/${filename}`,
  locked_description: lockedDescription
});
```

---

## Files to Modify

| File | Change |
|------|--------|
| `server.js` | Add new `/api/lock-character` endpoint (~50-80 lines) |

---

## Key Design Decisions

1. **9:16 aspect ratio**: Matches the video format and ensures full-body visibility
2. **Reuse base64 for Gemini**: Avoids re-reading file from disk since we just generated it
3. **Custom Gemini prompt**: The existing `analyzeImageWithGemini` helper is too generic; we need a specialized prompt for sparse feature extraction
4. **Low temperature (0.2)**: Ensures consistent, factual feature extraction
5. **Plain gray background**: Maximizes character visibility and minimizes noise in analysis
6. **Deterministic filename**: Using `character_${id}_base.png` allows overwriting if re-locked

---

## Testing

```bash
curl -X POST http://localhost:3000/api/lock-character \
  -H "Content-Type: application/json" \
  -d '{
    "character": { "id": "woman_1", "description": "a young professional woman with determined expression" },
    "style": "cinematic, natural lighting"
  }'
```

Expected response:
```json
{
  "character_id": "woman_1",
  "base_image_path": "/generated-images/character_woman_1_base.png",
  "locked_description": "Caucasian woman, early 30s, dark brown shoulder-length hair, medium build, strong jawline."
}
```
