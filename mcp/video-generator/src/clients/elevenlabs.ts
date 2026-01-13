import fs from "fs";
import path from "path";
import { loadConfig } from "../utils/config.js";
import { AUDIO_DIR, DATA_DIR } from "../utils/paths.js";

const VOICES_CACHE_PATH = path.join(DATA_DIR, "elevenlabs-voices.json");
const TTS_DIR = path.join(AUDIO_DIR, "tts");
const MUSIC_DIR = path.join(AUDIO_DIR, "music");

export interface Voice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
}

export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
}

export interface VoicesCache {
  fetchedAt: string;
  voices: Voice[];
}

export interface TTSOptions {
  voice_id: string;
  text: string;
  model_id?: string;
  voice_settings?: VoiceSettings;
  filename?: string;
}

export interface TTSResult {
  filename: string;
  path: string;
}

export interface MusicOptions {
  prompt?: string;
  lyrics?: string;
  style?: {
    positive?: string[];
    negative?: string[];
  };
  duration_seconds: number;
}

export interface MusicResult {
  filename: string;
  path: string;
  duration: number;
  has_vocals: boolean;
}

/**
 * Get ElevenLabs API key from config
 */
function getApiKey(): string {
  const config = loadConfig();
  const key = config.elevenLabsKey as string;
  if (!key) {
    throw new Error("elevenLabsKey not configured in data/config.json");
  }
  return key;
}

/**
 * Load cached voices
 */
export function loadVoicesCache(): VoicesCache | null {
  try {
    if (fs.existsSync(VOICES_CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(VOICES_CACHE_PATH, "utf-8"));
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Save voices to cache
 */
function saveVoicesCache(voices: Voice[]): VoicesCache {
  const cache: VoicesCache = {
    fetchedAt: new Date().toISOString(),
    voices,
  };
  fs.writeFileSync(VOICES_CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

/**
 * Fetch voices from ElevenLabs API
 */
export async function fetchVoices(): Promise<Voice[]> {
  const apiKey = getApiKey();

  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { voices: Voice[] };
  return data.voices;
}

/**
 * Get voices with smart caching (7-day TTL)
 */
export async function getVoicesCached(forceRefresh = false): Promise<{
  voices: Voice[];
  stale: boolean;
  fetchedAt: string;
}> {
  const cache = loadVoicesCache();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // Check if cache is valid
  if (cache && !forceRefresh) {
    const cacheAge = Date.now() - new Date(cache.fetchedAt).getTime();
    if (cacheAge < sevenDaysMs) {
      return { voices: cache.voices, stale: false, fetchedAt: cache.fetchedAt };
    }
  }

  // Try to fetch fresh
  try {
    const voices = await fetchVoices();
    const newCache = saveVoicesCache(voices);
    return { voices, stale: false, fetchedAt: newCache.fetchedAt };
  } catch (error) {
    // Return stale cache if available
    if (cache) {
      return { voices: cache.voices, stale: true, fetchedAt: cache.fetchedAt };
    }
    throw error;
  }
}

/**
 * Generate TTS audio
 */
export async function generateTTS(options: TTSOptions): Promise<TTSResult> {
  const apiKey = getApiKey();

  const {
    voice_id,
    text,
    model_id = "eleven_turbo_v2_5",
    voice_settings = { stability: 0.5, similarity_boost: 0.75 },
    filename,
  } = options;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id,
        voice_settings,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs TTS error: ${response.status} ${errorText}`);
  }

  // Ensure TTS directory exists
  if (!fs.existsSync(TTS_DIR)) {
    fs.mkdirSync(TTS_DIR, { recursive: true });
  }

  // Generate filename
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const outputFilename = filename || `tts_${timestamp}_${randomId}.mp3`;
  const outputPath = path.join(TTS_DIR, outputFilename);

  // Save audio
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

  return {
    filename: outputFilename,
    path: `audio/tts/${outputFilename}`,
  };
}

/**
 * Generate music using ElevenLabs
 */
export async function generateMusic(options: MusicOptions): Promise<MusicResult> {
  const apiKey = getApiKey();

  const { prompt, lyrics, style, duration_seconds } = options;

  // Determine request type
  const hasLyrics = !!lyrics;

  // Build request body
  const requestBody: Record<string, unknown> = {
    duration_seconds,
  };

  if (hasLyrics) {
    // Lyrics mode
    requestBody.lyrics = lyrics;
    if (style) {
      if (style.positive) requestBody.positive_style_tags = style.positive;
      if (style.negative) requestBody.negative_style_tags = style.negative;
    }
  } else if (prompt) {
    // Prompt mode (instrumental)
    requestBody.prompt = prompt;
  } else {
    throw new Error("Either prompt or lyrics is required");
  }

  const response = await fetch("https://api.elevenlabs.io/v1/music/generate", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs Music error: ${response.status} ${errorText}`);
  }

  // Ensure music directory exists
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }

  // Generate filename
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const outputFilename = `music_${timestamp}_${randomId}.mp3`;
  const outputPath = path.join(MUSIC_DIR, outputFilename);

  // Save audio
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

  // Get duration via ffprobe
  let duration = duration_seconds;
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`
    );
    duration = parseFloat(stdout.trim()) || duration_seconds;
  } catch {
    // Use requested duration if ffprobe fails
  }

  return {
    filename: outputFilename,
    path: `audio/music/${outputFilename}`,
    duration,
    has_vocals: hasLyrics,
  };
}
