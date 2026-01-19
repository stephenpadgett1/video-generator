# Video Upscaling MCP Tool

Add an `upscale_video` MCP tool to upscale Veo outputs (720p/1280p) to 4K using Video2X.

## Context

- **GPU:** NVIDIA RTX 30/40 series
- **Use case:** Upscaling Veo-generated videos from 720p/1280p to 4K
- **Integration:** MCP tool for automated workflows

## Recommended Approach: Video2X CLI

Video2X 6.x is the best fit because:
- Easy Windows installation (single installer)
- CLI interface perfect for MCP wrapping
- Supports Real-ESRGAN (best for AI-generated content)
- Uses Vulkan (fast on RTX GPUs)
- No Python/CUDA setup required

**Alternative considered:** RTX Video in ComfyUI is faster but requires ComfyUI installation and more complex integration. Video2X is simpler and quality is comparable for Veo content.

## Implementation

### Phase 1: Install Video2X

1. Download `video2x-qt6-windows-amd64-installer.exe` from [releases](https://github.com/k4yt3x/video2x/releases)
2. Run installer, note installation path (default: `C:\Program Files\Video2X`)
3. Verify CLI works: `video2x --version`

### Phase 2: Create MCP Tool

#### New file: `mcp/video-generator/src/services/upscaling.ts`

```typescript
// Wraps Video2X CLI for video upscaling
// - Executes: video2x -i input.mp4 -o output.mp4 -p realesrgan -s 4
// - Supports scale factors: 2, 3, 4
// - Models: realesrgan (default), realcugan, anime4k
```

#### New file: `mcp/video-generator/src/tools/upscaling.ts`

```typescript
upscale_video: {
  inputPath: string,         // Required: source video
  outputPath?: string,       // Optional: output path (default: auto-named)
  scale?: number,            // 2, 3, or 4 (default: 4 for 4K)
  model?: string,            // realesrgan, realcugan, anime4k
  gpuId?: number,            // GPU index for multi-GPU systems
}
```

#### Modify: `mcp/video-generator/src/utils/paths.ts`

```typescript
export const VIDEO2X_PATH = process.env.VIDEO2X_PATH || "C:/Program Files/Video2X/video2x.exe";
```

#### Modify: `mcp/video-generator/src/server.ts`

```typescript
import { upscalingTools } from "./tools/upscaling.js";
registerTools(upscalingTools as unknown as Record<string, ToolDef>);
```

### Video2X CLI Reference

```bash
# Basic upscale to 4x
video2x -i input.mp4 -o output.mp4 -p realesrgan -s 4

# With GPU selection
video2x -i input.mp4 -o output.mp4 -p realesrgan -s 4 --gpuid 0

# Available processors (-p):
# - realesrgan: Best for real/AI-generated content
# - realcugan: Good for anime, less artifacts
# - anime4k: Fast, optimized for anime

# Scale factors (-s): 2, 3, 4
```

### Output Naming Convention

```
input: data/video/veo_abc123.mp4 (720p)
output: data/video/veo_abc123_4k.mp4
```

## Files to Create

| File | Purpose |
|------|---------|
| `mcp/video-generator/src/services/upscaling.ts` | Video2X CLI wrapper service |
| `mcp/video-generator/src/tools/upscaling.ts` | MCP tool definition |

## Files to Modify

| File | Change |
|------|--------|
| `mcp/video-generator/src/utils/paths.ts` | Add VIDEO2X_PATH |
| `mcp/video-generator/src/server.ts` | Register upscalingTools |

## Verification

1. **Install Video2X:**
   ```
   Download and run video2x-qt6-windows-amd64-installer.exe
   ```

2. **Test CLI manually:**
   ```bash
   "C:\Program Files\Video2X\video2x.exe" -i test.mp4 -o test_4k.mp4 -p realesrgan -s 4
   ```

3. **Build MCP server:**
   ```bash
   cd mcp/video-generator && npm run build
   ```

4. **Test MCP tool:**
   ```
   Use upscale_video tool with a Veo output file
   Verify 4K output is created
   Check quality matches expectations
   ```

## Notes

- **Processing time:** ~1-5 min per 8-second clip depending on resolution
- **VRAM usage:** Real-ESRGAN uses ~2-4 GB VRAM
- **Output format:** Same as input (MP4 with H.264/H.265)

## Sources

- [Video2X GitHub](https://github.com/k4yt3x/video2x)
- [Video2X Releases](https://github.com/k4yt3x/video2x/releases)
- [Video2X Documentation](https://docs.video2x.org/)
