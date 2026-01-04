// audio-rules.js
// Mood-aware audio mappings for voice modulation and music characteristics

// =============================================================================
// VOICE MAPPINGS
// =============================================================================

// Mood → voice characteristics (ElevenLabs settings + speed)
const MOOD_VOICE = {
  'hopeful':      { stability: 0.6, similarity_boost: 0.7, speed_factor: 1.0 },
  'melancholic':  { stability: 0.7, similarity_boost: 0.8, speed_factor: 0.9 },
  'tense':        { stability: 0.4, similarity_boost: 0.6, speed_factor: 1.1 },
  'peaceful':     { stability: 0.8, similarity_boost: 0.75, speed_factor: 0.85 },
  'unsettling':   { stability: 0.3, similarity_boost: 0.5, speed_factor: 0.95 },
  'triumphant':   { stability: 0.5, similarity_boost: 0.8, speed_factor: 1.05 },
  'intimate':     { stability: 0.75, similarity_boost: 0.85, speed_factor: 0.9 },
  'desolate':     { stability: 0.8, similarity_boost: 0.7, speed_factor: 0.8 },
  'mysterious':   { stability: 0.5, similarity_boost: 0.6, speed_factor: 0.95 },
  'urgent':       { stability: 0.35, similarity_boost: 0.65, speed_factor: 1.2 },
  'contemplative':{ stability: 0.75, similarity_boost: 0.8, speed_factor: 0.85 },
  'chaotic':      { stability: 0.2, similarity_boost: 0.5, speed_factor: 1.15 },
  'bittersweet':  { stability: 0.6, similarity_boost: 0.75, speed_factor: 0.9 },
  'whimsical':    { stability: 0.45, similarity_boost: 0.7, speed_factor: 1.05 },
  'ominous':      { stability: 0.7, similarity_boost: 0.6, speed_factor: 0.85 },
  'serene':       { stability: 0.85, similarity_boost: 0.8, speed_factor: 0.8 }
};

// Tension modifiers (applied to base mood settings)
const TENSION_VOICE_MODIFIERS = {
  'very_low':  { stability_offset: 0.1, speed_mult: 0.95 },
  'low':       { stability_offset: 0.05, speed_mult: 0.98 },
  'medium':    { stability_offset: 0, speed_mult: 1.0 },
  'high':      { stability_offset: -0.1, speed_mult: 1.05 },
  'very_high': { stability_offset: -0.15, speed_mult: 1.1 }
};

// Energy modifiers (primarily affects speed)
const ENERGY_VOICE_MODIFIERS = {
  'very_low':  { speed_mult: 0.9 },
  'low':       { speed_mult: 0.95 },
  'medium':    { speed_mult: 1.0 },
  'high':      { speed_mult: 1.1 },
  'very_high': { speed_mult: 1.2 }
};

// =============================================================================
// MUSIC MAPPINGS
// =============================================================================

// Mood → music characteristics
const MOOD_MUSIC = {
  'hopeful':      { tempo: 'moderate', key: 'major', texture: 'building', instruments: 'strings, piano', tags: ['uplifting', 'warm', 'crescendo'] },
  'melancholic':  { tempo: 'slow', key: 'minor', texture: 'sparse', instruments: 'solo piano, cello', tags: ['sad', 'reflective', 'soft'] },
  'tense':        { tempo: 'slow', key: 'minor', texture: 'sustained', instruments: 'strings, drones', tags: ['suspense', 'building', 'uneasy'] },
  'peaceful':     { tempo: 'slow', key: 'major', texture: 'ambient', instruments: 'pads, acoustic guitar', tags: ['calm', 'gentle', 'relaxing'] },
  'unsettling':   { tempo: 'irregular', key: 'atonal', texture: 'dissonant', instruments: 'prepared piano, electronics', tags: ['creepy', 'off-kilter', 'anxious'] },
  'triumphant':   { tempo: 'fast', key: 'major', texture: 'full', instruments: 'brass, orchestra', tags: ['victorious', 'bold', 'powerful'] },
  'intimate':     { tempo: 'slow', key: 'major', texture: 'minimal', instruments: 'solo guitar, voice', tags: ['close', 'personal', 'tender'] },
  'desolate':     { tempo: 'very-slow', key: 'minor', texture: 'empty', instruments: 'distant piano, wind', tags: ['lonely', 'hollow', 'abandoned'] },
  'mysterious':   { tempo: 'slow', key: 'modal', texture: 'layered', instruments: 'synth pads, bells', tags: ['enigmatic', 'curious', 'ethereal'] },
  'urgent':       { tempo: 'fast', key: 'minor', texture: 'driving', instruments: 'percussion, bass', tags: ['intense', 'pulsing', 'relentless'] },
  'contemplative':{ tempo: 'slow', key: 'major', texture: 'reflective', instruments: 'piano, strings', tags: ['thoughtful', 'meditative', 'gentle'] },
  'chaotic':      { tempo: 'very-fast', key: 'chromatic', texture: 'dense', instruments: 'full orchestra, percussion', tags: ['frantic', 'overwhelming', 'unpredictable'] },
  'bittersweet':  { tempo: 'moderate', key: 'major-minor', texture: 'layered', instruments: 'strings, piano', tags: ['nostalgic', 'complex', 'emotional'] },
  'whimsical':    { tempo: 'moderate-upbeat', key: 'major', texture: 'playful', instruments: 'woodwinds, xylophone', tags: ['quirky', 'lighthearted', 'fun'] },
  'ominous':      { tempo: 'slow', key: 'minor', texture: 'dark', instruments: 'low brass, timpani', tags: ['threatening', 'foreboding', 'heavy'] },
  'serene':       { tempo: 'very-slow', key: 'major', texture: 'flowing', instruments: 'harp, flute, pads', tags: ['tranquil', 'peaceful', 'floating'] }
};

// Energy affects music intensity
const ENERGY_MUSIC_MODIFIERS = {
  'very_low':  { tempo_adjust: -20, layer_density: 0.3, dynamics: 'pianissimo' },
  'low':       { tempo_adjust: -10, layer_density: 0.5, dynamics: 'piano' },
  'medium':    { tempo_adjust: 0, layer_density: 0.7, dynamics: 'mezzo' },
  'high':      { tempo_adjust: 10, layer_density: 0.9, dynamics: 'forte' },
  'very_high': { tempo_adjust: 20, layer_density: 1.0, dynamics: 'fortissimo' }
};

// Tension affects harmonic content
const TENSION_MUSIC_MODIFIERS = {
  'very_low':  { dissonance: 0, resolution: 'resolved' },
  'low':       { dissonance: 0.1, resolution: 'stable' },
  'medium':    { dissonance: 0.3, resolution: 'neutral' },
  'high':      { dissonance: 0.5, resolution: 'unresolved' },
  'very_high': { dissonance: 0.7, resolution: 'cliffhanger' }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Get tension category from 0-1 value
function getTensionCategory(tension) {
  if (tension <= 0.2) return 'very_low';
  if (tension <= 0.4) return 'low';
  if (tension <= 0.6) return 'medium';
  if (tension <= 0.8) return 'high';
  return 'very_high';
}

// Get energy category from 0-1 value
function getEnergyCategory(energy) {
  if (energy <= 0.2) return 'very_low';
  if (energy <= 0.4) return 'low';
  if (energy <= 0.6) return 'medium';
  if (energy <= 0.8) return 'high';
  return 'very_high';
}

// =============================================================================
// COMPUTATION FUNCTIONS
// =============================================================================

/**
 * Compute voice settings for a shot based on mood, tension, and energy
 * @param {Object} shot - Shot object with mood, tension, energy
 * @returns {Object} Voice settings for ElevenLabs + speed_factor for ffmpeg
 */
function computeVoiceSettings(shot) {
  const mood = shot.mood || 'contemplative';
  const tension = shot.tension ?? 0.5;
  const energy = shot.energy ?? 0.5;

  // Get base settings from mood
  const moodSettings = MOOD_VOICE[mood] || MOOD_VOICE['contemplative'];

  // Get modifiers
  const tensionCat = getTensionCategory(tension);
  const energyCat = getEnergyCategory(energy);
  const tensionMod = TENSION_VOICE_MODIFIERS[tensionCat];
  const energyMod = ENERGY_VOICE_MODIFIERS[energyCat];

  // Compute final values with clamping
  const stability = Math.max(0.1, Math.min(1.0,
    moodSettings.stability + tensionMod.stability_offset
  ));

  const speed_factor = moodSettings.speed_factor *
    tensionMod.speed_mult *
    energyMod.speed_mult;

  return {
    stability: Math.round(stability * 100) / 100,
    similarity_boost: moodSettings.similarity_boost,
    speed_factor: Math.max(0.5, Math.min(2.0, Math.round(speed_factor * 100) / 100)),
    mood,
    tension_category: tensionCat,
    energy_category: energyCat
  };
}

/**
 * Compute music profile for a shot based on mood, tension, and energy
 * @param {Object} shot - Shot object with mood, tension, energy
 * @returns {Object} Music characteristics for selection or generation
 */
function computeMusicProfile(shot) {
  const mood = shot.mood || 'contemplative';
  const tension = shot.tension ?? 0.5;
  const energy = shot.energy ?? 0.5;

  const moodMusic = MOOD_MUSIC[mood] || MOOD_MUSIC['contemplative'];
  const tensionCat = getTensionCategory(tension);
  const energyCat = getEnergyCategory(energy);
  const tensionMod = TENSION_MUSIC_MODIFIERS[tensionCat];
  const energyMod = ENERGY_MUSIC_MODIFIERS[energyCat];

  // Combine tags for search
  const searchTags = [
    ...moodMusic.tags,
    energyMod.dynamics,
    tensionMod.resolution,
    mood
  ];

  return {
    tempo: moodMusic.tempo,
    tempo_bpm_adjust: energyMod.tempo_adjust,
    key: moodMusic.key,
    texture: moodMusic.texture,
    instruments: moodMusic.instruments,
    dynamics: energyMod.dynamics,
    layer_density: energyMod.layer_density,
    dissonance: tensionMod.dissonance,
    resolution: tensionMod.resolution,
    search_tags: searchTags,
    mood,
    tension_category: tensionCat,
    energy_category: energyCat
  };
}

/**
 * Compute complete audio profile for a shot
 * @param {Object} shot - Shot object with mood, tension, energy
 * @returns {Object} Combined voice and music profiles
 */
function computeAudioProfile(shot) {
  return {
    voice: computeVoiceSettings(shot),
    music: computeMusicProfile(shot)
  };
}

module.exports = {
  // Mappings (for inspection/debugging)
  MOOD_VOICE,
  TENSION_VOICE_MODIFIERS,
  ENERGY_VOICE_MODIFIERS,
  MOOD_MUSIC,
  ENERGY_MUSIC_MODIFIERS,
  TENSION_MUSIC_MODIFIERS,

  // Helper functions
  getTensionCategory,
  getEnergyCategory,

  // Computation functions
  computeVoiceSettings,
  computeMusicProfile,
  computeAudioProfile
};
