"""
Manifest Loader for Real-time Narrative System

Loads clip metadata and provides search/filter capabilities for the selector.
"""

import json
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class Clip:
    """Represents a single video clip with its metadata."""
    filename: str
    file_path: str
    duration: float
    width: int
    height: int
    aspect_ratio: str
    description: str
    subjects: list[str]
    setting: str
    mood: str
    visual_style: str
    dominant_colors: list[str]
    camera_work: str
    motion_intensity: str
    has_speech: bool
    speech_transcript: Optional[str]
    has_music: bool
    music_description: Optional[str]
    ambient_sounds: Optional[str]
    starts_clean: bool
    ends_clean: bool
    suggested_tags: list[str]
    raw_data: dict = field(repr=False)
    
    @classmethod
    def from_json(cls, data: dict) -> "Clip":
        """Create a Clip from raw JSON manifest entry."""
        tech = data.get("technical", {})
        analysis = data.get("analysis", {})
        audio = analysis.get("audio", {})
        
        return cls(
            filename=data.get("filename", ""),
            file_path=data.get("filePath", ""),
            duration=tech.get("durationSeconds", 0),
            width=tech.get("width", 0),
            height=tech.get("height", 0),
            aspect_ratio=tech.get("aspectRatio", ""),
            description=analysis.get("description", ""),
            subjects=analysis.get("subjects", []),
            setting=analysis.get("setting", ""),
            mood=analysis.get("mood", ""),
            visual_style=analysis.get("visualStyle", ""),
            dominant_colors=analysis.get("dominantColors", []),
            camera_work=analysis.get("cameraWork", ""),
            motion_intensity=analysis.get("motionIntensity", ""),
            has_speech=audio.get("hasSpeech", False),
            speech_transcript=audio.get("speechTranscript"),
            has_music=audio.get("hasMusic", False),
            music_description=audio.get("musicDescription"),
            ambient_sounds=audio.get("ambientSounds"),
            starts_clean=analysis.get("startsClean", True),
            ends_clean=analysis.get("endsClean", True),
            suggested_tags=analysis.get("suggestedTags", []),
            raw_data=data
        )
    
    def matches_query(self, query: str) -> bool:
        """Simple text search across key fields."""
        query_lower = query.lower()
        searchable = " ".join([
            self.description,
            self.setting,
            self.mood,
            self.visual_style,
            " ".join(self.subjects),
            " ".join(self.suggested_tags),
            self.speech_transcript or "",
        ]).lower()
        return query_lower in searchable
    
    def to_selector_context(self) -> dict:
        """Return a condensed version for the LLM selector."""
        return {
            "filename": self.filename,
            "duration": self.duration,
            "description": self.description,
            "mood": self.mood,
            "setting": self.setting,
            "subjects": self.subjects[:5],  # limit for token efficiency
            "tags": self.suggested_tags[:8],
            "has_speech": self.has_speech,
            "speech_preview": (self.speech_transcript[:100] + "...") if self.speech_transcript and len(self.speech_transcript) > 100 else self.speech_transcript,
            "motion": self.motion_intensity,
            "colors": self.dominant_colors[:4],
        }


class ManifestLoader:
    """Loads and manages the clip manifest."""
    
    def __init__(self, manifest_path: Optional[str] = None, clips_base_path: Optional[str] = None):
        self.clips: list[Clip] = []
        self.clips_by_filename: dict[str, Clip] = {}
        self.clips_base_path = Path(clips_base_path) if clips_base_path else None
        
        if manifest_path:
            self.load(manifest_path)
    
    def load(self, manifest_path: str) -> None:
        """Load manifest from JSON file."""
        with open(manifest_path, 'r') as f:
            data = json.load(f)
        
        # Handle both array format and object-with-clips format
        if isinstance(data, list):
            clip_list = data
        elif isinstance(data, dict) and "clips" in data:
            clip_list = data["clips"]
        else:
            raise ValueError("Manifest must be a JSON array or object with 'clips' key")
        
        self.clips = [Clip.from_json(c) for c in clip_list]
        self.clips_by_filename = {c.filename: c for c in self.clips}
        
        print(f"Loaded {len(self.clips)} clips from manifest")
    
    def get_clip(self, filename: str) -> Optional[Clip]:
        """Get a specific clip by filename."""
        return self.clips_by_filename.get(filename)
    
    def get_full_path(self, clip: Clip) -> Path:
        """Get the full filesystem path for a clip."""
        if self.clips_base_path:
            return self.clips_base_path / clip.file_path
        return Path(clip.file_path)
    
    def search(self, query: str) -> list[Clip]:
        """Simple text search across all clips."""
        return [c for c in self.clips if c.matches_query(query)]
    
    def filter_by_mood(self, mood_keywords: list[str]) -> list[Clip]:
        """Filter clips by mood keywords (any match)."""
        mood_keywords_lower = [m.lower() for m in mood_keywords]
        return [
            c for c in self.clips 
            if any(kw in c.mood.lower() for kw in mood_keywords_lower)
        ]
    
    def filter_by_tags(self, tags: list[str], match_all: bool = False) -> list[Clip]:
        """Filter clips by tags."""
        tags_lower = set(t.lower() for t in tags)
        
        def clip_matches(clip: Clip) -> bool:
            clip_tags = set(t.lower() for t in clip.suggested_tags)
            if match_all:
                return tags_lower.issubset(clip_tags)
            return bool(tags_lower & clip_tags)
        
        return [c for c in self.clips if clip_matches(c)]
    
    def filter_by_motion(self, intensity: str) -> list[Clip]:
        """Filter by motion intensity: low, medium, high."""
        return [c for c in self.clips if c.motion_intensity.lower() == intensity.lower()]
    
    def filter_has_speech(self, has_speech: bool = True) -> list[Clip]:
        """Filter clips by whether they have speech."""
        return [c for c in self.clips if c.has_speech == has_speech]
    
    def filter_clean_cuts(self, starts_clean: bool = True, ends_clean: bool = True) -> list[Clip]:
        """Filter clips that have clean start/end points for editing."""
        return [
            c for c in self.clips 
            if c.starts_clean == starts_clean and c.ends_clean == ends_clean
        ]
    
    def get_all_tags(self) -> dict[str, int]:
        """Get all tags with their frequency counts."""
        tag_counts: dict[str, int] = {}
        for clip in self.clips:
            for tag in clip.suggested_tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        return dict(sorted(tag_counts.items(), key=lambda x: -x[1]))
    
    def get_all_moods(self) -> dict[str, int]:
        """Get all unique mood strings with counts."""
        mood_counts: dict[str, int] = {}
        for clip in self.clips:
            mood_counts[clip.mood] = mood_counts.get(clip.mood, 0) + 1
        return dict(sorted(mood_counts.items(), key=lambda x: -x[1]))
    
    def get_selector_batch(self, clips: list[Clip], max_clips: int = 50) -> list[dict]:
        """Get a batch of clips formatted for the LLM selector."""
        return [c.to_selector_context() for c in clips[:max_clips]]
    
    def stats(self) -> dict:
        """Get summary statistics about the manifest."""
        total_duration = sum(c.duration for c in self.clips)
        return {
            "total_clips": len(self.clips),
            "total_duration_seconds": total_duration,
            "total_duration_minutes": round(total_duration / 60, 1),
            "with_speech": len([c for c in self.clips if c.has_speech]),
            "with_music": len([c for c in self.clips if c.has_music]),
            "clean_cuts": len([c for c in self.clips if c.starts_clean and c.ends_clean]),
            "unique_tags": len(self.get_all_tags()),
        }


# Quick test when run directly
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python manifest_loader.py <manifest.json> [clips_base_path]")
        print("\nCreating a test with sample data...")
        
        # Create sample data for testing
        sample_data = [
            {
                "filename": "17th_century_dutch_202512031808_3aemg.mp4",
                "filePath": "17th_century_dutch_202512031808_3aemg.mp4",
                "originalPrompt": None,
                "technical": {
                    "durationSeconds": 8,
                    "width": 720,
                    "height": 1280,
                    "aspectRatio": "720:1280",
                    "fileSizeBytes": 2296407,
                    "fileSizeMB": "2.19"
                },
                "analysis": {
                    "description": "In a dimly lit, 17th-century style room, an artist paints a still life by tracing a brightly projected image from a camera obscura.",
                    "subjects": ["artist", "painter", "camera obscura", "painting", "easel"],
                    "setting": "A dimly lit artist's studio, reminiscent of the 17th-century Dutch Golden Age",
                    "mood": "Suspicious, dramatic, accusatory, tense",
                    "visualStyle": "Chiaroscuro lighting with high contrast",
                    "dominantColors": ["black", "brown", "dark green", "white"],
                    "cameraWork": "Static, medium shot",
                    "audio": {
                        "hasSpeech": True,
                        "speechTranscript": "He is cheating. It is not art.",
                        "hasMusic": False,
                        "musicDescription": None,
                        "ambientSounds": "Faint room tone"
                    },
                    "motionIntensity": "low",
                    "startsClean": True,
                    "endsClean": True,
                    "suggestedTags": ["artist", "painter", "cheating", "camera obscura", "historical", "Dutch Golden Age"]
                }
            }
        ]
        
        # Write sample manifest
        sample_path = "/tmp/sample_manifest.json"
        with open(sample_path, 'w') as f:
            json.dump(sample_data, f)
        
        loader = ManifestLoader(sample_path)
    else:
        clips_base = sys.argv[2] if len(sys.argv) > 2 else None
        loader = ManifestLoader(sys.argv[1], clips_base)
    
    print("\n=== Manifest Stats ===")
    for key, value in loader.stats().items():
        print(f"  {key}: {value}")
    
    print("\n=== Top 10 Tags ===")
    for tag, count in list(loader.get_all_tags().items())[:10]:
        print(f"  {tag}: {count}")
    
    print("\n=== Sample Search: 'dark' ===")
    results = loader.search("dark")
    print(f"  Found {len(results)} clips")
    if results:
        print(f"  First result: {results[0].filename}")
        print(f"  Description: {results[0].description[:100]}...")
    
    print("\n=== Sample Clip Context (for selector) ===")
    if loader.clips:
        import json as json_module
        print(json_module.dumps(loader.clips[0].to_selector_context(), indent=2))
