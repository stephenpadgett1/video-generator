# Character Naming and Description

Generate names and descriptions for all 45 detected characters by viewing representative frames.

## Approach

1. For each character, get their first clip_id from characters.json
2. Extract a frame from that clip at a timestamp where the face was detected
3. View the frame with Claude's vision capability
4. Generate a fitting name (first name or amusing name as appropriate)
5. Write a brief description of their appearance
6. Update via `update_character` tool

## Script

Create `scripts/face-detection/describe_characters.py`:
- Iterates through all 45 characters
- Extracts representative frames to `data/temp/char_frames/`
- Outputs frame paths for viewing

Then view frames and call `update_character` for each.

## Verification

After completion:
- `list_characters` should show names
- `get_character(char_id)` should return descriptions
- `characters.json` should have all metadata populated
