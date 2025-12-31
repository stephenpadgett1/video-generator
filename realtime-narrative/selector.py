"""
Selector for Real-time Narrative System

Uses an LLM to select clips based on narrative state and user feedback.
Supports configurable coherence levels from pure dream logic to strict narrative.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
import anthropic

from manifest_loader import ManifestLoader, Clip


@dataclass
class NarrativeState:
    """Tracks the current state of the narrative experience."""
    direction: str = "open exploration"
    coherence_level: float = 0.3  # 0.0 = pure dream, 1.0 = strict narrative
    recently_played: list[dict] = field(default_factory=list)
    current_queue: list[str] = field(default_factory=list)  # filenames
    feedback_history: list[dict] = field(default_factory=list)
    mood_trajectory: list[str] = field(default_factory=list)
    
    def add_played(self, clip: Clip) -> None:
        """Record a clip as played."""
        self.recently_played.append({
            "filename": clip.filename,
            "description": clip.description[:150],
            "mood": clip.mood,
            "played_at": datetime.now().isoformat()
        })
        # Keep last 10
        self.recently_played = self.recently_played[-10:]
        
        # Track mood trajectory
        self.mood_trajectory.append(clip.mood)
        self.mood_trajectory = self.mood_trajectory[-15:]
    
    def add_feedback(self, feedback: str) -> None:
        """Record user feedback."""
        self.feedback_history.append({
            "text": feedback,
            "at": datetime.now().isoformat()
        })
        # Keep last 10
        self.feedback_history = self.feedback_history[-10:]
    
    def get_recent_feedback(self, n: int = 5) -> list[str]:
        """Get the N most recent feedback strings."""
        return [f["text"] for f in self.feedback_history[-n:]]
    
    def to_context(self) -> dict:
        """Export state for the selector prompt."""
        return {
            "direction": self.direction,
            "coherence_level": self.coherence_level,
            "recently_played": self.recently_played[-5:],
            "recent_feedback": self.get_recent_feedback(5),
            "mood_trajectory": self.mood_trajectory[-5:],
            "queued_count": len(self.current_queue)
        }


class Selector:
    """LLM-based clip selector."""
    
    def __init__(self, manifest: ManifestLoader, model: str = "claude-sonnet-4-20250514"):
        self.manifest = manifest
        self.model = model
        self.client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var
        self.state = NarrativeState()
    
    def build_prompt(self, available_clips: list[dict], num_selections: int = 3) -> str:
        """Build the selection prompt."""
        state_ctx = self.state.to_context()
        
        coherence_desc = self._coherence_description(state_ctx["coherence_level"])
        
        prompt = f"""You are selecting video clips for a real-time narrative experience. Your selections will be played in sequence to create an evolving visual story.

## COHERENCE LEVEL: {state_ctx['coherence_level']:.1f}
{coherence_desc}

## CURRENT NARRATIVE DIRECTION
{state_ctx['direction']}

## RECENTLY PLAYED CLIPS (most recent last)
{json.dumps(state_ctx['recently_played'], indent=2) if state_ctx['recently_played'] else "None yet - this is the beginning."}

## MOOD TRAJECTORY
{' → '.join(state_ctx['mood_trajectory']) if state_ctx['mood_trajectory'] else "Not established yet."}

## RECENT USER FEEDBACK (most recent last)
{self._format_feedback(state_ctx['recent_feedback'])}

## AVAILABLE CLIPS
{json.dumps(available_clips, indent=2)}

## YOUR TASK
Select {num_selections} clips to add to the queue. Consider:
1. How they flow from what was recently played
2. The user's feedback and desired direction
3. The coherence level (low = dream logic ok, high = narrative continuity required)
4. Variety in visual style, motion, and mood while maintaining thematic threads
5. Whether clips have speech that might conflict or enhance

Return ONLY valid JSON in this exact format:
{{
  "selections": [
    {{
      "filename": "exact_filename.mp4",
      "reasoning": "Brief explanation of why this clip fits"
    }}
  ],
  "narrative_note": "Brief note on where the narrative seems to be heading",
  "suggested_direction": "Optional suggestion for evolving the narrative direction"
}}"""
        
        return prompt
    
    def _coherence_description(self, level: float) -> str:
        """Get a description of what the coherence level means."""
        if level < 0.2:
            return "PURE DREAM LOGIC: Connections can be abstract, emotional, symbolic. Visual/thematic rhymes are valid. No need for literal continuity."
        elif level < 0.4:
            return "LOOSE ASSOCIATIONS: Prioritize mood and visual flow. Thematic threads can be suggestive. Surreal juxtapositions welcome."
        elif level < 0.6:
            return "BALANCED: Mix of associative and narrative logic. Some continuity expected but creative leaps allowed."
        elif level < 0.8:
            return "NARRATIVE FORWARD: Prefer clips that build on previous content. Maintain recognizable threads and themes."
        else:
            return "STRICT NARRATIVE: Strong continuity required. Clips should clearly relate to and advance the established story."
    
    def _format_feedback(self, feedback: list[str]) -> str:
        """Format feedback for the prompt."""
        if not feedback:
            return "No feedback yet."
        return "\n".join(f"- \"{f}\"" for f in feedback)
    
    def select(self, num_selections: int = 3, exclude_filenames: Optional[list[str]] = None) -> dict:
        """
        Select clips using the LLM.
        
        Args:
            num_selections: How many clips to select
            exclude_filenames: Filenames to exclude (e.g., recently played, already queued)
        
        Returns:
            Dict with selections and metadata
        """
        exclude = set(exclude_filenames or [])
        
        # Get available clips (excluding already used ones)
        available = [c for c in self.manifest.clips if c.filename not in exclude]
        
        if not available:
            return {"error": "No available clips", "selections": []}
        
        # Convert to selector context format
        available_context = [c.to_selector_context() for c in available]
        
        # If we have too many clips, we need to be smart about which to show the LLM
        # For now, simple approach: take a sample that includes variety
        if len(available_context) > 50:
            available_context = self._smart_sample(available, 50)
        
        prompt = self.build_prompt(available_context, num_selections)
        
        # Call the LLM
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        
        # Parse the response
        response_text = response.content[0].text
        
        # Extract JSON from response (handle potential markdown wrapping)
        try:
            # Try direct parse first
            result = json.loads(response_text)
        except json.JSONDecodeError:
            # Try to find JSON in the response
            import re
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                result = json.loads(json_match.group())
            else:
                return {"error": "Failed to parse LLM response", "raw": response_text, "selections": []}
        
        # Validate selections exist in manifest
        valid_selections = []
        for sel in result.get("selections", []):
            if self.manifest.get_clip(sel["filename"]):
                valid_selections.append(sel)
            else:
                print(f"Warning: LLM selected non-existent clip: {sel['filename']}")
        
        result["selections"] = valid_selections
        return result
    
    def _smart_sample(self, clips: list[Clip], n: int) -> list[dict]:
        """
        Sample clips intelligently to show variety to the LLM.
        Tries to include diverse moods, tags, and motion levels.
        """
        import random
        
        # Group by motion intensity
        by_motion = {"low": [], "medium": [], "high": []}
        for c in clips:
            motion = c.motion_intensity.lower()
            if motion in by_motion:
                by_motion[motion].append(c)
            else:
                by_motion["medium"].append(c)
        
        # Take proportionally from each
        result = []
        per_group = n // 3
        
        for motion, group in by_motion.items():
            sample_size = min(per_group, len(group))
            result.extend(random.sample(group, sample_size))
        
        # Fill remaining slots randomly
        remaining = n - len(result)
        if remaining > 0:
            unused = [c for c in clips if c not in result]
            result.extend(random.sample(unused, min(remaining, len(unused))))
        
        return [c.to_selector_context() for c in result]
    
    def process_feedback(self, feedback: str) -> None:
        """Process user feedback and update state."""
        self.state.add_feedback(feedback)
        
        # Simple keyword detection for direction changes
        feedback_lower = feedback.lower()
        
        direction_keywords = {
            "darker": "exploring darker themes",
            "lighter": "moving toward lighter, brighter content",
            "faster": "increasing energy and pace",
            "slower": "slowing down, contemplative",
            "abstract": "embracing abstraction and surrealism",
            "narrative": "building toward clearer narrative",
            "emotional": "focusing on emotional resonance",
            "violent": "exploring conflict and tension",
            "peaceful": "seeking calm and serenity",
            "weird": "leaning into the strange and surreal",
            "funny": "looking for humor and levity",
        }
        
        for keyword, direction in direction_keywords.items():
            if keyword in feedback_lower:
                self.state.direction = direction
                print(f"Direction updated: {direction}")
                break
    
    def mark_played(self, filename: str) -> None:
        """Mark a clip as played."""
        clip = self.manifest.get_clip(filename)
        if clip:
            self.state.add_played(clip)
    
    def set_coherence(self, level: float) -> None:
        """Set the coherence level (0.0 - 1.0)."""
        self.state.coherence_level = max(0.0, min(1.0, level))
        print(f"Coherence set to: {self.state.coherence_level:.1f}")
    
    def set_direction(self, direction: str) -> None:
        """Manually set the narrative direction."""
        self.state.direction = direction
        print(f"Direction set to: {direction}")


# Interactive test
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python selector.py <manifest.json> [clips_base_path]")
        print("\nThis will start an interactive selection session.")
        sys.exit(1)
    
    # Check for API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)
    
    clips_base = sys.argv[2] if len(sys.argv) > 2 else None
    manifest = ManifestLoader(sys.argv[1], clips_base)
    
    print(f"\nLoaded manifest with {len(manifest.clips)} clips")
    print(f"Total duration: {manifest.stats()['total_duration_minutes']} minutes")
    
    selector = Selector(manifest)
    
    print("\n=== Interactive Selection Mode ===")
    print("Commands:")
    print("  select [n]     - Select n clips (default 3)")
    print("  feedback <text> - Add feedback")
    print("  coherence <0-1> - Set coherence level")
    print("  direction <text> - Set narrative direction")
    print("  state          - Show current state")
    print("  quit           - Exit")
    print()
    
    while True:
        try:
            cmd = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        
        if not cmd:
            continue
        
        parts = cmd.split(maxsplit=1)
        action = parts[0].lower()
        arg = parts[1] if len(parts) > 1 else None
        
        if action == "quit":
            break
        
        elif action == "select":
            n = int(arg) if arg else 3
            print(f"\nSelecting {n} clips...")
            
            # Exclude recently played and queued
            exclude = [p["filename"] for p in selector.state.recently_played]
            exclude.extend(selector.state.current_queue)
            
            result = selector.select(n, exclude)
            
            if "error" in result:
                print(f"Error: {result['error']}")
            else:
                print("\nSelections:")
                for sel in result["selections"]:
                    print(f"  - {sel['filename']}")
                    print(f"    Reasoning: {sel['reasoning']}")
                
                if result.get("narrative_note"):
                    print(f"\nNarrative note: {result['narrative_note']}")
                if result.get("suggested_direction"):
                    print(f"Suggested direction: {result['suggested_direction']}")
        
        elif action == "feedback":
            if arg:
                selector.process_feedback(arg)
                print("Feedback recorded.")
            else:
                print("Usage: feedback <your feedback text>")
        
        elif action == "coherence":
            if arg:
                try:
                    selector.set_coherence(float(arg))
                except ValueError:
                    print("Usage: coherence <0.0-1.0>")
            else:
                print(f"Current coherence: {selector.state.coherence_level:.1f}")
        
        elif action == "direction":
            if arg:
                selector.set_direction(arg)
            else:
                print(f"Current direction: {selector.state.direction}")
        
        elif action == "state":
            print("\nCurrent State:")
            print(json.dumps(selector.state.to_context(), indent=2))
        
        else:
            print(f"Unknown command: {action}")
