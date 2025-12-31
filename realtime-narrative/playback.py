"""
Playback Controller for Real-time Narrative System

Controls mpv via JSON IPC for playlist management and playback status.
"""

import json
import socket
import subprocess
import time
import os
from pathlib import Path
from typing import Optional
from dataclasses import dataclass


@dataclass
class PlaybackStatus:
    """Current playback state."""
    playing: bool = False
    filename: Optional[str] = None
    position: float = 0.0
    duration: float = 0.0
    playlist_count: int = 0
    playlist_pos: int = 0
    paused: bool = False


class PlaybackController:
    """
    Controls mpv playback via JSON IPC.
    
    mpv must be started with: mpv --idle --input-ipc-server=/tmp/mpv-socket
    """
    
    def __init__(self, socket_path: str = "/tmp/mpv-socket", clips_base_path: Optional[str] = None):
        self.socket_path = socket_path
        self.clips_base_path = Path(clips_base_path) if clips_base_path else None
        self._socket: Optional[socket.socket] = None
        self._mpv_process: Optional[subprocess.Popen] = None
    
    def start_mpv(self, fullscreen: bool = False) -> bool:
        """Start mpv with IPC enabled."""
        # Kill any existing mpv on this socket
        self._cleanup_socket()
        
        cmd = [
            "mpv",
            "--idle",
            f"--input-ipc-server={self.socket_path}",
            "--keep-open=yes",  # Don't close when playlist ends
            "--force-window=yes",  # Show window even when idle
        ]
        
        if fullscreen:
            cmd.append("--fullscreen")
        
        try:
            self._mpv_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # Wait for socket to be ready
            for _ in range(50):  # 5 seconds max
                time.sleep(0.1)
                if os.path.exists(self.socket_path):
                    return True
            
            print("Warning: mpv started but socket not ready")
            return False
            
        except FileNotFoundError:
            print("Error: mpv not found. Install with: apt install mpv")
            return False
    
    def _cleanup_socket(self) -> None:
        """Remove stale socket file."""
        try:
            os.unlink(self.socket_path)
        except FileNotFoundError:
            pass
    
    def connect(self) -> bool:
        """Connect to mpv IPC socket."""
        if self._socket:
            return True
        
        try:
            self._socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self._socket.connect(self.socket_path)
            self._socket.setblocking(False)
            return True
        except (socket.error, FileNotFoundError) as e:
            print(f"Failed to connect to mpv: {e}")
            self._socket = None
            return False
    
    def disconnect(self) -> None:
        """Disconnect from mpv."""
        if self._socket:
            try:
                self._socket.close()
            except Exception:
                pass
            self._socket = None
    
    def stop_mpv(self) -> None:
        """Stop the mpv process."""
        self.disconnect()
        if self._mpv_process:
            self._mpv_process.terminate()
            self._mpv_process.wait()
            self._mpv_process = None
        self._cleanup_socket()
    
    def _send_command(self, command: list) -> Optional[dict]:
        """Send a command to mpv and get response."""
        if not self._socket and not self.connect():
            return None
        
        msg = json.dumps({"command": command}) + "\n"
        
        try:
            self._socket.send(msg.encode())
            
            # Read response (may need multiple reads)
            response = b""
            self._socket.setblocking(True)
            self._socket.settimeout(2.0)
            
            while True:
                chunk = self._socket.recv(4096)
                response += chunk
                if b"\n" in response:
                    break
            
            self._socket.setblocking(False)
            return json.loads(response.decode().strip())
            
        except (socket.error, json.JSONDecodeError) as e:
            print(f"Command failed: {e}")
            self._socket = None
            return None
    
    def _get_property(self, name: str) -> Optional[any]:
        """Get an mpv property."""
        result = self._send_command(["get_property", name])
        if result and result.get("error") == "success":
            return result.get("data")
        return None
    
    def get_full_path(self, filename: str) -> str:
        """Get full path for a clip filename."""
        if self.clips_base_path:
            return str(self.clips_base_path / filename)
        return filename
    
    def add_to_playlist(self, filename: str, play_now: bool = False) -> bool:
        """Add a file to the playlist."""
        path = self.get_full_path(filename)
        
        if play_now:
            result = self._send_command(["loadfile", path, "replace"])
        else:
            result = self._send_command(["loadfile", path, "append"])
        
        return result is not None and result.get("error") == "success"
    
    def add_multiple(self, filenames: list[str]) -> int:
        """Add multiple files to playlist. Returns count of successfully added."""
        added = 0
        for fn in filenames:
            if self.add_to_playlist(fn):
                added += 1
        return added
    
    def clear_playlist(self) -> bool:
        """Clear the playlist."""
        result = self._send_command(["playlist-clear"])
        return result is not None
    
    def play(self) -> bool:
        """Start/resume playback."""
        result = self._send_command(["set_property", "pause", False])
        return result is not None
    
    def pause(self) -> bool:
        """Pause playback."""
        result = self._send_command(["set_property", "pause", True])
        return result is not None
    
    def next(self) -> bool:
        """Skip to next item in playlist."""
        result = self._send_command(["playlist-next"])
        return result is not None
    
    def previous(self) -> bool:
        """Go to previous item in playlist."""
        result = self._send_command(["playlist-prev"])
        return result is not None
    
    def seek(self, seconds: float, relative: bool = True) -> bool:
        """Seek in current file."""
        mode = "relative" if relative else "absolute"
        result = self._send_command(["seek", str(seconds), mode])
        return result is not None
    
    def get_status(self) -> PlaybackStatus:
        """Get current playback status."""
        status = PlaybackStatus()
        
        status.playing = not (self._get_property("idle-active") or False)
        status.paused = self._get_property("pause") or False
        status.filename = self._get_property("filename")
        status.position = self._get_property("time-pos") or 0.0
        status.duration = self._get_property("duration") or 0.0
        status.playlist_count = self._get_property("playlist-count") or 0
        status.playlist_pos = self._get_property("playlist-pos") or 0
        
        return status
    
    def get_playlist(self) -> list[dict]:
        """Get the current playlist."""
        playlist = self._get_property("playlist")
        return playlist or []
    
    def get_remaining_time(self) -> float:
        """Get remaining time in current file."""
        status = self.get_status()
        if status.duration > 0:
            return status.duration - status.position
        return 0.0
    
    def get_queue_duration(self) -> float:
        """Estimate total duration of remaining playlist items."""
        status = self.get_status()
        playlist = self.get_playlist()
        
        # Current file remaining
        remaining = self.get_remaining_time()
        
        # Add assumed duration for remaining files (rough estimate)
        # In reality we'd want to know actual durations
        remaining_files = len(playlist) - status.playlist_pos - 1
        remaining += remaining_files * 8  # Assume 8 sec average
        
        return remaining
    
    def set_volume(self, volume: int) -> bool:
        """Set volume (0-100)."""
        result = self._send_command(["set_property", "volume", volume])
        return result is not None


class DummyPlaybackController:
    """
    Dummy controller for testing without mpv.
    Simulates playback timing.
    """
    
    def __init__(self, clips_base_path: Optional[str] = None):
        self.clips_base_path = Path(clips_base_path) if clips_base_path else None
        self.playlist: list[str] = []
        self.current_pos: int = 0
        self.playing: bool = False
        self.start_time: float = 0
        self._clip_duration: float = 8.0  # Assumed duration
    
    def start_mpv(self, fullscreen: bool = False) -> bool:
        print("[DUMMY] mpv 'started'")
        return True
    
    def connect(self) -> bool:
        return True
    
    def disconnect(self) -> None:
        pass
    
    def stop_mpv(self) -> None:
        print("[DUMMY] mpv 'stopped'")
    
    def add_to_playlist(self, filename: str, play_now: bool = False) -> bool:
        if play_now:
            self.playlist = [filename]
            self.current_pos = 0
            self.playing = True
            self.start_time = time.time()
        else:
            self.playlist.append(filename)
        print(f"[DUMMY] Added to playlist: {filename}")
        return True
    
    def add_multiple(self, filenames: list[str]) -> int:
        for fn in filenames:
            self.add_to_playlist(fn)
        return len(filenames)
    
    def clear_playlist(self) -> bool:
        self.playlist = []
        self.current_pos = 0
        return True
    
    def play(self) -> bool:
        self.playing = True
        self.start_time = time.time()
        print("[DUMMY] Playing")
        return True
    
    def pause(self) -> bool:
        self.playing = False
        print("[DUMMY] Paused")
        return True
    
    def next(self) -> bool:
        if self.current_pos < len(self.playlist) - 1:
            self.current_pos += 1
            self.start_time = time.time()
            print(f"[DUMMY] Next: {self.playlist[self.current_pos]}")
        return True
    
    def get_status(self) -> PlaybackStatus:
        elapsed = time.time() - self.start_time if self.playing else 0
        return PlaybackStatus(
            playing=self.playing,
            filename=self.playlist[self.current_pos] if self.playlist else None,
            position=elapsed % self._clip_duration,
            duration=self._clip_duration,
            playlist_count=len(self.playlist),
            playlist_pos=self.current_pos,
            paused=not self.playing
        )
    
    def get_playlist(self) -> list[dict]:
        return [{"filename": f} for f in self.playlist]
    
    def get_remaining_time(self) -> float:
        if not self.playing:
            return 0
        elapsed = time.time() - self.start_time
        return max(0, self._clip_duration - (elapsed % self._clip_duration))
    
    def get_queue_duration(self) -> float:
        remaining = self.get_remaining_time()
        remaining_files = len(self.playlist) - self.current_pos - 1
        remaining += remaining_files * self._clip_duration
        return remaining


# Test when run directly
if __name__ == "__main__":
    import sys
    
    use_dummy = "--dummy" in sys.argv
    
    if use_dummy:
        print("Using dummy controller (no actual playback)")
        controller = DummyPlaybackController()
    else:
        print("Using real mpv controller")
        controller = PlaybackController()
        
        if not controller.start_mpv():
            print("Failed to start mpv")
            sys.exit(1)
        
        time.sleep(0.5)  # Let mpv initialize
        
        if not controller.connect():
            print("Failed to connect to mpv")
            sys.exit(1)
    
    print("\n=== Playback Controller Test ===")
    print("Commands:")
    print("  add <file>   - Add file to playlist")
    print("  play         - Start playback")
    print("  pause        - Pause")
    print("  next         - Next track")
    print("  status       - Show status")
    print("  playlist     - Show playlist")
    print("  quit         - Exit")
    print()
    
    try:
        while True:
            cmd = input("playback> ").strip()
            
            if not cmd:
                continue
            
            parts = cmd.split(maxsplit=1)
            action = parts[0].lower()
            arg = parts[1] if len(parts) > 1 else None
            
            if action == "quit":
                break
            elif action == "add" and arg:
                controller.add_to_playlist(arg)
                print("Added")
            elif action == "play":
                controller.play()
            elif action == "pause":
                controller.pause()
            elif action == "next":
                controller.next()
            elif action == "status":
                s = controller.get_status()
                print(f"Playing: {s.playing}, Paused: {s.paused}")
                print(f"File: {s.filename}")
                print(f"Position: {s.position:.1f}/{s.duration:.1f}s")
                print(f"Playlist: {s.playlist_pos + 1}/{s.playlist_count}")
            elif action == "playlist":
                for i, item in enumerate(controller.get_playlist()):
                    print(f"  {i}: {item.get('filename', item)}")
            else:
                print(f"Unknown: {action}")
    
    finally:
        if not use_dummy:
            controller.stop_mpv()
        print("Done")
