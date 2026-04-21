import { captureFrame, captureScreen, getWindowSources } from './capture'
import type { CaptureFrame } from './capture'
import { recognizeImage, terminateWorker } from './ocr'
import { detectSensitiveSurface } from './privacy-guards'
import { evaluateProactiveOpportunity } from './proactive-engine'
import { getUserProfile, updateUserProfile as persistUserProfile } from './user-profile'
import { recordDiagnosticEvent, recordPerformanceTrace } from './observability'
import { getMemoryContext, syncPersistedMemory } from './memory-card'
import { buildIntermediateThought } from './intermediate-thought'
import {
  createGlobalIntentState,
  getGlobalIntentState,
  resetGlobalIntentState,
  resolveGlobalIntent
} from './global-intent'
import {
  effectiveObservationText,
  estimateUncertainty,
  extractPrimaryContentText
} from './perception-helpers'
import { analyzeScreenWithVision, buildSemanticStateFromVision } from './vision-analyzer'
import type {
  CaptureSource,
  ChangeSummary,
  PerceptionConfig,
  PerceptionContextSnapshot,
  PerceptionResult,
  SemanticState,
  SessionMemory,
  SessionMemoryEntry,
  SurfaceType,
  UserProfile
} from '../../shared/perception.types'

// ---------------------------------------------------------------------------
// Perception state machine
// ---------------------------------------------------------------------------
//
//  IDLE ──(frame changed)──→ WATCHING ──(2+ stable frames)──→ SETTLED → analyze
//   ↑                           │                                  │
//   │   3+ unchanged polls      │ each poll detects change         │
//   └───────────────────────────┘  (scroll/typing = stay watching) │
//   ↑                                                              │
//   └──────── analysis complete, cooldown 8s ──────────────────────┘
//
// IDLE:      poll every 20s base, up to 40s after 5+ unchanged cycles (adaptive)
// WATCHING:  poll every 2s   (cheap hash-only, waiting for settle)
// SETTLED:   run full analyzeOnce(), then → IDLE with cooldown
// ---------------------------------------------------------------------------

type PerceptionPhase = 'idle' | 'watching' | 'settled' | 'analyzing'

const FAST_POLL_MS = 2_000
const IDLE_POLL_MS = 20_000
const IDLE_POLL_MAX_MS = 40_000        // ceiling for adaptive throttling
const IDLE_THROTTLE_AFTER = 5         // consecutive unchanged cycles before stepping up
const IDLE_THROTTLE_STEP_MS = 5_000   // how much to add per extra unchanged cycle
const POST_ANALYSIS_COOLDOWN_MS = 8_000
const SETTLE_THRESHOLD = 2
const MAX_WATCHING_WITHOUT_SETTLE = 15 // safety: force analysis after 30s of watching
const SNAPSHOT_STALE_MS = 15_000
const WATCHING_SNAPSHOT_STALE_MS = 4_000

const DEFAULT_CONFIG: PerceptionConfig = {
  enabled: false,
  privateMode: false,
  intervalMs: IDLE_POLL_MS,
  thumbnailWidth: 1280,
  thumbnailHeight: 720,
  targetSourceId: null,
  sessionTtlMs: 15 * 60_000,
  memoryLimit: 6,
  useVisionLLM: true
}

let config: PerceptionConfig = { ...DEFAULT_CONFIG }
let pollTimer: ReturnType<typeof setTimeout> | null = null
let captureStateListeners: ((isCapturing: boolean) => void)[] = []
let snapshotListeners: ((snapshot: PerceptionContextSnapshot) => void)[] = []
let lastRawText = ''
let consecutiveUnchanged = 0
let sessionMemory = createSessionMemory()
let latestSnapshot: PerceptionContextSnapshot | null = null
let sensitiveSurfaceBlocked = false

// State machine state
let phase: PerceptionPhase = 'idle'
let lastFrameHash: string | null = null
let lastWindowTitle: string | null = null
let stableFrameCount = 0
let watchingPollCount = 0
let pendingFrame: CaptureFrame | null = null
let appSwitchDetected = false

export function configurePerception(patch: Partial<PerceptionConfig>): void {
  config = { ...config, ...patch }
}

export function setPrivateMode(enabled: boolean): void {
  config.privateMode = enabled
  if (enabled) sensitiveSurfaceBlocked = false
  notifyCaptureState(!enabled && config.enabled)
  if (enabled) stopSession()
}

function getPhaseInterval(): number {
  if (phase === 'watching') return FAST_POLL_MS
  // Adaptive idle: step up interval for every unchanged cycle beyond the threshold,
  // capped at IDLE_POLL_MAX_MS. Resets to base whenever the screen changes.
  const extra = Math.max(0, consecutiveUnchanged - IDLE_THROTTLE_AFTER) * IDLE_THROTTLE_STEP_MS
  return Math.min(IDLE_POLL_MS + extra, IDLE_POLL_MAX_MS)
}

function scheduleNextPoll(): void {
  if (!config.enabled || config.privateMode) return
  if (pollTimer) clearTimeout(pollTimer)

  pollTimer = setTimeout(async () => {
    if (!config.enabled || config.privateMode) return
    await pollFrame()
    scheduleNextPoll()
  }, getPhaseInterval())
}

/**
 * Lightweight poll — capture + hash + window title comparison.
 * No OCR, no Vision LLM. Drives the state machine.
 */
async function pollFrame(): Promise<void> {
  if (phase === 'analyzing') return

  const frame = await captureFrame(config.targetSourceId ?? undefined)
  if (!frame) return

  const hashChanged = lastFrameHash !== null && frame.hash !== lastFrameHash
  const titleChanged = lastWindowTitle !== null && frame.windowTitle !== null
    && frame.windowTitle !== lastWindowTitle

  // --- State transitions ---

  if (hashChanged || titleChanged) {
    // Screen or app changed — enter watching mode, reset adaptive throttle
    appSwitchDetected = titleChanged
    stableFrameCount = 0
    watchingPollCount = 0
    consecutiveUnchanged = 0
    pendingFrame = frame
    lastFrameHash = frame.hash
    lastWindowTitle = frame.windowTitle

    if (phase !== 'watching') {
      phase = 'watching'
      void recordDiagnosticEvent({
        type: 'trace',
        source: 'perception',
        action: 'phase_watching',
        details: {
          trigger: titleChanged ? 'app_switch' : 'frame_changed',
          windowTitle: frame.windowTitle ?? 'unknown'
        }
      })
    }

    return
  }

  // Hash unchanged
  lastFrameHash = frame.hash
  lastWindowTitle = frame.windowTitle

  if (phase === 'watching') {
    stableFrameCount++
    watchingPollCount++

    const shouldSettle = stableFrameCount >= SETTLE_THRESHOLD
      || watchingPollCount >= MAX_WATCHING_WITHOUT_SETTLE

    if (shouldSettle) {
      // Screen settled — run full analysis
      phase = 'analyzing'
      pendingFrame = pendingFrame ?? frame

      void recordDiagnosticEvent({
        type: 'trace',
        source: 'perception',
        action: 'phase_settled',
        details: {
          stableFrames: stableFrameCount,
          watchingPolls: watchingPollCount,
          appSwitch: appSwitchDetected
        }
      })

      try {
        await analyzeOnce(pendingFrame.dataUrl)
      } finally {
        pendingFrame = null
        appSwitchDetected = false
        stableFrameCount = 0
        watchingPollCount = 0
        phase = 'idle'

        // Post-analysis cooldown — pause before next poll
        if (pollTimer) clearTimeout(pollTimer)
        pollTimer = setTimeout(() => {
          if (config.enabled && !config.privateMode) {
            scheduleNextPoll()
          }
        }, POST_ANALYSIS_COOLDOWN_MS)
      }
      return
    }
  } else {
    // Idle, nothing changed
    consecutiveUnchanged++
  }
}

export function startSession(): void {
  if (config.privateMode || sensitiveSurfaceBlocked) return
  config.enabled = true
  ensureActiveSession()
  notifyCaptureState(true)
  phase = 'idle'
  lastFrameHash = null
  lastWindowTitle = null
  stableFrameCount = 0
  watchingPollCount = 0
  if (pollTimer) return
  // First analysis immediately, then switch to polling
  void (async () => {
    await analyzeOnce()
    scheduleNextPoll()
  })()
}

export function stopSession(): void {
  config.enabled = false
  notifyCaptureState(false)
  phase = 'idle'
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

export async function analyzeOnce(preloadedDataUrl?: string): Promise<PerceptionContextSnapshot> {
  const startedAt = Date.now()
  const userProfile = await getUserProfile()

  try {
    if (config.privateMode) {
      const snapshot = await buildEmptySnapshot('private mode active', userProfile)
      latestSnapshot = snapshot
      void recordPerformanceTrace({
        operation: 'perception.analyze',
        durationMs: Date.now() - startedAt,
        status: 'ok'
      })
      return snapshot
    }

    ensureActiveSession()

    // Use pre-captured frame from polling if available, otherwise capture fresh
    const dataUrl = preloadedDataUrl ?? await captureScreen(config.targetSourceId ?? undefined)
    if (!dataUrl) {
      const snapshot = await buildEmptySnapshot('capture failed - check screen recording permission', userProfile)
      latestSnapshot = snapshot
      void recordPerformanceTrace({
        operation: 'perception.analyze',
        durationMs: Date.now() - startedAt,
        status: 'error'
      })
      return snapshot
    }

    // Skip OCR when the previous frame was already classified as a graphic
    // surface. Tesseract produces near-zero-confidence output on charts and
    // images, and repeatedly processing them triggers Leptonica bbox errors.
    //
    // With Vision LLM: skip from the second graphic frame onward (Vision reads
    // the frame directly without needing OCR text).
    //
    // Without Vision LLM: also skip if prevSurface is 'graphic' — the heuristic
    // analyzer already classified it, and re-running OCR on charts adds noise
    // without improving accuracy.
    const prevSurface = latestSnapshot?.semanticState.surface_type
    const skipOcr = prevSurface === 'graphic'

    const perception: PerceptionResult = skipOcr
      ? { rawText: '', confidence: 0, regions: [], capturedAt: Date.now() }
      : await recognizeImage(dataUrl)

    // --- Vision LLM path (primary) ---
    let semanticState: SemanticState | null = null
    let analysisSource: 'vision' | 'heuristic' = 'heuristic'

    if (config.useVisionLLM) {
      const ocrText = perception.rawText.trim()
      const visionResult = await analyzeScreenWithVision(
        dataUrl,
        ocrText,
        lastRawText,
        userProfile
      )

      if (visionResult) {
        semanticState = buildSemanticStateFromVision(visionResult, perception, lastRawText)
        analysisSource = 'vision'
      }
    }

    // --- Heuristic fallback ---
    if (!semanticState) {
      if (!perception.rawText.trim() && perception.regions.length === 0) {
        const snapshot = await buildEmptySnapshot('ocr sem contexto util no frame atual', userProfile)
        latestSnapshot = snapshot
        void recordPerformanceTrace({
          operation: 'perception.analyze',
          durationMs: Date.now() - startedAt,
          status: 'ok'
        })
        return snapshot
      }

      semanticState = buildSemanticStateHeuristic(perception, userProfile)
      analysisSource = 'heuristic'
    }

    if (semanticState.capture_policy === 'blocked-sensitive') {
      sensitiveSurfaceBlocked = true
      stopSession()
    }

    lastRawText = semanticState.detected_text || effectiveObservationText(perception) || perception.rawText

    // Track consecutive unchanged frames for adaptive throttling
    if (semanticState.change_summary === 'none') {
      consecutiveUnchanged++
    } else {
      consecutiveUnchanged = 0
    }

    sessionMemory = updateSessionMemory(sessionMemory, semanticState)

    await syncPersistedMemory({ userProfile, sessionMemory })
    const memoryContext = await getMemoryContext()
    const intermediateThought = buildIntermediateThought({
      semanticState,
      sessionMemory,
      persistedMemoryHighlights: memoryContext.highlights
    })
    const globalIntent = await resolveGlobalIntent(
      {
        semanticState,
        sessionMemory,
        userProfile
      },
      {
        appSwitchDetected
      }
    )

    const snapshot = {
      semanticState,
      sessionMemory,
      globalIntent,
      userProfile,
      persisted_memory_summary: memoryContext.summary,
      persisted_memory_highlights: memoryContext.highlights,
      intermediateThought,
      screenshotDataUrl: dataUrl
    }

    void evaluateProactiveOpportunity(snapshot)
    notifySnapshotUpdate(snapshot)

    void recordDiagnosticEvent({
      type: 'trace',
      source: 'perception',
      action: 'analyze_once',
      sessionId: sessionMemory.session_id,
      details: {
        surfaceType: semanticState.surface_type,
        changeSummary: semanticState.change_summary,
        uncertainty: Number(semanticState.uncertainty.toFixed(2)),
        analysisSource
      }
    })

    void recordPerformanceTrace({
      operation: 'perception.analyze',
      durationMs: Date.now() - startedAt,
      status: semanticState.capture_policy === 'blocked-sensitive' ? 'error' : 'ok'
    })

    latestSnapshot = snapshot
    return snapshot
  } catch (error) {
    void recordDiagnosticEvent({
      type: 'error',
      source: 'perception',
      action: 'analyze_failed',
      sessionId: sessionMemory.session_id,
      details: {
        hasMessage: error instanceof Error ? Boolean(error.message) : true
      }
    })
    void recordPerformanceTrace({
      operation: 'perception.analyze',
      durationMs: Date.now() - startedAt,
      status: 'error'
    })
    throw error
  }
}

export async function getContextSnapshot(): Promise<PerceptionContextSnapshot> {
  if (latestSnapshot) {
    const refresh = await getSnapshotRefreshPlan(latestSnapshot)
    if (!refresh) return latestSnapshot

    void recordDiagnosticEvent({
      type: 'trace',
      source: 'perception',
      action: 'refresh_snapshot_for_tutor',
      sessionId: sessionMemory.session_id,
      details: {
        reason: refresh.reason,
        phase,
        ageMs: Math.max(0, Date.now() - latestSnapshot.semanticState.capturedAt)
      }
    })

    return analyzeOnce(refresh.frame?.dataUrl)
  }
  return analyzeOnce()
}

export async function getUserProfileSnapshot(): Promise<UserProfile> {
  return getUserProfile()
}

export async function updateUserProfile(patch: Partial<UserProfile>): Promise<PerceptionContextSnapshot> {
  const userProfile = await persistUserProfile(patch)
  const semanticState =
    latestSnapshot?.semanticState ?? buildEmptySemanticState('waiting for first capture')
  await syncPersistedMemory({ userProfile, sessionMemory })
  const memoryContext = await getMemoryContext()
  const intermediateThought = buildIntermediateThought({
    semanticState,
    sessionMemory,
    persistedMemoryHighlights: memoryContext.highlights
  })

  const snapshot = {
    semanticState,
    sessionMemory,
    globalIntent: getGlobalIntentState(),
    userProfile,
    persisted_memory_summary: memoryContext.summary,
    persisted_memory_highlights: memoryContext.highlights,
    intermediateThought,
    screenshotDataUrl: latestSnapshot?.screenshotDataUrl ?? null
  }

  latestSnapshot = snapshot
  void recordDiagnosticEvent({
    type: 'audit',
    source: 'perception',
    action: 'user_profile_updated',
    sessionId: sessionMemory.session_id,
    details: {
      userLevel: userProfile.user_level,
      responseTone: userProfile.response_tone
    }
  })
  return snapshot
}

export function clearSessionMemory(): SessionMemory {
  lastRawText = ''
  sessionMemory = createSessionMemory()
  resetGlobalIntentState()

  if (latestSnapshot) {
    const intermediateThought = buildIntermediateThought({
      semanticState: latestSnapshot.semanticState,
      sessionMemory,
      persistedMemoryHighlights: latestSnapshot.persisted_memory_highlights
    })
    latestSnapshot = {
      ...latestSnapshot,
      sessionMemory,
      globalIntent: createGlobalIntentState(),
      intermediateThought
    }
  }

  void recordDiagnosticEvent({
    type: 'audit',
    source: 'perception',
    action: 'session_memory_cleared',
    sessionId: sessionMemory.session_id,
    details: {}
  })

  return sessionMemory
}

export async function resumeAfterSensitiveBlock(): Promise<PerceptionContextSnapshot> {
  sensitiveSurfaceBlocked = false
  lastRawText = ''

  const userProfile = await getUserProfile()
  if (config.privateMode) {
    const snapshot = await buildEmptySnapshot('private mode active', userProfile)
    latestSnapshot = snapshot
    return snapshot
  }

  return analyzeOnce()
}

export async function listSources(): Promise<CaptureSource[]> {
  return getWindowSources()
}

export function onCaptureStateChange(cb: (isCapturing: boolean) => void): () => void {
  captureStateListeners.push(cb)
  return () => {
    captureStateListeners = captureStateListeners.filter(listener => listener !== cb)
  }
}

export function onSnapshotUpdate(cb: (snapshot: PerceptionContextSnapshot) => void): () => void {
  snapshotListeners.push(cb)
  return () => {
    snapshotListeners = snapshotListeners.filter(listener => listener !== cb)
  }
}

function notifySnapshotUpdate(snapshot: PerceptionContextSnapshot): void {
  for (const listener of snapshotListeners) listener(snapshot)
}

async function getSnapshotRefreshPlan(
  snapshot: PerceptionContextSnapshot
): Promise<{ reason: string; frame?: CaptureFrame } | null> {
  if (config.privateMode || !config.enabled) return null

  const ageMs = Math.max(0, Date.now() - snapshot.semanticState.capturedAt)
  const staleThreshold = phase === 'watching' ? WATCHING_SNAPSHOT_STALE_MS : SNAPSHOT_STALE_MS

  if (phase === 'watching' && pendingFrame) {
    return {
      reason: appSwitchDetected ? 'watching_app_switch' : 'watching_pending_frame',
      frame: pendingFrame
    }
  }

  if (ageMs >= staleThreshold) {
    return { reason: 'snapshot_stale' }
  }

  const frame = await captureFrame(config.targetSourceId ?? undefined)
  if (!frame) return null

  const hashChanged = lastFrameHash !== null && frame.hash !== lastFrameHash
  const titleChanged = lastWindowTitle !== null
    && frame.windowTitle !== null
    && frame.windowTitle !== lastWindowTitle

  if (!hashChanged && !titleChanged) return null

  pendingFrame = frame
  lastFrameHash = frame.hash
  lastWindowTitle = frame.windowTitle
  stableFrameCount = 0
  watchingPollCount = 0
  appSwitchDetected = titleChanged
  phase = 'watching'

  return {
    reason: titleChanged ? 'window_changed_before_tutor' : 'frame_changed_before_tutor',
    frame
  }
}


export async function shutdown(): Promise<void> {
  stopSession()
  await terminateWorker()
}

function buildSemanticStateHeuristic(
  perception: PerceptionResult,
  userProfile: UserProfile
): SemanticState {
  const text = extractPrimaryContentText(perception)
  const fallbackText = perception.rawText.trim()
  const effectiveText = text || fallbackText
  const surface = classifySurface(effectiveText)
  const change = computeChange(lastRawText, effectiveText)
  const focusRegion = estimateFocus(perception.regions)
  const uncertainty = estimateUncertainty(perception, text, fallbackText)
  const detectedText = summarizeText(effectiveText, surface)
  const probableUserFocus = inferUserFocus(detectedText, surface, focusRegion)
  const inferredIntent = inferIntent(surface, detectedText, userProfile)
  const pedagogicalTopics = inferPedagogicalTopics(effectiveText, surface, userProfile)
  const sensitivity = detectSensitiveSurface(fallbackText || effectiveText)
  const visualSummary = buildVisualSummary({
    detectedText,
    surface,
    focusRegion,
    change,
    probableUserFocus,
    pedagogicalTopics
  })

  return {
    detected_text: detectedText,
    visual_summary: visualSummary,
    surface_type: surface,
    change_summary: change,
    focus_region: focusRegion,
    probable_user_focus: probableUserFocus,
    inferred_intent: inferredIntent,
    pedagogical_topics: pedagogicalTopics,
    capture_policy: sensitivity.isSensitive ? 'blocked-sensitive' : 'allowed',
    sensitivity_reason: sensitivity.reason,
    uncertainty,
    capturedAt: perception.capturedAt
  }
}

async function buildEmptySnapshot(
  reason: string,
  userProfile: UserProfile
): Promise<PerceptionContextSnapshot> {
  const semanticState = buildEmptySemanticState(reason)
  sessionMemory = updateSessionMemory(sessionMemory, semanticState)
  const memoryContext = await getMemoryContext()
  const intermediateThought = buildIntermediateThought({
    semanticState,
    sessionMemory,
    persistedMemoryHighlights: memoryContext.highlights
  })

  return {
    semanticState,
    sessionMemory,
    globalIntent: createGlobalIntentState(),
    userProfile,
    persisted_memory_summary: memoryContext.summary,
    persisted_memory_highlights: memoryContext.highlights,
    intermediateThought,
    screenshotDataUrl: null
  }
}

function buildEmptySemanticState(reason: string): SemanticState {
  return {
    detected_text: reason,
    visual_summary: reason,
    surface_type: 'unknown',
    change_summary: 'none',
    focus_region: 'unknown',
    probable_user_focus: 'context unavailable',
    inferred_intent: 'await clearer context',
    pedagogical_topics: [],
    capture_policy: reason === 'private mode active' ? 'private-mode' : 'allowed',
    sensitivity_reason: null,
    uncertainty: 1,
    capturedAt: Date.now()
  }
}

function classifySurface(text: string): SurfaceType {
  if (!text || text.length < 20) return 'unknown'

  const lower = text.toLowerCase()
  const codeKeywordHits = CODE_KEYWORDS.filter(keyword => lower.includes(keyword.toLowerCase())).length
  const symbolDensity = (text.match(CODE_SYMBOLS_RE) ?? []).length / text.length
  const numberCount = (text.match(NUMBERS_RE) ?? []).length
  const wordCount = (text.match(PARAGRAPH_RE) ?? []).length
  const lines = text.split('\n').filter(line => line.trim())

  if (codeKeywordHits >= 3 || symbolDensity > 0.08) return 'code'
  if (numberCount > wordCount * 0.6 && numberCount > 5) return 'dashboard'
  if (wordCount < 15 && lines.length < 10 && numberCount > 3) return 'graphic'
  if (wordCount > 80 && lines.length > 10) return 'document'
  if (wordCount > 20) return 'text'
  return 'unknown'
}

function computeChange(prev: string, curr: string): ChangeSummary {
  if (!prev) return 'major'

  const prevWords = new Set(prev.toLowerCase().split(/\s+/).filter(word => word.length > 3))
  const currWords = new Set(curr.toLowerCase().split(/\s+/).filter(word => word.length > 3))

  let commonCount = 0
  for (const word of prevWords) {
    if (currWords.has(word)) commonCount++
  }

  const union = new Set([...prevWords, ...currWords]).size
  const similarity = union > 0 ? commonCount / union : 1

  if (similarity > 0.85) return 'none'
  if (similarity > 0.5) return 'minor'
  return 'major'
}

function estimateFocus(regions: PerceptionResult['regions']): string {
  if (!regions.length) return 'desconhecido'

  const mainRegion = regions.reduce((best, region) =>
    region.text.length * region.confidence > best.text.length * best.confidence ? region : best
  )

  const { x, y, width, height } = mainRegion.bbox
  const centerX = x + width / 2
  const centerY = y + height / 2

  if (centerY < 220) return centerX < 420 ? 'topo esquerdo' : 'topo direito'
  if (centerY > 500) return centerX < 420 ? 'base esquerda' : 'base direita'
  if (centerX < 360) return 'painel esquerdo'
  if (centerX > 920) return 'painel direito'
  return 'centro'
}

function summarizeText(raw: string, surface: SurfaceType): string {
  const lines = raw.split('\n').map(line => line.trim()).filter(line => line.length > 2)
  if (!lines.length) return ''

  switch (surface) {
    case 'code': {
      const meaningful = lines.filter(line => line.length > 8 && !/^[{}\[\]();,]+$/.test(line))
      return meaningful.slice(0, 3).join(' · ')
    }
    case 'dashboard':
    case 'graphic':
      return lines.slice(0, 4).join(' · ')
    default: {
      const first = lines.find(line => line.split(' ').length > 3) ?? lines[0]
      return first.slice(0, 140)
    }
  }
}

function inferUserFocus(detectedText: string, surface: SurfaceType, focusRegion: string): string {
  if (detectedText) {
    const focusLine = detectedText.split(' · ')[0]
    return `${surfaceLabel(surface)} em ${focusRegion}: ${focusLine}`.slice(0, 160)
  }

  return `${surfaceLabel(surface)} em ${focusRegion}`
}

function inferIntent(
  surface: SurfaceType,
  detectedText: string,
  userProfile: UserProfile
): string {
  const goal = userProfile.study_goals[0]

  if (surface === 'code') return goal ? `understand code related to ${goal}` : 'understand code on screen'
  if (surface === 'graphic' || surface === 'dashboard') {
    return goal ? `interpret visual data for ${goal}` : 'interpret visual data'
  }
  if (surface === 'document' || surface === 'text') {
    return goal ? `learn the current material for ${goal}` : 'understand the current material'
  }
  if (detectedText) return 'explain what is currently visible'
  return 'await more explicit context'
}

function inferPedagogicalTopics(
  rawText: string,
  surface: SurfaceType,
  userProfile: UserProfile
): string[] {
  const topics = new Set<string>()
  const text = rawText.toLowerCase()

  if (surface === 'code') {
    if (/\basync\b|\bawait\b/.test(text)) topics.add('fluxo assíncrono')
    if (/\binterface\b|\btype\b/.test(text)) topics.add('tipagem e contratos')
    if (/\bfunction\b|\breturn\b/.test(text)) topics.add('estrutura de funções')
    if (!topics.size) topics.add('leitura de código')
  } else if (surface === 'graphic' || surface === 'dashboard') {
    if (/%|r\$|\$|€/.test(rawText)) topics.add('leitura de métricas')
    if (/\bRSI\b|\bMACD\b|\bEMA\b/i.test(rawText)) topics.add('indicadores visuais')
    topics.add('interpretação de gráficos')
  } else if (surface === 'document' || surface === 'text') {
    topics.add(userProfile.preferred_explanation_style === 'summary' ? 'resumo guiado' : 'explicação progressiva')
    if (rawText.split(/\s+/).length > 120) topics.add('extração de conceitos centrais')
  }

  if (userProfile.study_goals.length) topics.add(userProfile.study_goals[0])

  return [...topics].slice(0, 4)
}

function buildVisualSummary(input: {
  detectedText: string
  surface: SurfaceType
  focusRegion: string
  change: ChangeSummary
  probableUserFocus: string
  pedagogicalTopics: string[]
}): string {
  const summaryParts = [
    `Viewing ${surfaceLabel(input.surface)} in ${input.focusRegion}`,
    input.detectedText ? `main cue: ${input.detectedText}` : '',
    input.change !== 'none' ? `change: ${input.change}` : '',
    input.pedagogicalTopics.length ? `topics: ${input.pedagogicalTopics.join(', ')}` : ''
  ].filter(Boolean)

  return summaryParts.join(' | ').slice(0, 220) || input.probableUserFocus
}

function createSessionMemory(): SessionMemory {
  const now = Date.now()
  return {
    session_id: `session-${now}`,
    started_at: now,
    updated_at: now,
    expires_at: now + config.sessionTtlMs,
    frame_count: 0,
    continuity_summary: 'No active continuity yet.',
    incremental_summary: 'Waiting for the first stable observation.',
    probable_focus: 'unknown',
    current_intent: 'await more context',
    topic_candidates: [],
    recent_states: []
  }
}

function ensureActiveSession(): void {
  const now = Date.now()
  if (sessionMemory.expires_at <= now) {
    sessionMemory = createSessionMemory()
    resetGlobalIntentState()
    lastRawText = ''
  }
}

function updateSessionMemory(current: SessionMemory, semanticState: SemanticState): SessionMemory {
  const nextEntries: SessionMemoryEntry[] = [
    ...current.recent_states,
    {
      capturedAt: semanticState.capturedAt,
      surface_type: semanticState.surface_type,
      change_summary: semanticState.change_summary,
      detected_text: semanticState.detected_text,
      visual_summary: semanticState.visual_summary,
      probable_user_focus: semanticState.probable_user_focus,
      inferred_intent: semanticState.inferred_intent,
      uncertainty: semanticState.uncertainty,
      app_identifier: semanticState.app_identifier ?? null,
      emotional_signal: semanticState.emotional_signal ?? null
    }
  ].slice(-config.memoryLimit)

  const previousEntry = current.recent_states[current.recent_states.length - 1]
  const continuitySummary = buildContinuitySummary(nextEntries, semanticState)
  const incrementalSummary = buildIncrementalSummary(previousEntry, semanticState)
  const topicCandidates = deriveTopicCandidates(nextEntries, semanticState)

  return {
    session_id: current.session_id,
    started_at: current.started_at,
    updated_at: semanticState.capturedAt,
    expires_at: semanticState.capturedAt + config.sessionTtlMs,
    frame_count: current.frame_count + 1,
    continuity_summary: continuitySummary,
    incremental_summary: incrementalSummary,
    probable_focus: semanticState.probable_user_focus,
    current_intent: semanticState.inferred_intent,
    topic_candidates: topicCandidates,
    recent_states: nextEntries
  }
}

function buildContinuitySummary(
  entries: SessionMemoryEntry[],
  semanticState: SemanticState
): string {
  if (entries.length <= 1) {
    return `Session started around ${surfaceLabel(semanticState.surface_type)} with focus on ${semanticState.probable_user_focus}.`
  }

  const surfaces = new Set(entries.map(entry => entry.surface_type))
  const lastChanges = entries.slice(-3).map(entry => entry.change_summary)
  const stable = lastChanges.every(change => change === 'none' || change === 'minor')

  if (surfaces.size === 1 && stable) {
    return `The context remains on ${surfaceLabel(semanticState.surface_type)} and is refining the same line of attention: ${semanticState.probable_user_focus}.`
  }

  return `The session is tracking a transition toward ${semanticState.probable_user_focus}, with recent changes classified as ${semanticState.change_summary}.`
}

function buildIncrementalSummary(
  previousEntry: SessionMemoryEntry | undefined,
  semanticState: SemanticState
): string {
  if (!previousEntry) {
    return `Initial observation: ${semanticState.visual_summary}`
  }

  if (semanticState.change_summary === 'none') {
    return `The screen stayed semantically stable around ${semanticState.probable_user_focus}.`
  }

  if (semanticState.change_summary === 'minor') {
    return `A small update happened: focus moved from ${previousEntry.probable_user_focus} to ${semanticState.probable_user_focus}.`
  }

  return `A larger shift happened from ${surfaceLabel(previousEntry.surface_type)} to ${surfaceLabel(semanticState.surface_type)}.`
}

function deriveTopicCandidates(
  entries: SessionMemoryEntry[],
  semanticState: SemanticState
): string[] {
  const topics = new Set<string>(semanticState.pedagogical_topics)

  entries.forEach(entry => {
    if (entry.detected_text) {
      const cue = entry.detected_text.split(' · ')[0].trim()
      if (cue.length > 8) topics.add(cue.slice(0, 48))
    }
  })

  return [...topics].slice(-5)
}

function surfaceLabel(surface: SurfaceType): string {
  switch (surface) {
    case 'code':
      return 'code'
    case 'text':
      return 'text'
    case 'graphic':
      return 'graphic'
    case 'document':
      return 'document'
    case 'dashboard':
      return 'dashboard'
    default:
      return 'context'
  }
}

function notifyCaptureState(isCapturing: boolean): void {
  captureStateListeners.forEach(cb => cb(isCapturing))
}

const CODE_KEYWORDS = [
  'function', 'const', 'let', 'var', 'return', 'import', 'export', 'class',
  'interface', 'type', 'async', 'await', 'if', 'else', 'for', 'while',
  'def ', 'print(', 'public ', 'private ', 'void ', 'int ', 'string',
  '#include', 'select', 'from', 'where', 'insert', 'update'
]

const CODE_SYMBOLS_RE = /[{}\[\]();=>|&!]/g
const NUMBERS_RE = /\b\d+([.,]\d+)?(%|\$|€|R\$)?\b/g
const PARAGRAPH_RE = /[A-Za-zÀ-ÿ]{4,}/g
