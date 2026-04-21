import { bridgeServer } from './bridge'
import { generateRemoteText } from './ai-provider'
import { recordDiagnosticEvent } from './observability'
import type {
  GlobalIntentMode,
  GlobalIntentState,
  PerceptionContextSnapshot,
  SemanticState,
  SessionMemory
} from '../../shared/perception.types'

type SnapshotSeed = Pick<PerceptionContextSnapshot, 'semanticState' | 'sessionMemory' | 'userProfile'>

type IntentCandidate = {
  mode: GlobalIntentMode
  confidence: number
  reason: string
  evidence: string[]
}

type IntentResolverOptions = {
  appSwitchDetected?: boolean
  explicitOperatorMode?: boolean
  classify?: (input: IntentClassifierInput) => Promise<IntentCandidate | null>
}

type IntentClassifierInput = {
  semanticState: SemanticState
  sessionMemory: SessionMemory
  previous: GlobalIntentState | null
  recentContext: Array<{
    surface_type: SessionMemory['recent_states'][number]['surface_type']
    probable_user_focus: string
    inferred_intent: string
    app_identifier?: string | null
  }>
  connectors: {
    vscode: boolean
    spotify: boolean
    tradingview: boolean
  }
  appSwitchDetected: boolean
  explicitOperatorMode: boolean
  idleHint: boolean
}

interface GlobalIntentTracker {
  current: GlobalIntentState | null
  pendingMode: GlobalIntentMode | null
  pendingCount: number
}

const SWITCH_CONFIRMATIONS = 2
const LOW_CONFIDENCE_THRESHOLD = 0.55
const IMMEDIATE_SWITCH_THRESHOLD = 0.78

let tracker: GlobalIntentTracker = {
  current: null,
  pendingMode: null,
  pendingCount: 0
}

export async function resolveGlobalIntent(
  input: SnapshotSeed,
  options: IntentResolverOptions = {}
): Promise<GlobalIntentState> {
  const classifierInput = buildClassifierInput(input, options)
  const previous = tracker.current
  const heuristicCandidate = deriveHeuristicIntent(classifierInput)
  const shouldSkipRemoteClassification = !options.classify
    && shouldSkipLLMClassification(classifierInput, previous, heuristicCandidate)
  const llmCandidate =
    shouldSkipRemoteClassification
      ? null
      : options.classify
        ? await options.classify(classifierInput)
        : await classifyGlobalIntent(classifierInput)

  if (shouldSkipRemoteClassification) {
    void recordDiagnosticEvent({
      type: 'trace',
      source: 'perception',
      action: 'global_intent_llm_skipped',
      sessionId: input.sessionMemory.session_id,
      details: {
        currentMode: previous?.mode ?? 'none',
        heuristicMode: heuristicCandidate.mode,
        changeSummary: classifierInput.semanticState.change_summary,
        stabilityState: previous?.stabilityState ?? 'none'
      }
    })
  }

  const candidate = normalizeCandidate(llmCandidate) ?? buildFallbackCandidate(previous, heuristicCandidate)
  const next = applyHysteresis(previous, candidate, {
    appSwitchDetected: classifierInput.appSwitchDetected,
    explicitOperatorMode: classifierInput.explicitOperatorMode
  })

  tracker = {
    current: next.state,
    pendingMode: next.pendingMode,
    pendingCount: next.pendingCount
  }

  return next.state
}

export function getGlobalIntentState(): GlobalIntentState {
  return tracker.current ?? createGlobalIntentState()
}

export function resetGlobalIntentState(): void {
  tracker = {
    current: null,
    pendingMode: null,
    pendingCount: 0
  }
}

export function createGlobalIntentState(
  overrides: Partial<GlobalIntentState> = {}
): GlobalIntentState {
  const now = overrides.updatedAt ?? Date.now()
  const mode = overrides.mode ?? 'uncertain'

  return {
    mode,
    confidence: round(overrides.confidence ?? 0.24),
    reason: overrides.reason ?? 'contexto inicial ainda fraco para firmar a intenção global',
    evidence: overrides.evidence ?? [],
    candidateMode: overrides.candidateMode ?? mode,
    updatedAt: now,
    stabilityState: overrides.stabilityState ?? 'stable'
  }
}

export async function classifyGlobalIntent(
  input: IntentClassifierInput
): Promise<IntentCandidate | null> {
  const result = await generateRemoteText({
    sensitive: false,
    feature: 'router',
    system: [
      'Classify the user session into exactly one global intent mode.',
      'Return valid JSON only.',
      'Allowed modes: technical_focus, decision, study, light, review, uncertain.',
      'Schema: {"mode":"...", "confidence":0.0, "reason":"...", "evidence":["..."]}.',
      'Use short evidence items.',
      'If the signal is weak, choose uncertain.',
      'Never invent capabilities or app names that are not present in the input.'
    ].join('\n'),
    prompt: buildClassifierPrompt(input)
  })

  return parseIntentCandidate(result?.text ?? '')
}

export function deriveHeuristicIntent(input: IntentClassifierInput): IntentCandidate {
  const app = normalizeAppIdentifier(input.semanticState.app_identifier)
  const focus = `${input.semanticState.probable_user_focus} ${input.semanticState.inferred_intent}`.toLowerCase()
  const history = input.recentContext.map(entry => `${entry.probable_user_focus} ${entry.inferred_intent}`).join(' ').toLowerCase()

  if (input.explicitOperatorMode || input.connectors.tradingview || app.includes('tradingview')) {
    return {
      mode: 'decision',
      confidence: 0.86,
      reason: 'o contexto atual aponta para leitura de mercado e decisão operacional',
      evidence: collectEvidence([
        input.explicitOperatorMode ? 'modo operador ativo' : null,
        input.connectors.tradingview ? 'conector TradingView ativo' : null,
        app.includes('tradingview') ? `app ${app}` : null,
        input.semanticState.surface_type === 'graphic' ? 'superfície gráfica' : null
      ])
    }
  }

  if (
    input.connectors.vscode ||
    app.includes('code') ||
    app.includes('visual studio') ||
    input.semanticState.surface_type === 'code'
  ) {
    return {
      mode: 'technical_focus',
      confidence: 0.84,
      reason: 'o usuário está em fluxo técnico de código, erro ou implementação',
      evidence: collectEvidence([
        input.connectors.vscode ? 'conector VS Code ativo' : null,
        app ? `app ${app}` : null,
        input.semanticState.surface_type === 'code' ? 'superfície de código' : null
      ])
    }
  }

  if (
    (input.connectors.spotify || app.includes('spotify')) &&
    input.idleHint &&
    input.semanticState.change_summary !== 'major'
  ) {
    return {
      mode: 'light',
      confidence: 0.78,
      reason: 'há contexto leve de mídia com baixa atividade recente',
      evidence: collectEvidence([
        input.connectors.spotify ? 'conector Spotify ativo' : null,
        app.includes('spotify') ? `app ${app}` : null,
        input.idleHint ? 'atividade estável/baixa' : null
      ])
    }
  }

  if (
    /\b(review|revis|compare|comparar|diff|retomar|retorno)\b/.test(focus) ||
    /\b(review|revis|compare|comparar|diff|retomar|retorno)\b/.test(history)
  ) {
    return {
      mode: 'review',
      confidence: 0.68,
      reason: 'o contexto recente sugere retomada, comparação ou revisão',
      evidence: collectEvidence([
        'sinais semânticos de revisão',
        input.sessionMemory.recent_states.length > 2 ? 'continuidade de sessão presente' : null
      ])
    }
  }

  if (input.semanticState.surface_type === 'document' || input.semanticState.surface_type === 'text') {
    return {
      mode: 'study',
      confidence: 0.74,
      reason: 'a sessão está em leitura ou absorção de material textual',
      evidence: collectEvidence([
        `superfície ${input.semanticState.surface_type}`,
        input.semanticState.pedagogical_topics[0] ? `tópico ${input.semanticState.pedagogical_topics[0]}` : null
      ])
    }
  }

  return {
    mode: 'uncertain',
    confidence: 0.34,
    reason: 'os sinais atuais ainda estão ambíguos para cravar a intenção global',
    evidence: collectEvidence([
      input.semanticState.surface_type ? `superfície ${input.semanticState.surface_type}` : null,
      input.semanticState.app_identifier ? `app ${input.semanticState.app_identifier}` : null
    ])
  }
}

function buildFallbackCandidate(
  previous: GlobalIntentState | null,
  heuristicCandidate: IntentCandidate
): IntentCandidate {
  if (previous) {
    return {
      mode: previous.mode,
      confidence: Math.max(previous.confidence, 0.58),
      reason: previous.reason || 'mantendo a intenção global anterior por falta de sinal melhor',
      evidence: previous.evidence.length ? previous.evidence : heuristicCandidate.evidence
    }
  }

  return heuristicCandidate
}

function applyHysteresis(
  previous: GlobalIntentState | null,
  candidate: IntentCandidate,
  options: {
    appSwitchDetected: boolean
    explicitOperatorMode: boolean
  }
): {
  state: GlobalIntentState
  pendingMode: GlobalIntentMode | null
  pendingCount: number
} {
  const now = Date.now()

  if (!previous) {
    return {
      state: createGlobalIntentState({
        mode: candidate.mode,
        candidateMode: candidate.mode,
        confidence: candidate.confidence,
        reason: candidate.reason,
        evidence: candidate.evidence,
        updatedAt: now,
        stabilityState: 'stable'
      }),
      pendingMode: null,
      pendingCount: 0
    }
  }

  const sameMode = candidate.mode === previous.mode
  if (sameMode) {
    return {
      state: {
        ...previous,
        mode: previous.mode,
        candidateMode: candidate.mode,
        confidence: blendConfidence(previous.confidence, candidate.confidence),
        reason: candidate.reason,
        evidence: candidate.evidence,
        updatedAt: now,
        stabilityState: 'stable'
      },
      pendingMode: null,
      pendingCount: 0
    }
  }

  const strongSwitch =
    options.explicitOperatorMode ||
    (options.appSwitchDetected && candidate.confidence >= 0.7) ||
    candidate.confidence >= IMMEDIATE_SWITCH_THRESHOLD

  if (strongSwitch) {
    return {
      state: createGlobalIntentState({
        mode: candidate.mode,
        candidateMode: candidate.mode,
        confidence: candidate.confidence,
        reason: candidate.reason,
        evidence: candidate.evidence,
        updatedAt: now,
        stabilityState: 'switching'
      }),
      pendingMode: null,
      pendingCount: 0
    }
  }

  if (candidate.confidence < LOW_CONFIDENCE_THRESHOLD || candidate.mode === 'uncertain') {
    return {
      state: {
        ...previous,
        candidateMode: candidate.mode,
        confidence: previous.confidence,
        reason: previous.reason,
        evidence: previous.evidence,
        updatedAt: now,
        stabilityState: 'holding'
      },
      pendingMode: candidate.mode,
      pendingCount: tracker.pendingMode === candidate.mode ? tracker.pendingCount + 1 : 1
    }
  }

  const nextPendingMode = tracker.pendingMode === candidate.mode ? candidate.mode : candidate.mode
  const nextPendingCount = tracker.pendingMode === candidate.mode ? tracker.pendingCount + 1 : 1
  if (nextPendingCount >= SWITCH_CONFIRMATIONS) {
    return {
      state: createGlobalIntentState({
        mode: candidate.mode,
        candidateMode: candidate.mode,
        confidence: candidate.confidence,
        reason: candidate.reason,
        evidence: candidate.evidence,
        updatedAt: now,
        stabilityState: 'switching'
      }),
      pendingMode: null,
      pendingCount: 0
    }
  }

  return {
    state: {
      ...previous,
      candidateMode: candidate.mode,
      confidence: previous.confidence,
      reason: previous.reason,
      evidence: previous.evidence,
      updatedAt: now,
      stabilityState: 'holding'
    },
    pendingMode: nextPendingMode,
    pendingCount: nextPendingCount
  }
}

function buildClassifierInput(
  input: SnapshotSeed,
  options: IntentResolverOptions
): IntentClassifierInput {
  const recentContext = input.sessionMemory.recent_states.slice(-5).map(entry => ({
    surface_type: entry.surface_type,
    probable_user_focus: entry.probable_user_focus,
    inferred_intent: entry.inferred_intent,
    app_identifier: entry.app_identifier ?? null
  }))
  const connectors = {
    vscode: Boolean(bridgeServer.getContext('vscode')),
    spotify: Boolean(bridgeServer.getContext('spotify')),
    tradingview: Boolean(bridgeServer.getContext('tradingview'))
  }
  const recentStableFrames = input.sessionMemory.recent_states.slice(-3)
  const idleHint = recentStableFrames.length > 0
    && recentStableFrames.every(entry => entry.change_summary === 'none' || entry.change_summary === 'minor')

  return {
    semanticState: input.semanticState,
    sessionMemory: input.sessionMemory,
    previous: tracker.current,
    recentContext,
    connectors,
    appSwitchDetected: Boolean(options.appSwitchDetected),
    explicitOperatorMode: Boolean(options.explicitOperatorMode),
    idleHint
  }
}

function buildClassifierPrompt(input: IntentClassifierInput): string {
  return JSON.stringify({
    surface_type: input.semanticState.surface_type,
    app_identifier: input.semanticState.app_identifier ?? null,
    probable_user_focus: input.semanticState.probable_user_focus,
    semantic_intent: input.semanticState.inferred_intent,
    session_intent: input.sessionMemory.current_intent,
    recent_context: input.recentContext,
    activity: {
      idle_hint: input.idleHint,
      change_summary: input.semanticState.change_summary,
      emotional_signal: input.semanticState.emotional_signal ?? null
    },
    connectors: input.connectors,
    app_switch_detected: input.appSwitchDetected,
    explicit_operator_mode: input.explicitOperatorMode,
    previous_global_intent: input.previous
      ? {
          mode: input.previous.mode,
          confidence: input.previous.confidence
        }
      : null
  })
}

function shouldSkipLLMClassification(
  input: IntentClassifierInput,
  previous: GlobalIntentState | null,
  heuristicCandidate: IntentCandidate
): boolean {
  if (!previous) return false
  if (input.appSwitchDetected || input.explicitOperatorMode) return false
  if (input.semanticState.change_summary !== 'none') return false
  if (!input.idleHint) return false
  if (previous.stabilityState !== 'stable') return false
  if (heuristicCandidate.mode !== previous.mode) return false
  return true
}

function parseIntentCandidate(raw: string): IntentCandidate | null {
  if (!raw.trim()) return null

  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as {
      mode?: string
      confidence?: number
      reason?: string
      evidence?: unknown
    }
    if (!isGlobalIntentMode(parsed.mode)) return null

    return {
      mode: parsed.mode,
      confidence: clamp(typeof parsed.confidence === 'number' ? parsed.confidence : 0),
      reason: typeof parsed.reason === 'string' && parsed.reason.trim()
        ? parsed.reason.trim()
        : 'classificação remota sem justificativa detalhada',
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((item): item is string => typeof item === 'string').slice(0, 4)
        : []
    }
  } catch {
    return null
  }
}

function normalizeCandidate(candidate: IntentCandidate | null): IntentCandidate | null {
  if (!candidate || !isGlobalIntentMode(candidate.mode)) return null

  return {
    mode: candidate.mode,
    confidence: clamp(candidate.confidence),
    reason: candidate.reason.trim() || 'classificação sem justificativa',
    evidence: candidate.evidence.slice(0, 4)
  }
}

function extractJsonObject(raw: string): string {
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1)
  }
  return raw
}

function isGlobalIntentMode(value: unknown): value is GlobalIntentMode {
  return value === 'technical_focus'
    || value === 'decision'
    || value === 'study'
    || value === 'light'
    || value === 'review'
    || value === 'uncertain'
}

function normalizeAppIdentifier(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function collectEvidence(items: Array<string | null>): string[] {
  return items.filter((item): item is string => Boolean(item)).slice(0, 4)
}

function blendConfidence(previous: number, next: number): number {
  return round(clamp(previous * 0.45 + next * 0.55))
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function round(value: number): number {
  return Number(value.toFixed(2))
}
