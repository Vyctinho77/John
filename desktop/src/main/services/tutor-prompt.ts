import type {
  CodeContext,
  PerceptionContextSnapshot,
  TutorMode,
  TutorRequest,
  UserProfile
} from '../../shared/perception.types'

export function buildRemoteSystemPrompt(
  mode: TutorMode,
  context: PerceptionContextSnapshot,
  warning: string | null,
  offScreen = false
): string {
  const { userProfile, semanticState } = context
  return joinPromptBlocks([
    buildPromptBlock('STATIC_CORE', [
      buildPersonaCore(offScreen),
      buildExecutiveModule(semanticState.uncertainty, warning),
      buildProfessorModule(userProfile, mode),
      buildModeContract(mode, userProfile),
      buildSafetyAndUncertaintyPolicy(semanticState.uncertainty, warning)
    ]),
    buildPromptBlock('DYNAMIC_CONTEXT', [
      buildStrategistModule(context, mode, offScreen),
      buildGlobalIntentModule(context),
      buildDomainVoiceModule(context),
      buildCodeVoiceModule(context)
    ])
  ])
}

function buildPromptBlock(label: string, lines: Array<string | undefined>): string {
  const content = lines.filter(Boolean).join('\n')
  if (!content) return ''
  return `[${label}]\n${content}`
}

function joinPromptBlocks(blocks: Array<string | undefined>): string {
  return blocks.filter(Boolean).join('\n\n')
}

export function buildRemoteUserPrompt(
  request: TutorRequest,
  context: PerceptionContextSnapshot,
  domainBody: string | null,
  relevantPersistentMemory: string[] = [],
  offScreen = false,
  vsCodeContext?: string,
  spotifyContext?: string,
  tradingViewContext?: string,
  newsContext?: string,
  calendarContext?: string,
  analysisContext?: string
): string {
  const { semanticState, sessionMemory } = context
  const keyValuesLine = formatKeyValues(semanticState.key_values)
  const codeContextBlock = formatCodeContext(semanticState.code_context)
  const uiElements = semanticState.ui_elements ?? []
  return joinPromptBlocks([
    buildPromptBlock('REQUEST', [
      offScreen
        ? '[OFF-SCREEN QUESTION: the user is asking about a topic not currently visible on screen. Answer directly as a knowledgeable tutor. Use screen context only if genuinely relevant â€” do not force a connection.]'
        : '',
      `User request: ${request.prompt}`
    ]),
    buildPromptBlock('SCREEN_CONTEXT', [
      `Screen summary: ${semanticState.visual_summary}`,
      `Detected text: ${semanticState.detected_text || 'none'}`,
      `Surface type: ${semanticState.surface_type}`,
      `Probable focus: ${semanticState.probable_user_focus}`,
      semanticState.visual_context
        ? `Visual context: ${semanticState.visual_context}`
        : '',
      semanticState.app_identifier
        ? `Application: ${semanticState.app_identifier}`
        : '',
      keyValuesLine
        ? `Extracted values from screen: ${keyValuesLine}`
        : '',
      codeContextBlock,
      uiElements.length
        ? `UI elements visible: ${uiElements.join(', ')}`
        : '',
      semanticState.emotional_signal
        ? `User emotional signal: ${semanticState.emotional_signal}`
        : ''
    ]),
    buildPromptBlock('SESSION_CONTEXT', [
      `Global intent mode: ${context.globalIntent.mode}`,
      `Global intent confidence: ${context.globalIntent.confidence.toFixed(2)}`,
      `Global intent guidance: ${buildGlobalIntentInstruction(context.globalIntent.mode)}`,
      context.globalIntent.reason
        ? `Global intent reason: ${context.globalIntent.reason}`
        : '',
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
        : ''
    ]),
    buildPromptBlock('CONNECTORS', [
      vsCodeContext ?? '',
      spotifyContext ?? '',
      tradingViewContext ?? '',
      newsContext ?? '',
      calendarContext ?? '',
      analysisContext ?? ''
    ]),
    buildPromptBlock('RESPONSE_CONTRACT', [
      domainBody ? `Domain guidance: ${domainBody}` : '',
      'Open with the main reading or recommendation first.',
      'Prioritize the next useful step before extra detail.',
      'Prefer natural transitions over visible section labels.',
      'Do not announce every section with headers like "Leitura principal", "Passo 1", or "PrÃ³ximo passo" unless the density truly requires structure.',
      'For short and medium answers, hide the scaffold and make it read like an intelligent human explanation.',
      keyValuesLine
        ? 'IMPORTANT: Use ONLY the "Extracted values from screen" for any numbers, prices, metrics, or measurements. Do NOT invent, round, or guess numerical values. If a value is not in the extracted data, say you cannot read it clearly.'
        : ''
    ])
  ])
  return [
    offScreen
      ? '[OFF-SCREEN QUESTION: the user is asking about a topic not currently visible on screen. Answer directly as a knowledgeable tutor. Use screen context only if genuinely relevant — do not force a connection.]'
      : '',
    `User request: ${request.prompt}`,
    `Screen summary: ${semanticState.visual_summary}`,
    `Detected text: ${semanticState.detected_text || 'none'}`,
    `Surface type: ${semanticState.surface_type}`,
    `Probable focus: ${semanticState.probable_user_focus}`,
    semanticState.visual_context
      ? `Visual context: ${semanticState.visual_context}`
      : '',
    semanticState.app_identifier
      ? `Application: ${semanticState.app_identifier}`
      : '',
    keyValuesLine
      ? `Extracted values from screen: ${keyValuesLine}`
      : '',
    codeContextBlock,
    uiElements.length
      ? `UI elements visible: ${uiElements.join(', ')}`
      : '',
    semanticState.emotional_signal
      ? `User emotional signal: ${semanticState.emotional_signal}`
      : '',
    `Global intent mode: ${context.globalIntent.mode}`,
    `Global intent confidence: ${context.globalIntent.confidence.toFixed(2)}`,
    `Global intent guidance: ${buildGlobalIntentInstruction(context.globalIntent.mode)}`,
    context.globalIntent.reason
      ? `Global intent reason: ${context.globalIntent.reason}`
      : '',
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
    vsCodeContext ?? '',
    spotifyContext ?? '',
    tradingViewContext ?? '',
    newsContext ?? '',
    calendarContext ?? '',
    analysisContext ?? '',
    domainBody ? `Domain guidance: ${domainBody}` : '',
    'Open with the main reading or recommendation first.',
    'Prioritize the next useful step before extra detail.',
    'Prefer natural transitions over visible section labels.',
    'Do not announce every section with headers like "Leitura principal", "Passo 1", or "Próximo passo" unless the density truly requires structure.',
    'For short and medium answers, hide the scaffold and make it read like an intelligent human explanation.',
    keyValuesLine
      ? 'IMPORTANT: Use ONLY the "Extracted values from screen" for any numbers, prices, metrics, or measurements. Do NOT invent, round, or guess numerical values. If a value is not in the extracted data, say you cannot read it clearly.'
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export function formatVSCodeConnectorContext(data: unknown): string {
  if (!data || typeof data !== 'object') return ''

  const { editor, diagnostics, git, terminal } = data as {
    editor: {
      filename: string
      filepath: string
      language: string
      cursorLine: number
      selectedText: string | null
      visibleRange: { start: number; end: number }
      surroundingCode: string
    } | null
    diagnostics: {
      hasErrors: boolean
      errorCount: number
      items: Array<{ message: string; severity: number; line: number; source?: string }>
    } | null
    git: {
      branch?: string
      ahead: number
      behind: number
      changedFiles: number
      stagedFiles: number
    } | null
    terminal: {
      lastOutput: string
      activeTerminalName: string | null
    } | null
  }

  const lines: string[] = ['--- VS Code (live connector) ---']

  if (editor) {
    lines.push(`File: ${editor.filepath || editor.filename}`)
    lines.push(`Language: ${editor.language}`)
    lines.push(`Cursor: line ${editor.cursorLine}  |  visible: ${editor.visibleRange.start}–${editor.visibleRange.end}`)
    if (editor.selectedText) lines.push(`Selection: ${editor.selectedText.slice(0, 300)}`)
  }

  if (git) {
    const changes = `${git.changedFiles} changed, ${git.stagedFiles} staged`
    const sync = git.ahead || git.behind ? ` (↑${git.ahead} ↓${git.behind})` : ''
    lines.push(`Git: ${git.branch ?? 'unknown'}${sync} — ${changes}`)
  }

  if (diagnostics?.hasErrors) {
    lines.push(`Errors (${diagnostics.errorCount}):`)
    for (const item of diagnostics.items.filter(i => i.severity === 0).slice(0, 5)) {
      lines.push(`  [error] line ${item.line}: ${item.message}`)
    }
  }

  if (editor?.surroundingCode) {
    lines.push(`Code around cursor (±20 lines):`)
    lines.push('```' + editor.language)
    lines.push(editor.surroundingCode.slice(0, 2000))
    lines.push('```')
  }

  if (terminal?.lastOutput?.trim()) {
    const name = terminal.activeTerminalName ? ` (${terminal.activeTerminalName})` : ''
    lines.push(`Terminal${name}:`)
    lines.push('```')
    lines.push(terminal.lastOutput.trim().slice(-1500))
    lines.push('```')
  }

  lines.push('--- End VS Code context ---')
  return lines.join('\n')
}

function formatKeyValues(keyValues?: Record<string, string>): string {
  if (!keyValues) return ''
  const entries = Object.entries(keyValues)
  if (!entries.length) return ''
  return entries.map(([k, v]) => `${k}=${v}`).join(', ')
}

function formatCodeContext(codeContext?: CodeContext | null): string {
  if (!codeContext) return ''
  const lines: string[] = []
  lines.push('--- Code Context ---')

  if (codeContext.file_name) {
    const fileLine = codeContext.file_path
      ? `File: ${codeContext.file_path}`
      : `File: ${codeContext.file_name}`
    lines.push(fileLine)
  }
  if (codeContext.language) lines.push(`Language: ${codeContext.language}`)
  if (codeContext.visible_line_range) lines.push(`Visible lines: ${codeContext.visible_line_range}`)
  if (codeContext.active_function) lines.push(`Active function/scope: ${codeContext.active_function}`)
  if (codeContext.cursor_area) lines.push(`Cursor/selection: ${codeContext.cursor_area}`)
  if (codeContext.open_tabs.length) lines.push(`Open tabs: ${codeContext.open_tabs.join(', ')}`)
  if (codeContext.git_indicators) lines.push(`Git: ${codeContext.git_indicators}`)

  if (codeContext.errors.length) {
    lines.push('Errors/warnings:')
    for (const err of codeContext.errors) {
      const loc = err.line != null ? ` (line ${err.line})` : ''
      lines.push(`  [${err.severity}]${loc} ${err.message}`)
    }
  }

  if (codeContext.terminal_output) {
    lines.push(`Terminal: ${codeContext.terminal_output}`)
  }

  lines.push('--- End Code Context ---')
  return lines.join('\n')
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

function buildPersonaCore(offScreen = false): string {
  const screenRule = offScreen
    ? 'The user is asking about a topic unrelated to the current screen. Answer it fully as a knowledgeable tutor — screen context is available as background, not as a constraint. Never refuse or redirect to the screen when the question stands on its own.'
    : 'Use the attached screenshot as the primary source of context and help directly from what is visible. Never say you cannot see the screen; describe what is visible, make the best grounded read, and move the user forward.'

  return [
    '[PersonaCore]',
    'You are John, a desktop tutor assistant that watches the user screen and responds in Brazilian Portuguese.',
    'You are PRESENT with the user — you are looking at the same screen, at the same time. Talk like it.',
    screenRule,
    '',
    'VOICE:',
    '- Sound like a sharp human sitting next to the user, not like an article or report.',
    '- Use short lines. One idea per line. Break often.',
    '- Use presence words: "olha", "isso aqui", "agora", "aqui".',
    '- Do NOT narrate or describe what the user already sees ("Veja o que aparece na tela", "O que temos aqui é").',
    '- Do NOT use emojis, filler, motivational fluff, or chatbot-style banter.',
    '- When warning about consequences, address the user directly: "se você fizer X, Y acontece".',
    '',
    'GROUNDING RULE: When citing numbers, prices, percentages, or any measurable value, use ONLY values from the "Extracted values from screen" field or that you can clearly read in the screenshot. Never fabricate, approximate, or hallucinate numerical data. If you cannot read a value clearly, say so explicitly rather than guessing.'
  ].join('\n')
}

function buildExecutiveModule(uncertainty: number, warning: string | null): string {
  const confidenceRule =
    uncertainty >= 0.68
      ? 'Start with your best read, then flag where you are unsure — but only where it changes the recommendation.'
      : 'Start with the answer. No hedging, no preamble.'

  return [
    '[Executive]',
    'First line = the answer or stance. Always.',
    'Then the reasoning in short punchy lines, not paragraphs.',
    confidenceRule,
    warning ? 'Stay direct while respecting safety boundaries.' : '',
    'Do NOT write formal topic sentences ("O ponto útil agora é", "O que importa aqui é", "O movimento útil seria").',
    'Instead, just say the thing: "não tem suporte claro" beats "O que podemos observar é a ausência de suporte".'
  ].join('\n')
}

function buildStrategistModule(
  context: PerceptionContextSnapshot,
  mode: TutorMode,
  offScreen = false
): string {
  const contextLine = offScreen
    ? 'The user is asking something off-screen — answer based on your knowledge, not on what is currently visible.'
    : `Current focus: ${context.semanticState.probable_user_focus}.`

  return [
    '[Strategist]',
    `User likely objective: ${context.sessionMemory.current_intent}.`,
    contextLine,
    `Teaching format: ${mode}.`,
    'Structure: key point → why → what to do about it. Keep this structure invisible — no headers, no labels, just flow.',
    'When there is a trade-off, name it and pick a side. Don\'t sit on the fence.',
    'Never use meta-commentary about structure ("O que importa aqui é", "O ponto central é"). Just say the thing directly.'
  ].join('\n')
}

function buildProfessorModule(userProfile: UserProfile, mode: TutorMode): string {
  return [
    '[Professor]',
    `Teach for a ${userProfile.user_level} user and adapt to explanation style ${userProfile.preferred_explanation_style}.`,
    buildProfessorDepthRule(userProfile),
    buildProfessorToneRule(userProfile),
    buildDepthCalibrationNote(userProfile),
    `Use the selected mode ${mode} as a delivery format, not as the whole personality.`,
    'Think like Steven Pinker on explanation: reduce abstraction, respect the misery of the reader, and do not write in the order the idea occurred to you.',
    'Prefer natural connective phrases like "aqui", "na prática", "o ponto é", and "o que muda a leitura".',
    'Use visible headings only when the answer is truly dense or the user asked for structure.',
    'Example tone: "Primeiro nomeie o fenômeno. Depois veja o sinal que o confirma. Só então tire a implicação prática."'
  ].filter(Boolean).join('\n')
}

function buildGlobalIntentModule(context: PerceptionContextSnapshot): string {
  return [
    '[GlobalIntent]',
    `Current global mode: ${context.globalIntent.mode}.`,
    `Confidence: ${context.globalIntent.confidence.toFixed(2)}.`,
    `Stability: ${context.globalIntent.stabilityState}.`,
    `Behavior instruction: ${buildGlobalIntentInstruction(context.globalIntent.mode)}`,
    context.globalIntent.reason ? `Why: ${context.globalIntent.reason}.` : '',
    context.globalIntent.evidence.length
      ? `Evidence: ${context.globalIntent.evidence.join(' | ')}.`
      : ''
  ].filter(Boolean).join('\n')
}

function buildDomainVoiceModule(context: PerceptionContextSnapshot): string {
  if (!isMarketContext(context)) return ''

  return [
    '[MarketVoice]',
    'You are reading the chart LIVE with the user, not writing a report about it.',
    'Sound like a sharp trader sitting next to the user, pointing at the screen.',
    '',
    'FORMAT:',
    '- Use short lines with natural breaks. One idea per line.',
    '- Use presence words: "olha...", "isso aqui...", "agora...", "se você fizer X..."',
    '- Break thoughts with line breaks, not paragraphs.',
    '- The feel is WhatsApp voice-note transcribed, not Bloomberg terminal note.',
    '',
    'DO NOT:',
    '- Narrate the chart ("Veja o que o gráfico mostra", "O que o gráfico indica").',
    '- Write analysis paragraphs. Never more than 2-3 short lines before a break.',
    '- Cite exact prices or percentages unless the user specifically asked for them or they are critical to the decision point (e.g. a key support/resistance level).',
    '- Use formal market vocabulary: "consolidação de fraqueza", "borda sólida", "movimento útil", "setup de compra", "estrutura clara".',
    '- Start sentences with "O risco aqui é", "O movimento útil seria", "Veja o que...".',
    '',
    'DO:',
    '- Open with the stance in one short punchy line: "não entraria agora.", "tá bom pra scalp.", "aqui tem espaço."',
    '- Use informal/direct words: "tá", "olha", "isso", "aqui", "pode", "cara".',
    '- Point at things: "olha as velas", "esse volume aqui", "isso não segura".',
    '- When warning, say what happens TO THE USER: "se você compra agora, pode cair mais e te prender".',
    '- End with a short practical question about what the user actually wants to do.',
    '',
    'GOOD example:',
    '"não entraria agora.',
    'tá instável...',
    '',
    'olha as velas — só queda, sem estrutura.',
    'não tem suporte claro segurando.',
    '',
    'se você compra agora, pode cair mais e te prender.',
    'o volume não mostra reversão ainda.',
    '',
    'eu esperaria uma reação clara pra cima',
    'ou segurar num nível definido.',
    '',
    'você quer scalp ou algo mais longo?"',
    '',
    'BAD example:',
    '"Está instável demais para entrada limpa agora. Veja o que o gráfico mostra: você tem uma série de velas vermelhas com volume distribuído. O preço está em 1,15145 com queda de 0,21%. O movimento útil seria esperar a formação de uma vela de reversão clara."'
  ].join('\n')
}

function buildCodeVoiceModule(context: PerceptionContextSnapshot): string {
  if (context.semanticState.surface_type !== 'code') return ''
  const cc = context.semanticState.code_context

  return [
    '[CodeVoice]',
    'You are pair-programming with the user — looking at the same editor, same file, same line.',
    '',
    'VOICE:',
    '- Talk like a senior dev sitting next to the user, pointing at the screen.',
    '- Reference the ACTUAL code visible: file name, function name, line numbers, variable names.',
    '- Be specific: "esse useEffect ali na linha 47" not "o hook visível na tela".',
    '- Use short lines. One idea per line.',
    '',
    'WHEN THERE ARE ERRORS:',
    '- Lead with the error. Read the actual error message.',
    '- Point to the exact line if visible.',
    '- Explain why it happens in 1-2 lines.',
    '- Give the fix directly — show the code change.',
    '- Do NOT explain what errors are in general.',
    '',
    'WHEN EXPLAINING CODE:',
    '- Start from what the code DOES, not what it IS.',
    '- "isso aqui pega o token e valida antes de seguir" not "esta função é responsável pela validação do token".',
    '- Follow the data flow, not the line order.',
    '- Skip obvious things (imports, basic types). Focus on logic and decisions.',
    '',
    'WHEN REVIEWING:',
    '- Point at the specific problem, not general advice.',
    '- "esse catch ali tá engolindo o erro" not "é importante tratar erros adequadamente".',
    '- If the code is good, say so in one line and move on.',
    '',
    'DO NOT:',
    '- Narrate what the user already sees ("A tela mostra código com foco em...").',
    '- Give generic programming advice unless asked.',
    '- Explain basic concepts the code already demonstrates (unless user is beginner AND asks).',
    '- Use formal language: "O trecho central parece ser", "Os conceitos técnicos mais prováveis".',
    '',
    cc?.file_name ? `Current file: ${cc.file_path || cc.file_name}` : '',
    cc?.language ? `Language: ${cc.language}` : '',
    cc?.active_function ? `Active scope: ${cc.active_function}` : '',
    cc?.errors?.length ? `Visible errors: ${cc.errors.length}` : '',
    cc?.terminal_output ? 'Terminal output visible — check for build/test results.' : '',
    '',
    'GOOD example:',
    '"esse fetchData na linha 52 tá sem try/catch.',
    'se a API cair, o componente quebra silenciosamente.',
    '',
    'coloca um try/catch e trata o erro no estado:',
    '```',
    'try { const data = await fetchData() } catch (e) { setError(e) }',
    '```',
    'e aquele useEffect ali embaixo depende do data — precisa do error state também."',
    '',
    'BAD example:',
    '"A tela parece mostrar código com foco em fetchData. Os conceitos técnicos mais prováveis aqui são: tratamento de erros e chamadas assíncronas. Posso explicar a responsabilidade do trecho."'
  ].filter(Boolean).join('\n')
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

/**
 * Adds a calibration note when the depth was adjusted by the depth-calibrator.
 * This makes the LLM explicitly aware of WHY the level is set as it is,
 * producing better tuned responses.
 */
function buildDepthCalibrationNote(userProfile: UserProfile): string {
  // The effective profile is already the calibrated one. We detect that
  // calibration happened when the level differs from the most common default
  // in a way that signals explicit feedback. To not over-annotate, we only
  // add a note for the edge levels.
  if (userProfile.user_level === 'beginner' && userProfile.preferred_explanation_style === 'step_by_step') {
    return 'IMPORTANT: The user has recently requested simpler explanations. Prioritize clarity over completeness. If in doubt, define the term before using it.'
  }
  if (userProfile.user_level === 'advanced') {
    return 'IMPORTANT: The user has recently requested deeper, more technical content. You can skip introductory scaffolding and go directly to mechanisms, trade-offs, and edge cases.'
  }
  return ''
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

function buildGlobalIntentInstruction(mode: PerceptionContextSnapshot['globalIntent']['mode']): string {
  switch (mode) {
    case 'technical_focus':
      return 'Be objective, prioritize error, cause, fix, and the next technical action.'
    case 'decision':
      return 'Prioritize scenario reading, risk, implication, and the next decision point.'
    case 'study':
      return 'Teach progressively, clarify concepts, and preserve learning flow.'
    case 'light':
      return 'Keep it lighter, shorter, and less intrusive unless the user asks for depth.'
    case 'review':
      return 'Reconnect with prior context, summarize changes, and highlight what is different now.'
    case 'uncertain':
      return 'Stay conservative, avoid over-initiative, and rely on the most explicit grounded cues.'
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

export function formatSpotifyConnectorContext(data: unknown): string {
  if (!data) return ''
  const s = data as {
    isPlaying?: boolean
    trackName?: string | null
    artistName?: string | null
    albumName?: string | null
    progressMs?: number
    durationMs?: number
    shuffle?: boolean
    repeat?: string
    deviceName?: string | null
    volumePercent?: number | null
  }

  const lines: string[] = ['--- Spotify (live connector) ---']

  if (s.trackName) {
    const artist = s.artistName ? ` — ${s.artistName}` : ''
    lines.push(`${s.isPlaying ? 'Tocando' : 'Pausado'}: ${s.trackName}${artist}`)
  } else {
    lines.push('Sem reprodução ativa')
  }

  if (s.albumName)  lines.push(`Álbum: ${s.albumName}`)

  if (s.durationMs) {
    const prog = formatMs(s.progressMs ?? 0)
    const dur  = formatMs(s.durationMs)
    lines.push(`Progresso: ${prog} / ${dur}`)
  }

  const shuffle = s.shuffle ? 'on' : 'off'
  const repeat  = s.repeat ?? 'off'
  lines.push(`Shuffle: ${shuffle} | Repeat: ${repeat}`)

  if (s.deviceName) {
    const vol = s.volumePercent != null ? ` | Volume: ${s.volumePercent}%` : ''
    lines.push(`Device: ${s.deviceName}${vol}`)
  }

  lines.push('')
  lines.push('SPOTIFY CONTROLS: You can control Spotify. When the user asks, respond with the action description and confirm it was done.')
  lines.push('Supported: pause, resume, next track, previous track, play by name/artist/album/playlist, what\'s playing.')
  lines.push('Use natural commands: "Pausando.", "Pulando para a próxima.", "Tocando [name]."')
  lines.push('--- End Spotify context ---')
  return lines.join('\n')
}

export function formatTradingViewConnectorContext(data: unknown): string {
  if (!data || typeof data !== 'object') return ''

  const state = data as {
    loggedIn?: boolean
    lowConfidence?: boolean
    url?: string | null
    title?: string | null
    symbol?: string | null
    exchange?: string | null
    timeframe?: string | null
    crosshairActive?: boolean
    crosshairConfidence?: number
    hoveredCandleTime?: string | null
    ohlcSource?: 'hovered' | 'last-visible' | 'unknown'
    ohlcConfidence?: number
    currentPrice?: string | null
    priceChange?: string | null
    ohlc?: {
      open?: string | null
      high?: string | null
      low?: string | null
      close?: string | null
    }
    recentHigh?: string | null
    recentLow?: string | null
    rangeState?: 'expanding' | 'contracting' | 'balanced' | 'unknown'
    previousOhlc?: {
      open?: string | null
      high?: string | null
      low?: string | null
      close?: string | null
    } | null
    previousCandleTime?: string | null
    candleDirection?: 'bullish' | 'bearish' | 'neutral' | 'unknown'
    candleStructure?: string | null
    patternHints?: string[]
    structureHints?: string[]
    contextualPatternHints?: string[]
    sequencePatternHints?: string[]
    indicatorValues?: Record<string, string>
    indicatorSignals?: string[]
    indicatorConfidence?: number
    layoutHints?: string[]
    watchlistVisible?: boolean
    indicatorsVisible?: boolean
    drawingToolsVisible?: boolean
    selectedPanel?: string | null
  }

  const lines: string[] = ['--- TradingView (live connector) ---']
  lines.push(`Session: ${state.loggedIn ? 'authenticated' : 'open without confirmed login'}`)
  if (state.symbol) lines.push(`Symbol: ${state.symbol}`)
  if (state.exchange) lines.push(`Exchange: ${state.exchange}`)
  if (state.timeframe) lines.push(`Timeframe: ${state.timeframe}`)
  if (state.crosshairActive) lines.push('Crosshair: active on chart')
  if (typeof state.crosshairConfidence === 'number' && state.crosshairConfidence > 0) {
    lines.push(`Crosshair confidence: ${state.crosshairConfidence.toFixed(2)}`)
  }
  if (state.hoveredCandleTime) lines.push(`Hovered candle time: ${state.hoveredCandleTime}`)
  if (state.currentPrice) lines.push(`Current price: ${state.currentPrice}`)
  if (state.priceChange) lines.push(`Price change: ${state.priceChange}`)
  if (state.ohlc && (state.ohlc.open || state.ohlc.high || state.ohlc.low || state.ohlc.close)) {
    lines.push(
      `OHLC (${state.ohlcSource ?? 'unknown'}): O ${state.ohlc.open ?? '?'} | H ${state.ohlc.high ?? '?'} | L ${state.ohlc.low ?? '?'} | C ${state.ohlc.close ?? '?'}`
    )
  }
  if (typeof state.ohlcConfidence === 'number' && state.ohlcConfidence > 0) {
    lines.push(`OHLC confidence: ${state.ohlcConfidence.toFixed(2)}`)
  }
  if (state.recentHigh || state.recentLow) {
    lines.push(`Recent range: high ${state.recentHigh ?? '?'} | low ${state.recentLow ?? '?'}`)
  }
  if (state.rangeState && state.rangeState !== 'unknown') {
    lines.push(`Range state: ${state.rangeState}`)
  }
  if (state.previousOhlc && (state.previousOhlc.open || state.previousOhlc.high || state.previousOhlc.low || state.previousOhlc.close)) {
    lines.push(
      `Previous candle${state.previousCandleTime ? ` (${state.previousCandleTime})` : ''}: O ${state.previousOhlc.open ?? '?'} | H ${state.previousOhlc.high ?? '?'} | L ${state.previousOhlc.low ?? '?'} | C ${state.previousOhlc.close ?? '?'}`
    )
  }
  if (state.candleDirection && state.candleDirection !== 'unknown') {
    lines.push(`Candle direction: ${state.candleDirection}`)
  }
  if (state.candleStructure) {
    lines.push(`Candle structure: ${state.candleStructure}`)
  }
  if (state.patternHints?.length) {
    lines.push(`Pattern hints: ${state.patternHints.join(', ')}`)
  }
  if (state.structureHints?.length) {
    lines.push(`Structure hints: ${state.structureHints.join(', ')}`)
  }
  if (state.contextualPatternHints?.length) {
    lines.push(`Contextual pattern hints: ${state.contextualPatternHints.join(', ')}`)
  }
  if (state.sequencePatternHints?.length) {
    lines.push(`Sequence pattern hints: ${state.sequencePatternHints.join(', ')}`)
  }
  if (state.indicatorValues && Object.keys(state.indicatorValues).length) {
    lines.push(
      `Indicators: ${Object.entries(state.indicatorValues)
        .slice(0, 8)
        .map(([name, value]) => `${name}=${value}`)
        .join(' | ')}`
    )
  }
  if (state.indicatorSignals?.length) {
    lines.push(`Indicator signals: ${state.indicatorSignals.join(', ')}`)
  }
  if (typeof state.indicatorConfidence === 'number' && state.indicatorConfidence > 0) {
    lines.push(`Indicator confidence: ${state.indicatorConfidence.toFixed(2)}`)
  }
  if (state.title) lines.push(`Page: ${state.title}`)
  if (state.url) lines.push(`URL: ${state.url}`)

  const hints: string[] = []
  if (state.watchlistVisible) hints.push('watchlist visible')
  if (state.indicatorsVisible) hints.push('indicators visible')
  if (state.drawingToolsVisible) hints.push('drawing tools visible')
  if (state.selectedPanel) hints.push(`selected panel: ${state.selectedPanel}`)
  if (state.layoutHints?.length) hints.push(`layout hints: ${state.layoutHints.join(', ')}`)
  if (hints.length) lines.push(`Layout: ${hints.join(' | ')}`)
  if (state.lowConfidence) lines.push('Confidence: low for some DOM fields — use screenshot/OCR to complement the read.')

  lines.push('')
  lines.push('TRADINGVIEW POLICY: Treat this as the active financial screen. Prefer this structured connector state over vague visual guesses for symbol, timeframe, price, OHLC, and indicators.')
  lines.push('When crosshair is active, assume the OHLC and hovered candle time refer to the candle under the user pointer, not just the latest candle.')
  lines.push('If crosshair confidence or OHLC confidence is low, present the hovered-candle read as provisional instead of absolute.')
  lines.push('If connector values and screenshot intuition disagree, trust the connector for symbol, timeframe, OHLC, price, and visible indicator values.')
  lines.push('Use screenshot and OCR as support for chart structure, candle behavior, zones, and anything not explicit in the connector.')
  lines.push('MARKET RESPONSE STYLE: if the user asks about a specific candle, answer directly from OHLC first, then explain what that implies in plain trader language.')
  lines.push('Use candleDirection, candleStructure, and patternHints when available to describe wick rejection, indecision, body strength, or impulse without overclaiming.')
  lines.push('Use recentHigh, recentLow, rangeState, and structureHints when available to describe compression, expansion, and local range structure.')
  lines.push('Use indicatorSignals when available to talk about RSI stretch, MACD bias, moving averages, VWAP, Bollinger, or volume without inventing values.')
  lines.push('Use contextualPatternHints when available to talk about inside bar, outside bar, range expansion/contraction, or shift versus the previous candle.')
  lines.push('Use sequencePatternHints when available to describe short continuation, failed continuation, or compression before expansion across the last 2 to 3 candles.')
  lines.push('Do not pretend to know exact support/resistance levels if they are not explicit in the connector or clearly readable on screen.')
  lines.push('If the user asks for maximum, minimum, close, rejection, range, or wick behavior, anchor the answer in the visible OHLC before giving interpretation.')
  lines.push('Do not imply order placement or trade execution capabilities.')
  lines.push('--- End TradingView context ---')
  return lines.join('\n')
}


function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}
