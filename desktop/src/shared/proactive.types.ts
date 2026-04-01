import type { SurfaceType } from './perception.types'

export type ProactiveEventType =
  | 'new-content'
  | 'user-lingering'
  | 'interesting-pattern'
  | 'possible-doubt'
  | 'revisit-focus'
  | 'ocr-conflict'

export type ProactiveInterventionLevel = 'hint'

export type ProactiveActivityType =
  | 'mouse-move'
  | 'scroll'
  | 'typing'
  | 'submit'
  | 'expand'
  | 'collapse'
  | 'engage'

export type ProactiveOutcome =
  | 'pending'
  | 'consumed'
  | 'dismissed'
  | 'expired'
  | 'ignored'

export type ProactiveReasonCode =
  | 'feature-disabled'
  | 'capture-blocked'
  | 'unknown-surface'
  | 'cooldown-active'
  | 'recent-user-activity'
  | 'streaming-active'
  | 'session-limit'
  | 'duplicate-fingerprint'
  | 'low-score'
  | 'low-context-stability'
  | 'no-opportunity'
  | 'emitted'

export interface ProactiveScore {
  relevance: number
  confidence: number
  user_interrupt_cost: number
  novelty: number
  fatigue_penalty: number
  user_match: number
  total: number
}

export interface ProactiveSourceSignals {
  lingerFrames: number
  revisitCount: number
  stableFocus: boolean
  majorChangeDetected: boolean
  domainSignal: string | null
  semanticFocus: string
  topic: string | null
}

export interface ProactiveHint {
  id: string
  eventType: ProactiveEventType
  level: ProactiveInterventionLevel
  text: string
  surfaceType: SurfaceType
  fingerprint: string
  score: ProactiveScore
  sourceSignals: ProactiveSourceSignals
  reasonCodes: ProactiveReasonCode[]
  outcome: ProactiveOutcome
  createdAt: number
  expiresAt: number
}

export interface ProactiveSessionStats {
  emittedCount: number
  consumedCount: number
  dismissedCount: number
  expiredCount: number
  ignoredCount: number
  blockedCount: number
  lastEmitAt: number | null
}

export interface ProactiveState {
  currentHint: ProactiveHint | null
  recentHints: ProactiveHint[]
  cooldownUntil: number
  lastUserActivityAt: number
  lastActivityType: ProactiveActivityType | null
  lastUserSubmitAt: number | null
  lastHudExpandAt: number | null
  lastStreamingAt: number | null
  sessionStats: ProactiveSessionStats
  recentBlockReasons: ProactiveReasonCode[]
}
