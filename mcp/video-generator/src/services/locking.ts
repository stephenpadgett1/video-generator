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
  userLockedDescription?: string;
  userReferenceImagePath?: string;
}): Promise<LockCharacterResult> {
  const { character, style, userLockedDescription, userReferenceImagePath } = options;

  let base64Image: string;
  const filename = `character_${character.id}_base.png`;
  const filepath = path.join(GENERATED_IMAGES_DIR, filename);

  // Ensure output directory exists
  if (!fs.existsSync(GENERATED_IMAGES_DIR)) {
    fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });
  }

  // Step 1: Get reference image (user-provided or generate)
  if (userReferenceImagePath) {
    // Use user-provided reference image
    const resolvedPath = path.isAbsolute(userReferenceImagePath)
      ? userReferenceImagePath
      : path.resolve(userReferenceImagePath);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`User reference image not found: ${resolvedPath}`);
    }

    const imageBuffer = fs.readFileSync(resolvedPath);
    base64Image = imageBuffer.toString("base64");

    // Copy to standard location
    fs.copyFileSync(resolvedPath, filepath);
  } else {
    // Generate neutral full-body reference image
    const imagenPrompt = `Full-body portrait of ${character.description}. Standing in a neutral pose, plain gray background, soft even lighting, facing camera, simple clothing.${style ? " " + style : ""}`;
    base64Image = await generateImageWithImagen(imagenPrompt, "9:16");

    // Save generated image
    fs.writeFileSync(filepath, Buffer.from(base64Image, "base64"));
  }

  // Step 2: Get locked description (user-provided or extract from image)
  let lockedDescription: string;

  if (userLockedDescription) {
    // Use user-provided description directly
    lockedDescription = userLockedDescription.trim();
  } else {
    // Extract description from image using Gemini
    const characterPrompt = `Analyze this reference image for video generation consistency.

EXTRACT ALL VISUAL FEATURES - be extremely specific:

1. PHYSICAL: age, ethnicity/skin tone, gender, hair (color/style/length), build, facial features
2. CLOTHING: exact garments with colors, patterns, fit
3. MAKEUP/FACEPAINT (if present):
   - Describe LEFT and RIGHT sides SEPARATELY
   - COUNT elements: stripes, dots, marks on each side
   - Note colors and positioning
4. ACCESSORIES:
   - Hats: style, any folds or angles (which side?)
   - Glasses: frame style and color
   - Jewelry: exact placement
5. ASYMMETRIC DETAILS: anything different left vs right

Output: 50-80 words. Include specific COUNTS and POSITIONS.
Example: "Caucasian man, mid-50s, receding gray hair, thick black-framed glasses, tiger facepaint with 4 orange diagonal stripes on left cheek and 3 on right cheek angled toward nose, charcoal fedora with left brim folded up 2 inches, brown tweed jacket, nervous expression."`;

    lockedDescription = await analyzeWithGemini(base64Image, characterPrompt);
    lockedDescription = lockedDescription.trim();

    // Validate description length
    const wordCount = lockedDescription.split(/\s+/).length;
    if (wordCount < 15) {
      // Retry with more explicit prompt
      const retryPrompt = `Describe this person's complete visual appearance for video consistency in 50-80 words.

You MUST include ALL of these details:
1. Ethnicity/skin tone and approximate age
2. Gender presentation
3. Hair color, style, and length
4. Body build
5. CLOTHING: specific garments with exact colors
6. Expression/demeanor
7. MAKEUP/FACEPAINT: COUNT elements on each side (left vs right)
8. ACCESSORIES: note positions and angles

Be VERY SPECIFIC about counts and asymmetric details.`;

      const retryDescription = await analyzeWithGemini(base64Image, retryPrompt);
      if (retryDescription.split(/\s+/).length >= 15) {
        lockedDescription = retryDescription.trim();
      }
    }

    if (!lockedDescription) {
      throw new Error("Failed to extract character description");
    }
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
