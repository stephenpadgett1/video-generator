#!/usr/bin/env python3
"""
Aggressive audio declipping and restoration.
Attempts to reconstruct clipped waveforms using interpolation.
"""

import numpy as np
from scipy import signal
from scipy.interpolate import CubicSpline
import subprocess
import sys
import os

def extract_audio(video_path, output_wav):
    """Extract audio to WAV for processing."""
    subprocess.run([
        'ffmpeg', '-y', '-i', video_path,
        '-vn', '-acodec', 'pcm_f32le', '-ar', '48000', '-ac', '2',
        output_wav
    ], check=True, capture_output=True)

def read_wav(path):
    """Read WAV file using ffmpeg (avoids dependency on soundfile)."""
    result = subprocess.run([
        'ffmpeg', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'
    ], capture_output=True, check=True)
    audio = np.frombuffer(result.stdout, dtype=np.float32)
    # Reshape to stereo
    return audio.reshape(-1, 2)

def write_wav(path, audio, sample_rate=48000):
    """Write audio back to WAV."""
    audio_bytes = audio.astype(np.float32).tobytes()
    subprocess.run([
        'ffmpeg', '-y',
        '-f', 'f32le', '-ar', str(sample_rate), '-ac', '2', '-i', 'pipe:0',
        '-acodec', 'pcm_f32le', path
    ], input=audio_bytes, check=True, capture_output=True)

def detect_clipped_regions(audio, threshold=0.98, min_samples=2):
    """Find regions where audio is clipped."""
    clipped = np.abs(audio) >= threshold
    regions = []

    in_clip = False
    start = 0

    for i in range(len(clipped)):
        if clipped[i] and not in_clip:
            start = i
            in_clip = True
        elif not clipped[i] and in_clip:
            if i - start >= min_samples:
                regions.append((start, i))
            in_clip = False

    if in_clip and len(audio) - start >= min_samples:
        regions.append((start, len(audio)))

    return regions

def cubic_declip(audio, threshold=0.98, extend=5):
    """
    Reconstruct clipped regions using cubic spline interpolation.
    Uses samples before and after the clip to estimate the true peak.
    """
    output = audio.copy()
    regions = detect_clipped_regions(audio, threshold)

    print(f"  Found {len(regions)} clipped regions")

    for start, end in regions:
        # Extend the interpolation window
        interp_start = max(0, start - extend)
        interp_end = min(len(audio), end + extend)

        # Get unclipped samples for interpolation
        x_before = np.arange(interp_start, start)
        x_after = np.arange(end, interp_end)

        if len(x_before) < 2 or len(x_after) < 2:
            continue

        x_known = np.concatenate([x_before, x_after])
        y_known = np.concatenate([audio[x_before], audio[x_after]])

        try:
            # Fit cubic spline through unclipped samples
            cs = CubicSpline(x_known, y_known)

            # Reconstruct the clipped region
            x_clipped = np.arange(start, end)
            output[start:end] = cs(x_clipped)
        except Exception:
            pass

    return output

def soft_clip_tanh(audio, drive=2.0):
    """Apply soft saturation using tanh - rounds off harsh edges."""
    return np.tanh(audio * drive) / np.tanh(drive)

def multiband_compress(audio, sr=48000):
    """
    3-band compression targeting different frequency ranges.
    Aggressive settings for heavily clipped audio.
    """
    # Design crossover filters
    low_cutoff = 200 / (sr/2)
    high_cutoff = 4000 / (sr/2)

    # Butterworth filters
    b_low, a_low = signal.butter(4, low_cutoff, btype='low')
    b_mid, a_mid = signal.butter(4, [low_cutoff, high_cutoff], btype='band')
    b_high, a_high = signal.butter(4, high_cutoff, btype='high')

    # Split into bands
    low = signal.filtfilt(b_low, a_low, audio, axis=0)
    mid = signal.filtfilt(b_mid, a_mid, audio, axis=0)
    high = signal.filtfilt(b_high, a_high, audio, axis=0)

    # Compress each band (simple soft knee compression)
    def compress(x, threshold, ratio):
        mask = np.abs(x) > threshold
        compressed = x.copy()
        compressed[mask] = np.sign(x[mask]) * (threshold + (np.abs(x[mask]) - threshold) / ratio)
        return compressed

    # Aggressive compression on low/mid (where drums live)
    low_compressed = compress(low, 0.2, 8.0)
    mid_compressed = compress(mid, 0.15, 6.0)
    high_compressed = compress(high, 0.3, 4.0)

    # Recombine with adjusted levels
    return low_compressed * 0.8 + mid_compressed * 0.9 + high_compressed * 1.0

def harmonic_exciter(audio, sr=48000):
    """Add back some harmonics that were lost in clipping (subtle)."""
    # Generate harmonics through soft saturation
    harmonics = np.tanh(audio * 3) - audio

    # High-pass the harmonics (we only want the sparkle)
    b, a = signal.butter(2, 3000 / (sr/2), btype='high')
    harmonics = signal.filtfilt(b, a, harmonics, axis=0)

    return audio + harmonics * 0.1

def de_harsh(audio, sr=48000):
    """
    Reduce harsh frequencies created by clipping.
    Clipping creates odd harmonics - target the harsh ones.
    """
    # Notch out some of the harsh frequencies (2-5kHz range)
    # Use a gentle shelf instead of harsh notches
    b, a = signal.butter(2, [2000 / (sr/2), 5000 / (sr/2)], btype='band')
    harsh = signal.filtfilt(b, a, audio, axis=0)

    # Subtract some of the harsh content
    return audio - harsh * 0.3

def normalize(audio, target_peak=0.9):
    """Normalize to target peak level."""
    peak = np.max(np.abs(audio))
    if peak > 0:
        return audio * (target_peak / peak)
    return audio

def process_full_chain(audio, sr=48000):
    """Full aggressive restoration chain."""
    print("Step 1: Cubic spline declipping...")
    audio = cubic_declip(audio[:, 0]), cubic_declip(audio[:, 1])
    audio = np.column_stack(audio)

    print("Step 2: Multiband compression...")
    audio = multiband_compress(audio, sr)

    print("Step 3: De-harshening...")
    audio = de_harsh(audio, sr)

    print("Step 4: Soft saturation pass...")
    audio = soft_clip_tanh(audio, drive=1.5)

    print("Step 5: Harmonic exciter...")
    audio = harmonic_exciter(audio, sr)

    print("Step 6: Final normalization...")
    audio = normalize(audio, 0.85)

    return audio

def main():
    if len(sys.argv) < 3:
        print("Usage: python declip_audio.py input.mp4 output.mp4")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    temp_wav = '/tmp/declip_temp.wav'
    processed_wav = '/tmp/declip_processed.wav'

    print(f"Processing: {input_path}")
    print()

    print("Extracting audio...")
    extract_audio(input_path, temp_wav)

    print("Reading audio data...")
    audio = read_wav(temp_wav)
    print(f"  Shape: {audio.shape}, Duration: {len(audio)/48000:.1f}s")
    print(f"  Input peak: {np.max(np.abs(audio)):.3f}")

    print()
    print("=== AGGRESSIVE RESTORATION ===")
    processed = process_full_chain(audio)
    print(f"  Output peak: {np.max(np.abs(processed)):.3f}")

    print()
    print("Writing processed audio...")
    write_wav(processed_wav, processed)

    print("Muxing with original video...")
    subprocess.run([
        'ffmpeg', '-y',
        '-i', input_path,
        '-i', processed_wav,
        '-map', '0:v', '-map', '1:a',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
        output_path
    ], check=True, capture_output=True)

    # Cleanup
    os.remove(temp_wav)
    os.remove(processed_wav)

    print()
    print(f"Done! Output: {output_path}")

if __name__ == '__main__':
    main()
