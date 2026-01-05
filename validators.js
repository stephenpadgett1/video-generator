/**
 * Video Project Validators (CommonJS)
 *
 * Programmatic validation functions for video generation projects.
 * Returns structured pass/fail results with detailed issues.
 */

// Constants
const VALID_ARCS = ['linear-build', 'tension-release', 'wave', 'flat-punctuate', 'bookend'];
const VALID_MOODS = [
  'hopeful', 'melancholic', 'tense', 'peaceful', 'unsettling', 'triumphant',
  'intimate', 'desolate', 'mysterious', 'urgent', 'contemplative', 'chaotic',
  'bittersweet', 'whimsical', 'ominous', 'serene'
];
const VALID_ROLES = ['establish', 'emphasize', 'transition', 'punctuate', 'reveal', 'resolve'];
const VALID_PRODUCTION_STYLES = ['stage_play', 'documentary', 'music_video', 'noir', null];

// VFX keywords that often fail in Veo
const VFX_RISK_KEYWORDS = [
  'hologram', 'holographic', 'neon', 'glowing', 'glow', 'laser', 'beam',
  'portal', 'teleport', 'magic', 'spell', 'energy field', 'force field',
  'explosion', 'shatter', 'dissolve', 'morph', 'transform', 'particle',
  'floating', 'levitate', 'fly', 'flying', 'transparent', 'invisible',
  'x-ray', 'infrared', 'thermal', 'wireframe', 'digital', 'cyber',
  'futuristic ui', 'hud', 'interface', 'screen graphics', 'data stream'
];

/**
 * Validate project structure - required fields, types, references
 */
function validateProjectStructure(project) {
  const issues = [];
  const warnings = [];

  // Required top-level fields
  if (!project.project_id) issues.push('Missing project_id');
  if (!project.concept) issues.push('Missing concept');
  if (typeof project.duration !== 'number') issues.push('Missing or invalid duration');
  if (!project.arc) issues.push('Missing arc type');
  if (!Array.isArray(project.shots)) issues.push('Missing shots array');
  if (!Array.isArray(project.characters)) issues.push('Missing characters array');
  if (!Array.isArray(project.environments)) issues.push('Missing environments array');

  // Duration bounds
  if (project.duration < 15) issues.push(`Duration ${project.duration}s is below minimum (15s)`);
  if (project.duration > 120) warnings.push(`Duration ${project.duration}s exceeds typical max (60s)`);

  // Arc validation
  if (project.arc && !VALID_ARCS.includes(project.arc)) {
    issues.push(`Invalid arc type: ${project.arc}`);
  }

  // Validate each shot
  const charIds = new Set((project.characters || []).map(c => c.id));
  const envIds = new Set((project.environments || []).map(e => e.id));

  (project.shots || []).forEach((shot, i) => {
    if (!shot.shot_id) issues.push(`Shot ${i}: missing shot_id`);
    if (typeof shot.energy !== 'number' || shot.energy < 0 || shot.energy > 1) {
      issues.push(`Shot ${i}: energy must be 0-1, got ${shot.energy}`);
    }
    if (typeof shot.tension !== 'number' || shot.tension < 0 || shot.tension > 1) {
      issues.push(`Shot ${i}: tension must be 0-1, got ${shot.tension}`);
    }
    if (!shot.mood || !VALID_MOODS.includes(shot.mood)) {
      issues.push(`Shot ${i}: invalid mood "${shot.mood}"`);
    }
    if (!shot.role || !VALID_ROLES.includes(shot.role)) {
      issues.push(`Shot ${i}: invalid role "${shot.role}"`);
    }
    if (!shot.description) issues.push(`Shot ${i}: missing description`);

    // Reference validation
    (shot.characters || []).forEach(charId => {
      if (!charIds.has(charId)) {
        issues.push(`Shot ${i}: references undefined character "${charId}"`);
      }
    });
    if (shot.environment && !envIds.has(shot.environment)) {
      issues.push(`Shot ${i}: references undefined environment "${shot.environment}"`);
    }

    // VO validation
    if (shot.vo) {
      if (!shot.vo.text) issues.push(`Shot ${i}: VO missing text`);
      if (!['start', 'middle', 'end'].includes(shot.vo.timing)) {
        issues.push(`Shot ${i}: invalid VO timing "${shot.vo.timing}"`);
      }
    }
  });

  // Character/Environment validation
  (project.characters || []).forEach((char, i) => {
    if (!char.id) issues.push(`Character ${i}: missing id`);
    if (!char.description) warnings.push(`Character ${i}: missing description`);
  });

  (project.environments || []).forEach((env, i) => {
    if (!env.id) issues.push(`Environment ${i}: missing id`);
    if (!env.description) warnings.push(`Environment ${i}: missing description`);
  });

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Validate narrative arc - energy curve matches arc type
 */
function validateNarrativeArc(project) {
  const issues = [];
  const warnings = [];
  const shots = project.shots || [];

  if (shots.length === 0) {
    issues.push('No shots to validate arc');
    return { valid: false, issues, warnings };
  }

  const energies = shots.map(s => s.energy);
  const tensions = shots.map(s => s.tension);

  const startEnergy = energies[0];
  const endEnergy = energies[energies.length - 1];
  const maxEnergy = Math.max(...energies);
  const minEnergy = Math.min(...energies);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;

  const startTension = tensions[0];
  const endTension = tensions[tensions.length - 1];
  const maxTension = Math.max(...tensions);

  switch (project.arc) {
    case 'linear-build':
      if (endEnergy < startEnergy) {
        issues.push(`linear-build: energy should increase (${startEnergy.toFixed(2)} → ${endEnergy.toFixed(2)})`);
      }
      if (maxEnergy - endEnergy > 0.3) {
        warnings.push('linear-build: peak energy not at end');
      }
      break;

    case 'tension-release':
      const peakIndex = tensions.indexOf(maxTension);
      if (peakIndex < shots.length * 0.3) {
        warnings.push('tension-release: tension peaks too early');
      }
      if (peakIndex > shots.length * 0.9) {
        warnings.push('tension-release: no release after tension peak');
      }
      if (endTension > maxTension * 0.7) {
        issues.push('tension-release: tension does not release at end');
      }
      break;

    case 'wave':
      let peaks = 0;
      for (let i = 1; i < energies.length - 1; i++) {
        if (energies[i] > energies[i-1] && energies[i] > energies[i+1]) peaks++;
      }
      if (peaks < 2) {
        warnings.push(`wave: only ${peaks} energy peak(s), expected multiple waves`);
      }
      break;

    case 'flat-punctuate':
      const variance = energies.reduce((sum, e) => sum + Math.pow(e - avgEnergy, 2), 0) / energies.length;
      if (variance > 0.15) {
        warnings.push('flat-punctuate: energy varies too much for flat arc');
      }
      if (maxEnergy - minEnergy < 0.3) {
        warnings.push('flat-punctuate: no punctuation spikes detected');
      }
      break;

    case 'bookend':
      if (Math.abs(startEnergy - endEnergy) > 0.2) {
        warnings.push('bookend: start and end energy should be similar');
      }
      const midEnergy = energies[Math.floor(energies.length / 2)];
      if (Math.abs(midEnergy - startEnergy) < 0.2) {
        warnings.push('bookend: middle should contrast with start/end');
      }
      break;
  }

  const isMonotonicEnergy = energies.every((e, i) => i === 0 || e >= energies[i-1]) ||
                           energies.every((e, i) => i === 0 || e <= energies[i-1]);
  if (isMonotonicEnergy && shots.length > 4 && project.arc !== 'linear-build') {
    warnings.push('Energy is monotonic - consider more variation');
  }

  const moodTransitions = shots.slice(1).map((s, i) => ({ from: shots[i].mood, to: s.mood }));
  const jarringMoods = {
    'peaceful': ['chaotic', 'urgent'],
    'serene': ['chaotic', 'urgent'],
    'chaotic': ['peaceful', 'serene'],
    'triumphant': ['desolate', 'melancholic']
  };

  moodTransitions.forEach((t, i) => {
    const jarring = jarringMoods[t.from];
    if (jarring && jarring.includes(t.to)) {
      warnings.push(`Shot ${i+1}→${i+2}: jarring mood transition (${t.from}→${t.to})`);
    }
  });

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Validate Veo feasibility - flag risky prompts
 */
function validateVeoFeasibility(project) {
  const issues = [];
  const warnings = [];

  const checkForRisks = (text, context) => {
    const lower = text.toLowerCase();
    VFX_RISK_KEYWORDS.forEach(keyword => {
      if (lower.includes(keyword)) {
        warnings.push(`${context}: VFX risk keyword "${keyword}"`);
      }
    });

    if (/\b(suddenly|instantly|immediately)\b/.test(lower)) {
      warnings.push(`${context}: abrupt action word may cause generation issues`);
    }
    if (/\b(complex|intricate|detailed)\s+(pattern|design|mechanism)/i.test(text)) {
      warnings.push(`${context}: complex details often render poorly`);
    }
  };

  (project.shots || []).forEach((shot, i) => {
    if (shot.description) {
      checkForRisks(shot.description, `Shot ${i}`);

      if (shot.description.length < 20) {
        warnings.push(`Shot ${i}: description too short (${shot.description.length} chars)`);
      }
      if (shot.description.length > 500) {
        warnings.push(`Shot ${i}: description very long (${shot.description.length} chars)`);
      }
    }
  });

  if (project.style) {
    checkForRisks(project.style, 'Style');
  }

  (project.characters || []).forEach((char, i) => {
    if (char.description) {
      checkForRisks(char.description, `Character "${char.id}"`);
    }
    if (char.locked_description) {
      checkForRisks(char.locked_description, `Character "${char.id}" locked`);
    }
  });

  (project.environments || []).forEach((env, i) => {
    if (env.description) {
      checkForRisks(env.description, `Environment "${env.id}"`);
    }
  });

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Validate audio settings - VO timing, voice parameters
 */
function validateAudioSettings(project) {
  const issues = [];
  const warnings = [];

  const shotsWithVo = (project.shots || []).filter(s => s.vo);

  if (shotsWithVo.length === 0) {
    return { valid: true, issues, warnings };
  }

  shotsWithVo.forEach((shot, i) => {
    if (!shot.vo) return;

    const wordCount = shot.vo.text.split(/\s+/).length;
    const estimatedSeconds = wordCount / 2.5;

    if (estimatedSeconds > shot.duration_target * 0.9) {
      issues.push(`Shot ${shot.shot_id}: VO too long (${wordCount} words for ${shot.duration_target}s shot)`);
    }
    if (estimatedSeconds < shot.duration_target * 0.2 && shot.duration_target > 5) {
      warnings.push(`Shot ${shot.shot_id}: VO quite short for shot length`);
    }
  });

  let consecutiveVo = 0;
  (project.shots || []).forEach(shot => {
    if (shot.vo) {
      consecutiveVo++;
      if (consecutiveVo > 4) {
        warnings.push('Many consecutive VO shots - consider pacing breaks');
      }
    } else {
      consecutiveVo = 0;
    }
  });

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Validate transitions - tension-aware transition logic
 */
function validateTransitions(project) {
  const issues = [];
  const warnings = [];

  const shots = project.shots || [];
  if (shots.length < 2) {
    return { valid: true, issues, warnings };
  }

  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const curr = shots[i];
    const tensionDrop = prev.tension - curr.tension;

    if (curr.tension - prev.tension > 0.5 && prev.tension < 0.3) {
      warnings.push(`Shot ${i-1}→${i}: large tension jump (${prev.tension.toFixed(2)}→${curr.tension.toFixed(2)}) - consider intermediate shot`);
    }

    if (curr.role === 'establish' && i > 1) {
      warnings.push(`Shot ${i}: "establish" role used mid-sequence`);
    }
    if (prev.role === 'resolve' && i < shots.length - 1) {
      warnings.push(`Shot ${i-1}: "resolve" role used before final shot`);
    }
  }

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Validate production rules - preset consistency
 */
function validateProductionRules(project) {
  const issues = [];
  const warnings = [];

  if (!project.production_style) {
    return { valid: true, issues, warnings };
  }

  if (!VALID_PRODUCTION_STYLES.includes(project.production_style)) {
    issues.push(`Invalid production_style: ${project.production_style}`);
    return { valid: false, issues, warnings };
  }

  const shots = project.shots || [];

  switch (project.production_style) {
    case 'stage_play':
      shots.forEach((shot, i) => {
        if (/\b(drone|aerial|tracking|steadicam|handheld)\b/i.test(shot.description)) {
          warnings.push(`Shot ${i}: stage_play style but description mentions dynamic camera`);
        }
      });
      const uniqueEnvs = new Set(shots.map(s => s.environment).filter(Boolean));
      if (uniqueEnvs.size > 2) {
        warnings.push(`stage_play: ${uniqueEnvs.size} different environments (expect 1-2)`);
      }
      break;

    case 'documentary':
      shots.forEach((shot, i) => {
        if (/\b(dramatic|cinematic|epic)\b/i.test(shot.description)) {
          warnings.push(`Shot ${i}: documentary style but description uses dramatic language`);
        }
      });
      break;

    case 'noir':
      const noirMoods = ['mysterious', 'tense', 'ominous', 'melancholic', 'unsettling'];
      shots.forEach((shot, i) => {
        if (!noirMoods.includes(shot.mood) && !['intimate', 'contemplative'].includes(shot.mood)) {
          warnings.push(`Shot ${i}: mood "${shot.mood}" unusual for noir style`);
        }
      });
      break;

    case 'music_video':
      const energyRange = Math.max(...shots.map(s => s.energy)) - Math.min(...shots.map(s => s.energy));
      if (energyRange < 0.4) {
        warnings.push('music_video: low energy variation for style');
      }
      break;
  }

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Validate dialogue - speaker references, timing, overlap detection
 */
function validateDialogue(project) {
  const issues = [];
  const warnings = [];

  const shots = project.shots || [];
  const voiceCasting = project.voiceCasting || {};
  const characterIds = new Set((project.characters || []).map(c => c.id));

  // Check if any shots have dialogue
  const shotsWithDialogue = shots.filter(s => s.dialogue && Array.isArray(s.dialogue) && s.dialogue.length > 0);

  if (shotsWithDialogue.length === 0) {
    // No dialogue to validate
    return { valid: true, issues, warnings };
  }

  // Warn if dialogue exists but no voiceCasting
  if (Object.keys(voiceCasting).length === 0) {
    warnings.push('Dialogue present but no voiceCasting defined - will use default voice');
  }

  // Validate each shot's dialogue
  shotsWithDialogue.forEach(shot => {
    const shotId = shot.shot_id || 'unknown';
    const shotDuration = shot.duration_target || 8;

    // Track timing for overlap detection
    const lineTimings = [];

    shot.dialogue.forEach((line, lineIdx) => {
      // Check speaker exists
      if (!line.speaker) {
        issues.push(`Shot ${shotId}, line ${lineIdx}: missing speaker`);
      } else if (line.speaker !== 'narrator' && !characterIds.has(line.speaker)) {
        issues.push(`Shot ${shotId}, line ${lineIdx}: speaker "${line.speaker}" not in characters`);
      }

      // Check speaker has voice assigned
      if (line.speaker && !voiceCasting[line.speaker] && Object.keys(voiceCasting).length > 0) {
        warnings.push(`Shot ${shotId}: speaker "${line.speaker}" has no voice in voiceCasting`);
      }

      // Check text exists
      if (!line.text || line.text.trim() === '') {
        issues.push(`Shot ${shotId}, line ${lineIdx}: empty dialogue text`);
      }

      // Validate timing if specified
      if (line.timing !== undefined && line.timing !== null) {
        if (typeof line.timing !== 'number' || line.timing < 0) {
          issues.push(`Shot ${shotId}, line ${lineIdx}: invalid timing ${line.timing}`);
        } else if (line.timing >= shotDuration) {
          warnings.push(`Shot ${shotId}, line ${lineIdx}: timing ${line.timing}s exceeds shot duration ${shotDuration}s`);
        }

        // Estimate line duration for overlap check (150 WPM)
        const wordCount = (line.text || '').split(/\s+/).length;
        const lineDuration = (wordCount / 150) * 60;
        lineTimings.push({
          lineIdx,
          start: line.timing,
          end: line.timing + lineDuration,
          speaker: line.speaker
        });
      }

      // Validate mood if specified
      if (line.mood && !VALID_MOODS.includes(line.mood)) {
        issues.push(`Shot ${shotId}, line ${lineIdx}: invalid mood "${line.mood}"`);
      }
    });

    // Check for overlapping dialogue (only if timing is explicit)
    if (lineTimings.length > 1) {
      lineTimings.sort((a, b) => a.start - b.start);
      for (let i = 1; i < lineTimings.length; i++) {
        const prev = lineTimings[i - 1];
        const curr = lineTimings[i];
        if (curr.start < prev.end) {
          warnings.push(`Shot ${shotId}: lines ${prev.lineIdx} and ${curr.lineIdx} may overlap (${prev.end.toFixed(1)}s vs ${curr.start.toFixed(1)}s)`);
        }
      }
    }

    // Check total dialogue fits in shot
    const totalWords = shot.dialogue.reduce((sum, l) => sum + (l.text || '').split(/\s+/).length, 0);
    const totalEstimatedDuration = (totalWords / 150) * 60 + (shot.dialogue.length - 1) * 0.5;
    if (totalEstimatedDuration > shotDuration * 1.1) {
      warnings.push(`Shot ${shotId}: dialogue may be too long (${totalEstimatedDuration.toFixed(1)}s estimated for ${shotDuration}s shot)`);
    }
  });

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Run all validators and return comprehensive result
 */
function validateProject(project) {
  const structure = validateProjectStructure(project);
  const narrative = validateNarrativeArc(project);
  const feasibility = validateVeoFeasibility(project);
  const audio = validateAudioSettings(project);
  const transitions = validateTransitions(project);
  const production = validateProductionRules(project);
  const dialogue = validateDialogue(project);

  const totalIssues = [structure, narrative, feasibility, audio, transitions, production, dialogue]
    .reduce((sum, r) => sum + r.issues.length, 0);
  const totalWarnings = [structure, narrative, feasibility, audio, transitions, production, dialogue]
    .reduce((sum, r) => sum + r.warnings.length, 0);

  const criticalAreas = [];
  if (!structure.valid) criticalAreas.push('structure');
  if (!narrative.valid) criticalAreas.push('narrative');
  if (!feasibility.valid) criticalAreas.push('feasibility');
  if (!audio.valid) criticalAreas.push('audio');
  if (!dialogue.valid) criticalAreas.push('dialogue');

  return {
    valid: totalIssues === 0,
    structure,
    narrative,
    feasibility,
    audio,
    transitions,
    production,
    dialogue,
    summary: {
      totalIssues,
      totalWarnings,
      criticalAreas
    }
  };
}

module.exports = {
  VALID_ARCS,
  VALID_MOODS,
  VALID_ROLES,
  VALID_PRODUCTION_STYLES,
  VFX_RISK_KEYWORDS,
  validateProjectStructure,
  validateNarrativeArc,
  validateVeoFeasibility,
  validateAudioSettings,
  validateTransitions,
  validateProductionRules,
  validateDialogue,
  validateProject
};
