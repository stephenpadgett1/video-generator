import {
  fetchVoices,
  getVoicesCached,
  generateTTS as elevenLabsTTS,
  generateMusic as elevenLabsMusic,
  generateSoundEffect,
  loadVoicesCache,
  type Voice,
  type TTSOptions,
  type TTSResult,
  type MusicOptions,
  type MusicResult,
  type SoundEffectOptions,
  type SoundEffectResult,
} from "../clients/elevenlabs.js";

// Mood-to-voice settings mappings
const MOOD_VOICE: Record<string, { stability: number; similarity_boost: number; speed_factor: number }> = {
  hopeful: { stability: 0.6, similarity_boost: 0.7, speed_factor: 1.0 },
  melancholic: { stability: 0.7, similarity_boost: 0.8, speed_factor: 0.9 },
  tense: { stability: 0.4, similarity_boost: 0.6, speed_factor: 1.1 },
  peaceful: { stability: 0.8, similarity_boost: 0.75, speed_factor: 0.85 },
  unsettling: { stability: 0.3, similarity_boost: 0.5, speed_factor: 0.95 },
  triumphant: { stability: 0.55, similarity_boost: 0.7, speed_factor: 1.05 },
  intimate: { stability: 0.75, similarity_boost: 0.85, speed_factor: 0.9 },
  desolate: { stability: 0.65, similarity_boost: 0.6, speed_factor: 0.85 },
  mysterious: { stability: 0.5, similarity_boost: 0.55, speed_factor: 0.95 },
  urgent: { stability: 0.35, similarity_boost: 0.65, speed_factor: 1.2 },
  contemplative: { stability: 0.7, similarity_boost: 0.7, speed_factor: 0.85 },
  chaotic: { stability: 0.25, similarity_boost: 0.5, speed_factor: 1.15 },
  bittersweet: { stability: 0.6, similarity_boost: 0.75, speed_factor: 0.95 },
  whimsical: { stability: 0.45, similarity_boost: 0.65, speed_factor: 1.05 },
  ominous: { stability: 0.7, similarity_boost: 0.6, speed_factor: 0.85 },
  serene: { stability: 0.85, similarity_boost: 0.8, speed_factor: 0.8 },
};

// Tension modifiers
const TENSION_VOICE_MODIFIERS: Record<string, { stability_offset: number; speed_mult: number }> = {
  very_low: { stability_offset: 0.1, speed_mult: 0.95 },
  low: { stability_offset: 0.05, speed_mult: 0.98 },
  medium: { stability_offset: 0, speed_mult: 1.0 },
  high: { stability_offset: -0.1, speed_mult: 1.05 },
  very_high: { stability_offset: -0.15, speed_mult: 1.1 },
};

// Energy modifiers
const ENERGY_VOICE_MODIFIERS: Record<string, { speed_mult: number }> = {
  very_low: { speed_mult: 0.9 },
  low: { speed_mult: 0.95 },
  medium: { speed_mult: 1.0 },
  high: { speed_mult: 1.1 },
  very_high: { speed_mult: 1.2 },
};

// Mood-to-music mappings
const MOOD_MUSIC: Record<string, { tempo: string; key: string; texture: string; instruments: string; tags: string[] }> = {
  hopeful: { tempo: "moderate", key: "major", texture: "building", instruments: "strings, piano", tags: ["uplifting", "warm", "crescendo"] },
  melancholic: { tempo: "slow", key: "minor", texture: "sparse", instruments: "piano, cello", tags: ["sad", "reflective", "gentle"] },
  tense: { tempo: "moderate", key: "minor", texture: "pulsing", instruments: "strings, percussion", tags: ["suspenseful", "anxious", "building"] },
  peaceful: { tempo: "slow", key: "major", texture: "ambient", instruments: "piano, pads", tags: ["calm", "serene", "gentle"] },
  unsettling: { tempo: "variable", key: "atonal", texture: "dissonant", instruments: "strings, electronics", tags: ["eerie", "uncomfortable", "tense"] },
  triumphant: { tempo: "fast", key: "major", texture: "full", instruments: "brass, orchestra", tags: ["victorious", "bold", "powerful"] },
  intimate: { tempo: "slow", key: "major", texture: "minimal", instruments: "guitar, piano", tags: ["tender", "close", "warm"] },
  desolate: { tempo: "slow", key: "minor", texture: "sparse", instruments: "solo piano, wind", tags: ["empty", "lonely", "bleak"] },
  mysterious: { tempo: "slow", key: "minor", texture: "layered", instruments: "woodwinds, harp", tags: ["enigmatic", "curious", "atmospheric"] },
  urgent: { tempo: "fast", key: "minor", texture: "driving", instruments: "percussion, brass", tags: ["intense", "pressing", "action"] },
  contemplative: { tempo: "slow", key: "major", texture: "ambient", instruments: "piano, strings", tags: ["thoughtful", "reflective", "peaceful"] },
  chaotic: { tempo: "fast", key: "atonal", texture: "dense", instruments: "full orchestra", tags: ["frantic", "overwhelming", "intense"] },
  bittersweet: { tempo: "moderate", key: "mixed", texture: "layered", instruments: "strings, piano", tags: ["nostalgic", "complex", "emotional"] },
  whimsical: { tempo: "moderate", key: "major", texture: "playful", instruments: "woodwinds, pizzicato", tags: ["quirky", "lighthearted", "fun"] },
  ominous: { tempo: "slow", key: "minor", texture: "dark", instruments: "low brass, timpani", tags: ["threatening", "foreboding", "heavy"] },
  serene: { tempo: "slow", key: "major", texture: "ambient", instruments: "pads, soft piano", tags: ["tranquil", "peaceful", "floating"] },
};

// Energy modifiers for music
const ENERGY_MUSIC_MODIFIERS: Record<string, { tempo_adjust: number; layer_density: number; dynamics: string }> = {
  very_low: { tempo_adjust: -20, layer_density: 0.3, dynamics: "pianissimo" },
  low: { tempo_adjust: -10, layer_density: 0.5, dynamics: "piano" },
  medium: { tempo_adjust: 0, layer_density: 0.7, dynamics: "mezzo" },
  high: { tempo_adjust: 10, layer_density: 0.9, dynamics: "forte" },
  very_high: { tempo_adjust: 20, layer_density: 1.0, dynamics: "fortissimo" },
};

// Tension modifiers for music
const TENSION_MUSIC_MODIFIERS: Record<string, { dissonance: number; resolution: string }> = {
  very_low: { dissonance: 0, resolution: "resolved" },
  low: { dissonance: 0.1, resolution: "stable" },
  medium: { dissonance: 0.3, resolution: "neutral" },
  high: { dissonance: 0.5, resolution: "unresolved" },
  very_high: { dissonance: 0.7, resolution: "cliffhanger" },
};

/**
 * Categorize tension value (0-1) into named category
 */
function categorizeTension(value: number): string {
  if (value < 0.2) return "very_low";
  if (value < 0.4) return "low";
  if (value < 0.6) return "medium";
  if (value < 0.8) return "high";
  return "very_high";
}

/**
 * Categorize energy value (0-1) into named category
 */
function categorizeEnergy(value: number): string {
  if (value < 0.2) return "very_low";
  if (value < 0.4) return "low";
  if (value < 0.6) return "medium";
  if (value < 0.8) return "high";
  return "very_high";
}

export interface VoiceProfile {
  stability: number;
  similarity_boost: number;
  speed_factor: number;
  mood: string;
  tension_category: string;
  energy_category: string;
}

export interface MusicProfile {
  tempo: string;
  tempo_bpm_adjust: number;
  key: string;
  texture: string;
  instruments: string;
  dynamics: string;
  layer_density: number;
  dissonance: number;
  resolution: string;
  search_tags: string[];
  mood: string;
  tension_category: string;
  energy_category: string;
}

/**
 * Compute voice settings based on mood, tension, energy
 */
export function computeVoiceSettings(options: {
  mood?: string;
  tension?: number;
  energy?: number;
}): VoiceProfile {
  const { mood = "peaceful", tension = 0.5, energy = 0.5 } = options;

  const tensionCategory = categorizeTension(tension);
  const energyCategory = categorizeEnergy(energy);

  // Get base values from mood
  const moodSettings = MOOD_VOICE[mood] || MOOD_VOICE.peaceful;

  // Apply tension modifier
  const tensionMod = TENSION_VOICE_MODIFIERS[tensionCategory];
  let stability = moodSettings.stability + tensionMod.stability_offset;
  let speedFactor = moodSettings.speed_factor * tensionMod.speed_mult;

  // Apply energy modifier
  const energyMod = ENERGY_VOICE_MODIFIERS[energyCategory];
  speedFactor *= energyMod.speed_mult;

  // Clamp values
  stability = Math.max(0.1, Math.min(1.0, stability));
  speedFactor = Math.max(0.5, Math.min(2.0, speedFactor));

  return {
    stability,
    similarity_boost: moodSettings.similarity_boost,
    speed_factor: speedFactor,
    mood,
    tension_category: tensionCategory,
    energy_category: energyCategory,
  };
}

/**
 * Compute music profile based on mood, tension, energy
 */
export function computeMusicProfile(options: {
  mood?: string;
  tension?: number;
  energy?: number;
}): MusicProfile {
  const { mood = "peaceful", tension = 0.5, energy = 0.5 } = options;

  const tensionCategory = categorizeTension(tension);
  const energyCategory = categorizeEnergy(energy);

  // Get base values from mood
  const moodSettings = MOOD_MUSIC[mood] || MOOD_MUSIC.peaceful;

  // Apply modifiers
  const energyMod = ENERGY_MUSIC_MODIFIERS[energyCategory];
  const tensionMod = TENSION_MUSIC_MODIFIERS[tensionCategory];

  return {
    tempo: moodSettings.tempo,
    tempo_bpm_adjust: energyMod.tempo_adjust,
    key: moodSettings.key,
    texture: moodSettings.texture,
    instruments: moodSettings.instruments,
    dynamics: energyMod.dynamics,
    layer_density: energyMod.layer_density,
    dissonance: tensionMod.dissonance,
    resolution: tensionMod.resolution,
    search_tags: moodSettings.tags,
    mood,
    tension_category: tensionCategory,
    energy_category: energyCategory,
  };
}

// Re-export client functions
export { fetchVoices, getVoicesCached, loadVoicesCache, generateSoundEffect };
export type { Voice, TTSResult, MusicResult, SoundEffectOptions, SoundEffectResult };

/**
 * Generate TTS with mood-aware settings
 */
export async function generateTTS(options: {
  voice_id: string;
  text: string;
  mood?: string;
  tension?: number;
  energy?: number;
  model_id?: string;
  filename?: string;
}): Promise<TTSResult & { voice_profile: VoiceProfile }> {
  const { voice_id, text, mood, tension, energy, model_id, filename } = options;

  // Compute voice profile
  const voiceProfile = computeVoiceSettings({ mood, tension, energy });

  // Generate TTS
  const result = await elevenLabsTTS({
    voice_id,
    text,
    model_id,
    voice_settings: {
      stability: voiceProfile.stability,
      similarity_boost: voiceProfile.similarity_boost,
    },
    filename,
  });

  return {
    ...result,
    voice_profile: voiceProfile,
  };
}

/**
 * Generate music with mood-aware prompt building
 */
export async function generateMusic(options: {
  prompt?: string;
  lyrics?: string;
  style?: { positive?: string[]; negative?: string[] };
  mood?: string;
  tension?: number;
  energy?: number;
  duration_seconds: number;
}): Promise<MusicResult & { music_profile?: MusicProfile; prompt_used?: string }> {
  const { prompt, lyrics, style, mood, tension, energy, duration_seconds } = options;

  // If mood is provided but no prompt, build prompt from mood
  let finalPrompt = prompt;
  let musicProfile: MusicProfile | undefined;

  if (!prompt && !lyrics && mood) {
    musicProfile = computeMusicProfile({ mood, tension, energy });
    finalPrompt = `${musicProfile.tempo} ${musicProfile.key} ${musicProfile.texture} instrumental with ${musicProfile.instruments}. ${musicProfile.search_tags.join(", ")}. ${musicProfile.dynamics} dynamics.`;
  }

  const result = await elevenLabsMusic({
    prompt: finalPrompt,
    lyrics,
    style,
    duration_seconds,
  });

  return {
    ...result,
    music_profile: musicProfile,
    prompt_used: finalPrompt,
  };
}
