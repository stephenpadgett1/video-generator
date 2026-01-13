import fs from "fs";
import path from "path";
import { getGoogleAccessToken, buildVertexUrl } from "../clients/google-auth.js";
import { GENERATED_IMAGES_DIR } from "../utils/paths.js";

const IMAGEN_MODEL = "imagen-3.0-generate-002";
const GEMINI_MODEL = "gemini-2.5-pro";

export interface LockCharacterResult {
  character_id: string;
  base_image_path: string;
  locked_description: string;
}

export interface LockEnvironmentResult {
  environment_id: string;
  base_image_path: string;
  locked_description: string;
}

/**
 * Call Gemini for image analysis
 */
async function analyzeWithGemini(
  base64Image: string,
  prompt: string
): Promise<string> {
  const { accessToken, projectId } = await getGoogleAccessToken();

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: base64Image } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  };

  const url = buildVertexUrl(projectId, GEMINI_MODEL, "generateContent");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""
  );
}

/**
 * Generate image via Imagen
 */
async function generateImageWithImagen(
  prompt: string,
  aspectRatio: string
): Promise<string> {
  const { accessToken, projectId } = await getGoogleAccessToken();

  const requestBody = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio,
    },
  };

  const url = buildVertexUrl(projectId, IMAGEN_MODEL, "predict");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Imagen API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string }>;
  };

  const base64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!base64) {
    throw new Error("No image generated from Imagen");
  }

  return base64;
}

/**
 * Lock a character's appearance - generates reference image and extracts features
 */
export async function lockCharacter(options: {
  character: { id: string; description: string };
  style?: string;
}): Promise<LockCharacterResult> {
  const { character, style } = options;

  // Step 1: Generate neutral full-body reference image
  const imagenPrompt = `Full-body portrait of ${character.description}. Standing in a neutral pose, plain gray background, soft even lighting, facing camera, simple clothing.${style ? " " + style : ""}`;

  const base64Image = await generateImageWithImagen(imagenPrompt, "9:16");

  // Step 2: Save image
  if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
    fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  }

  const filename = `character_${character.id}_base.png`;
  const filepath = path.join(GENERATED_IMAGES_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(base64Image, "base64"));

  // Step 3: Analyze with Gemini to extract immutable features
  const characterPrompt = `Analyze this reference image of a character for video generation consistency. Extract ALL visual features that must stay identical across multiple video shots.

MUST INCLUDE:
- Physical: age, ethnicity/skin tone, gender, hair color/style/length, body build, facial features
- Clothing: exact garments, colors, patterns, fit (e.g., "white button-up blouse, dark navy pants")
- Appearance state: expression, pose, demeanor if distinctive

EXCLUDE: background, lighting, camera angle

Output format: A detailed sentence, 30-50 words. Be SPECIFIC about colors and clothing.
Example: "East Asian woman, late 20s, shoulder-length straight black hair, slim build, wearing a crisp white button-up blouse tucked into high-waisted dark navy trousers, calm neutral expression, standing upright with relaxed posture."`;

  let lockedDescription = await analyzeWithGemini(base64Image, characterPrompt);
  lockedDescription = lockedDescription.trim();

  // Validate description length
  const wordCount = lockedDescription.split(/\s+/).length;
  if (wordCount < 8) {
    // Retry with more explicit prompt
    const retryPrompt = `Describe this person's complete visual appearance for video consistency in 30-50 words.

You MUST include ALL of these details:
1. Ethnicity/skin tone and approximate age
2. Gender presentation
3. Hair color, style, and length
4. Body build
5. CLOTHING: specific garments with colors (e.g., "white blouse, dark pants")
6. Expression/demeanor if notable

Example: "East Asian woman, early 30s, shoulder-length black hair, slim build, wearing white button-up blouse and dark navy trousers, calm composed expression."`;

    const retryDescription = await analyzeWithGemini(base64Image, retryPrompt);
    if (retryDescription.split(/\s+/).length >= 8) {
      lockedDescription = retryDescription.trim();
    }
  }

  if (!lockedDescription) {
    throw new Error("Failed to extract character description");
  }

  return {
    character_id: character.id,
    base_image_path: `generated-images/${filename}`,
    locked_description: lockedDescription,
  };
}

/**
 * Lock an environment's appearance - generates reference image and extracts features
 */
export async function lockEnvironment(options: {
  environment: { id: string; description: string };
  style?: string;
}): Promise<LockEnvironmentResult> {
  const { environment, style } = options;

  // Step 1: Generate wide establishing shot (no people)
  const imagenPrompt = `Wide establishing shot of ${environment.description}. Empty scene with no people or characters visible. Focus on architecture, atmosphere, and spatial depth. Cinematic composition, dramatic lighting.${style ? " " + style : ""}`;

  const base64Image = await generateImageWithImagen(imagenPrompt, "16:9");

  // Step 2: Save image
  if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
    fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  }

  const filename = `environment_${environment.id}_base.png`;
  const filepath = path.join(GENERATED_IMAGES_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(base64Image, "base64"));

  // Step 3: Analyze with Gemini to extract architectural/atmospheric features
  const environmentPrompt = `Analyze this reference image of an environment/location. Extract ONLY the immutable architectural and atmospheric features that must stay consistent across video shots.

Include:
- Setting type (interior/exterior, architectural style)
- Materials and textures (brick, wood, concrete, metal)
- Color palette (dominant and accent colors)
- Lighting character (natural/artificial, warm/cool, direction)
- Key spatial elements (ceiling height, depth, openings)

Exclude: moveable objects, weather conditions, people, vehicles, temporary items.

Output format: A single paragraph, 25-40 words. Example: "Industrial warehouse interior, exposed red brick walls, concrete floor, high vaulted ceiling with steel beams, warm amber light from tall windows, deep perspective."`;

  let lockedDescription = await analyzeWithGemini(base64Image, environmentPrompt);
  lockedDescription = lockedDescription.trim();

  // Validate description length
  const wordCount = lockedDescription.split(/\s+/).length;
  if (wordCount < 15) {
    // Retry with more explicit prompt
    const retryPrompt = `Describe this environment/location in exactly one paragraph with 25-40 words.

You MUST include ALL of these details:
1. Interior or exterior setting
2. Architectural style (modern, industrial, rustic, etc.)
3. Main materials visible (wood, brick, concrete, glass, etc.)
4. Color palette (warm/cool, specific dominant colors)
5. Lighting quality (natural/artificial, bright/dim, warm/cool)

Example: "Industrial warehouse interior, exposed red brick walls, concrete floor, high vaulted ceiling with steel beams, warm amber light from tall windows, deep perspective."`;

    const retryDescription = await analyzeWithGemini(base64Image, retryPrompt);
    if (retryDescription.split(/\s+/).length >= 15) {
      lockedDescription = retryDescription.trim();
    }
  }

  if (!lockedDescription) {
    throw new Error("Failed to extract environment description");
  }

  return {
    environment_id: environment.id,
    base_image_path: `generated-images/${filename}`,
    locked_description: lockedDescription,
  };
}
