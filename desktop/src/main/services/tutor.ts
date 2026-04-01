import { getContextSnapshot } from './perception'
import type {
  PerceptionContextSnapshot,
  TutorMode,
  TutorRequest,
  TutorResponse,
  UserProfile
} from '../../shared/perception.types'

export async function generateTutorResponse(request: TutorRequest): Promise<TutorResponse> {
  const context = request.context ?? await getContextSnapshot()
  const mode = inferMode(request, context.userProfile)
  const uncertainty = context.semanticState.uncertainty
  const warning = inferWarning(context)
  const needsVisualConfirmation = uncertainty >= 0.68 || context.semanticState.surface_type === 'unknown'
  const shouldAskConfirmation = needsVisualConfirmation || /\bisso\b|\besta tela\b|\baqui\b/i.test(request.prompt)

  const content = composeResponse({
    mode,
    prompt: request.prompt,
    context,
    shouldAskConfirmation,
    warning
  })

  return {
    mode,
    content,
    uncertainty,
    should_ask_confirmation: shouldAskConfirmation,
    needs_visual_confirmation: needsVisualConfirmation,
    suggested_follow_ups: buildFollowUps(mode, context),
    warning
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

function composeResponse(input: {
  mode: TutorMode
  prompt: string
  context: PerceptionContextSnapshot
  shouldAskConfirmation: boolean
  warning: string | null
}): string {
  const { mode, context, shouldAskConfirmation, warning } = input
  const { semanticState, userProfile } = context

  const intro = buildIntro(semanticState.uncertainty, semanticState.visual_summary)
  const body = buildBody(mode, context)
  const confirmation = shouldAskConfirmation
    ? buildConfirmationLine(semanticState.uncertainty)
    : ''
  const warningLine = warning ? `Atenção: ${warning}` : ''
  const pedagogicalHint = buildPedagogicalHint(mode, userProfile)

  return [intro, body, pedagogicalHint, warningLine, confirmation]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildIntro(uncertainty: number, visualSummary: string): string {
  if (uncertainty >= 0.72) {
    return `Leitura provisória da tela: ${visualSummary}. Posso estar vendo só parte do contexto.`
  }

  if (uncertainty >= 0.45) {
    return `Pelo que aparece na tela, o contexto mais provável é: ${visualSummary}.`
  }

  return `O que a tela sugere neste momento é: ${visualSummary}.`
}

function buildBody(mode: TutorMode, context: PerceptionContextSnapshot): string {
  const { semanticState, sessionMemory } = context
  const focus = semanticState.probable_user_focus
  const topics = semanticState.pedagogical_topics
  const continuity = sessionMemory.continuity_summary
  const change = sessionMemory.incremental_summary

  switch (mode) {
    case 'direct':
      return [
        `Em termos diretos, o foco parece ser ${focus}.`,
        topics[0] ? `O conceito principal aqui é ${topics[0]}.` : '',
        `Continuidade recente: ${continuity}`
      ].filter(Boolean).join('\n')

    case 'step_by_step':
      return [
        'Vamos por partes:',
        `1. Primeiro identifique o elemento central: ${focus}.`,
        `2. Depois observe a mudança mais recente: ${change}`,
        topics.length ? `3. Os tópicos que valem estudar agora são: ${topics.join(', ')}.` : '3. Se quiser, eu quebro isso em subtópicos.'
      ].join('\n')

    case 'analogy':
      return [
        `Pense nisso como um professor apontando para o quadro e dizendo "olhe primeiro para ${focus}" antes de entrar nos detalhes.`,
        continuity,
        topics[0] ? `A analogia útil aqui é tratar ${topics[0]} como a chave de leitura do resto.` : ''
      ].filter(Boolean).join('\n')

    case 'summary':
      return [
        `Resumo curto: ${focus}.`,
        `Mudança recente: ${change}`,
        topics.length ? `Assuntos relacionados: ${topics.join(', ')}.` : ''
      ].filter(Boolean).join('\n')

    case 'diagnostic':
      return [
        `Antes de eu explicar demais, quero testar se estamos olhando para a mesma coisa: ${focus}.`,
        topics[0] ? `Se você tivesse que nomear o conceito dominante, seria algo como ${topics[0]}?` : 'Qual parte dessa tela parece mais importante para você?',
        'Se responder isso, eu ajusto a profundidade da explicação.'
      ].join('\n')

    case 'layered':
      return [
        `Camada 1: a tela aponta para ${focus}.`,
        topics[0] ? `Camada 2: o conceito pedagógico dominante parece ser ${topics[0]}.` : 'Camada 2: há um conceito central que posso destrinchar com exemplos.',
        `Camada 3: no fluxo recente, ${continuity.toLowerCase()}`,
        'Se quiser, a próxima camada pode ser exemplo concreto, passo a passo ou checagem de entendimento.'
      ].join('\n')
  }
}

function buildPedagogicalHint(mode: TutorMode, profile: UserProfile): string {
  if (mode === 'diagnostic') return 'Responda em uma frase e eu calibro a explicação.'
  if (profile.user_level === 'beginner') return 'Vou priorizar vocabulário simples e progressão do básico para o detalhe.'
  if (profile.user_level === 'advanced') return 'Posso ir direto para nuances, tradeoffs e implicações.'
  return 'Posso ajustar para mais síntese ou mais profundidade conforme o próximo passo.'
}

function buildConfirmationLine(uncertainty: number): string {
  if (uncertainty >= 0.72) {
    return 'Confirma se você está olhando exatamente para essa área da tela. Se não, descreva o bloco visível e eu recalibro.'
  }

  return 'Se eu estiver mirando a área errada, me diga qual painel ou trecho da tela devo usar como referência.'
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
    return 'parece haver informação sensível; vou evitar assumir ou repetir dados privados'
  }

  if (/(bank|banco|cart[aã]o|saldo|pix|conta)/.test(haystack)) {
    return 'isso pode envolver contexto financeiro; trate a leitura como apoio, não como instrução operacional'
  }

  if (/(medical|m[ée]dico|diagn[oó]stico|legal|contrato)/.test(haystack)) {
    return 'isso pode ser um contexto de alto risco; vale confirmar com a fonte primária'
  }

  return null
}
