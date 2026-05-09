import { getContextSnapshot } from './perception'
import { runDomainTutor } from './tutor-domains'
import { recordDiagnosticEvent, recordPerformanceTrace } from './observability'
import { generateRemoteText, streamRemoteText } from './ai-provider'
import { buildTutorCacheKey, getTutorCached, setTutorCache } from './tutor-cache'
import { codexAuth, codexClient } from '../auth/codex-singleton'
import { retrieveRelevantMemories } from './memory-embeddings'
import { newsService } from './news-service'
import { calendarService } from './calendar-service'
import { analysisStore } from './analysis-store'
import {
  buildRemoteSystemPrompt,
  buildRemoteUserPromptBlocks,
  composeResponse,
  inferWarning,
  formatVSCodeConnectorContext,
  formatSpotifyConnectorContext,
  formatTradingViewConnectorContext,
  renderTutorPromptBlocks
} from './tutor-prompt'
import { bridgeServer } from './bridge'
import { buildVSCodeActionsFromContext, getVSCodeConnectorData } from './vscode-command-router'
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
  ConnectorID,
  PerceptionContextSnapshot,
  TutorMessage,
  TutorDominantContextSource,
  TutorMode,
  TutorRequest,
  TutorResponse,
  TutorSourceConfidence,
  TutorStep,
  UserProfile
} from '../../shared/perception.types'
import type { TutorPromptBlock } from './tutor-prompt'

/** Track how many responses have been generated this process session for flush scheduling */
let responseCountSinceFlush = 0
const FLUSH_EVERY_N_RESPONSES = 5
const TUTOR_HISTORY_MAX_MESSAGES = 6
const TUTOR_HISTORY_SUMMARY_MAX_CHARS = 900
const TUTOR_INPUT_TOKEN_BUDGET = 12_000
const TUTOR_INPUT_TOKEN_TARGET = 10_500
let tutorInputEstimateBias = 1

export async function generateTutorResponse(request: TutorRequest): Promise<TutorResponse> {
  const startedAt = Date.now()

  try {
    const context = request.context ?? await getContextSnapshot()

    // ─── Behavior pattern summary for prompt injection ────────────────────────
    const behaviorPattern = await getBehaviorPattern()
    const behaviorSummaryLines = await getBehaviorPatternSummary()

    // ─── Resolve mode and domain BEFORE calibration so depth-calibrator gets
    //     the real values — not placeholders ────────────────────────────────────
    const mode = inferMode(request, context.userProfile)
    const uncertainty = context.semanticState.uncertainty
    const baseWarning = inferWarning(context)
    const offScreen = isOffScreenQuestion(request.prompt, context)
    const needsVisualConfirmation = !offScreen && (uncertainty >= 0.68 || context.semanticState.surface_type === 'unknown')
    const shouldAskConfirmation = needsVisualConfirmation || /\bisso\b|\besta tela\b|\baqui\b/i.test(request.prompt)

    // Run domain router with base context — domain classification doesn't depend
    // on calibrated depth, so this is safe and gives us the real domain name.
    const domainOutput = runDomainTutor({ request, context: { ...context, userProfile: context.userProfile }, mode })

    // ─── Depth calibration — now has real mode and domain ────────────────────
    const calibration = calibrateDepth({
      prompt: request.prompt,
      conversationLength: request.conversation.length,
      profile: context.userProfile,
      behaviorPattern,
      domain: domainOutput?.domain ?? 'general',
      modeUsed: mode
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
    const tradingViewRaw = bridgeServer.getContext('tradingview')
    const vsCodeBlock  = vsCodeRaw  ? formatVSCodeConnectorContext(vsCodeRaw.data)   : undefined
    const spotifyBlock = spotifyRaw ? formatSpotifyConnectorContext(spotifyRaw.data) : undefined
    const tradingViewBlock = tradingViewRaw ? formatTradingViewConnectorContext(tradingViewRaw.data) : undefined
    const newsBlock = tradingViewRaw
      ? newsService.formatForPrompt((tradingViewRaw.data as { symbol?: string })?.symbol ?? '')
      : undefined
    const calendarBlock = calendarService.formatForPrompt() || undefined
    const tvSymbol = (tradingViewRaw?.data as { symbol?: string })?.symbol ?? ''
    const analysisBlock = tvSymbol
      ? (await analysisStore.formatForPrompt(tvSymbol)) || undefined
      : undefined
    const connectorsUsed = ([
      vsCodeRaw ? 'vscode' : null,
      spotifyRaw ? 'spotify' : null,
      tradingViewRaw ? 'tradingview' : null
    ].filter(Boolean) as ConnectorID[])

    const sensitive = Boolean(domainOutput?.warning ?? baseWarning)
    const screenAgeMs = context.screenshotDataUrl
      ? Math.max(0, Date.now() - context.semanticState.capturedAt)
      : null
    const staleContextGuarded =
      Boolean(context.screenshotDataUrl)
      && (context.semanticState.change_summary === 'major' || (screenAgeMs !== null && screenAgeMs > 45_000))
    const systemLines = [
      buildRemoteSystemPrompt(mode, effectiveContext, domainOutput?.warning ?? baseWarning, offScreen),
      staleContextGuarded
        ? [
            '[FreshScreenGuard]',
            'The screen likely changed or the current capture is no longer fresh.',
            'Prioritize the latest screenshot and current semantic state over older conversation assumptions.',
            'If earlier turns conflict with the current screen, discard the older screen reading.'
          ].join('\n')
        : ''
    ].filter(Boolean)
    const system = systemLines.join('\n\n')
    const baseHistory = request.conversation.slice(0, -1)
    const initialHistory = compactConversationHistory(
      staleContextGuarded ? baseHistory.slice(-2) : baseHistory
    )
    const budgetedContext = buildBudgetedTutorContext({
      request,
      context: effectiveContext,
      domainBody: domainOutput?.content ?? null,
      relevantMemoryLines: [...relevantPersistentMemory, ...behaviorSummaryLines],
      offScreen,
      vsCodeBlock,
      spotifyBlock,
      tradingViewBlock,
      newsBlock: newsBlock || undefined,
      calendarBlock,
      analysisBlock,
      system,
      history: initialHistory,
      imageDataUrl: context.screenshotDataUrl ?? null
    })
    const prompt = budgetedContext.prompt
    const history = budgetedContext.history
    const imageDataUrl = context.screenshotDataUrl ?? null
    const sourceConfidence = buildSourceConfidence({
      context,
      connectorsUsed
    })
    const dominantContextSource = determineDominantContextSource({
      domain: domainOutput?.domain ?? 'general',
      prompt: request.prompt,
      connectorsUsed,
      sourceConfidence
    })

    // ─── Tutor response cache ─────────────────────────────────────────────────
    // Skip the strong-model call when the context hasn't changed meaningfully.
    // Only cache when the screen is stable (no major change) and no sensitive
    // content is involved.
    const connectorKey = buildConnectorKey(connectorsUsed)
    const cacheKey = buildTutorCacheKey({
      prompt: request.prompt,
      domain: domainOutput?.domain ?? 'general',
      imageDataUrlPrefix: imageDataUrl ? imageDataUrl.slice(0, 80) : null,
      connectorKey
    })
    const cached = !sensitive && context.semanticState.change_summary !== 'major'
      ? getTutorCached(cacheKey)
      : null

    if (cached) {
      void recordDiagnosticEvent({
        type: 'trace',
        source: 'tutor',
        action: 'cache_hit',
        sessionId: context.sessionMemory.session_id,
        details: { domain: domainOutput?.domain ?? 'general', cacheKey: cacheKey.slice(0, 60) }
      })
      return cached
    }

    if (sensitive || context.semanticState.change_summary === 'major') {
      void recordDiagnosticEvent({
        type: 'trace',
        source: 'tutor',
        action: 'cache_bypassed',
        sessionId: context.sessionMemory.session_id,
        details: {
          domain: domainOutput?.domain ?? 'general',
          reason: sensitive ? 'sensitive_context' : 'major_screen_change',
          cacheKey: cacheKey.slice(0, 60)
        }
      })
    }

    if (budgetedContext.compactionStage !== 'full') {
      void recordDiagnosticEvent({
        type: 'trace',
        source: 'tutor',
        action: 'prompt_compacted',
        sessionId: context.sessionMemory.session_id,
        details: {
          domain: domainOutput?.domain ?? 'general',
          stage: budgetedContext.compactionStage,
          estimatedInputTokens: budgetedContext.estimatedInputTokens,
          budgetTarget: TUTOR_INPUT_TOKEN_TARGET,
          estimateBias: tutorInputEstimateBias,
          promptBlocks: budgetedContext.blocks.map(block => block.id).join(',')
        }
      })
    }

    const remoteResult = await generateWithCodexFallback({
      sensitive,
      system,
      prompt,
      history,
      imageDataUrl,
      conversationKey: context.sessionMemory.session_id,
      allowResponseState: !imageDataUrl && !staleContextGuarded,
      resetResponseState: staleContextGuarded || context.semanticState.change_summary === 'major',
      screenCapturedAt: context.semanticState.capturedAt,
      screenChangeSummary: context.semanticState.change_summary,
      screenVisualSummary: context.semanticState.visual_summary
    })
    updateTutorInputEstimateBias(
      budgetedContext.estimatedInputTokens,
      remoteResult?.actualInputTokens
    )
    const content = remoteResult?.text?.trim() || localContent
    const latencyMs = Date.now() - startedAt

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
        dominantSource: dominantContextSource,
        staleContextGuarded,
        connectorsUsed: connectorsUsed.join(','),
        screenshotIncluded: Boolean(imageDataUrl),
        screenAgeMs,
        latencyMs,
        systemLength: system.length,
        promptLength: prompt.length,
        historyCount: history.length,
        rawHistoryCount: baseHistory.length,
        calibratedLevel: calibration.effective_level,
        calibrationReason: calibration.reason
      }
    })

    void recordPerformanceTrace({
      operation: 'tutor.respond',
      durationMs: latencyMs,
      status: 'ok'
    })

    const responseActions =
      connectorsUsed.includes('vscode') && (domainOutput?.domain === 'code' || dominantContextSource === 'vscode')
        ? buildVSCodeActionsFromContext(getVSCodeConnectorData())
        : undefined

    const tutorResponse: TutorResponse = {
      domain: domainOutput?.domain ?? 'general',
      mode,
      content,
      actions: responseActions,
      provider: remoteResult?.providerId ?? 'local',
      model: remoteResult?.model ?? 'local',
      uncertainty,
      should_ask_confirmation: shouldAskConfirmation,
      needs_visual_confirmation: needsVisualConfirmation,
      suggested_follow_ups: domainOutput?.suggested_follow_ups ?? buildFollowUps(mode, effectiveContext),
      warning: domainOutput?.warning ?? baseWarning,
      debug: {
        provider: remoteResult?.providerId ?? 'local',
        model: remoteResult?.model ?? 'local',
        latencyMs,
        screenshotIncluded: Boolean(imageDataUrl),
        screenCapturedAt: context.screenshotDataUrl ? context.semanticState.capturedAt : null,
        screenAgeMs,
        changeSummary: context.semanticState.change_summary,
        connectorsUsed,
        dominantContextSource,
        sourceConfidence,
        staleContextGuarded
      }
    }

    // Store in cache for stable-context follow-ups
    if (!sensitive && context.semanticState.change_summary !== 'major' && remoteResult?.text) {
      setTutorCache(cacheKey, tutorResponse)
    }

    return tutorResponse
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

// ─── Retry helper — exponential backoff for transient network errors ─────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number, baseDelayMs: number): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelayMs * (2 ** attempt)))
      }
    }
  }
  throw lastError
}

// ─── Codex-first provider with graceful fallback ──────────────────────────────

async function generateWithCodexFallback(input: {
  sensitive: boolean
  system: string
  prompt: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  imageDataUrl: string | null
  conversationKey: string
  allowResponseState: boolean
  resetResponseState: boolean
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
        '- match the same Ares voice used in the standard API provider path',
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
        const text = await withRetry(
          () => codexClient.chat({ model: 'gpt-4.1', messages, imageDataUrl: input.imageDataUrl }),
          2,   // up to 2 retries (3 total attempts)
          400  // 400ms → 800ms backoff
        )
        return { providerId: 'codex' as import('../../shared/ai-provider.types').AIProviderId, model: 'gpt-4.1', text }
      } catch (primaryError) {
        console.warn('[Codex] gpt-4.1 falhou após retries, tentando modelo padrão da conta:', primaryError instanceof Error ? primaryError.message : primaryError)
        const text = await withRetry(
          () => codexClient.chat({ messages, imageDataUrl: input.imageDataUrl }),
          1,   // 1 retry for account default
          600
        )
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
    imageDataUrl: input.imageDataUrl,
    feature: 'tutor',
    conversationKey: input.conversationKey,
    allowResponseState: input.allowResponseState,
    resetResponseState: input.resetResponseState
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

export { buildRemoteSystemPrompt, buildRemoteUserPromptBlocks, renderTutorPromptBlocks, composeResponse }

// ─── Streaming tutor response — same pipeline with step + chunk callbacks ─────

export async function generateTutorResponseStream(
  request: TutorRequest,
  onStep: (step: TutorStep) => void,
  onChunk: (text: string) => void
): Promise<TutorResponse> {
  const startedAt = Date.now()

  // Step 1 — context + domain routing + calibration
  onStep({ id: 'context', label: 'Analisando tela', status: 'running' })

  const context = request.context ?? await getContextSnapshot()
  const behaviorPattern = await getBehaviorPattern()
  const behaviorSummaryLines = await getBehaviorPatternSummary()
  const mode = inferMode(request, context.userProfile)
  const uncertainty = context.semanticState.uncertainty
  const baseWarning = inferWarning(context)
  const offScreen = isOffScreenQuestion(request.prompt, context)
  const needsVisualConfirmation = !offScreen && (uncertainty >= 0.68 || context.semanticState.surface_type === 'unknown')
  const shouldAskConfirmation = needsVisualConfirmation || /\bisso\b|\besta tela\b|\baqui\b/i.test(request.prompt)
  const domainOutput = runDomainTutor({ request, context: { ...context, userProfile: context.userProfile }, mode })
  const calibration = calibrateDepth({
    prompt: request.prompt,
    conversationLength: request.conversation.length,
    profile: context.userProfile,
    behaviorPattern,
    domain: domainOutput?.domain ?? 'general',
    modeUsed: mode
  })
  const effectiveProfile: UserProfile = {
    ...context.userProfile,
    user_level: calibration.effective_level,
    preferred_explanation_style: calibration.effective_style,
    response_tone: calibration.effective_tone
  }
  const effectiveContext: PerceptionContextSnapshot = { ...context, userProfile: effectiveProfile }

  onStep({ id: 'context', label: 'Analisando tela', status: 'done' })

  // Step 2 — memory retrieval
  onStep({ id: 'memory', label: 'Buscando memória', status: 'running' })

  const relevantPersistentMemory = await retrieveRelevantMemories({
    query: buildPersistentMemoryQuery(request.prompt, context),
    limit: 4
  })

  onStep({ id: 'memory', label: 'Buscando memória', status: 'done' })

  // Step 3 — LLM generation
  onStep({ id: 'generate', label: 'Gerando resposta', status: 'running' })

  const localContent = composeResponse({
    mode,
    context: effectiveContext,
    shouldAskConfirmation,
    warning: domainOutput?.warning ?? baseWarning,
    domainBody: domainOutput?.content ?? null
  })
  const vsCodeRaw      = bridgeServer.getContext('vscode')
  const spotifyRaw     = bridgeServer.getContext('spotify')
  const tradingViewRaw = bridgeServer.getContext('tradingview')
  const vsCodeBlock    = vsCodeRaw      ? formatVSCodeConnectorContext(vsCodeRaw.data)      : undefined
  const spotifyBlock   = spotifyRaw     ? formatSpotifyConnectorContext(spotifyRaw.data)    : undefined
  const tradingViewBlock = tradingViewRaw ? formatTradingViewConnectorContext(tradingViewRaw.data) : undefined
  const newsBlock = tradingViewRaw
    ? newsService.formatForPrompt((tradingViewRaw.data as { symbol?: string })?.symbol ?? '')
    : undefined
  const calendarBlock = calendarService.formatForPrompt() || undefined
  const tvSymbolStream = (tradingViewRaw?.data as { symbol?: string })?.symbol ?? ''
  const analysisBlock = tvSymbolStream
    ? (await analysisStore.formatForPrompt(tvSymbolStream)) || undefined
    : undefined
  const connectorsUsed = ([
    vsCodeRaw ? 'vscode' : null,
    spotifyRaw ? 'spotify' : null,
    tradingViewRaw ? 'tradingview' : null
  ].filter(Boolean) as ConnectorID[])

  const sensitive = Boolean(domainOutput?.warning ?? baseWarning)
  const screenAgeMs = context.screenshotDataUrl
    ? Math.max(0, Date.now() - context.semanticState.capturedAt)
    : null
  const staleContextGuarded =
    Boolean(context.screenshotDataUrl)
    && (context.semanticState.change_summary === 'major' || (screenAgeMs !== null && screenAgeMs > 45_000))
  const systemLines = [
    buildRemoteSystemPrompt(mode, effectiveContext, domainOutput?.warning ?? baseWarning, offScreen),
    staleContextGuarded
      ? ['[FreshScreenGuard]', 'The screen likely changed or the current capture is no longer fresh.',
         'Prioritize the latest screenshot and current semantic state over older conversation assumptions.',
         'If earlier turns conflict with the current screen, discard the older screen reading.'].join('\n')
      : ''
  ].filter(Boolean)
  const system = systemLines.join('\n\n')
  const baseHistory = request.conversation.slice(0, -1)
  const initialHistory = compactConversationHistory(
    staleContextGuarded ? baseHistory.slice(-2) : baseHistory
  )
  const budgetedContext = buildBudgetedTutorContext({
    request,
    context: effectiveContext,
    domainBody: domainOutput?.content ?? null,
    relevantMemoryLines: [...relevantPersistentMemory, ...behaviorSummaryLines],
    offScreen,
    vsCodeBlock,
    spotifyBlock,
    tradingViewBlock,
    newsBlock: newsBlock || undefined,
    calendarBlock,
    analysisBlock,
    system,
    history: initialHistory,
    imageDataUrl: context.screenshotDataUrl ?? null
  })
  const prompt = budgetedContext.prompt
  const history = budgetedContext.history
  const imageDataUrl = context.screenshotDataUrl ?? null
  const sourceConfidence = buildSourceConfidence({ context, connectorsUsed })
  const dominantContextSource = determineDominantContextSource({
    domain: domainOutput?.domain ?? 'general',
    prompt: request.prompt,
    connectorsUsed,
    sourceConfidence
  })

  // Cache check (skip streaming if cached — return immediately)
  const connectorKey = buildConnectorKey(connectorsUsed)
  const cacheKey = buildTutorCacheKey({
    prompt: request.prompt,
    domain: domainOutput?.domain ?? 'general',
    imageDataUrlPrefix: imageDataUrl ? imageDataUrl.slice(0, 80) : null,
    connectorKey
  })
  const cached = !sensitive && context.semanticState.change_summary !== 'major'
    ? getTutorCached(cacheKey)
    : null

  let remoteResult: import('./ai-provider').ProviderExecutionResult | null = null

  if (cached) {
    // Emit cached content as a single chunk so the UI still "streams"
    onChunk(cached.content)
    onStep({ id: 'generate', label: 'Gerando resposta', status: 'done' })
    void recordDiagnosticEvent({
      type: 'trace', source: 'tutor', action: 'cache_hit',
      sessionId: context.sessionMemory.session_id,
      details: { domain: domainOutput?.domain ?? 'general', cacheKey: cacheKey.slice(0, 60) }
    })
    return cached
  }

  if (sensitive || context.semanticState.change_summary === 'major') {
    void recordDiagnosticEvent({
      type: 'trace',
      source: 'tutor',
      action: 'cache_bypassed',
      sessionId: context.sessionMemory.session_id,
      details: {
        domain: domainOutput?.domain ?? 'general',
        reason: sensitive ? 'sensitive_context' : 'major_screen_change',
        cacheKey: cacheKey.slice(0, 60)
      }
    })
  }

  // Try streaming via Codex first (no streaming API — emit as single chunk when done)
  if (budgetedContext.compactionStage !== 'full') {
    void recordDiagnosticEvent({
      type: 'trace',
      source: 'tutor',
      action: 'prompt_compacted',
      sessionId: context.sessionMemory.session_id,
      details: {
        domain: domainOutput?.domain ?? 'general',
        stage: budgetedContext.compactionStage,
        estimatedInputTokens: budgetedContext.estimatedInputTokens,
        budgetTarget: TUTOR_INPUT_TOKEN_TARGET,
        estimateBias: tutorInputEstimateBias,
        promptBlocks: budgetedContext.blocks.map(block => block.id).join(',')
      }
    })
  }

  if (!sensitive && codexAuth.getStatus().authenticated) {
    try {
      const shouldTrimHistoryForFreshScreen = Boolean(imageDataUrl) && context.semanticState.change_summary === 'major'
      const codexHistory = shouldTrimHistoryForFreshScreen ? history.slice(-2) : history
      const codexSystem = [
        system,
        `Current screen capture timestamp: ${context.semanticState.capturedAt}.`,
        `Current screen summary: ${context.semanticState.visual_summary}.`,
        'Visual grounding policy:',
        '- the latest screenshot and current screen summary are authoritative',
        '- if the current screen differs from earlier conversation context, discard the older screen assumptions',
        '- do not keep describing a previous screen after a screen change',
        'House style override:',
        '- match the same Ares voice used in the standard API provider path',
        '- do not answer in an overly compressed or timid way',
        '- when the answer is explanatory, prefer 2 to 4 well-developed paragraphs instead of a single short block',
        '- use the available width naturally; do not sound clipped or minimal by default',
        '- stay direct, observant, grounded in the current screen and with the same personality tone as the non-Codex path'
      ].join('\n')
      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: codexSystem },
        ...codexHistory,
        { role: 'user', content: prompt }
      ]
      try {
        const text = await withRetry(
          () => codexClient.chat({ model: 'gpt-4.1', messages, imageDataUrl }),
          2, 400
        )
        onChunk(text)
        remoteResult = { providerId: 'codex' as import('../../shared/ai-provider.types').AIProviderId, model: 'gpt-4.1', text }
      } catch {
        const text = await withRetry(
          () => codexClient.chat({ messages, imageDataUrl }),
          1, 600
        )
        onChunk(text)
        remoteResult = { providerId: 'codex' as import('../../shared/ai-provider.types').AIProviderId, model: 'codex-account-default', text }
      }
    } catch (e) {
      console.error('[Codex] streaming fallback failed:', e instanceof Error ? e.message : e)
    }
  }

  // If Codex didn't handle it, use streaming provider
  if (!remoteResult) {
    let firstChunk = true
    remoteResult = await streamRemoteText(
      {
        sensitive,
        system,
        prompt,
        messages: history,
        imageDataUrl,
        feature: 'tutor',
        conversationKey: context.sessionMemory.session_id,
        allowResponseState: !imageDataUrl && !staleContextGuarded,
        resetResponseState: staleContextGuarded || context.semanticState.change_summary === 'major'
      },
      (chunk) => {
        if (firstChunk) {
          firstChunk = false
          onStep({ id: 'generate', label: 'Gerando resposta', status: 'done' })
        }
        onChunk(chunk)
      }
    )
  }

  updateTutorInputEstimateBias(
    budgetedContext.estimatedInputTokens,
    remoteResult?.actualInputTokens
  )

  onStep({ id: 'generate', label: 'Gerando resposta', status: 'done' })

  const content = remoteResult?.text?.trim() || localContent
  const latencyMs = Date.now() - startedAt

  // Post-response signals (same as non-streaming path)
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
  void applyDepthCalibration(calibration)
  responseCountSinceFlush++
  if (responseCountSinceFlush >= FLUSH_EVERY_N_RESPONSES) {
    responseCountSinceFlush = 0
    void flushBehaviorToMemory()
  }

  const responseActions =
    connectorsUsed.includes('vscode') && (domainOutput?.domain === 'code' || dominantContextSource === 'vscode')
      ? buildVSCodeActionsFromContext(getVSCodeConnectorData())
      : undefined

  const tutorResponse: TutorResponse = {
    domain: domainOutput?.domain ?? 'general',
    mode,
    content,
    actions: responseActions,
    provider: remoteResult?.providerId ?? 'local',
    model: remoteResult?.model ?? 'local',
    uncertainty,
    should_ask_confirmation: shouldAskConfirmation,
    needs_visual_confirmation: needsVisualConfirmation,
    suggested_follow_ups: domainOutput?.suggested_follow_ups ?? buildFollowUps(mode, effectiveContext),
    warning: domainOutput?.warning ?? baseWarning,
    debug: {
      provider: remoteResult?.providerId ?? 'local',
      model: remoteResult?.model ?? 'local',
      latencyMs,
      screenshotIncluded: Boolean(imageDataUrl),
      screenCapturedAt: context.screenshotDataUrl ? context.semanticState.capturedAt : null,
      screenAgeMs,
      changeSummary: context.semanticState.change_summary,
      connectorsUsed,
      dominantContextSource,
      sourceConfidence,
      staleContextGuarded
    }
  }

  if (!sensitive && context.semanticState.change_summary !== 'major' && remoteResult?.text) {
    setTutorCache(cacheKey, tutorResponse)
  }

  void recordDiagnosticEvent({
    type: 'trace', source: 'tutor', action: 'generate_response',
    sessionId: context.sessionMemory.session_id,
    details: {
      domain: domainOutput?.domain ?? 'general',
      mode,
      provider: remoteResult?.providerId ?? 'local',
      model: remoteResult?.model ?? 'local',
      latencyMs,
      systemLength: system.length,
      promptLength: prompt.length,
      historyCount: history.length,
      rawHistoryCount: baseHistory.length
    }
  })
  void recordPerformanceTrace({ operation: 'tutor.respond.stream', durationMs: latencyMs, status: 'ok' })

  return tutorResponse
}

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

function buildSourceConfidence(input: {
  context: PerceptionContextSnapshot
  connectorsUsed: ConnectorID[]
}): TutorSourceConfidence {
  const { context, connectorsUsed } = input
  const hasVisionSignals = Boolean(
    context.semanticState.ui_elements?.length
      || context.semanticState.visual_context
      || context.semanticState.app_identifier
      || context.semanticState.code_context
      || (context.semanticState.key_values && Object.keys(context.semanticState.key_values).length)
  )
  const hasOcrSignals = Boolean(
    context.semanticState.detected_text
      && !/context unavailable|private mode active|capture failed|ocr sem contexto/i.test(context.semanticState.detected_text)
  )

  return {
    bridge: connectorsUsed.length
      ? Number(Math.min(0.98, 0.86 + connectorsUsed.length * 0.06).toFixed(2))
      : 0,
    vision: context.screenshotDataUrl
      ? Number((hasVisionSignals ? 0.88 : 0.58).toFixed(2))
      : 0,
    ocr: hasOcrSignals
      ? Number((context.semanticState.surface_type === 'graphic' ? 0.38 : 0.68).toFixed(2))
      : 0,
    memory: Number(
      (
        context.sessionMemory.frame_count > 1
          ? context.semanticState.change_summary === 'none'
            ? 0.62
            : context.semanticState.change_summary === 'minor'
              ? 0.46
              : 0.18
          : 0.12
      ).toFixed(2)
    )
  }
}

function determineDominantContextSource(input: {
  domain: TutorResponse['domain']
  prompt: string
  connectorsUsed: ConnectorID[]
  sourceConfidence: TutorSourceConfidence
}): TutorDominantContextSource {
  const { domain, prompt, connectorsUsed, sourceConfidence } = input
  const lowerPrompt = prompt.toLowerCase()

  if (connectorsUsed.includes('tradingview') && (domain === 'market' || /\b(tradingview|grafico|gr[aá]fico|candle|ticker|timeframe)\b/i.test(lowerPrompt))) {
    return 'tradingview'
  }

  if (connectorsUsed.includes('vscode') && (domain === 'code' || /\b(c[oó]digo|erro|bug|arquivo|diff|terminal|vscode)\b/i.test(lowerPrompt))) {
    return 'vscode'
  }

  if (connectorsUsed.includes('spotify') && /\b(spotify|m[uú]sica|musica|faixa|album|álbum|playlist|tocando)\b/i.test(lowerPrompt)) {
    return 'spotify'
  }

  if (connectorsUsed.length === 1) {
    return connectorsUsed[0]
  }

  if (sourceConfidence.vision >= sourceConfidence.ocr && sourceConfidence.vision >= sourceConfidence.memory && sourceConfidence.vision > 0) {
    return 'vision'
  }

  if (sourceConfidence.ocr >= sourceConfidence.memory && sourceConfidence.ocr > 0) {
    return 'ocr'
  }

  if (sourceConfidence.memory > 0.2) {
    return 'memory'
  }

  return connectorsUsed[0] ?? 'unknown'
}

function buildConnectorKey(connectorsUsed: ConnectorID[]): string {
  if (connectorsUsed.length === 0) return 'no-connectors'

  const parts: string[] = []

  if (connectorsUsed.includes('tradingview')) {
    const raw = bridgeServer.getContext('tradingview')
    const data = raw?.data as { symbol?: string; timeframe?: string } | undefined
    parts.push(`tv:${data?.symbol ?? ''}:${data?.timeframe ?? ''}`)
  }

  if (connectorsUsed.includes('vscode')) {
    const data = getVSCodeConnectorData()
    parts.push(`vsc:${data?.editor?.filepath ?? data?.editor?.filename ?? ''}`)
  }

  if (connectorsUsed.includes('spotify')) {
    const raw = bridgeServer.getContext('spotify')
    const data = raw?.data as { trackName?: string } | undefined
    parts.push(`sp:${data?.trackName ?? ''}`)
  }

  return parts.join('|')
}

function buildBudgetedTutorContext(input: {
  request: TutorRequest
  context: PerceptionContextSnapshot
  domainBody: string | null
  relevantMemoryLines: string[]
  offScreen: boolean
  vsCodeBlock?: string
  spotifyBlock?: string
  tradingViewBlock?: string
  newsBlock?: string
  calendarBlock?: string
  analysisBlock?: string
  system: string
  history: TutorMessage[]
  imageDataUrl: string | null
}): {
  prompt: string
  blocks: TutorPromptBlock[]
  history: TutorMessage[]
  estimatedInputTokens: number
  compactionStage: 'full' | 'memory_trimmed' | 'history_compacted' | 'connector_trimmed'
} {
  const estimate = (prompt: string, history: TutorMessage[]): number => estimateTutorInputTokens({
    system: input.system,
    prompt,
    history,
    imageDataUrl: input.imageDataUrl
  })

  const buildBlocks = (overrides?: {
    relevantMemoryLines?: string[]
    spotifyBlock?: string | null
    newsBlock?: string | null
    calendarBlock?: string | null
    analysisBlock?: string | null
  }): TutorPromptBlock[] => buildRemoteUserPromptBlocks(
    input.request,
    input.context,
    input.domainBody,
    overrides?.relevantMemoryLines ?? input.relevantMemoryLines,
    input.offScreen,
    input.vsCodeBlock,
    overrides?.spotifyBlock !== undefined ? overrides.spotifyBlock ?? undefined : input.spotifyBlock,
    input.tradingViewBlock,
    overrides?.newsBlock !== undefined ? overrides.newsBlock ?? undefined : input.newsBlock,
    overrides?.calendarBlock !== undefined ? overrides.calendarBlock ?? undefined : input.calendarBlock,
    overrides?.analysisBlock !== undefined ? overrides.analysisBlock ?? undefined : input.analysisBlock
  )

  const fullBlocks = buildBlocks()
  const fullPrompt = renderTutorPromptBlocks(fullBlocks)
  const fullEstimate = estimate(fullPrompt, input.history)
  if (fullEstimate <= TUTOR_INPUT_TOKEN_TARGET) {
    return {
      prompt: fullPrompt,
      blocks: fullBlocks,
      history: input.history,
      estimatedInputTokens: fullEstimate,
      compactionStage: 'full'
    }
  }

  const trimmedMemoryLines = compactPromptSupportLines(input.relevantMemoryLines, 360)
  const memoryTrimmedBlocks = buildBlocks({ relevantMemoryLines: trimmedMemoryLines })
  const memoryTrimmedPrompt = renderTutorPromptBlocks(memoryTrimmedBlocks)
  const memoryTrimmedEstimate = estimate(memoryTrimmedPrompt, input.history)
  if (memoryTrimmedEstimate <= TUTOR_INPUT_TOKEN_TARGET) {
    return {
      prompt: memoryTrimmedPrompt,
      blocks: memoryTrimmedBlocks,
      history: input.history,
      estimatedInputTokens: memoryTrimmedEstimate,
      compactionStage: 'memory_trimmed'
    }
  }

  const tighterHistory = compactConversationHistory(input.history, {
    maxMessages: 4,
    summaryMaxChars: 520
  })
  const historyCompactedEstimate = estimate(memoryTrimmedPrompt, tighterHistory)
  if (historyCompactedEstimate <= TUTOR_INPUT_TOKEN_TARGET || historyCompactedEstimate <= TUTOR_INPUT_TOKEN_BUDGET) {
    return {
      prompt: memoryTrimmedPrompt,
      blocks: memoryTrimmedBlocks,
      history: tighterHistory,
      estimatedInputTokens: historyCompactedEstimate,
      compactionStage: 'history_compacted'
    }
  }

  const connectorTrimmedBlocks = buildBlocks({
    relevantMemoryLines: trimmedMemoryLines,
    spotifyBlock: null,
    newsBlock: null,
    calendarBlock: null,
    analysisBlock: null
  })
  const connectorTrimmedPrompt = renderTutorPromptBlocks(connectorTrimmedBlocks)
  return {
    prompt: connectorTrimmedPrompt,
    blocks: connectorTrimmedBlocks,
    history: tighterHistory,
    estimatedInputTokens: estimate(connectorTrimmedPrompt, tighterHistory),
    compactionStage: 'connector_trimmed'
  }
}

function compactPromptSupportLines(lines: string[], maxChars: number): string[] {
  const result: string[] = []
  let remaining = maxChars

  for (const line of lines) {
    const normalized = normalizeHistoryContent(line)
    if (!normalized || remaining <= 0) break
    const compacted = compressHistorySnippet(normalized, Math.min(remaining, 160))
    if (!compacted) continue
    result.push(compacted)
    remaining -= compacted.length + 3
  }

  return result
}

function estimateTutorInputTokens(input: {
  system: string
  prompt: string
  history: TutorMessage[]
  imageDataUrl: string | null
}): number {
  let charCount = input.system.length + input.prompt.length

  for (const message of input.history) {
    charCount += message.content.length + 12
  }

  if (input.imageDataUrl) {
    charCount += 1_200
  }

  const rawEstimate = Math.max(1, Math.ceil(charCount / 4))
  return Math.max(1, Math.ceil(rawEstimate * tutorInputEstimateBias))
}

function updateTutorInputEstimateBias(
  estimatedInputTokens: number,
  actualInputTokens?: number
): void {
  if (!actualInputTokens || estimatedInputTokens <= 0 || actualInputTokens <= 0) return

  const ratio = clampTutorBias(actualInputTokens / estimatedInputTokens)
  tutorInputEstimateBias = Number((tutorInputEstimateBias * 0.72 + ratio * 0.28).toFixed(3))
}

function clampTutorBias(value: number): number {
  return Math.max(1, Math.min(1.6, value))
}

function compactConversationHistory(
  messages: TutorMessage[],
  options: {
    maxMessages?: number
    summaryMaxChars?: number
  } = {}
): TutorMessage[] {
  const maxMessages = options.maxMessages ?? TUTOR_HISTORY_MAX_MESSAGES
  const summaryMaxChars = options.summaryMaxChars ?? TUTOR_HISTORY_SUMMARY_MAX_CHARS

  if (messages.length <= maxMessages) return messages

  const recentMessages = messages.slice(-(maxMessages - 1))
  const olderMessages = messages.slice(0, -(maxMessages - 1))
  const summaryContent = summarizeConversationHistory(olderMessages, summaryMaxChars)

  if (!summaryContent) return recentMessages

  return [
    { role: 'assistant', content: summaryContent },
    ...recentMessages
  ]
}

function summarizeConversationHistory(messages: TutorMessage[], summaryMaxChars = TUTOR_HISTORY_SUMMARY_MAX_CHARS): string {
  const groupedTurns = groupConversationTurns(messages)
  const lines: string[] = [
    '[ConversationSummary]',
    'Compressed older context. Prefer the recent verbatim turns if there is any conflict.'
  ]
  let remaining = summaryMaxChars - lines.join('\n').length - 1

  const summaryState = extractConversationState(groupedTurns)
  const summaryGoal = extractConversationGoal(groupedTurns)
  const summaryDecision = extractConversationDecision(groupedTurns)
  const overviewLines = [
    summaryState ? `State: ${summaryState}` : '',
    summaryGoal ? `Goal: ${summaryGoal}` : '',
    summaryDecision ? `Decision: ${summaryDecision}` : ''
  ].filter(Boolean)

  if (overviewLines.length && remaining > 0) {
    const overviewBlock = overviewLines.join('\n')
    if (overviewBlock.length <= remaining) {
      lines.push(overviewBlock)
      remaining -= overviewBlock.length + 1
    }
  }

  for (const turn of groupedTurns) {
    if (remaining <= 0) break

    const turnLines = [
      turn.user ? `User goal: ${compressHistorySnippet(turn.user, 180)}` : '',
      turn.assistant ? `Assistant takeaway: ${compressHistorySnippet(turn.assistant, 200)}` : ''
    ].filter(Boolean)

    if (turnLines.length === 0) continue

    const block = turnLines.join('\n')
    if (block.length > remaining) {
      const truncated = block.slice(0, Math.max(0, remaining - 3)).trim()
      if (truncated) lines.push(`${truncated}...`)
      break
    }

    lines.push(block)
    remaining -= block.length + 1
  }

  const openLoops = extractOpenLoops(groupedTurns)
  if (openLoops.length && remaining > 0) {
    const openLoopBlock = ['Open loops:', ...openLoops.map(item => `- ${item}`)].join('\n')
    if (openLoopBlock.length <= remaining) {
      lines.push(openLoopBlock)
    } else {
      const compactOpenLoops = compressHistorySnippet(openLoops.join(' | '), Math.max(80, remaining - 16))
      if (compactOpenLoops) {
        lines.push(`Open loops: ${compactOpenLoops}`)
      }
    }
  }

  return lines.length > 2 ? lines.join('\n') : ''
}

function groupConversationTurns(messages: TutorMessage[]): Array<{
  user: string
  assistant: string
}> {
  const turns: Array<{ user: string; assistant: string }> = []
  let pendingUser = ''
  let pendingAssistant = ''

  for (const message of messages) {
    const normalized = normalizeHistoryContent(message.content)
    if (!normalized) continue

    if (message.role === 'user') {
      if (pendingUser || pendingAssistant) {
        turns.push({ user: pendingUser, assistant: pendingAssistant })
        pendingAssistant = ''
      }
      pendingUser = normalized
      continue
    }

    if (!pendingUser && pendingAssistant) {
      pendingAssistant = `${pendingAssistant} ${normalized}`.trim()
      continue
    }

    pendingAssistant = pendingAssistant
      ? `${pendingAssistant} ${normalized}`.trim()
      : normalized
  }

  if (pendingUser || pendingAssistant) {
    turns.push({ user: pendingUser, assistant: pendingAssistant })
  }

  return turns
}

function normalizeHistoryContent(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/\s+/g, ' ')
    .trim()
}

function compressHistorySnippet(content: string, maxLength: number): string {
  const normalized = normalizeHistoryContent(content)
  if (normalized.length <= maxLength) return normalized

  const sentences = normalized.split(/(?<=[.!?])\s+/)
  const parts: string[] = []
  let length = 0

  for (const sentence of sentences) {
    const nextLength = length + sentence.length + (parts.length ? 1 : 0)
    if (nextLength > maxLength) break
    parts.push(sentence)
    length = nextLength
  }

  if (parts.length) return parts.join(' ')
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`
}

function extractOpenLoops(turns: Array<{ user: string; assistant: string }>): string[] {
  const loops: string[] = []

  for (const turn of turns) {
    const user = turn.user.trim()
    const assistant = turn.assistant.trim()
    if (!user) continue

    const userLooksOpen = userHasOpenLoop(user)
    const assistantLooksResolved = assistantResolvesLoop(assistant)

    if (!assistant) {
      loops.push(compressHistorySnippet(user, 140))
      continue
    }

    if (userLooksOpen && !assistantLooksResolved) {
      loops.push(compressHistorySnippet(user, 140))
    }
  }

  return dedupeHistoryItems(loops).slice(0, 3)
}

function userHasOpenLoop(content: string): boolean {
  const normalized = content.toLowerCase()
  return /\?$/.test(content)
    || /\b(como|por que|porque|qual|quais|quando|onde|vale a pena|faz sentido|consegue|pode|devo|me ajuda|me explica|me mostra|pr[oó]ximo passo|o que eu faço)\b/.test(normalized)
}

function assistantResolvesLoop(content: string): boolean {
  if (!content) return false
  const normalized = content.toLowerCase()
  return /\b(passo|fa[cç]a|faz|segue|tente|use|troque|resposta|resumo|explica[cç][aã]o|solu[cç][aã]o|corrige|ajusta|o ponto [ée]|na pr[aá]tica)\b/.test(normalized)
}

function dedupeHistoryItems(items: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items) {
    const key = item.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

function extractConversationState(turns: Array<{ user: string; assistant: string }>): string {
  const latestAssistant = [...turns]
    .reverse()
    .map(turn => turn.assistant.trim())
    .find(Boolean)

  if (!latestAssistant) return ''
  return compressHistorySnippet(latestAssistant, 160)
}

function extractConversationGoal(turns: Array<{ user: string; assistant: string }>): string {
  const latestUser = [...turns]
    .reverse()
    .map(turn => turn.user.trim())
    .find(Boolean)

  if (!latestUser) return ''
  return compressHistorySnippet(latestUser, 140)
}

function extractConversationDecision(turns: Array<{ user: string; assistant: string }>): string {
  const candidates: string[] = []

  for (const turn of turns) {
    const user = turn.user.trim()
    const assistant = turn.assistant.trim()

    if (userHasOpenLoop(user)) {
      candidates.push(user)
      continue
    }

    if (assistantSuggestsDecision(assistant)) {
      candidates.push(assistant)
    }
  }

  const unique = dedupeHistoryItems(candidates)
  return unique.length ? compressHistorySnippet(unique[unique.length - 1], 150) : ''
}

function assistantSuggestsDecision(content: string): boolean {
  if (!content) return false
  const normalized = content.toLowerCase()
  return /\b(deve|melhor|vale|pr[oó]ximo passo|recomendo|faz sentido|o ideal|a melhor leitura|priorize|primeiro)\b/.test(normalized)
}
