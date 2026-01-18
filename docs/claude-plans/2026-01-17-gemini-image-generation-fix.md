# Fix Gemini 3 Pro Image (Nano Banana Pro) 404 Error

## Problem
The test script fails with 404 error for `gemini-3-pro-image-preview`:
```
Publisher Model `projects/.../locations/us-central1/publishers/google/models/gemini-3-pro-image-preview`
was not found or your project does not have access to it.
```

## Root Cause: Wrong Endpoint Region

**Research findings:**
- `gemini-3-pro-image-preview` is only available on the **global** endpoint
- `gemini-2.5-flash-image` works with regional endpoints like `us-central1`

**Current code uses:**
```
https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/us-central1/...
```

**Required for gemini-3-pro-image-preview:**
```
https://aiplatform.googleapis.com/v1/projects/{project}/locations/global/...
```

Note: The global endpoint has NO region prefix on the hostname.

---

## Plan: Fix Global Endpoint Support

### 1. Update `buildVertexUrl` in google-auth.ts

Add support for global vs regional endpoints:

**File:** `mcp/video-generator/src/clients/google-auth.ts`

```typescript
export function buildVertexUrl(
  projectId: string,
  model: string,
  method: string,
  location: string = "us-central1"  // Add location parameter
): string {
  if (location === "global") {
    // Global endpoint: no region prefix on hostname
    return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${model}:${method}`;
  }
  // Regional endpoint
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:${method}`;
}
```

### 2. Update `generateWithGemini` in imagen.ts

Detect which models need global endpoint:

**File:** `mcp/video-generator/src/clients/imagen.ts`

```typescript
// Models that require global endpoint
const GLOBAL_ONLY_MODELS = ["gemini-3-pro-image-preview"];

function getModelLocation(model: ImageModel): string {
  return GLOBAL_ONLY_MODELS.includes(model) ? "global" : "us-central1";
}
```

Update the `generateWithGemini` function to use the correct location:
```typescript
const location = getModelLocation(model);
const url = buildVertexUrl(projectId, model, "generateContent", location);
```

### 3. Revert test-image-models.ts

**File:** `test-image-models.ts`

Change back to use the Pro model:
```typescript
const modelsToTest: ImageModel[] = [
  "imagen-3.0-generate-002",      // Imagen 3 (baseline)
  "imagen-4.0-generate-001",      // Imagen 4 (improved)
  "gemini-3-pro-image-preview",   // Nano Banana Pro (4K) - now using global endpoint
];
```

---

## Files to Modify

| File | Change |
|------|--------|
| `mcp/video-generator/src/clients/google-auth.ts` | Add `location` parameter to `buildVertexUrl` |
| `mcp/video-generator/src/clients/imagen.ts` | Detect global-only models, pass location |
| `test-image-models.ts` | Revert to `gemini-3-pro-image-preview` |

---

## Verification

1. Build MCP server: `cd mcp/video-generator && npm run build`
2. Run test: `npx tsx test-image-models.ts`
3. Verify `gemini-3-pro-image-preview` generates successfully (no 404)
4. Compare image quality scores

---

## Reference

| Model | ID | Endpoint | Max Res |
|-------|-----|----------|---------|
| Imagen 3 | `imagen-3.0-generate-002` | us-central1 | 1024px |
| Imagen 4 | `imagen-4.0-generate-001` | us-central1 | 2048px |
| Gemini 2.5 Flash Image | `gemini-2.5-flash-image` | us-central1 | 1024px |
| **Gemini 3 Pro Image** | `gemini-3-pro-image-preview` | **global** | 4096px |

**Sources:**
- [Gemini 3 Pro Image docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image)
- [Vertex AI Locations](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations)

---

# Previous Implementation (Completed)

## Phase 1: Replace Gemini Image Analysis with Claude Opus 4.5

### Problem
`analyzeImageWithGemini` uses `gemini-2.5-flash` which hallucinates precision when counting fine details. Claude Opus 4.5 is already available via `callClaudeVision` and should be used instead.

### Current State
- `callClaudeVision` exists in `mcp/video-generator/src/clients/claude.ts` using `claude-opus-4-5-20251101` ✓
- `analyzeImageWithGemini` exists in `mcp/video-generator/src/clients/gemini.ts` using `gemini-2.5-flash` ✗

### 1.1 Create `analyzeImageWithClaude` Function

**File:** `mcp/video-generator/src/clients/claude.ts`

Add new function that wraps `callClaudeVision` for image analysis:
```typescript
export async function analyzeImageWithClaude(options: {
  imagePath: string;
  prompt?: string;
}): Promise<string>
```

### 1.2 Update `analyzeImage` Service

**File:** `mcp/video-generator/src/services/generation.ts`

Change import and implementation:
```typescript
// Before
import { analyzeImageWithGemini } from "../clients/gemini.js";
export async function analyzeImage(imagePath: string): Promise<string> {
  return analyzeImageWithGemini({ imagePath });
}

// After
import { analyzeImageWithClaude } from "../clients/claude.js";
export async function analyzeImage(imagePath: string): Promise<string> {
  return analyzeImageWithClaude({ imagePath });
}
```

### 1.3 Update Test Script

**File:** `test-image-models.ts`

Change import:
```typescript
// Before
import { analyzeImageWithGemini } from "./mcp/video-generator/src/clients/gemini.js";

// After
import { analyzeImageWithClaude } from "./mcp/video-generator/src/clients/claude.js";
```

### 1.4 Remove `analyzeImageWithGemini`

**File:** `mcp/video-generator/src/clients/gemini.ts`

Remove the `analyzeImageWithGemini` function entirely. Keep `analyzeVideoWithGemini` if still needed.

### 1.5 Verify No Other Gemini Image Analysis Usage

Check for remaining references:
- Old plan files (read-only, can ignore)
- Any other imports of `analyzeImageWithGemini`

---

## Files to Modify

| File | Changes |
|------|---------|
| `mcp/video-generator/src/clients/imagen.ts` | ✅ Fix `ImageModel` type with correct model IDs |
| `mcp/video-generator/src/tools/generation.ts` | ✅ Update `IMAGE_MODELS` const |
| `test-image-models.ts` | Update to use Claude for analysis |
| `mcp/video-generator/src/clients/claude.ts` | Add `analyzeImageWithClaude` function |
| `mcp/video-generator/src/services/generation.ts` | Switch from Gemini to Claude for `analyzeImage` |
| `mcp/video-generator/src/clients/gemini.ts` | Remove `analyzeImageWithGemini` function |

---

## Verification

1. Build MCP server: `cd mcp/video-generator && npm run build`
2. Run test: `npx tsx test-image-models.ts`
3. Verify Claude Opus 4.5 is used for analysis (check console output)
