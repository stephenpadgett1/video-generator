/**
 * Video Project Validators
 *
 * Programmatic validation functions for video generation projects.
 * Returns structured pass/fail results with detailed issues.
 */

import type { Project, Shot, ArcType, Mood, ProductionStyle } from '../agents/types.js';

// Constants
export const VALID_ARCS: ArcType[] = ['linear-build', 'tension-release', 'wave', 'flat-punctuate', 'bookend'];
export const VALID_MOODS: Mood[] = [
  'hopeful', 'melancholic', 'tense', 'peaceful', 'unsettling', 'triumphant',
  'intimate', 'desolate', 'mysterious', 'urgent', 'contemplative', 'chaotic',
  'bittersweet', 'whimsical', 'ominous', 'serene'
];
export const VALID_ROLES = ['establish', 'emphasize', 'transition', 'punctuate', 'reveal', 'resolve'] as const;
export const VALID_PRODUCTION_STYLES: ProductionStyle[] = ['stage_play', 'documentary', 'music_video', 'noir', null];

// VFX keywords that often fail in Veo
export const VFX_RISK_KEYWORDS = [
  'hologram', 'holographic', 'neon', 'glowing', 'glow', 'laser', 'beam',
  'portal', 'teleport', 'magic', 'spell', 'energy field', 'force field',
  'explosion', 'shatter', 'dissolve', 'morph', 'transform', 'particle',
  'floating', 'levitate', 'fly', 'flying', 'transparent', 'invisible',
  'x-ray', 'infrared', 'thermal', 'wireframe', 'digital', 'cyber',
  'futuristic ui', 'hud', 'interface', 'screen graphics', 'data stream'
];

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

export interface FullValidationResult {
  valid: boolean;
  structure: ValidationResult;
  narrative: ValidationResult;
  feasibility: ValidationResult;
  audio: ValidationResult;
  transitions: ValidationResult;
  production: ValidationResult;
  summary: {
    totalIssues: number;
    totalWarnings: number;
    criticalAreas: string[];
  };
}

/**
 * Validate project structure - required fields, types, references
 */
export function validateProjectStructure(project: Project): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

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
  const charIds = new Set(project.characters?.map(c => c.id) || []);
  const envIds = new Set(project.environments?.map(e => e.id) || []);

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
export function validateNarrativeArc(project: Project): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const shots = project.shots || [];

  if (shots.length === 0) {
    issues.push('No shots to validate arc');
    return { valid: false, issues, warnings };
  }

  // Calculate actual energy/tension curves
  const energies = shots.map(s => s.energy);
  const tensions = shots.map(s => s.tension);

  // Get positions for curve analysis
  const startEnergy = energies[0];
  const endEnergy = energies[energies.length - 1];
  const maxEnergy = Math.max(...energies);
  const minEnergy = Math.min(...energies);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;

  const startTension = tensions[0];
  const endTension = tensions[tensions.length - 1];
  const maxTension = Math.max(...tensions);

  // Arc-specific validation
  switch (project.arc) {
    case 'linear-build':
      // Should generally increase
      if (endEnergy < startEnergy) {
        issues.push(`linear-build: energy should increase (${startEnergy.toFixed(2)} → ${endEnergy.toFixed(2)})`);
      }
      if (maxEnergy - endEnergy > 0.3) {
        warnings.push('linear-build: peak energy not at end');
      }
      break;

    case 'tension-release':
      // Should build then release
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
      // Should have multiple peaks
      let peaks = 0;
      for (let i = 1; i < energies.length - 1; i++) {
        if (energies[i] > energies[i-1] && energies[i] > energies[i+1]) peaks++;
      }
      if (peaks < 2) {
        warnings.push(`wave: only ${peaks} energy peak(s), expected multiple waves`);
      }
      break;

    case 'flat-punctuate':
      // Low variance with spikes
      const variance = energies.reduce((sum, e) => sum + Math.pow(e - avgEnergy, 2), 0) / energies.length;
      if (variance > 0.15) {
        warnings.push('flat-punctuate: energy varies too much for flat arc');
      }
      if (maxEnergy - minEnergy < 0.3) {
        warnings.push('flat-punctuate: no punctuation spikes detected');
      }
      break;

    case 'bookend':
      // Start and end should mirror, middle different
      if (Math.abs(startEnergy - endEnergy) > 0.2) {
        warnings.push('bookend: start and end energy should be similar');
      }
      const midEnergy = energies[Math.floor(energies.length / 2)];
      if (Math.abs(midEnergy - startEnergy) < 0.2) {
        warnings.push('bookend: middle should contrast with start/end');
      }
      break;
  }

  // Check for monotonic tension/energy (usually indicates poor planning)
  const isMonotonicEnergy = energies.every((e, i) => i === 0 || e >= energies[i-1]) ||
                           energies.every((e, i) => i === 0 || e <= energies[i-1]);
  if (isMonotonicEnergy && shots.length > 4 && project.arc !== 'linear-build') {
    warnings.push('Energy is monotonic - consider more variation');
  }

  // Check mood flow coherence
  const moodTransitions = shots.slice(1).map((s, i) => ({ from: shots[i].mood, to: s.mood }));
  const jarringMoods: Record<string, string[]> = {
    'peaceful': ['chaotic', 'urgent'],
    'serene': ['chaotic', 'urgent'],
    'chaotic': ['peaceful', 'serene'],
    'triumphant': ['desolate', 'melancholic']
  };

  moodTransitions.forEach((t, i) => {
    const jarring = jarringMoods[t.from];
    if (jarring?.includes(t.to)) {
      warnings.push(`Shot ${i+1}→${i+2}: jarring mood transition (${t.from}→${t.to})`);
    }
  });

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Validate Veo feasibility - flag risky prompts
 */
export function validateVeoFeasibility(project: Project): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const checkForRisks = (text: string, context: string) => {
    const lower = text.toLowerCase();
    VFX_RISK_KEYWORDS.forEach(keyword => {
      if (lower.includes(keyword)) {
        warnings.push(`${context}: VFX risk keyword "${keyword}"`);
      }
    });

    // Additional risky patterns
    if (/\b(suddenly|instantly|immediately)\b/.test(lower)) {
      warnings.push(`${context}: abrupt action word may cause generation issues`);
    }
    if (/\b(complex|intricate|detailed)\s+(pattern|design|mechanism)/i.test(text)) {
      warnings.push(`${context}: complex details often render poorly`);
    }
  };

  // Check shot descriptions
  (project.shots || []).forEach((shot, i) => {
    if (shot.description) {
      checkForRisks(shot.description, `Shot ${i}`);

      // Check description length
      if (shot.description.length < 20) {
        warnings.push(`Shot ${i}: description too short (${shot.description.length} chars)`);
      }
      if (shot.description.length > 500) {
        warnings.push(`Shot ${i}: description very long (${shot.description.length} chars)`);
      }
    }
  });

  // Check style
  if (project.style) {
    checkForRisks(project.style, 'Style');
  }

  // Check character descriptions
  (project.characters || []).forEach((char, i) => {
    if (char.description) {
      checkForRisks(char.description, `Character "${char.id}"`);
    }
    if (char.locked_description) {
      checkForRisks(char.locked_description, `Character "${char.id}" locked`);
    }
  });

  // Check environment descriptions
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
export function validateAudioSettings(project: Project): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const shotsWithVo = (project.shots || []).filter(s => s.vo);

  if (shotsWithVo.length === 0) {
    // No VO is valid
    return { valid: true, issues, warnings };
  }

  // Check VO text length vs shot duration
  shotsWithVo.forEach((shot, i) => {
    if (!shot.vo) return;

    const wordCount = shot.vo.text.split(/\s+/).length;
    const estimatedSeconds = wordCount / 2.5; // ~150 words/min average

    if (estimatedSeconds > shot.duration_target * 0.9) {
      issues.push(`Shot ${shot.shot_id}: VO too long (${wordCount} words for ${shot.duration_target}s shot)`);
    }
    if (estimatedSeconds < shot.duration_target * 0.2 && shot.duration_target > 5) {
      warnings.push(`Shot ${shot.shot_id}: VO quite short for shot length`);
    }
  });

  // Check for back-to-back VO without breaks
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
export function validateTransitions(project: Project): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  const shots = project.shots || [];
  if (shots.length < 2) {
    return { valid: true, issues, warnings };
  }

  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1];
    const curr = shots[i];
    const tensionDrop = prev.tension - curr.tension;
    const energyDrop = prev.energy - curr.energy;

    // High → low tension should have breathing room
    if (tensionDrop > 0.4 && prev.tension > 0.7) {
      // This is good (release) but note it
    }

    // Low → high tension without build-up
    if (curr.tension - prev.tension > 0.5 && prev.tension < 0.3) {
      warnings.push(`Shot ${i-1}→${i}: large tension jump (${prev.tension.toFixed(2)}→${curr.tension.toFixed(2)}) - consider intermediate shot`);
    }

    // Check for establish/resolve roles in wrong positions
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
export function validateProductionRules(project: Project): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!project.production_style) {
    // No production style is valid
    return { valid: true, issues, warnings };
  }

  if (!VALID_PRODUCTION_STYLES.includes(project.production_style)) {
    issues.push(`Invalid production_style: ${project.production_style}`);
    return { valid: false, issues, warnings };
  }

  // Style-specific checks
  const shots = project.shots || [];

  switch (project.production_style) {
    case 'stage_play':
      // Should have limited camera movement described
      shots.forEach((shot, i) => {
        if (/\b(drone|aerial|tracking|steadicam|handheld)\b/i.test(shot.description)) {
          warnings.push(`Shot ${i}: stage_play style but description mentions dynamic camera`);
        }
      });
      // Should typically use single environment
      const uniqueEnvs = new Set(shots.map(s => s.environment).filter(Boolean));
      if (uniqueEnvs.size > 2) {
        warnings.push(`stage_play: ${uniqueEnvs.size} different environments (expect 1-2)`);
      }
      break;

    case 'documentary':
      // Should have observational descriptions
      shots.forEach((shot, i) => {
        if (/\b(dramatic|cinematic|epic)\b/i.test(shot.description)) {
          warnings.push(`Shot ${i}: documentary style but description uses dramatic language`);
        }
      });
      break;

    case 'noir':
      // Should have appropriate moods
      const noirMoods: Mood[] = ['mysterious', 'tense', 'ominous', 'melancholic', 'unsettling'];
      shots.forEach((shot, i) => {
        if (!noirMoods.includes(shot.mood) && !['intimate', 'contemplative'].includes(shot.mood)) {
          warnings.push(`Shot ${i}: mood "${shot.mood}" unusual for noir style`);
        }
      });
      break;

    case 'music_video':
      // Should have higher energy variation
      const energyRange = Math.max(...shots.map(s => s.energy)) - Math.min(...shots.map(s => s.energy));
      if (energyRange < 0.4) {
        warnings.push('music_video: low energy variation for style');
      }
      break;
  }

  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Run all validators and return comprehensive result
 */
export function validateProject(project: Project): FullValidationResult {
  const structure = validateProjectStructure(project);
  const narrative = validateNarrativeArc(project);
  const feasibility = validateVeoFeasibility(project);
  const audio = validateAudioSettings(project);
  const transitions = validateTransitions(project);
  const production = validateProductionRules(project);

  const totalIssues = [structure, narrative, feasibility, audio, transitions, production]
    .reduce((sum, r) => sum + r.issues.length, 0);
  const totalWarnings = [structure, narrative, feasibility, audio, transitions, production]
    .reduce((sum, r) => sum + r.warnings.length, 0);

  const criticalAreas: string[] = [];
  if (!structure.valid) criticalAreas.push('structure');
  if (!narrative.valid) criticalAreas.push('narrative');
  if (!feasibility.valid) criticalAreas.push('feasibility');
  if (!audio.valid) criticalAreas.push('audio');

  return {
    valid: totalIssues === 0,
    structure,
    narrative,
    feasibility,
    audio,
    transitions,
    production,
    summary: {
      totalIssues,
      totalWarnings,
      criticalAreas
    }
  };
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('fs');
  const path = process.argv[2];

  if (!path) {
    console.log('Usage: npx tsx validators.ts <project.json>');
    process.exit(1);
  }

  const project = JSON.parse(fs.readFileSync(path, 'utf-8'));
  const result = validateProject(project);

  console.log('\n=== Project Validation ===\n');
  console.log(`Overall: ${result.valid ? 'PASS' : 'FAIL'}`);
  console.log(`Issues: ${result.summary.totalIssues}, Warnings: ${result.summary.totalWarnings}`);

  if (result.summary.criticalAreas.length > 0) {
    console.log(`Critical areas: ${result.summary.criticalAreas.join(', ')}`);
  }

  const sections = ['structure', 'narrative', 'feasibility', 'audio', 'transitions', 'production'] as const;

  for (const section of sections) {
    const r = result[section];
    if (r.issues.length > 0 || r.warnings.length > 0) {
      console.log(`\n[${section.toUpperCase()}]`);
      r.issues.forEach(i => console.log(`  ERROR: ${i}`));
      r.warnings.forEach(w => console.log(`  WARN: ${w}`));
    }
  }
}
