/**
 * Shared types for video generator agents
 */

export type ArcType = 'linear-build' | 'tension-release' | 'wave' | 'flat-punctuate' | 'bookend';
export type ProductionStyle = 'stage_play' | 'documentary' | 'music_video' | 'noir' | null;
export type Mood = 'hopeful' | 'melancholic' | 'tense' | 'peaceful' | 'unsettling' | 'triumphant' |
  'intimate' | 'desolate' | 'mysterious' | 'urgent' | 'contemplative' | 'chaotic' |
  'bittersweet' | 'whimsical' | 'ominous' | 'serene';

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
