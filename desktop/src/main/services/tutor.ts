import { getContextSnapshot } from './perception'
import { runDomainTutor } from './tutor-domains'
import { recordDiagnosticEvent, recordPerformanceTrace } from './observability'
import { generateRemoteText } from './ai-provider'
import { codexAuth, codexClient } from '../auth/codex-singleton'
import { retrieveRelevantMemories } from './memory-embeddings'
import {
  buildRemoteSystemPrompt,
  buildRemoteUserPrompt,
  composeResponse,
  inferWarning,
  formatVSCodeConnectorContext,
  formatSpotifyConnectorContext
} from './tutor-prompt'
import { bridgeServer } from './bridge'
import {
  calibrateDepth,
  applyDepthCalibration,
  detectSimplificationSignal,
  detectDepthSignal
} from './depth-calibrator'
import {
  recordInteractionSignal,
  getBehaviorPattern,
  getBehaviorPatternSummary,
  flushBehaviorToMemory
} from './behavior-tracker'
import type {
  PerceptionContextSnapshot,
  TutorMode,
  TutorRequest,
  TutorResponse,
  UserProfile
} from '../../shared/perception.types'

/** Track how many responses have been generated this process session for flush scheduling */
let responseCountSinceFlush = 0
const FLUSH_EVERY_N_RESPONSES = 5

export async function generateTutorResponse(request: TutorRequest): Promise<TutorResponse> {
  const startedAt = Date.now()

  try {
    const context = request.context ?? await getContextSnapshot()

    // ─── Depth calibration ───────────────────────────────────────────────────
    const behaviorPattern = await getBehaviorPattern()
    const calibration = calibrateDepth({
      prompt: request.prompt,
      conversationLength: request.conversation.length,
      profile: context.userProfile,
      behaviorPattern,
      domain: 'general', // resolved below; used here for cross-session depth only
      modeUsed: 'direct' // placeholder; updated after inferMode
    })

    // Build an effective profile that reflects calibrated depth for THIS response
    const effectiveProfile: UserProfile = {
      ...context.userProfile,
      user_level: calibration.effective_level,
      preferred_explanation_style: calibration.effective_style,
      response_tone: calibration.effective_tone
    }

    const effectiveContext: PerceptionContextSnapshot = {
      ...context,
      userProfile: effectiveProfile
    }

    // ─── Behavior pattern summary for prompt injection ────────────────────────
    const behaviorSummaryLines = await getBehaviorPatternSummary()

    // ─── Core tutor pipeline ─────────────────────────────────────────────────
    const mode = inferMode(request, effectiveProfile)
    const uncertainty = context.semanticState.uncertainty
    const baseWarning = inferWarning(context)
    const offScreen = isOffScreenQuestion(request.prompt, context)
    const needsVisualConfirmation = !offScreen && (uncertainty >= 0.68 || context.semanticState.surface_type === 'unknown')
    const shouldAskConfirmation = needsVisualConfirmation || /\bisso\b|\besta tela\b|\baqui\b/i.test(request.prompt)
    const domainOutput = runDomainTutor({ request, context: effectiveContext, mode })
    const relevantPersistentMemory = await retrieveRelevantMemories({
      query: buildPersistentMemoryQuery(request.prompt, context),
      limit: 4
    })
    const localContent = composeResponse({
      mode,
      context: effectiveContext,
      shouldAskConfirmation,
      warning: domainOutput?.warning ?? baseWarning,
      domainBody: domainOutput?.content ?? null
    })
    const vsCodeRaw    = bridgeServer.getContext('vscode')
    const spotifyRaw   = bridgeServer.getContext('spotify')
    const vsCodeBlock  = vsCodeRaw  ? formatVSCodeConnectorContext(vsCodeRaw.data)   : undefined
    const spotifyBlock = spotifyRaw ? formatSpotifyConnectorContext(spotifyRaw.data) : undefined

    const sensitive = Boolean(domainOutput?.warning ?? baseWarning)
    const system    = buildRemoteSystemPrompt(mode, effectiveContext, domainOutput?.warning ?? baseWarning, offScreen)
    const prompt    = buildRemoteUserPrompt(
      request,
      effectiveContext,
      domainOutput?.content ?? null,
      [...relevantPersistentMemory, ...behaviorSummaryLines],
      offScreen,
      vsCodeBlock,
      spotifyBlock
    )
    const history   = request.conversation.slice(0, -1)
    const imageDataUrl = context.screenshotDataUrl ?? null

    const remoteResult = await generateWithCodexFallback({
      sensitive,
      system,
      prompt,
      history,
      imageDataUrl,
      screenCapturedAt: context.semanticState.capturedAt,
      screenChangeSummary: context.semanticState.change_summary,
      screenVisualSummary: context.semanticState.visual_summary
    })
    const content = remoteResult?.text?.trim() || localContent

    // ─── Post-response: record behavior signal ────────────────────────────────
    recordInteractionSignal({
      domain: domainOutput?.domain ?? 'general',
      mode,
      surface: context.semanticState.surface_type,
      askedForSimplification: detectSimplificationSignal(request.prompt),
      askedForDepth: detectDepthSignal(request.prompt),
      askedForSteps: /\bpasso\b|\betapas\b/i.test(request.prompt),
      askedForDirect: /\bdireto\b|\bresposta direta\b|\bcurto\b/i.test(request.prompt),
      followUpCount: request.conversation.filter(m => m.role === 'user').length,
      topics: context.semanticState.pedagogical_topics,
      sessionId: context.sessionMemory.session_id
    })

    // ─── Post-response: apply depth calibration to profile if warranted ───────
    void applyDepthCalibration(calibration)

    // ─── Periodic flush of behavior patterns to memory ───────────────────────
    responseCountSinceFlush++
    if (responseCountSinceFlush >= FLUSH_EVERY_N_RESPONSES) {
      responseCountSinceFlush = 0
      void flushBehaviorToMemory()
    }

    void recordDiagnosticEvent({
      type: 'trace',
      source: 'tutor',
      action: 'generate_response',
      sessionId: context.sessionMemory.session_id,
      details: {
        domain: domainOutput?.domain ?? 'general',
        mode,
        provider: remoteResult?.providerId ?? 'local',
        model: remoteResult?.model ?? 'local',
        uncertainty: Number(uncertainty.toFixed(2)),
        asksConfirmation: shouldAskConfirmation,
        calibratedLevel: calibration.effective_level,
        calibrationReason: calibration.reason
      }
    })

    void recordPerformanceTrace({
      operation: 'tutor.respond',
      durationMs: Date.now() - startedAt,
      status: 'ok'
    })

    return {
      domain: domainOutput?.domain ?? 'general',
      mode,
      content,
      provider: remoteResult?.providerId ?? 'local',
      model: remoteResult?.model ?? 'local',
      uncertainty,
      should_ask_confirmation: shouldAskConfirmation,
      needs_visual_confirmation: needsVisualConfirmation,
      suggested_follow_ups: domainOutput?.suggested_follow_ups ?? buildFollowUps(mode, effectiveContext),
      warning: domainOutput?.warning ?? baseWarning
    }
  } catch (error) {
    void recordDiagnosticEvent({
      type: 'error',
      source: 'tutor',
      action: 'generate_response_failed',
      details: {
        hasMessage: error instanceof Error ? Boolean(error.message) : true
      }
    })

    void recordPerformanceTrace({
      operation: 'tutor.respond',
      durationMs: Date.now() - startedAt,
      status: 'error'
    })

    throw error
  }
}

// ─── Codex-first provider with graceful fallback ──────────────────────────────

async function generateWithCodexFallback(input: {
  sensitive: boolean
  system: string
  prompt: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  imageDataUrl: string | null
  screenCapturedAt: number
  screenChangeSummary: PerceptionContextSnapshot['semanticState']['change_summary']
  screenVisualSummary: string
}): Promise<import('./ai-provider').ProviderExecutionResult | null> {
  // Conteúdo sensível não vai pro Codex (servidor externo, não local)
  if (!input.sensitive && codexAuth.getStatus().authenticated) {
    try {
      const shouldTrimHistoryForFreshScreen =
        Boolean(input.imageDataUrl) && input.screenChangeSummary === 'major'
      const codexHistory = shouldTrimHistoryForFreshScreen
        ? input.history.slice(-2)
        : input.history
      const codexSystem = [
        input.system,
        `Current screen capture timestamp: ${input.screenCapturedAt}.`,
        `Current screen summary: ${input.screenVisualSummary}.`,
        'Visual grounding policy:',
        '- the latest screenshot and current screen summary are authoritative',
        '- if the current screen differs from earlier conversation context, discard the older screen assumptions',
        '- do not keep describing a previous screen after a screen change',
        'House style override:',
        '- match the same John voice used in the standard API provider path',
        '- do not answer in an overly compressed or timid way',
        '- when the answer is explanatory, prefer 2 to 4 well-developed paragraphs instead of a single short block',
        '- use the available width naturally; do not sound clipped or minimal by default',
        '- stay direct, observant, grounded in the current screen and with the same personality tone as the non-Codex path'
      ].join('\n')
      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: codexSystem },
        ...codexHistory,
        { role: 'user',   content: input.prompt }
      ]
      try {
        const text = await codexClient.chat({ model: 'gpt-4.1', messages, imageDataUrl: input.imageDataUrl })
        return { providerId: 'codex' as import('../../shared/ai-provider.types').AIProviderId, model: 'gpt-4.1', text }
      } catch (primaryError) {
        const text = await codexClient.chat({ messages, imageDataUrl: input.imageDataUrl })
        console.warn('[Codex] fallback para modelo padrÃ£o da conta:', primaryError instanceof Error ? primaryError.message : primaryError)
        return { providerId: 'codex' as import('../../shared/ai-provider.types').AIProviderId, model: 'codex-account-default', text }
      }
    } catch (e) {
      // Codex falhou — cai no pipeline normal sem interromper
      console.error('[Codex] falhou, usando fallback:', e instanceof Error ? e.message : e)
    }
  }

  return generateRemoteText({
    sensitive: input.sensitive,
    system: input.system,
    prompt: input.prompt,
    messages: input.history,
    imageDataUrl: input.imageDataUrl
  })
}

function inferMode(request: TutorRequest, profile: UserProfile): TutorMode {
  const prompt = request.prompt.toLowerCase()

  if (/\bpasso\b|\betapas\b|\bcomo\b/.test(prompt)) return 'step_by_step'
  if (/\banalog/i.test(prompt) || /\bcompar(a|e)\b/.test(prompt)) return 'analogy'
  if (/\bresum/i.test(prompt)) return 'summary'
  if (/\bpergunta\b|\bme testa\b|\bdiagnostic/i.test(prompt)) return 'diagnostic'
  if (/\bexplica melhor\b|\baprofund/i.test(prompt)) return 'layered'

  const lastAssistant = [...request.conversation].reverse().find(message => message.role === 'assistant')
  if (lastAssistant && /\bexplica\b|\bdetalha\b|\baprofunda\b/i.test(prompt)) return 'layered'

  switch (profile.preferred_explanation_style) {
    case 'direct':
      return 'direct'
    case 'analogy':
      return 'analogy'
    case 'summary':
      return 'summary'
    default:
      return 'step_by_step'
  }
}

function buildFollowUps(mode: TutorMode, context: PerceptionContextSnapshot): string[] {
  const topic = context.semanticState.pedagogical_topics[0]
  const followUps = new Set<string>()

  if (mode !== 'step_by_step') followUps.add('Mostra em passos')
  if (mode !== 'summary') followUps.add('Resume isso')
  if (mode !== 'analogy') followUps.add('Traz uma analogia')
  if (topic) followUps.add(`Aprofunda ${topic}`)
  followUps.add('Me faz uma pergunta')

  return [...followUps].slice(0, 4)
}

export { buildRemoteSystemPrompt, buildRemoteUserPrompt, composeResponse }

/**
 * Returns true when the user's prompt is topically unrelated to what's on screen.
 * Detection is intentionally conservative: any screen deictic reference or meaningful
 * word overlap keeps it as a screen-anchored question.
 */
function isOffScreenQuestion(prompt: string, context: PerceptionContextSnapshot): boolean {
  // Explicit screen deictic references → always screen-anchored
  if (/\b(isso|aqui|essa tela|o que (está|aparece|to vendo|tô vendo|estou vendo)|esse (gráfico|código|texto|arquivo|dashboard|painel))\b/i.test(prompt)) {
    return false
  }

  // Build a set of meaningful words from screen context (len > 3 to skip noise)
  const screenText = [
    context.semanticState.visual_summary,
    context.semanticState.probable_user_focus,
    context.semanticState.surface_type,
    context.semanticState.detected_text ?? '',
    ...context.semanticState.pedagogical_topics
  ].join(' ').toLowerCase()

  const screenWords = new Set(
    screenText.split(/\W+/).filter(w => w.length > 3)
  )

  // Count how many non-trivial prompt words appear in screen context
  const promptWords = prompt.toLowerCase().split(/\W+/).filter(w => w.length > 3)
  if (promptWords.length === 0) return false

  const overlap = promptWords.filter(w => screenWords.has(w)).length
  const overlapRatio = overlap / promptWords.length

  // Less than 20% topical overlap → treat as an off-screen question
  return overlapRatio < 0.20
}

function buildPersistentMemoryQuery(
  prompt: string,
  context: PerceptionContextSnapshot
): string {
  return [
    prompt,
    context.semanticState.visual_summary,
    context.semanticState.probable_user_focus,
    context.sessionMemory.current_intent,
    context.sessionMemory.continuity_summary
  ]
    .filter(Boolean)
    .join(' | ')
}
