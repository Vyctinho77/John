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

export type EmotionalSignal = 'neutral' | 'frustrated' | 'focused' | 'exploring' | 'confused'

export interface SemanticState {
  detected_text: string
  visual_summary: string
  surface_type: SurfaceType
  change_summary: ChangeSummary
  focus_region: string
  probable_user_focus: string
  inferred_intent: string
  pedagogical_topics: string[]
  capture_policy: 'allowed' | 'blocked-sensitive' | 'private-mode'
  sensitivity_reason: string | null
  uncertainty: number
  capturedAt: number

  // Vision-enriched fields (populated when Vision LLM is available)
  ui_elements?: string[]
  visual_context?: string | null
  app_identifier?: string | null
  emotional_signal?: EmotionalSignal | null
  key_values?: Record<string, string>
  code_context?: CodeContext | null
}

export interface CodeContext {
  file_name: string | null
  file_path: string | null
  language: string | null
  visible_line_range: string | null
  active_function: string | null
  errors: CodeDiagnostic[]
  terminal_output: string | null
  git_indicators: string | null
  open_tabs: string[]
  cursor_area: string | null
}

export interface CodeDiagnostic {
  severity: 'error' | 'warning' | 'info'
  message: string
  line: number | null
}

export interface VisionAnalysis {
  surface_type: SurfaceType
  visual_summary: string
  detected_text: string
  focus_region: string
  probable_user_focus: string
  inferred_intent: string
  pedagogical_topics: string[]
  change_summary: ChangeSummary | null
  uncertainty: number
  is_sensitive: boolean
  sensitivity_reason: string | null
  ui_elements: string[]
  visual_context: string | null
  app_identifier: string | null
  emotional_signal: EmotionalSignal | null
  key_values: Record<string, string>
  code_context: CodeContext | null
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
  app_identifier?: string | null
  emotional_signal?: EmotionalSignal | null
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
  display_name: string
  user_level: 'beginner' | 'intermediate' | 'advanced'
  preferred_explanation_style: 'step_by_step' | 'direct' | 'analogy' | 'summary'
  study_goals: string[]
  response_language: string
  response_tone: 'didactic' | 'concise' | 'technical'
  updated_at: number
}

export interface IntermediateThought {
  primary: string
  secondary: string | null
  confidence: number
}

export interface PerceptionContextSnapshot {
  semanticState: SemanticState
  sessionMemory: SessionMemory
  userProfile: UserProfile
  persisted_memory_summary: string
  persisted_memory_highlights: string[]
  intermediateThought: IntermediateThought
  screenshotDataUrl: string | null
}

export type TutorMode =
  | 'direct'
  | 'step_by_step'
  | 'analogy'
  | 'summary'
  | 'diagnostic'
  | 'layered'

export type TutorDomain =
  | 'general'
  | 'reading'
  | 'homework'
  | 'code'
  | 'market'
  | 'document'
  | 'dashboard'

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
  domain: TutorDomain
  mode: TutorMode
  content: string
  provider?: string
  model?: string
  uncertainty: number
  should_ask_confirmation: boolean
  needs_visual_confirmation: boolean
  suggested_follow_ups: string[]
  warning: string | null
  actions?: TutorAction[]
}

export type SpotifyEntityType = 'track' | 'artist' | 'album' | 'playlist'

export type SpotifyActionPayload = {
  action: 'play_uri' | 'resume' | 'pause' | 'next' | 'prev' | 'report_state'
  uri?: string
  entityType?: SpotifyEntityType
  query?: string
}

export type TutorAction = {
  id: string
  label: string
  kind: 'spotify'
  payload: SpotifyActionPayload
}

export interface SpotifyCommandResult {
  ok: boolean
  message: string
  state: {
    isPlaying: boolean
    trackName: string | null
    artistName: string | null
    albumName: string | null
    albumArtUrl: string | null
    progressMs: number
    durationMs: number
    shuffle: boolean
    repeat: 'off' | 'track' | 'context'
    deviceName: string | null
    volumePercent: number | null
  } | null
  errorCode?: 'not_authenticated' | 'no_active_device' | 'forbidden' | 'rate_limited' | 'not_found' | 'invalid_action' | 'unknown'
}

export interface FeatureFlags {
  passiveSuggestions: boolean
  advancedPerception: boolean
  voiceMode: boolean
  crashReporting: boolean
}

export interface CaptureScopeSettings {
  mode: 'any-visible' | 'selected-source'
  selectedSourceId: string | null
  selectedSourceName: string | null
  blockedSourceKeywords: string[]
}

export type TypographyFontFamily = 'system-sans' | 'system-serif' | 'mono'

export type TypographyFontWeight = 'light' | 'book' | 'regular' | 'medium' | 'bold'

export interface TypographySettings {
  fontFamily: TypographyFontFamily
  fontSize: number
  fontWeight: TypographyFontWeight
}

export interface AppSettings {
  telemetryOptIn: boolean
  alwaysVisible: boolean
  minimalMode: boolean
  passiveSuggestions: boolean
  dailyCostLimitUsd: number | null
  featureFlags: FeatureFlags
  captureScope: CaptureScopeSettings
  typography: TypographySettings
  spotifyClientId: string
  updatedAt: number
}

export interface DiagnosticEvent {
  id: string
  type: 'trace' | 'audit' | 'error'
  source: 'main' | 'perception' | 'tutor' | 'renderer' | 'settings' | 'proactive'
  action: string
  at: number
  sessionId?: string
  details: Record<string, string | number | boolean | null>
}

export interface PerformanceTrace {
  id: string
  operation: string
  durationMs: number
  at: number
  status: 'ok' | 'error'
}

export interface ReplayEvent {
  id: string
  at: number
  source: DiagnosticEvent['source']
  action: string
  sessionId?: string
  summary: string
}

export interface FeatureFlagPolicyState {
  requested: boolean
  effective: boolean
  rolloutPercentage: number
  reason: string
}

export type FeaturePolicySnapshot = Record<keyof FeatureFlags, FeatureFlagPolicyState>

export interface DiagnosticsSnapshot {
  appVersion: string
  telemetryOptIn: boolean
  eventCount: number
  recentEvents: DiagnosticEvent[]
  replayEvents: ReplayEvent[]
  performance: {
    traceCount: number
    averageDurationMs: number
    slowestDurationMs: number
    recentTraces: PerformanceTrace[]
  }
  featurePolicy: FeaturePolicySnapshot
}

export interface ConsentRecord {
  id: string
  action: string
  enabled: boolean
  at: number
  source: 'user' | 'system'
}

export interface PrivacySnapshot {
  consentTrail: ConsentRecord[]
  lastDataDeletionAt: number | null
}

export interface DataDeletionSummary {
  sessionCleared: boolean
  diagnosticsCleared: boolean
  userProfileReset: boolean
  settingsReset: boolean
  at: number
}

export interface CaptureSource {
  id: string
  name: string
  thumbnailDataUrl: string
  blocked: boolean
  blockedReason: string | null
  selected: boolean
}

// ─── Biblioteca / Connector types ────────────────────────────────────────────

export type ConnectorID = 'vscode' | 'spotify'

export interface ConnectorStatus {
  id: ConnectorID
  connected: boolean
  connectedAt: number | null
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
  useVisionLLM: boolean
}
