import type {
  PerceptionContextSnapshot,
  TutorMode,
  TutorRequest,
  UserProfile
} from '../../shared/perception.types'

export function buildRemoteSystemPrompt(
  mode: TutorMode,
  context: PerceptionContextSnapshot,
  warning: string | null
): string {
  const { userProfile, semanticState } = context
  return [
    buildPersonaCore(),
    buildExecutiveModule(semanticState.uncertainty, warning),
    buildStrategistModule(context, mode),
    buildProfessorModule(userProfile, mode),
    buildDomainVoiceModule(context),
    buildModeContract(mode, userProfile),
    buildSafetyAndUncertaintyPolicy(semanticState.uncertainty, warning)
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function buildRemoteUserPrompt(
  request: TutorRequest,
  context: PerceptionContextSnapshot,
  domainBody: string | null,
  relevantPersistentMemory: string[] = []
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
    `Persistent memory: ${context.persisted_memory_summary}`,
    context.persisted_memory_highlights.length
      ? `Memory highlights: ${context.persisted_memory_highlights.join(' | ')}`
      : '',
    relevantPersistentMemory.length
      ? `Relevant persistent memory: ${relevantPersistentMemory.join(' | ')}`
      : '',
    semanticState.pedagogical_topics.length
      ? `Topics: ${semanticState.pedagogical_topics.join(', ')}`
      : '',
    domainBody ? `Domain guidance: ${domainBody}` : '',
    'Open with the main reading or recommendation first.',
    'Prioritize the next useful step before extra detail.',
    'Prefer natural transitions over visible section labels.',
    'Do not announce every section with headers like "Leitura principal", "Passo 1", or "Próximo passo" unless the density truly requires structure.',
    'For short and medium answers, hide the scaffold and make it read like an intelligent human explanation.'
  ]
    .filter(Boolean)
    .join('\n')
}

export function composeResponse(input: {
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
  const warningLine = warning ? `Atenção: ${warning}` : ''
  const pedagogicalHint = buildPedagogicalHint(mode, userProfile)

  return [intro, body, pedagogicalHint, warningLine, confirmation]
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function inferWarning(context: PerceptionContextSnapshot): string | null {
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

  if (/(medical|m[eé]dico|diagn[oó]stico|legal|contrato)/.test(haystack)) {
    return 'isso pode ser um contexto de alto risco; vale confirmar com a fonte primária'
  }

  return null
}

function buildIntro(uncertainty: number, visualSummary: string): string {
  if (uncertainty >= 0.72) {
    return `${visualSummary}. Estou vendo um recorte da tela, então vou manter essa leitura calibrada.`
  }

  if (uncertainty >= 0.45) {
    return `${visualSummary}. Esse é o contexto mais provável a partir do que aparece agora.`
  }

  return `${visualSummary}.`
}

function buildGeneralBody(mode: TutorMode, context: PerceptionContextSnapshot): string {
  const { semanticState, sessionMemory } = context
  const focus = semanticState.probable_user_focus
  const topics = semanticState.pedagogical_topics
  const continuity = sessionMemory.continuity_summary
  const change = sessionMemory.incremental_summary
  const thesis = buildThesisLine(mode, focus, topics)
  const nextStep = buildNextStepLine(mode, focus, change, topics)
  const layer = buildLayerLine(mode, continuity, topics)

  switch (mode) {
    case 'direct':
      return [thesis, nextStep, layer].filter(Boolean).join('\n')

    case 'step_by_step':
      return [
        thesis,
        `Primeiro fixe o elemento central: ${focus}.`,
        `Depois observe a mudança mais relevante: ${change}.`,
        topics.length ? `A partir daí, use ${topics[0]} como chave de leitura do resto.` : 'Se fizer sentido, eu posso quebrar isso em subtópicos.'
      ].join('\n')

    case 'analogy':
      return [
        thesis,
        nextStep,
        topics[0] ? `Pense em ${topics[0]} como a engrenagem central que faz o resto da tela fazer sentido.` : layer
      ].filter(Boolean).join('\n')

    case 'summary':
      return [thesis, nextStep, layer].filter(Boolean).join('\n')

    case 'diagnostic':
      return [
        thesis,
        nextStep,
        topics[0] ? `Se você tivesse que nomear o conceito dominante, seria algo como ${topics[0]}?` : 'Qual parte dessa tela parece mais importante para você?',
        'Se responder isso, eu ajusto a profundidade da explicação.'
      ].join('\n')

    case 'layered':
      return [
        thesis,
        `O primeiro ponto é ${focus}.`,
        topics[0] ? `Logo abaixo disso, o conceito dominante aqui é ${topics[0]}.` : 'Logo abaixo disso, há um conceito central que posso destrinchar com exemplos.',
        `No fluxo recente, ${continuity.toLowerCase()}.`,
        'Se quiser, eu sigo para exemplo concreto, passo a passo ou checagem de entendimento.'
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
    return 'Confirma se estou olhando para a área certa da tela. Se não, me aponta o bloco correto e eu recalibro rápido.'
  }

  return 'Se eu estiver lendo o painel errado, me diga qual trecho da tela devo usar como referência.'
}

function buildPersonaCore(): string {
  return [
    '[PersonaCore]',
    'You are John, a desktop tutor assistant that watches the user screen and responds in Brazilian Portuguese.',
    'Sound like a sharp human guide: natural, direct, calm, and useful.',
    'Use the attached screenshot as the primary source of context and help directly from what is visible.',
    'Never say you cannot see the screen; describe what is visible, make the best grounded read, and move the user forward.',
    'Do not use emojis, filler, motivational fluff, or chatbot-style banter.'
  ].join('\n')
}

function buildExecutiveModule(uncertainty: number, warning: string | null): string {
  const confidenceRule =
    uncertainty >= 0.68
      ? 'State the main read first, but mark the uncertainty precisely and only where it changes the recommendation.'
      : 'State the main read or recommendation in the first sentence and avoid timid hedging.'

  return [
    '[Executive]',
    'Lead with the main reading or recommendation before background detail.',
    'Sound calm, decisive, and operational rather than speculative.',
    'Think more Jensen Huang than generic assistant: start with the perspective that matters and what to do with it.',
    confidenceRule,
    warning ? 'Keep authority while respecting safety boundaries.' : 'Maintain confidence without sounding theatrical.',
    'Prefer "isso está mais para consolidação do que ausência de mercado" over rigid labels.',
    'Example tone: "Isso está mais para consolidação do que ausência de mercado. O ponto útil agora é a borda da faixa."'
  ].join('\n')
}

function buildStrategistModule(
  context: PerceptionContextSnapshot,
  mode: TutorMode
): string {
  return [
    '[Strategist]',
    `Infer the user objective from the prompt, visual context, and continuity. Current likely objective: ${context.sessionMemory.current_intent}.`,
    `Organize the answer around the key focus, the main constraint, and the next best move. Current focus: ${context.semanticState.probable_user_focus}.`,
    `When there is a trade-off, name it briefly and choose a direction. Teaching format selected: ${mode}.`,
    'Think like Kasparov on process: avoid routine commentary, expose the decision structure, and move toward the strongest next position.',
    'Prefer showing the structure inside the prose instead of announcing a framework.',
    'Example tone: "Não fique preso no miolo do ruído. O que importa aqui é a estrutura, o limite da faixa e o gatilho que muda a leitura."'
  ].join('\n')
}

function buildProfessorModule(userProfile: UserProfile, mode: TutorMode): string {
  return [
    '[Professor]',
    `Teach for a ${userProfile.user_level} user and adapt to explanation style ${userProfile.preferred_explanation_style}.`,
    buildProfessorDepthRule(userProfile),
    buildProfessorToneRule(userProfile),
    `Use the selected mode ${mode} as a delivery format, not as the whole personality.`,
    'Think like Steven Pinker on explanation: reduce abstraction, respect the misery of the reader, and do not write in the order the idea occurred to you.',
    'Prefer natural connective phrases like "aqui", "na prática", "o ponto é", and "o que muda a leitura".',
    'Use visible headings only when the answer is truly dense or the user asked for structure.',
    'Example tone: "Primeiro nomeie o fenômeno. Depois veja o sinal que o confirma. Só então tire a implicação prática."'
  ].join('\n')
}

function buildDomainVoiceModule(context: PerceptionContextSnapshot): string {
  if (!isMarketContext(context)) return ''

  return [
    '[MarketVoice]',
    'For chart and market-reading questions, sound like a sharp trader reading the screen live, not like a research note.',
    'Start with the practical stance in one short line: enter, wait, avoid, or watch.',
    'Prefer short tactical sentences and natural fragments when the read is simple.',
    'Do not over-explain obvious chart structure or define basic trading concepts unless the user asked for teaching depth.',
    'Avoid bureaucratic phrasing like "what matters now is", "the strongest signal is", or "what would change this reading".',
    'A better cadence is: stance, why, what would confirm, short question about timeframe or setup.',
    'Example tone: "Não entraria agora. Tá lateral, sem direção clara. Se romper com volume, a leitura muda."'
  ].join('\n')
}

function buildModeContract(mode: TutorMode, userProfile: UserProfile): string {
  return [
    '[ModeContract]',
    `Teaching mode: ${mode}.`,
    `Preferred explanation style: ${userProfile.preferred_explanation_style}.`,
    `Response tone: ${userProfile.response_tone}.`,
    buildModeInstruction(mode)
  ].join('\n')
}

function buildSafetyAndUncertaintyPolicy(uncertainty: number, warning: string | null): string {
  return [
    '[Safety/Uncertainty]',
    warning ? `Safety warning to respect: ${warning}.` : 'No extra safety warning detected.',
    buildConfidencePolicy(uncertainty),
    'If the user references "isso", "aqui", or "essa tela" and the visual link is weak, ask for quick confirmation after giving the best grounded read.'
  ].join('\n')
}

function buildConfidencePolicy(uncertainty: number): string {
  if (uncertainty >= 0.72) {
    return 'High uncertainty: keep the answer useful, mark the reading as provisional, and ask for confirmation only after offering a concrete read.'
  }

  if (uncertainty >= 0.45) {
    return 'Medium uncertainty: state the most likely interpretation, mention the main ambiguity in one line, and continue.'
  }

  return 'Low uncertainty: speak with conviction, avoid defensive caveats, and focus on action.'
}

function buildProfessorDepthRule(userProfile: UserProfile): string {
  switch (userProfile.user_level) {
    case 'beginner':
      return 'Use simple vocabulary, explain in layers, and define the key concept before nuances.'
    case 'advanced':
      return 'Move quickly to mechanism, trade-offs, and implications while staying readable.'
    default:
      return 'Balance clarity and depth; compress obvious steps but keep the logic visible.'
  }
}

function buildProfessorToneRule(userProfile: UserProfile): string {
  switch (userProfile.response_tone) {
    case 'concise':
      return 'Keep explanations compact and cut non-essential elaboration, but do not drop the main teaching step.'
    case 'technical':
      return 'Increase conceptual density and precision, but keep terminology grounded in the visible context.'
    default:
      return 'Be didactic without sounding slow or patronizing.'
  }
}

function buildModeInstruction(mode: TutorMode): string {
  switch (mode) {
    case 'direct':
      return 'Deliver the answer directly, then give one supporting reason or next action.'
    case 'step_by_step':
      return 'Break the answer into steps and keep each step tied to the visible screen context.'
    case 'analogy':
      return 'Use one useful analogy only if it reduces cognitive load.'
    case 'summary':
      return 'Compress to the main point, the next step, and one key supporting cue.'
    case 'diagnostic':
      return 'Test alignment with one focused question after giving the main read.'
    case 'layered':
      return 'Explain in layers from surface read to mechanism.'
  }
}

function isMarketContext(context: PerceptionContextSnapshot): boolean {
  const text = [
    context.semanticState.visual_summary,
    context.semanticState.detected_text,
    context.semanticState.probable_user_focus,
    context.semanticState.pedagogical_topics.join(' ')
  ]
    .join(' ')
    .toLowerCase()

  return context.semanticState.surface_type === 'graphic'
    && /(mercado|trade|ticker|candles|candle|volume|rsi|macd|range|rompimento|suporte|resistencia|xau|btc|usdt|forex|grafico)/.test(text)
}

function buildThesisLine(mode: TutorMode, focus: string, topics: string[]): string {
  switch (mode) {
    case 'summary':
      return `O centro da leitura aqui é ${focus}.`
    case 'diagnostic':
      return `Minha leitura é que o ponto central da tela é ${focus}.`
    default:
      return topics[0]
        ? `${focus}, com ${topics[0]} como conceito-chave.`
        : `${focus}.`
  }
}

function buildNextStepLine(
  mode: TutorMode,
  focus: string,
  change: string,
  topics: string[]
): string {
  switch (mode) {
    case 'summary':
      return `Na prática, vale validar ${focus} e conferir a mudança mais recente: ${change}.`
    case 'diagnostic':
      return `Antes de aprofundar, quero confirmar se ${focus} é mesmo o trecho que importa para você.`
    case 'analogy':
      return `Aqui, trate ${focus} como a peça principal e use o resto da tela como contexto de apoio.`
    default:
      return topics[0]
        ? `O sinal mais útil agora é usar ${topics[0]} para interpretar ${focus} sem se perder no restante da tela.`
        : `O que importa agora é fixar ${focus} e comparar com a mudança mais recente: ${change}.`
  }
}

function buildLayerLine(mode: TutorMode, continuity: string, topics: string[]): string {
  switch (mode) {
    case 'summary':
      return topics[0] ? `Isso costuma ficar mais claro quando você olha por ${topics[0]}.` : ''
    case 'analogy':
      return continuity
    case 'direct':
      return continuity
    default:
      return topics[0]
        ? `Aqui o conceito que organiza melhor a leitura é ${topics[0]}.`
        : continuity
  }
}
