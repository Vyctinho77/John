export type SurfaceType =
  | 'code'
  | 'text'
  | 'graphic'
  | 'document'
  | 'dashboard'
  | 'unknown'

export type ChangeSummary = 'none' | 'minor' | 'major'

export interface TextRegion {
  text: string
  bbox: { x: number; y: number; width: number; height: number }
  confidence: number
}

export interface PerceptionResult {
  rawText: string
  confidence: number
  regions: TextRegion[]
  capturedAt: number
}

export interface SemanticState {
  detected_text: string
  visual_summary: string
  surface_type: SurfaceType
  change_summary: ChangeSummary
  focus_region: string
  probable_user_focus: string
  inferred_intent: string
  pedagogical_topics: string[]
  uncertainty: number
  capturedAt: number
}

export interface SessionMemoryEntry {
  capturedAt: number
  surface_type: SurfaceType
  change_summary: ChangeSummary
  detected_text: string
  visual_summary: string
  probable_user_focus: string
  inferred_intent: string
  uncertainty: number
}

export interface SessionMemory {
  session_id: string
  started_at: number
  updated_at: number
  expires_at: number
  frame_count: number
  continuity_summary: string
  incremental_summary: string
  probable_focus: string
  current_intent: string
  topic_candidates: string[]
  recent_states: SessionMemoryEntry[]
}

export interface UserProfile {
  user_level: 'beginner' | 'intermediate' | 'advanced'
  preferred_explanation_style: 'step_by_step' | 'direct' | 'analogy' | 'summary'
  study_goals: string[]
  response_language: string
  response_tone: 'didactic' | 'concise' | 'technical'
  updated_at: number
}

export interface PerceptionContextSnapshot {
  semanticState: SemanticState
  sessionMemory: SessionMemory
  userProfile: UserProfile
}

export type TutorMode =
  | 'direct'
  | 'step_by_step'
  | 'analogy'
  | 'summary'
  | 'diagnostic'
  | 'layered'

export interface TutorMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TutorRequest {
  prompt: string
  conversation: TutorMessage[]
  context?: PerceptionContextSnapshot | null
}

export interface TutorResponse {
  mode: TutorMode
  content: string
  uncertainty: number
  should_ask_confirmation: boolean
  needs_visual_confirmation: boolean
  suggested_follow_ups: string[]
  warning: string | null
}

export interface CaptureSource {
  id: string
  name: string
  thumbnailDataUrl: string
}

export interface PerceptionConfig {
  enabled: boolean
  privateMode: boolean
  intervalMs: number
  thumbnailWidth: number
  thumbnailHeight: number
  targetSourceId: string | null
  sessionTtlMs: number
  memoryLimit: number
}
