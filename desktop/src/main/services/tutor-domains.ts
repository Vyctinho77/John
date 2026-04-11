import type {
  PerceptionContextSnapshot,
  TutorDomain,
  TutorMode,
  TutorRequest
} from '../../shared/perception.types'

export interface DomainTutorInput {
  request: TutorRequest
  context: PerceptionContextSnapshot
  mode: TutorMode
}

export interface DomainTutorOutput {
  domain: TutorDomain
  content: string
  suggested_follow_ups?: string[]
  warning?: string | null
}

export function resolveTutorDomain(input: DomainTutorInput): TutorDomain {
  const prompt = input.request.prompt.toLowerCase()
  const surface = input.context.semanticState.surface_type
  const topics = input.context.semanticState.pedagogical_topics.join(' ').toLowerCase()
  const allText = [
    input.context.semanticState.detected_text,
    input.context.semanticState.visual_summary,
    topics,
    prompt
  ].join(' ').toLowerCase()

  if (surface === 'code') return 'code'
  if (surface === 'dashboard') return 'dashboard'
  if (surface === 'graphic') return /(mercado|trade|ticker|rsi|macd|candles|ema)/.test(allText) ? 'market' : 'dashboard'
  if (surface === 'document') return 'document'
  if (/(exercicio|li[cç][aã]o|tarefa|dever|quest[aã]o|resposta da prova|gabarito)/.test(allText)) return 'homework'
  if (surface === 'text') return 'reading'
  return 'general'
}

export function runDomainTutor(input: DomainTutorInput): DomainTutorOutput | null {
  const domain = resolveTutorDomain(input)

  switch (domain) {
    case 'code':
      return buildCodeTutor(input)
    case 'market':
      return buildMarketTutor(input)
    case 'document':
      return buildDocumentTutor(input)
    case 'dashboard':
      return buildDashboardTutor(input)
    case 'homework':
      return buildHomeworkTutor(input)
    case 'reading':
      return buildReadingTutor(input)
    default:
      return null
  }
}

function buildCodeTutor(input: DomainTutorInput): DomainTutorOutput {
  const { semanticState, sessionMemory } = input.context
  const cc = semanticState.code_context

  // Build rich context lines from vision data when available
  const contextParts: string[] = []

  if (cc) {
    if (cc.file_path || cc.file_name) {
      contextParts.push(`Arquivo ativo: ${cc.file_path || cc.file_name}`)
    }
    if (cc.language) contextParts.push(`Linguagem: ${cc.language}`)
    if (cc.active_function) contextParts.push(`Escopo visível: ${cc.active_function}`)
    if (cc.visible_line_range) contextParts.push(`Linhas: ${cc.visible_line_range}`)

    if (cc.errors.length) {
      contextParts.push(`Erros visíveis: ${cc.errors.map(e => {
        const loc = e.line != null ? `linha ${e.line}: ` : ''
        return `[${e.severity}] ${loc}${e.message}`
      }).join(' | ')}`)
    }

    if (cc.terminal_output) {
      contextParts.push(`Terminal: ${cc.terminal_output}`)
    }

    if (cc.cursor_area) {
      contextParts.push(`Cursor em: ${cc.cursor_area}`)
    }
  }

  // Fallback to basic context if no vision code_context
  if (!contextParts.length) {
    const cue = semanticState.detected_text || semanticState.probable_user_focus
    contextParts.push(`Foco visível: ${cue}`)
  }

  contextParts.push(`Mudança recente: ${sessionMemory.incremental_summary}`)

  const body = contextParts.join('\n')

  // Smarter follow-ups based on what's visible
  const followUps: string[] = []
  if (cc?.errors.length) followUps.push('Explica esse erro')
  if (cc?.active_function) followUps.push(`O que ${cc.active_function} faz?`)
  if (cc?.terminal_output) followUps.push('O que o terminal tá dizendo?')
  followUps.push('Explica o fluxo')
  if (followUps.length < 4) followUps.push('Resume o trecho')
  if (followUps.length < 4) followUps.push('Mostra tradeoffs')

  return {
    domain: 'code',
    content: body,
    suggested_follow_ups: followUps.slice(0, 4)
  }
}

function buildMarketTutor(input: DomainTutorInput): DomainTutorOutput {
  const { semanticState, sessionMemory } = input.context

  return {
    domain: 'market',
    content: [
      'Trate isso como leitura de tela e contexto, não como chamada automática de compra ou venda.',
      `O trecho central do gráfico parece ser ${semanticState.probable_user_focus}.`,
      `Mudança recente no viewport: ${sessionMemory.incremental_summary}.`,
      'Se a leitura for simples, prefira responder como trader lendo o gráfico ao vivo: posição prática, motivo, gatilho que mudaria a leitura e pergunta curta sobre horizonte.'
    ].join('\n'),
    suggested_follow_ups: ['Explica o gráfico', 'O que você faria aqui?', 'Qual nível importa?', 'Resume a leitura'],
    warning: 'contexto de mercado deve ser tratado como estudo, não como sinal de compra ou venda'
  }
}

function buildDocumentTutor(input: DomainTutorInput): DomainTutorOutput {
  const { semanticState, sessionMemory } = input.context

  return {
    domain: 'document',
    content: input.mode === 'summary'
      ? [
          `Resumo do documento: ${semanticState.probable_user_focus}.`,
          `Continuidade de leitura: ${sessionMemory.continuity_summary}`,
          semanticState.pedagogical_topics.length
            ? `Temas centrais: ${semanticState.pedagogical_topics.join(', ')}.`
            : 'Se quiser, eu separo em ideia principal, argumentos e implicações.'
        ].join('\n')
      : [
          `Isso parece um documento mais longo com foco em ${semanticState.probable_user_focus}.`,
          'Eu posso organizar a explicação por tese principal, argumentos de apoio e termos importantes.',
          `O resumo incremental da sessão diz: ${sessionMemory.incremental_summary}`
        ].join('\n'),
    suggested_follow_ups: ['Resume o documento', 'Extrai a tese principal', 'Lista os argumentos', 'Explica os termos']
  }
}

function buildDashboardTutor(input: DomainTutorInput): DomainTutorOutput {
  const { semanticState, sessionMemory } = input.context

  return {
    domain: 'dashboard',
    content: [
      `Isso parece um painel de métricas com foco em ${semanticState.probable_user_focus}.`,
      `Mudança mais relevante observada: ${sessionMemory.incremental_summary}`,
      semanticState.pedagogical_topics.length
        ? `As lentes de leitura mais úteis aqui são ${semanticState.pedagogical_topics.join(', ')}.`
        : 'Posso explicar hierarquia de métricas, comparações e relações entre painéis.'
    ].join('\n'),
    suggested_follow_ups: ['Explica as métricas', 'O que mudou?', 'Quais números importam?', 'Resume o dashboard']
  }
}

function buildHomeworkTutor(input: DomainTutorInput): DomainTutorOutput {
  const { semanticState } = input.context

  return {
    domain: 'homework',
    content: [
      `Vou tratar isso como apoio de estudo, nao como atalho para cola pronta.`,
      `A parte central parece ser ${semanticState.probable_user_focus}.`,
      'Posso ajudar decompondo a questão, sugerindo como pensar e checando seu raciocínio antes da resposta final.'
    ].join('\n'),
    suggested_follow_ups: ['Quebra a questão', 'Me guia sem dar a resposta', 'Faz uma pergunta diagnóstica', 'Confere meu raciocínio'],
    warning: 'em contexto escolar, o foco será orientar o raciocínio em vez de entregar a resposta pronta'
  }
}

function buildReadingTutor(input: DomainTutorInput): DomainTutorOutput {
  const { semanticState, sessionMemory } = input.context

  return {
    domain: 'reading',
    content: [
      `Isso parece leitura textual com foco em ${semanticState.probable_user_focus}.`,
      `Fluxo recente da leitura: ${sessionMemory.continuity_summary}`,
      semanticState.pedagogical_topics.length
        ? `Os conceitos de leitura mais prováveis são ${semanticState.pedagogical_topics.join(', ')}.`
        : 'Posso resumir, explicar termos e testar compreensão.'
    ].join('\n'),
    suggested_follow_ups: ['Resume o texto', 'Explica os termos', 'Faz perguntas de compreensão', 'Simplifica a linguagem']
  }
}
