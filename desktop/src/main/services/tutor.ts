import { getContextSnapshot } from './perception'
import { runDomainTutor } from './tutor-domains'
import { recordDiagnosticEvent, recordPerformanceTrace } from './observability'
import { generateRemoteText } from './ai-provider'
import { retrieveRelevantMemories } from './memory-embeddings'
import {
  buildRemoteSystemPrompt,
  buildRemoteUserPrompt,
  composeResponse,
  inferWarning
} from './tutor-prompt'
import type {
  PerceptionContextSnapshot,
  TutorMode,
  TutorRequest,
  TutorResponse,
  UserProfile
} from '../../shared/perception.types'

export async function generateTutorResponse(request: TutorRequest): Promise<TutorResponse> {
  const startedAt = Date.now()

  try {
    const context = request.context ?? await getContextSnapshot()
    const mode = inferMode(request, context.userProfile)
    const uncertainty = context.semanticState.uncertainty
    const baseWarning = inferWarning(context)
    const needsVisualConfirmation = uncertainty >= 0.68 || context.semanticState.surface_type === 'unknown'
    const shouldAskConfirmation = needsVisualConfirmation || /\bisso\b|\besta tela\b|\baqui\b/i.test(request.prompt)
    const domainOutput = runDomainTutor({ request, context, mode })
    const relevantPersistentMemory = await retrieveRelevantMemories({
      query: buildPersistentMemoryQuery(request.prompt, context),
      limit: 4
    })
    const localContent = composeResponse({
      mode,
      context,
      shouldAskConfirmation,
      warning: domainOutput?.warning ?? baseWarning,
      domainBody: domainOutput?.content ?? null
    })
    const remoteResult = await generateRemoteText({
      sensitive: Boolean(domainOutput?.warning ?? baseWarning),
      system: buildRemoteSystemPrompt(mode, context, domainOutput?.warning ?? baseWarning),
      prompt: buildRemoteUserPrompt(
        request,
        context,
        domainOutput?.content ?? null,
        relevantPersistentMemory
      ),
      imageDataUrl: context.screenshotDataUrl ?? null
    })
    const content = remoteResult?.text?.trim() || localContent

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
        asksConfirmation: shouldAskConfirmation
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
      suggested_follow_ups: domainOutput?.suggested_follow_ups ?? buildFollowUps(mode, context),
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
