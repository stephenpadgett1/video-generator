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
