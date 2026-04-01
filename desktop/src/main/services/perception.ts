import { captureScreen, getWindowSources } from './capture'
import { recognizeImage, terminateWorker } from './ocr'
import { getUserProfile, updateUserProfile as persistUserProfile } from './user-profile'
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

const DEFAULT_CONFIG: PerceptionConfig = {
  enabled: false,
  privateMode: false,
  intervalMs: 8_000,
  thumbnailWidth: 1280,
  thumbnailHeight: 720,
  targetSourceId: null,
  sessionTtlMs: 15 * 60_000,
  memoryLimit: 6
}

let config: PerceptionConfig = { ...DEFAULT_CONFIG }
let sessionInterval: ReturnType<typeof setInterval> | null = null
let captureStateListeners: ((isCapturing: boolean) => void)[] = []
let lastRawText = ''
let sessionMemory = createSessionMemory()
let latestSnapshot: PerceptionContextSnapshot | null = null

export function configurePerception(patch: Partial<PerceptionConfig>): void {
  config = { ...config, ...patch }
}

export function setPrivateMode(enabled: boolean): void {
  config.privateMode = enabled
  notifyCaptureState(!enabled && config.enabled)
  if (enabled) stopSession()
}

export function startSession(): void {
  if (config.privateMode) return
  config.enabled = true
  ensureActiveSession()
  notifyCaptureState(true)
  if (sessionInterval) return

  sessionInterval = setInterval(async () => {
    if (!config.enabled || config.privateMode) return
    await analyzeOnce()
  }, config.intervalMs)
}

export function stopSession(): void {
  config.enabled = false
  notifyCaptureState(false)
  if (sessionInterval) {
    clearInterval(sessionInterval)
    sessionInterval = null
  }
}

export async function analyzeOnce(): Promise<PerceptionContextSnapshot> {
  const userProfile = await getUserProfile()

  if (config.privateMode) {
    const snapshot = buildEmptySnapshot('private mode active', userProfile)
    latestSnapshot = snapshot
    return snapshot
  }

  ensureActiveSession()

  const dataUrl = await captureScreen(config.targetSourceId ?? undefined)
  if (!dataUrl) {
    const snapshot = buildEmptySnapshot('capture failed - check screen recording permission', userProfile)
    latestSnapshot = snapshot
    return snapshot
  }

  const perception = await recognizeImage(dataUrl)
  const semanticState = buildSemanticState(perception, userProfile)

  lastRawText = perception.rawText
  sessionMemory = updateSessionMemory(sessionMemory, semanticState)

  const snapshot = {
    semanticState,
    sessionMemory,
    userProfile
  }

  latestSnapshot = snapshot
  return snapshot
}

export async function getContextSnapshot(): Promise<PerceptionContextSnapshot> {
  if (latestSnapshot) return latestSnapshot
  return analyzeOnce()
}

export async function getUserProfileSnapshot(): Promise<UserProfile> {
  return getUserProfile()
}

export async function updateUserProfile(patch: Partial<UserProfile>): Promise<PerceptionContextSnapshot> {
  const userProfile = await persistUserProfile(patch)
  const semanticState =
    latestSnapshot?.semanticState ?? buildEmptySemanticState('waiting for first capture')

  const snapshot = {
    semanticState,
    sessionMemory,
    userProfile
  }

  latestSnapshot = snapshot
  return snapshot
}

export function clearSessionMemory(): SessionMemory {
  lastRawText = ''
  sessionMemory = createSessionMemory()

  if (latestSnapshot) {
    latestSnapshot = {
      ...latestSnapshot,
      sessionMemory
    }
  }

  return sessionMemory
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

export async function shutdown(): Promise<void> {
  stopSession()
  await terminateWorker()
}

function buildSemanticState(
  perception: PerceptionResult,
  userProfile: UserProfile
): SemanticState {
  const text = perception.rawText.trim()
  const surface = classifySurface(text)
  const change = computeChange(lastRawText, text)
  const focusRegion = estimateFocus(perception.regions)
  const uncertainty = Math.max(0, Math.min(1, 1 - perception.confidence / 100))
  const detectedText = summarizeText(text, surface)
  const probableUserFocus = inferUserFocus(detectedText, surface, focusRegion)
  const inferredIntent = inferIntent(surface, detectedText, userProfile)
  const pedagogicalTopics = inferPedagogicalTopics(text, surface, userProfile)
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
    uncertainty,
    capturedAt: perception.capturedAt
  }
}

function buildEmptySnapshot(
  reason: string,
  userProfile: UserProfile
): PerceptionContextSnapshot {
  const semanticState = buildEmptySemanticState(reason)
  sessionMemory = updateSessionMemory(sessionMemory, semanticState)

  return {
    semanticState,
    sessionMemory,
    userProfile
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
      uncertainty: semanticState.uncertainty
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
