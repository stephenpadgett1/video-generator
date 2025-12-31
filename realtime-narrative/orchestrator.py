"""
Orchestrator for Real-time Narrative System

Main loop that coordinates:
- Clip selection via LLM
- Playback queue management
- User feedback processing
- Buffer maintenance
"""

import json
import threading
import time
from typing import Optional
from dataclasses import dataclass

from manifest_loader import ManifestLoader
from selector import Selector
from playback import PlaybackController, DummyPlaybackController


@dataclass
class OrchestratorConfig:
    """Configuration for the orchestrator."""
    # Buffer settings
    min_buffer_seconds: float = 15.0  # Minimum buffer before triggering selection
    target_buffer_seconds: float = 30.0  # Target buffer to maintain
    
    # Selection settings
    clips_per_selection: int = 3  # How many clips to select at once
    
    # Timing
    poll_interval: float = 1.0  # How often to check buffer status
    
    # Playback
    use_dummy_playback: bool = False  # Use dummy controller (no mpv)
    fullscreen: bool = False


class Orchestrator:
    """
    Main orchestrator for the real-time narrative system.
    
    Manages the loop:
    1. Monitor playback buffer
    2. When buffer low, call selector for more clips
    3. Add selected clips to playback queue
    4. Process user feedback to influence selection
    """
    
    def __init__(
        self,
        manifest_path: str,
        clips_base_path: Optional[str] = None,
        config: Optional[OrchestratorConfig] = None
    ):
        self.config = config or OrchestratorConfig()
        
        # Initialize components
        print("Loading manifest...")
        self.manifest = ManifestLoader(manifest_path, clips_base_path)
        
        print("Initializing selector...")
        self.selector = Selector(self.manifest)
        
        print("Initializing playback...")
        if self.config.use_dummy_playback:
            self.playback = DummyPlaybackController(clips_base_path)
        else:
            self.playback = PlaybackController(clips_base_path=clips_base_path)
        
        # State
        self.running = False
        self.queued_filenames: list[str] = []
        self._buffer_thread: Optional[threading.Thread] = None
        self._feedback_queue: list[str] = []
        self._lock = threading.Lock()
        
        # Stats
        self.clips_played = 0
        self.selections_made = 0
    
    def start(self) -> bool:
        """Start the orchestrator."""
        print("\nStarting orchestrator...")
        
        # Start playback
        if not self.playback.start_mpv(fullscreen=self.config.fullscreen):
            print("Failed to start mpv")
            return False
        
        time.sleep(0.5)
        
        if not self.config.use_dummy_playback:
            if not self.playback.connect():
                print("Failed to connect to mpv")
                return False
        
        # Initial selection to seed the buffer
        print("Making initial clip selection...")
        self._fill_buffer()
        
        # Start playback
        self.playback.play()
        
        # Start buffer management thread
        self.running = True
        self._buffer_thread = threading.Thread(target=self._buffer_loop, daemon=True)
        self._buffer_thread.start()
        
        print("Orchestrator started!")
        return True
    
    def stop(self) -> None:
        """Stop the orchestrator."""
        print("\nStopping orchestrator...")
        self.running = False
        
        if self._buffer_thread:
            self._buffer_thread.join(timeout=2.0)
        
        self.playback.stop_mpv()
        print("Orchestrator stopped.")
    
    def _buffer_loop(self) -> None:
        """Background loop to maintain playback buffer."""
        while self.running:
            try:
                # Check buffer status
                buffer_time = self.playback.get_queue_duration()
                
                if buffer_time < self.config.min_buffer_seconds:
                    print(f"\n[Buffer low: {buffer_time:.1f}s] Selecting more clips...")
                    self._fill_buffer()
                
                # Process any queued feedback
                with self._lock:
                    feedback_to_process = self._feedback_queue.copy()
                    self._feedback_queue.clear()
                
                for feedback in feedback_to_process:
                    self.selector.process_feedback(feedback)
                
                # Update played clips tracking
                status = self.playback.get_status()
                if status.filename:
                    self._mark_current_as_played(status.filename)
                
            except Exception as e:
                print(f"Buffer loop error: {e}")
            
            time.sleep(self.config.poll_interval)
    
    def _fill_buffer(self) -> None:
        """Select and queue clips to fill the buffer."""
        # Get exclusion list (recently played + already queued)
        exclude = [p["filename"] for p in self.selector.state.recently_played]
        exclude.extend(self.queued_filenames)
        
        # Select clips
        result = self.selector.select(
            num_selections=self.config.clips_per_selection,
            exclude_filenames=exclude
        )
        
        if "error" in result:
            print(f"Selection error: {result['error']}")
            return
        
        selections = result.get("selections", [])
        if not selections:
            print("No clips selected!")
            return
        
        # Add to playback queue
        for sel in selections:
            filename = sel["filename"]
            if self.playback.add_to_playlist(filename):
                self.queued_filenames.append(filename)
                print(f"  Queued: {filename}")
                print(f"    Reason: {sel.get('reasoning', 'N/A')}")
            else:
                print(f"  Failed to queue: {filename}")
        
        self.selections_made += 1
        
        # Show narrative info
        if result.get("narrative_note"):
            print(f"\n  Narrative: {result['narrative_note']}")
        if result.get("suggested_direction"):
            print(f"  Suggested direction: {result['suggested_direction']}")
    
    def _mark_current_as_played(self, filename: str) -> None:
        """Mark the current file as played and remove from queue."""
        if filename in self.queued_filenames:
            self.queued_filenames.remove(filename)
            self.selector.mark_played(filename)
            self.clips_played += 1
    
    def add_feedback(self, feedback: str) -> None:
        """Add user feedback (thread-safe)."""
        with self._lock:
            self._feedback_queue.append(feedback)
        print(f"Feedback queued: {feedback}")
    
    def set_coherence(self, level: float) -> None:
        """Set coherence level."""
        self.selector.set_coherence(level)
    
    def set_direction(self, direction: str) -> None:
        """Set narrative direction."""
        self.selector.set_direction(direction)
    
    def get_state_summary(self) -> dict:
        """Get current state summary."""
        status = self.playback.get_status()
        return {
            "playing": status.playing,
            "current_clip": status.filename,
            "position": f"{status.position:.1f}/{status.duration:.1f}s",
            "buffer_time": f"{self.playback.get_queue_duration():.1f}s",
            "queued_clips": len(self.queued_filenames),
            "clips_played": self.clips_played,
            "selections_made": self.selections_made,
            "coherence": self.selector.state.coherence_level,
            "direction": self.selector.state.direction,
            "mood_trajectory": self.selector.state.mood_trajectory[-5:],
        }


def main():
    """Interactive orchestrator session."""
    import sys
    import os
    
    if len(sys.argv) < 2:
        print("Usage: python orchestrator.py <manifest.json> [clips_base_path] [--dummy]")
        print()
        print("Options:")
        print("  --dummy    Use dummy playback (no mpv required)")
        print()
        sys.exit(1)
    
    # Check for API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable not set")
        sys.exit(1)
    
    manifest_path = sys.argv[1]
    clips_base_path = None
    use_dummy = "--dummy" in sys.argv
    
    # Find clips base path (first arg that's not a flag)
    for arg in sys.argv[2:]:
        if not arg.startswith("--"):
            clips_base_path = arg
            break
    
    config = OrchestratorConfig(
        use_dummy_playback=use_dummy,
        min_buffer_seconds=15.0,
        target_buffer_seconds=30.0,
        clips_per_selection=3,
    )
    
    orchestrator = Orchestrator(manifest_path, clips_base_path, config)
    
    if not orchestrator.start():
        print("Failed to start orchestrator")
        sys.exit(1)
    
    print("\n" + "="*50)
    print("REAL-TIME NARRATIVE SYSTEM")
    print("="*50)
    print("\nCommands:")
    print("  <any text>       - Add as feedback to influence selection")
    print("  /status          - Show current state")
    print("  /coherence <0-1> - Set coherence level")
    print("  /direction <text>- Set narrative direction")
    print("  /pause           - Pause playback")
    print("  /play            - Resume playback")
    print("  /next            - Skip to next clip")
    print("  /quit            - Exit")
    print()
    print("Type anything to influence the narrative...")
    print("="*50 + "\n")
    
    try:
        while True:
            try:
                cmd = input().strip()
            except EOFError:
                break
            
            if not cmd:
                continue
            
            # Check for commands
            if cmd.startswith("/"):
                parts = cmd[1:].split(maxsplit=1)
                action = parts[0].lower()
                arg = parts[1] if len(parts) > 1 else None
                
                if action == "quit":
                    break
                elif action == "status":
                    state = orchestrator.get_state_summary()
                    print("\n--- Current State ---")
                    for k, v in state.items():
                        print(f"  {k}: {v}")
                    print()
                elif action == "coherence" and arg:
                    try:
                        orchestrator.set_coherence(float(arg))
                    except ValueError:
                        print("Usage: /coherence <0.0-1.0>")
                elif action == "direction" and arg:
                    orchestrator.set_direction(arg)
                elif action == "pause":
                    orchestrator.playback.pause()
                    print("Paused")
                elif action == "play":
                    orchestrator.playback.play()
                    print("Playing")
                elif action == "next":
                    orchestrator.playback.next()
                    print("Skipped")
                else:
                    print(f"Unknown command: /{action}")
            else:
                # Treat as feedback
                orchestrator.add_feedback(cmd)
    
    except KeyboardInterrupt:
        print("\nInterrupted")
    
    finally:
        orchestrator.stop()
        
        # Final stats
        print("\n--- Session Stats ---")
        print(f"  Clips played: {orchestrator.clips_played}")
        print(f"  Selections made: {orchestrator.selections_made}")
        print(f"  Final direction: {orchestrator.selector.state.direction}")


if __name__ == "__main__":
    main()
