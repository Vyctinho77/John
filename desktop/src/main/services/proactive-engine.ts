import { randomUUID } from 'crypto'
import type { PerceptionContextSnapshot, SurfaceType } from '../../shared/perception.types'
import type {
  ProactiveActivityType,
  ProactiveEventType,
  ProactiveHint,
  ProactiveInterventionLevel,
  ProactiveOutcome,
  ProactiveReasonCode,
  ProactiveScore,
  ProactiveSessionStats,
  ProactiveSourceSignals,
  ProactiveState
} from '../../shared/proactive.types'

const GLOBAL_COOLDOWN_MS = 18_000
const TOPIC_COOLDOWN_MS = 45_000
const HINT_TTL_MS = 14_000
const MAX_HINTS_PER_SESSION = 6
const USER_IDLE_REQUIRED_MS = 4_000
const SUBMIT_BLOCK_MS = 8_000
const EXPAND_BLOCK_MS = 6_000
const STREAMING_BLOCK_MS = 5_000
const RAPID_ACTIVITY_WINDOW_MS = 1_500
const RAPID_ACTIVITY_LIMIT = 4
const MIN_CONTEXT_FRAMES = 2

const SCORE_THRESHOLDS: Record<ProactiveEventType, number> = {
  'interesting-pattern': 0.64,
  'new-content': 0.61,
  'user-lingering': 0.59,
  'possible-doubt': 0.58,
  'revisit-focus': 0.6,
  'ocr-conflict': 0.62,
  'user-frustrated': 0.56,
  'app-switch': 0.63
}

interface OpportunityCandidate {
  eventType: ProactiveEventType
  level: ProactiveInterventionLevel
  text: string
  score: ProactiveScore
  sourceSignals: ProactiveSourceSignals
  fingerprint: string
}

interface ProactiveDebugDecision {
  emitted: boolean
  reasonCodes: ProactiveReasonCode[]
  candidate: OpportunityCandidate | null
}

const DEFAULT_SESSION_STATS: ProactiveSessionStats = {
  emittedCount: 0,
  consumedCount: 0,
  dismissedCount: 0,
  expiredCount: 0,
  ignoredCount: 0,
  blockedCount: 0,
  lastEmitAt: null
}

const DEFAULT_STATE: ProactiveState = {
  currentHint: null,
  recentHints: [],
  cooldownUntil: 0,
  ignoredStreak: 0,
  lastUserActivityAt: Date.now(),
  lastActivityType: null,
  lastUserSubmitAt: null,
  lastHudExpandAt: null,
  lastStreamingAt: null,
  sessionStats: { ...DEFAULT_SESSION_STATS },
  recentBlockReasons: []
}

let state: ProactiveState = { ...DEFAULT_STATE }
let expiryTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<(hint: ProactiveHint | null) => void>()

export async function evaluateProactiveOpportunity(
  snapshot: PerceptionContextSnapshot,
  options?: { isStreaming?: boolean }
): Promise<ProactiveHint | null> {
  const { getAppSettings } = await import('./settings')
  const now = Date.now()
  pruneExpired(now)

  const settings = await getAppSettings()
  const decision = decideOpportunity(snapshot, {
    ...state,
    lastStreamingAt:
      options?.isStreaming ? now : state.lastStreamingAt
  }, settings, now)

  if (!decision.emitted || !decision.candidate) {
    registerBlockReasons(decision.reasonCodes)
    await logDecision(snapshot, decision)
    return null
  }

  const hint: ProactiveHint = {
    id: randomUUID(),
    eventType: decision.candidate.eventType,
    level: decision.candidate.level,
    text: decision.candidate.text,
    surfaceType: snapshot.semanticState.surface_type,
    fingerprint: decision.candidate.fingerprint,
    score: decision.candidate.score,
    sourceSignals: decision.candidate.sourceSignals,
    reasonCodes: decision.reasonCodes,
    outcome: 'pending',
    createdAt: now,
    expiresAt: now + HINT_TTL_MS
  }

  state = {
    ...state,
    currentHint: hint,
    recentHints: [...state.recentHints, hint].slice(-18),
    cooldownUntil: now + getAdaptiveCooldownMs(state.ignoredStreak),
    sessionStats: {
      ...state.sessionStats,
      emittedCount: state.sessionStats.emittedCount + 1,
      lastEmitAt: now
    }
  }

  scheduleExpiry(hint.id)
  notify(hint)
  await logDecision(snapshot, decision, hint)
  return hint
}

export function markProactiveUserActivity(type: ProactiveActivityType = 'engage'): void {
  const now = Date.now()
  const previousHint = state.currentHint

  state = {
    ...state,
    lastUserActivityAt: now,
    lastActivityType: type,
    lastUserSubmitAt: type === 'submit' ? now : state.lastUserSubmitAt,
    lastHudExpandAt: type === 'expand' ? now : state.lastHudExpandAt,
    lastStreamingAt: type === 'typing' ? state.lastStreamingAt : state.lastStreamingAt
  }

  if (type === 'submit' || type === 'expand' || type === 'engage') {
    closeCurrentHint(type === 'submit' ? 'consumed' : 'ignored')
  } else if (type === 'collapse') {
    closeCurrentHint('dismissed')
  } else if (previousHint && type === 'typing') {
    closeCurrentHint('ignored')
  }
}

export function markProactiveStreaming(active: boolean): void {
  state = {
    ...state,
    lastStreamingAt: active ? Date.now() : state.lastStreamingAt
  }
  if (active) closeCurrentHint('ignored')
}

export function dismissCurrentHint(reason: ProactiveOutcome = 'dismissed'): void {
  closeCurrentHint(reason)
}

export function getProactiveState(): ProactiveState {
  pruneExpired(Date.now())
  return state
}

export function onProactiveHint(cb: (hint: ProactiveHint | null) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function resetProactiveState(): void {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
  state = { ...DEFAULT_STATE, sessionStats: { ...DEFAULT_SESSION_STATS } }
}

export function decideOpportunity(
  snapshot: PerceptionContextSnapshot,
  currentState: ProactiveState,
  settings: {
    passiveSuggestions: boolean
    featureFlags: {
      passiveSuggestions: boolean
    }
  },
  now = Date.now()
): ProactiveDebugDecision {
  const reasonCodes: ProactiveReasonCode[] = []

  if (!settings.passiveSuggestions || !settings.featureFlags.passiveSuggestions) {
    return blocked('feature-disabled', reasonCodes)
  }
  if (snapshot.semanticState.capture_policy !== 'allowed') {
    return blocked('capture-blocked', reasonCodes)
  }
  if (snapshot.semanticState.surface_type === 'unknown') {
    return blocked('unknown-surface', reasonCodes)
  }
  if (snapshot.sessionMemory.frame_count < MIN_CONTEXT_FRAMES) {
    return blocked('low-context-stability', reasonCodes)
  }
  if (now < currentState.cooldownUntil) {
    return blocked('cooldown-active', reasonCodes)
  }
  if (now - currentState.lastUserActivityAt < USER_IDLE_REQUIRED_MS) {
    return blocked('recent-user-activity', reasonCodes)
  }
  if (currentState.lastUserSubmitAt && now - currentState.lastUserSubmitAt < SUBMIT_BLOCK_MS) {
    return blocked('recent-user-activity', reasonCodes)
  }
  if (currentState.lastHudExpandAt && now - currentState.lastHudExpandAt < EXPAND_BLOCK_MS) {
    return blocked('recent-user-activity', reasonCodes)
  }
  if (currentState.lastStreamingAt && now - currentState.lastStreamingAt < STREAMING_BLOCK_MS) {
    return blocked('streaming-active', reasonCodes)
  }

  const sessionHintCount = currentState.recentHints.filter(
    hint => hint.createdAt >= snapshot.sessionMemory.started_at
  ).length
  if (sessionHintCount >= MAX_HINTS_PER_SESSION) {
    return blocked('session-limit', reasonCodes)
  }

  const candidates = buildOpportunityCandidates(snapshot, currentState, now)
  if (!candidates.length) {
    return blocked('no-opportunity', reasonCodes)
  }

  const candidate = candidates.sort((a, b) => b.score.total - a.score.total)[0]
  if (!candidate) return blocked('no-opportunity', reasonCodes)

  const duplicate = currentState.recentHints.some(
    hint =>
      hint.fingerprint === candidate.fingerprint &&
      now - hint.createdAt < TOPIC_COOLDOWN_MS
  )
  if (duplicate) {
    return blocked('duplicate-fingerprint', reasonCodes)
  }

  const threshold = SCORE_THRESHOLDS[candidate.eventType]
  if (candidate.score.total < threshold) {
    return blocked('low-score', reasonCodes)
  }

  reasonCodes.push('emitted')
  return {
    emitted: true,
    reasonCodes,
    candidate
  }
}

export function buildOpportunityCandidates(
  snapshot: PerceptionContextSnapshot,
  currentState: ProactiveState,
  now = Date.now()
): OpportunityCandidate[] {
  const signals = detectSignals(snapshot, currentState, now)
  const candidates: OpportunityCandidate[] = []

  for (const eventType of signals.eventTypes) {
    const score = scoreCandidate(snapshot, currentState, eventType, signals)
    const text = buildHintText(snapshot, eventType, 'hint', signals)
    const fingerprint = buildFingerprint(snapshot, eventType, text, signals)

    candidates.push({
      eventType,
      level: 'hint',
      text,
      score,
      sourceSignals: signals,
      fingerprint
    })
  }

  return candidates
}

export function detectSignals(
  snapshot: PerceptionContextSnapshot,
  currentState: ProactiveState,
  now = Date.now()
): ProactiveSourceSignals & { eventTypes: ProactiveEventType[] } {
  const { semanticState, sessionMemory } = snapshot
  const recent = sessionMemory.recent_states.slice(-4)
  const currentFocus = normalizeFocus(semanticState.probable_user_focus)
  const lingerFrames = recent.filter(
    entry => normalizeFocus(entry.probable_user_focus) === currentFocus
  ).length
  const stableFocus =
    lingerFrames >= 2 &&
    recent.every(entry => entry.change_summary === 'none' || entry.change_summary === 'minor')

  const previousEntries = sessionMemory.recent_states.slice(0, -1)
  const revisitCount = previousEntries.filter(
    entry => normalizeFocus(entry.probable_user_focus) === currentFocus
  ).length

  const majorChangeDetected = semanticState.change_summary === 'major'
  const domainSignal = detectDomainSignal(semanticState.surface_type, semanticState.detected_text)
  const topic = semanticState.pedagogical_topics[0] ?? null
  const emotionalSignal = semanticState.emotional_signal ?? null
  const appIdentifier = semanticState.app_identifier ?? null

  // Detect app switch by comparing current app with the most recent session entry
  const lastEntry = sessionMemory.recent_states[sessionMemory.recent_states.length - 1]
  const previousApp = lastEntry?.app_identifier ?? null
  const appSwitchDetected = Boolean(
    appIdentifier && previousApp && appIdentifier !== previousApp
  )

  const eventTypes = new Set<ProactiveEventType>()

  if (domainSignal) eventTypes.add('interesting-pattern')
  if (majorChangeDetected && semanticState.detected_text.length > 12) eventTypes.add('new-content')
  if (stableFocus && lingerFrames >= 2) eventTypes.add('user-lingering')
  if (revisitCount >= 2) eventTypes.add('revisit-focus')
  if (
    semanticState.uncertainty >= 0.62 &&
    semanticState.detected_text.length > 20 &&
    semanticState.surface_type !== 'unknown'
  ) {
    eventTypes.add('ocr-conflict')
  }
  if (
    snapshot.userProfile.user_level === 'beginner' &&
    topic &&
    stableFocus &&
    semanticState.uncertainty <= 0.7
  ) {
    eventTypes.add('possible-doubt')
  }

  // Vision-enriched signals
  if (emotionalSignal === 'frustrated' || emotionalSignal === 'confused') {
    eventTypes.add('user-frustrated')
  }
  if (appSwitchDetected && majorChangeDetected) {
    eventTypes.add('app-switch')
  }

  const rapidInteractions = currentState.recentBlockReasons.filter(
    reason => reason === 'recent-user-activity' && now - currentState.lastUserActivityAt < RAPID_ACTIVITY_WINDOW_MS
  ).length
  if (rapidInteractions >= RAPID_ACTIVITY_LIMIT) {
    eventTypes.clear()
  }

  return {
    lingerFrames,
    revisitCount,
    stableFocus,
    majorChangeDetected,
    domainSignal,
    semanticFocus: currentFocus,
    topic,
    emotionalSignal,
    appIdentifier,
    appSwitchDetected,
    eventTypes: [...eventTypes]
  }
}

export function scoreCandidate(
  snapshot: PerceptionContextSnapshot,
  currentState: ProactiveState,
  eventType: ProactiveEventType,
  signals: ProactiveSourceSignals
): ProactiveScore {
  const confidence = clamp(1 - snapshot.semanticState.uncertainty)
  const relevance =
    eventType === 'interesting-pattern' ? 0.86
    : eventType === 'user-frustrated' ? 0.88
    : eventType === 'new-content' ? 0.78
    : eventType === 'ocr-conflict' ? 0.73
    : eventType === 'revisit-focus' ? 0.7
    : eventType === 'user-lingering' ? 0.67
    : eventType === 'app-switch' ? 0.72
    : 0.65

  const userInterruptCost =
    currentState.lastActivityType === 'typing' ? 0.82
    : currentState.lastActivityType === 'scroll' ? 0.7
    : eventType === 'user-frustrated' ? 0.18
    : eventType === 'interesting-pattern' ? 0.26
    : eventType === 'new-content' ? 0.42
    : eventType === 'app-switch' ? 0.38
    : 0.34

  const novelty = clamp(
    1 -
      currentState.recentHints.filter(
        hint =>
          hint.surfaceType === snapshot.semanticState.surface_type &&
          normalizeFocus(hint.sourceSignals.semanticFocus) === signals.semanticFocus
      ).length * 0.28
  )

  const fatiguePenalty = clamp(
    currentState.sessionStats.emittedCount * 0.08 +
      currentState.sessionStats.ignoredCount * 0.04
  )

  const userMatch =
    snapshot.userProfile.user_level === 'beginner' && snapshot.semanticState.pedagogical_topics.length
      ? 0.82
      : snapshot.userProfile.user_level === 'advanced'
        ? 0.58
        : 0.68

  const intentAdjusted = applyGlobalIntentAdjustments(
    snapshot.globalIntent.mode,
    eventType,
    {
      relevance,
      userInterruptCost,
      userMatch,
      fatiguePenalty
    }
  )

  const total = clamp(
    intentAdjusted.relevance * 0.31 +
      confidence * 0.24 +
      (1 - intentAdjusted.userInterruptCost) * 0.17 +
      novelty * 0.14 +
      intentAdjusted.userMatch * 0.14 -
      intentAdjusted.fatiguePenalty * 0.16
  )

  return {
    relevance: round(intentAdjusted.relevance),
    confidence: round(confidence),
    user_interrupt_cost: round(intentAdjusted.userInterruptCost),
    novelty: round(novelty),
    fatigue_penalty: round(intentAdjusted.fatiguePenalty),
    user_match: round(intentAdjusted.userMatch),
    total: round(total)
  }
}

function blocked(
  reason: ProactiveReasonCode,
  reasonCodes: ProactiveReasonCode[]
): ProactiveDebugDecision {
  reasonCodes.push(reason)
  return {
    emitted: false,
    reasonCodes,
    candidate: null
  }
}

function detectDomainSignal(surfaceType: SurfaceType, detectedText: string): string | null {
  const text = detectedText.toLowerCase()
  if (surfaceType === 'code' && /\b(error|exception|traceback|cannot|failed|undefined|null reference|stack)\b/.test(text)) {
    return 'code-error'
  }
  if ((surfaceType === 'dashboard' || surfaceType === 'graphic') && /\b(rsi|macd|ema|volume|alerta|resistencia|suporte)\b/.test(text)) {
    return 'market-pattern'
  }
  if ((surfaceType === 'document' || surfaceType === 'text') && /\b(definicao|teorema|conceito|resumo|hipotese)\b/.test(text)) {
    return 'concept-cluster'
  }
  return null
}

function buildHintText(
  snapshot: PerceptionContextSnapshot,
  eventType: ProactiveEventType,
  _level: ProactiveInterventionLevel,
  signals: ProactiveSourceSignals
): string {
  const topic = signals.topic

  if (eventType === 'interesting-pattern') {
    return snapshot.semanticState.surface_type === 'code'
      ? 'isso aqui parece um erro importante'
      : 'isso parece um padrao importante'
  }
  if (eventType === 'new-content') {
    return 'parece que isso mudou agora'
  }
  if (eventType === 'revisit-focus') {
    return 'você voltou nisso de novo'
  }
  if (eventType === 'ocr-conflict') {
    return 'esse trecho parece instavel, mas importante'
  }
  if (eventType === 'possible-doubt' && topic) {
    return `isso costuma confundir em ${topic}`
  }
  if (eventType === 'user-frustrated') {
    return 'parece que voce ta travado, posso ajudar?'
  }
  if (eventType === 'app-switch') {
    const app = signals.appIdentifier
    return app ? `voce mudou pra ${app}, quer contexto?` : 'parece que voce mudou de contexto'
  }
  return 'isso aqui parece importante'
}

function buildFingerprint(
  snapshot: PerceptionContextSnapshot,
  eventType: ProactiveEventType,
  text: string,
  signals: ProactiveSourceSignals
): string {
  return [
    eventType,
    snapshot.semanticState.surface_type,
    signals.semanticFocus,
    signals.topic ?? '',
    text
  ].join(':').toLowerCase()
}

function closeCurrentHint(outcome: ProactiveOutcome): void {
  if (!state.currentHint) return
  const currentHint = { ...state.currentHint, outcome }

  state = {
    ...state,
    currentHint: null,
    ignoredStreak:
      outcome === 'ignored'
        ? Math.min(state.ignoredStreak + 1, 6)
        : outcome === 'consumed'
          ? 0
          : Math.max(0, state.ignoredStreak - 1),
    recentHints: state.recentHints.map(hint => hint.id === currentHint.id ? currentHint : hint),
    sessionStats: {
      ...state.sessionStats,
      consumedCount: state.sessionStats.consumedCount + (outcome === 'consumed' ? 1 : 0),
      dismissedCount: state.sessionStats.dismissedCount + (outcome === 'dismissed' ? 1 : 0),
      expiredCount: state.sessionStats.expiredCount + (outcome === 'expired' ? 1 : 0),
      ignoredCount: state.sessionStats.ignoredCount + (outcome === 'ignored' ? 1 : 0)
    }
  }

  if (expiryTimer) {
    clearTimeout(expiryTimer)
    expiryTimer = null
  }
  notify(null)
}

function pruneExpired(now: number): void {
  const currentHint = state.currentHint && state.currentHint.expiresAt > now
    ? state.currentHint
    : null

  if (state.currentHint && !currentHint) {
    closeCurrentHint('expired')
  }

  state = {
    ...state,
    currentHint,
    recentHints: state.recentHints.filter(hint => now - hint.createdAt < 5 * 60_000)
  }
}

function scheduleExpiry(hintId: string): void {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = setTimeout(() => {
    if (state.currentHint?.id === hintId) closeCurrentHint('expired')
  }, HINT_TTL_MS + 20)
}

function registerBlockReasons(reasonCodes: ProactiveReasonCode[]): void {
  if (!reasonCodes.length) return
  state = {
    ...state,
    recentBlockReasons: [...state.recentBlockReasons, ...reasonCodes].slice(-16),
    sessionStats: {
      ...state.sessionStats,
      blockedCount: state.sessionStats.blockedCount + 1
    }
  }
}

async function logDecision(
  snapshot: PerceptionContextSnapshot,
  decision: ProactiveDebugDecision,
  hint?: ProactiveHint
): Promise<void> {
  const { recordDiagnosticEvent } = await import('./observability')
  await recordDiagnosticEvent({
    type: 'trace',
    source: 'proactive',
    action: hint ? 'proactive_hint_emitted' : 'proactive_hint_blocked',
    sessionId: snapshot.sessionMemory.session_id,
    details: {
      eventType: hint?.eventType ?? decision.candidate?.eventType ?? null,
      totalScore: hint?.score.total ?? decision.candidate?.score.total ?? null,
      reasonCodes: decision.reasonCodes.join(','),
      surfaceType: snapshot.semanticState.surface_type
    }
  })
}

function normalizeFocus(focus: string): string {
  return focus.replace(/^.*?:\s*/, '').trim().toLowerCase()
}

function notify(hint: ProactiveHint | null): void {
  listeners.forEach(listener => listener(hint))
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number): number {
  return Number(value.toFixed(2))
}

function applyGlobalIntentAdjustments(
  mode: PerceptionContextSnapshot['globalIntent']['mode'],
  eventType: ProactiveEventType,
  base: {
    relevance: number
    userInterruptCost: number
    userMatch: number
    fatiguePenalty: number
  }
): {
  relevance: number
  userInterruptCost: number
  userMatch: number
  fatiguePenalty: number
} {
  switch (mode) {
    case 'technical_focus':
      return {
        relevance: clamp(base.relevance + (eventType === 'interesting-pattern' ? 0.05 : 0)),
        userInterruptCost: clamp(base.userInterruptCost + (eventType === 'possible-doubt' ? 0.12 : 0.06)),
        userMatch: clamp(base.userMatch + (eventType === 'interesting-pattern' ? 0.06 : 0.02)),
        fatiguePenalty: clamp(base.fatiguePenalty + 0.02)
      }
    case 'decision':
      return {
        relevance: clamp(base.relevance + (eventType === 'interesting-pattern' || eventType === 'new-content' ? 0.08 : 0.03)),
        userInterruptCost: clamp(base.userInterruptCost - 0.05),
        userMatch: clamp(base.userMatch + 0.06),
        fatiguePenalty: clamp(base.fatiguePenalty)
      }
    case 'study':
      return {
        relevance: clamp(base.relevance + (eventType === 'possible-doubt' || eventType === 'revisit-focus' ? 0.06 : 0.02)),
        userInterruptCost: clamp(base.userInterruptCost - 0.02),
        userMatch: clamp(base.userMatch + 0.07),
        fatiguePenalty: clamp(base.fatiguePenalty)
      }
    case 'light':
      return {
        relevance: clamp(base.relevance - 0.08),
        userInterruptCost: clamp(base.userInterruptCost + 0.12),
        userMatch: clamp(base.userMatch - 0.08),
        fatiguePenalty: clamp(base.fatiguePenalty + 0.08)
      }
    case 'review':
      return {
        relevance: clamp(base.relevance + (eventType === 'revisit-focus' || eventType === 'new-content' ? 0.08 : 0.01)),
        userInterruptCost: clamp(base.userInterruptCost),
        userMatch: clamp(base.userMatch + 0.05),
        fatiguePenalty: clamp(base.fatiguePenalty)
      }
    case 'uncertain':
      return {
        relevance: clamp(base.relevance - 0.12),
        userInterruptCost: clamp(base.userInterruptCost + 0.14),
        userMatch: clamp(base.userMatch - 0.1),
        fatiguePenalty: clamp(base.fatiguePenalty + 0.1)
      }
  }
}

function getAdaptiveCooldownMs(ignoredStreak: number): number {
  if (ignoredStreak < 3) return GLOBAL_COOLDOWN_MS
  const extraSteps = Math.min(ignoredStreak - 2, 4)
  return GLOBAL_COOLDOWN_MS + extraSteps * 12_000
}
