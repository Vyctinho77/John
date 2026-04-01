import { getContextSnapshot } from './perception'
import { runDomainTutor } from './tutor-domains'
import { recordDiagnosticEvent, recordPerformanceTrace } from './observability'
import { generateRemoteText } from './ai-provider'
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
      prompt: buildRemoteUserPrompt(request, context, domainOutput?.content ?? null),
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

function buildRemoteSystemPrompt(
  mode: TutorMode,
  context: PerceptionContextSnapshot,
  warning: string | null
): string {
  const { userProfile } = context
  return [
    'You are John, a desktop tutor assistant that watches the user\'s screen.',
    'A screenshot of the user\'s current screen is attached — use it as your primary source of context.',
    'Respond in Portuguese (pt-BR). Be concise and practical.',
    `Teaching mode: ${mode}.`,
    `User level: ${userProfile.user_level}.`,
    `Preferred explanation style: ${userProfile.preferred_explanation_style}.`,
    warning ? `Safety warning to respect: ${warning}.` : '',
    'Never say you cannot see the screen — describe what is visible and help directly.',
    'Do not add emojis or unnecessary formatting. Answer as a focused tutor, not a chatbot.'
  ]
    .filter(Boolean)
    .join(' ')
}

function buildRemoteUserPrompt(
  request: TutorRequest,
  context: PerceptionContextSnapshot,
  domainBody: string | null
): string {
  const { semanticState, sessionMemory } = context
  return [
    `User request: ${request.prompt}`,
    `Screen summary: ${semanticState.visual_summary}`,
    `Detected text: ${semanticState.detected_text || 'none'}`,
    `Surface type: ${semanticState.surface_type}`,
    `Probable focus: ${semanticState.probable_user_focus}`,
    `Current intent: ${sessionMemory.current_intent}`,
    `Continuity summary: ${sessionMemory.continuity_summary}`,
    semanticState.pedagogical_topics.length
      ? `Topics: ${semanticState.pedagogical_topics.join(', ')}`
      : '',
    domainBody ? `Domain guidance: ${domainBody}` : '',
    'Answer as a tutor, not just a chatbot.'
  ]
    .filter(Boolean)
    .join('\n')
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

function composeResponse(input: {
  mode: TutorMode
  context: PerceptionContextSnapshot
  shouldAskConfirmation: boolean
  warning: string | null
  domainBody: string | null
}): string {
  const { mode, context, shouldAskConfirmation, warning, domainBody } = input
  const { semanticState, userProfile } = context

  const intro = buildIntro(semanticState.uncertainty, semanticState.visual_summary)
  const body = domainBody ?? buildGeneralBody(mode, context)
  const confirmation = shouldAskConfirmation
    ? buildConfirmationLine(semanticState.uncertainty)
    : ''
  const warningLine = warning ? `Atencao: ${warning}` : ''
  const pedagogicalHint = buildPedagogicalHint(mode, userProfile)

  return [intro, body, pedagogicalHint, warningLine, confirmation]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildIntro(uncertainty: number, visualSummary: string): string {
  if (uncertainty >= 0.72) {
    return `Leitura provisoria da tela: ${visualSummary}. Posso estar vendo so parte do contexto.`
  }

  if (uncertainty >= 0.45) {
    return `Pelo que aparece na tela, o contexto mais provavel e: ${visualSummary}.`
  }

  return `O que a tela sugere neste momento e: ${visualSummary}.`
}

function buildGeneralBody(mode: TutorMode, context: PerceptionContextSnapshot): string {
  const { semanticState, sessionMemory } = context
  const focus = semanticState.probable_user_focus
  const topics = semanticState.pedagogical_topics
  const continuity = sessionMemory.continuity_summary
  const change = sessionMemory.incremental_summary

  switch (mode) {
    case 'direct':
      return [
        `Em termos diretos, o foco parece ser ${focus}.`,
        topics[0] ? `O conceito principal aqui e ${topics[0]}.` : '',
        `Continuidade recente: ${continuity}`
      ].filter(Boolean).join('\n')

    case 'step_by_step':
      return [
        'Vamos por partes:',
        `1. Primeiro identifique o elemento central: ${focus}.`,
        `2. Depois observe a mudanca mais recente: ${change}`,
        topics.length ? `3. Os topicos que valem estudar agora sao: ${topics.join(', ')}.` : '3. Se quiser, eu quebro isso em subtopicos.'
      ].join('\n')

    case 'analogy':
      return [
        `Pense nisso como um professor apontando para o quadro e dizendo "olhe primeiro para ${focus}" antes de entrar nos detalhes.`,
        continuity,
        topics[0] ? `A analogia util aqui e tratar ${topics[0]} como a chave de leitura do resto.` : ''
      ].filter(Boolean).join('\n')

    case 'summary':
      return [
        `Resumo curto: ${focus}.`,
        `Mudanca recente: ${change}`,
        topics.length ? `Assuntos relacionados: ${topics.join(', ')}.` : ''
      ].filter(Boolean).join('\n')

    case 'diagnostic':
      return [
        `Antes de eu explicar demais, quero testar se estamos olhando para a mesma coisa: ${focus}.`,
        topics[0] ? `Se voce tivesse que nomear o conceito dominante, seria algo como ${topics[0]}?` : 'Qual parte dessa tela parece mais importante para voce?',
        'Se responder isso, eu ajusto a profundidade da explicacao.'
      ].join('\n')

    case 'layered':
      return [
        `Camada 1: a tela aponta para ${focus}.`,
        topics[0] ? `Camada 2: o conceito pedagogico dominante parece ser ${topics[0]}.` : 'Camada 2: ha um conceito central que posso destrinchar com exemplos.',
        `Camada 3: no fluxo recente, ${continuity.toLowerCase()}`,
        'Se quiser, a proxima camada pode ser exemplo concreto, passo a passo ou checagem de entendimento.'
      ].join('\n')
  }
}

function buildPedagogicalHint(mode: TutorMode, profile: UserProfile): string {
  if (mode === 'diagnostic') return 'Responda em uma frase e eu calibro a explicacao.'
  if (profile.user_level === 'beginner') return 'Vou priorizar vocabulario simples e progressao do basico para o detalhe.'
  if (profile.user_level === 'advanced') return 'Posso ir direto para nuances, tradeoffs e implicacoes.'
  return 'Posso ajustar para mais sintese ou mais profundidade conforme o proximo passo.'
}

function buildConfirmationLine(uncertainty: number): string {
  if (uncertainty >= 0.72) {
    return 'Confirma se voce esta olhando exatamente para essa area da tela. Se nao, descreva o bloco visivel e eu recalibro.'
  }

  return 'Se eu estiver mirando a area errada, me diga qual painel ou trecho da tela devo usar como referencia.'
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

function inferWarning(context: PerceptionContextSnapshot): string | null {
  const haystack = [
    context.semanticState.detected_text,
    context.semanticState.visual_summary,
    context.sessionMemory.topic_candidates.join(' ')
  ].join(' ').toLowerCase()

  if (/(senha|password|token|2fa|otp|credencial)/.test(haystack)) {
    return 'parece haver informacao sensivel; vou evitar assumir ou repetir dados privados'
  }

  if (/(bank|banco|cart[aã]o|saldo|pix|conta)/.test(haystack)) {
    return 'isso pode envolver contexto financeiro; trate a leitura como apoio, nao como instrucao operacional'
  }

  if (/(medical|m[eé]dico|diagn[oó]stico|legal|contrato)/.test(haystack)) {
    return 'isso pode ser um contexto de alto risco; vale confirmar com a fonte primaria'
  }

  return null
}
