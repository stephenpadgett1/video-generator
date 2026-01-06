/**
 * Shared types for video generator agents
 */

export type ArcType = 'linear-build' | 'tension-release' | 'wave' | 'flat-punctuate' | 'bookend';
export type ProductionStyle = 'stage_play' | 'documentary' | 'music_video' | 'noir' | null;
export type Mood = 'hopeful' | 'melancholic' | 'tense' | 'peaceful' | 'unsettling' | 'triumphant' |
  'intimate' | 'desolate' | 'mysterious' | 'urgent' | 'contemplative' | 'chaotic' |
  'bittersweet' | 'whimsical' | 'ominous' | 'serene';

// Dialogue system types
export interface DialogueLine {
  speaker: string;           // character_id or "narrator"
  text: string;
  timing?: number;           // Seconds from shot start (auto-calculated if omitted)
  mood?: Mood;               // Override shot mood for this line
}

export interface VoiceCasting {
  [characterId: string]: string;  // character_id → ElevenLabs voice_id
}

export interface InterpretedIdea {
  duration: number;
  arc: ArcType;
  style: string;
  production_style: ProductionStyle;
  include_vo: boolean;
  reasoning: string;
}

export interface Character {
  id: string;
  description: string;
  base_image_path?: string;
  locked_description?: string;
}

export interface Environment {
  id: string;
  description: string;
  primary?: boolean;
  base_image_path?: string;
  locked_description?: string;
}

export interface Shot {
  shot_id: string;
  role: 'establish' | 'emphasize' | 'transition' | 'punctuate' | 'reveal' | 'resolve';
  energy: number;
  tension: number;
  mood: Mood;
  duration_target: number;
  position: number;
  characters: string[];
  environment: string | null;
  description: string;
  vo?: {
    text: string;
    timing: 'start' | 'middle' | 'end';
  };
  dialogue?: DialogueLine[];  // Multi-character dialogue (alternative to vo)
}

export interface Project {
  project_id: string;
  concept: string;
  duration: number;
  arc: ArcType;
  arc_description?: string;
  style?: string;
  production_style?: ProductionStyle;
  characters: Character[];
  environments: Environment[];
  shots: Shot[];
  voiceCasting?: VoiceCasting;  // Character → voice_id mapping
}

export interface Job {
  id: string;
  type: 'veo-generate';
  status: 'pending' | 'processing' | 'complete' | 'error';
  input: {
    prompt: string;
    aspectRatio: string;
    durationSeconds: number;
  };
  result?: {
    filename: string;
    path: string;
    duration: number;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExecuteResult {
  project_id: string;
  jobs: Array<{
    shot_id: string;
    job_id: string;
    duration_target: number;
    veo_prompt: string;
  }>;
}

export interface AssemblyResult {
  success: boolean;
  filename: string;
  path: string;
  duration: number;
  shotCount: number;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

export interface VoiceSelection {
  voice_id: string;
  name: string;
  reasoning: string;
}

// Agent annotation system - for inter-agent communication
export type AnnotationType = 'issue' | 'passed';
export type AnnotationCategory = 'timing' | 'audio' | 'visual' | 'completeness' | 'continuity';
export type AnnotationSeverity = 'info' | 'warning' | 'error';

export interface AnnotationTarget {
  shot_id: string;
  take_index?: number;           // For multi-take shots
  frame?: number;                // Seconds into clip (future use)
}

export interface Annotation {
  id: string;                    // "ann_" + timestamp + random
  agent: string;                 // Agent that created the annotation
  timestamp: string;             // ISO date
  target: AnnotationTarget;
  type: AnnotationType;
  category: AnnotationCategory;
  message: string;
  severity: AnnotationSeverity;
  resolved: boolean;
  resolved_by?: string;          // Agent or human who resolved
  resolution_note?: string;
}

// Extended project with annotations
export interface AnnotatedProject extends Project {
  annotations?: Annotation[];
}

// Cut point analysis types - for identifying optimal trim points in generated clips
export type CutPointIssueType =
  | 'entrance_movement'  // Character walks in when should already be in place
  | 'dead_time'          // Action completes early, static frames remain
  | 'late_action'        // Key action happens later than expected
  | 'rushed_action'      // Action too fast, filler at start/end
  | 'discontinuity'      // Visual glitch, jump cut, or quality drop
  | 'other';

export interface CutPointIssue {
  type: CutPointIssueType;
  at_seconds: number;
  description: string;
}

export interface CutPointAnalysis {
  actual_action_start: number;      // When meaningful action actually starts
  actual_action_end: number;        // When meaningful action actually ends
  suggested_trim_start: number;     // Seconds to trim from beginning (0 if none)
  suggested_trim_end: number | null; // Trim to this timestamp, null = use full clip
  usable_duration: number;          // Resulting duration after trims
  issues_detected: CutPointIssue[];
  reasoning: string;                // 1-2 sentences explaining the recommendation
  confidence: 'high' | 'medium' | 'low';
}
