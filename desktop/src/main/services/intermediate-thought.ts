/**
 * intermediate-thought.ts
 *
 * Builds a short, grounded "thinking" display from perception data alone —
 * no LLM calls. The goal is to show the user that John is READING the screen
 * right now, producing a sharp internal monologue that feels alive.
 *
 * Priority order of what to express:
 *  1. What is visually dominant (file, chart, paragraph, metric)
 *  2. What seems to be the active problem or question
 *  3. What changed recently (shift in focus gives continuity)
 *  4. What the next useful move looks like
 *
 * Inputs already extracted by the perception pipeline (no new LLM needed):
 *  - semanticState.visual_summary      — one-sentence read of the screen
 *  - semanticState.code_context        — file, language, errors, cursor, terminal
 *  - semanticState.key_values          — named numbers extracted from the screen
 *  - semanticState.pedagogical_topics  — concepts detected
 *  - semanticState.emotional_signal    — user emotional state
 *  - semanticState.app_identifier      — which app is in focus
 *  - semanticState.surface_type        — code / text / graphic / document / dashboard
 *  - sessionMemory.recent_states       — previous frames for shift detection
 */

import type {
  IntermediateThought,
  SemanticState,
  SessionMemory
} from '../../shared/perception.types'

interface IntermediateThoughtInput {
  semanticState: SemanticState
  sessionMemory: SessionMemory
  persistedMemoryHighlights?: string[]
}

export function buildIntermediateThought(input: IntermediateThoughtInput): IntermediateThought {
  const { semanticState, sessionMemory } = input
  const confidence = clamp(1 - semanticState.uncertainty)

  // ── Low confidence: say as little as possible, stay honest ────────────────
  if (confidence < 0.36) {
    return buildLowConfidenceThought(semanticState, confidence)
  }

  // ── Route by surface type for rich, grounded thoughts ─────────────────────
  switch (semanticState.surface_type) {
    case 'code':
      return buildCodeThought(semanticState, sessionMemory, confidence)
    case 'graphic':
      return buildGraphicThought(semanticState, sessionMemory, confidence)
    case 'dashboard':
      return buildDashboardThought(semanticState, sessionMemory, confidence)
    case 'document':
    case 'text':
      return buildTextThought(semanticState, sessionMemory, confidence)
    default:
      return buildGenericThought(semanticState, sessionMemory, confidence)
  }
}

// ─── Surface: code ────────────────────────────────────────────────────────────

function buildCodeThought(
  state: SemanticState,
  session: SessionMemory,
  confidence: number
): IntermediateThought {
  const cc = state.code_context
  const error = detectErrorSignal(state.detected_text)

  // Case 1: there's a visible error — lead with the specific error
  if (error) {
    const filePart = cc?.file_name ? ` em ${cc.file_name}` : ''
    const scopePart = cc?.active_function ? ` dentro de ${cc.active_function}` : ''
    const primary = `tem um problema${filePart}${scopePart} — ${error.blocker}`
    const cause = inferCause(error, state)
    const secondary = cause
      ? `o mais provável é que ${cause}; ${inferNextStep(error, state)}`
      : inferNextStep(error, state)
    return { primary: finalize(primary), secondary: confidence >= 0.44 ? finalize(secondary) : null, confidence }
  }

  // Case 2: terminal output visible — the user is watching build/test results
  if (cc?.terminal_output) {
    const terminalSignal = detectTerminalSignal(cc.terminal_output)
    if (terminalSignal) {
      const filePart = cc.file_name ? ` (${cc.file_name})` : ''
      return {
        primary: finalize(`${terminalSignal.summary}${filePart}`),
        secondary: confidence >= 0.44 ? finalize(terminalSignal.next) : null,
        confidence
      }
    }
  }

  // Case 3: focused on a specific function/scope
  if (cc?.active_function) {
    const langPart = cc.language ? ` ${cc.language}` : ''
    const filePart = cc.file_name ? ` em ${cc.file_name}` : ''
    const primary = `olhando ${cc.active_function}${langPart}${filePart}`
    const secondary = cc.visible_line_range
      ? `vizinhança das linhas ${cc.visible_line_range}`
      : detectFocusShift(state, session)
    return { primary: finalize(primary), secondary: secondary ? finalize(secondary) : null, confidence }
  }

  // Case 4: shift in context
  const shift = buildContextShift(state, session)
  if (shift) return { ...shift, confidence }

  // Case 5: just a file open, no specific signal
  const filePart = cc?.file_name ?? null
  const langPart = cc?.language ? ` (${cc.language})` : ''
  const primary = filePart
    ? `lendo ${filePart}${langPart}`
    : `olhando ${simplifyFocus(state.probable_user_focus)}`
  const topic = state.pedagogical_topics[0]
  const secondary = topic ? `o conceito central aqui parece ser ${topic}` : null
  return { primary: finalize(primary), secondary: secondary ? finalize(secondary) : null, confidence }
}

// ─── Surface: graphic (charts, candlesticks, etc.) ────────────────────────────

function buildGraphicThought(
  state: SemanticState,
  session: SessionMemory,
  confidence: number
): IntermediateThought {
  const kv = state.key_values ?? {}
  const kvEntries = Object.entries(kv).slice(0, 3)
  const summary = state.visual_summary
  const topics = state.pedagogical_topics

  // Lead with what numbers are visible if we have them
  if (kvEntries.length >= 2) {
    const kvLine = kvEntries.map(([k, v]) => `${k} ${v}`).join(', ')
    const primary = `vendo ${kvLine}`
    const topic = topics[0]
    const secondary = topic
      ? `o foco parece estar em ${topic}`
      : detectFocusShift(state, session) ?? `olhando ${simplifyFocus(state.probable_user_focus)}`
    return { primary: finalize(primary), secondary: finalize(secondary), confidence }
  }

  // No clean key-values — use the visual summary directly
  const primary = summary
    ? compactSummary(summary)
    : `analisando ${simplifyFocus(state.probable_user_focus)}`
  const shift = detectFocusShift(state, session)
  const secondary = shift ?? (topics[0] ? `referência central: ${topics[0]}` : null)
  return { primary: finalize(primary), secondary: secondary ? finalize(secondary) : null, confidence }
}

// ─── Surface: dashboard ───────────────────────────────────────────────────────

function buildDashboardThought(
  state: SemanticState,
  session: SessionMemory,
  confidence: number
): IntermediateThought {
  const kv = state.key_values ?? {}
  const kvEntries = Object.entries(kv).slice(0, 2)
  const app = state.app_identifier

  if (kvEntries.length) {
    const kvLine = kvEntries.map(([k, v]) => `${k}: ${v}`).join(' · ')
    const primary = `métricas visíveis — ${kvLine}`
    const shift = detectFocusShift(state, session)
    return { primary: finalize(primary), secondary: shift ? finalize(shift) : null, confidence }
  }

  const appPart = app ? ` no ${app}` : ''
  const primary = `lendo o painel${appPart} — ${simplifyFocus(state.probable_user_focus)}`
  const topic = state.pedagogical_topics[0]
  return {
    primary: finalize(primary),
    secondary: topic ? finalize(`lente principal: ${topic}`) : null,
    confidence
  }
}

// ─── Surface: text / document ─────────────────────────────────────────────────

function buildTextThought(
  state: SemanticState,
  _session: SessionMemory,
  confidence: number
): IntermediateThought {
  const topics = state.pedagogical_topics
  const summary = state.visual_summary
  const focusPart = simplifyFocus(state.probable_user_focus)

  // Academic/educational document — lead with topic
  if (topics.length >= 2) {
    const primary = `tentando ligar ${topics[0]} com ${topics[1]}`
    const secondary = summary ? `isso parece falar de ${compactSummary(summary)}` : null
    return { primary: finalize(primary), secondary: secondary ? finalize(secondary) : null, confidence }
  }

  if (topics.length === 1) {
    return {
      primary: finalize(`acho que o ponto central aqui é ${topics[0]}`),
      secondary: confidence >= 0.42 && focusPart ? finalize(`a parte importante parece ser ${focusPart}`) : null,
      confidence
    }
  }

  // No clean topics — use summary directly
  const gist = summary ? compactSummary(summary) : focusPart
  const primary = gist ? `tentando entender ${gist}` : 'tentando entender melhor esse trecho'
  return { primary: finalize(primary), secondary: null, confidence }
}

// ─── Surface: unknown / generic ───────────────────────────────────────────────

function buildGenericThought(
  state: SemanticState,
  session: SessionMemory,
  confidence: number
): IntermediateThought {
  const shift = buildContextShift(state, session)
  if (shift) return { ...shift, confidence }

  const app = state.app_identifier
  const focus = simplifyFocus(state.probable_user_focus)
  const appPart = app ? ` no ${app}` : ''
  const topic = state.pedagogical_topics[0]

  return {
    primary: finalize(focus ? `tentando entender o que está em foco${appPart}: ${focus}` : `tentando entender melhor essa tela${appPart}`),
    secondary: topic ? finalize(`talvez isso esteja girando em torno de ${topic}`) : null,
    confidence
  }
}

// ─── Low confidence ───────────────────────────────────────────────────────────

function buildLowConfidenceThought(state: SemanticState, confidence: number): IntermediateThought {
  const app = state.app_identifier
  const appPart = app ? ` (${app})` : ''
  return {
    primary: finalize(`capturando o contexto${appPart} — ainda calibrando`),
    secondary: state.surface_type !== 'unknown'
      ? finalize(`parece tela de ${state.surface_type}, mas preciso de mais frames`)
      : null,
    confidence
  }
}

// ─── Context shift detection ──────────────────────────────────────────────────

function buildContextShift(
  state: SemanticState,
  session: SessionMemory
): Omit<IntermediateThought, 'confidence'> | null {
  const previousEntry = session.recent_states.at(-2) ?? null
  if (!previousEntry) return null

  const prevFocus = simplifyFocus(previousEntry.probable_user_focus)
  const currFocus = simplifyFocus(state.probable_user_focus)
  if (prevFocus === currFocus || state.change_summary === 'none') return null

  const primary = buildShiftPrimary(prevFocus, currFocus, state)
  const secondary = buildShiftSecondary(state)
  return { primary: finalize(primary), secondary: secondary ? finalize(secondary) : null }
}

function detectFocusShift(state: SemanticState, session: SessionMemory): string | null {
  const prev = session.recent_states.at(-2)
  if (!prev) return null
  const prevFocus = simplifyFocus(prev.probable_user_focus)
  const currFocus = simplifyFocus(state.probable_user_focus)
  if (prevFocus === currFocus || state.change_summary === 'none') return null
  return `antes: ${prevFocus}`
}

function buildShiftPrimary(from: string, to: string, state: SemanticState): string {
  const { surface_type, change_summary } = state

  if (change_summary === 'major') {
    if (surface_type === 'code') return `saiu de "${from}" e abriu "${to}"`
    if (surface_type === 'graphic') return `viewport mudou — de "${from}" para "${to}"`
    return `agora ele parece focado em ${to}`
  }

  if (surface_type === 'document' || surface_type === 'text') {
    return `acho que a parte importante agora é ${to}`
  }
  if (surface_type === 'graphic' || surface_type === 'dashboard') {
    return `ele mudou o olhar para ${to}`
  }

  return `agora ele parece focado em ${to}`
}

function buildShiftSecondary(state: SemanticState): string | null {
  const topic = state.pedagogical_topics[0]
  if (state.surface_type === 'code') {
    return topic ? `conceito em jogo: ${topic}` : null
  }
  if (state.surface_type === 'document' || state.surface_type === 'text') {
    return null
  }
  return null
}

// ─── Terminal signal detection ────────────────────────────────────────────────

function detectTerminalSignal(terminal: string): { summary: string; next: string } | null {
  const t = terminal.toLowerCase()
  if (/tests? failed|✕|✗|● /.test(t)) {
    return { summary: 'teste falhando no terminal', next: 'o diff entre expected e received vai mostrar onde quebrou' }
  }
  if (/build failed|error:/.test(t)) {
    return { summary: 'build quebrando', next: 'a primeira linha de erro costuma apontar o arquivo exato' }
  }
  if (/tests? passed|✓|✔|all tests/.test(t)) {
    return { summary: 'testes passando', next: 'próximo passo é checar coverage ou o próximo caso' }
  }
  if (/command not found|enoent/.test(t)) {
    return { summary: 'comando ou arquivo não encontrado', next: 'checar se o pacote está instalado ou o path está certo' }
  }
  return null
}

// ─── Error signal detection ───────────────────────────────────────────────────

function detectErrorSignal(text: string): { blocker: string; type: string } | null {
  const n = text.toLowerCase()
  if (/typeerror:.*not a function/.test(n)) {
    return { blocker: 'alguma chamada está quebrando nessa função', type: 'not-a-function' }
  }
  if (/cannot read properties of (undefined|null)/.test(n)) {
    return { blocker: 'algum valor está chegando nulo onde o código espera objeto', type: 'undefined-access' }
  }
  if (/referenceerror/.test(n)) {
    return { blocker: 'tem um nome sendo usado antes de existir no escopo', type: 'reference-error' }
  }
  if (/syntaxerror/.test(n)) {
    return { blocker: 'tem um erro de sintaxe impedindo a execução', type: 'syntax-error' }
  }
  if (/assert|expected.*received|failing test|test failed/.test(n)) {
    return { blocker: 'o teste está parando aqui — o expected não fechou', type: 'test-failure' }
  }
  if (/\berror\b|\bexception\b|\btraceback\b|\bfalha\b/.test(n)) {
    return { blocker: 'tem um erro segurando esse fluxo', type: 'generic-error' }
  }
  return null
}

function inferCause(
  error: ReturnType<typeof detectErrorSignal>,
  state: SemanticState
): string | null {
  if (!error) return null
  switch (error.type) {
    case 'not-a-function':      return 'algum valor está sendo chamado como função sem ser'
    case 'undefined-access':    return 'um dado está chegando vazio onde o código precisa de estrutura'
    case 'reference-error':     return 'esse identificador ainda não entrou no escopo certo'
    case 'syntax-error':        return 'tem algo mal formado que o parser não consegue ler'
    case 'test-failure':        return state.change_summary === 'major'
      ? 'o teste e a implementação saíram do mesmo contrato'
      : 'a expectativa do teste não bate com o estado real'
    default:                    return 'alguma suposição do fluxo não está fechando'
  }
}

function inferNextStep(
  error: ReturnType<typeof detectErrorSignal>,
  state: SemanticState
): string {
  switch (error?.type) {
    case 'not-a-function':   return 'alinhar o valor com o que a função espera receber'
    case 'undefined-access': return 'validar de onde esse valor deveria vir antes da chamada'
    case 'reference-error':  return 'declarar ou importar esse nome antes de usar'
    case 'syntax-error':     return 'achar a linha exata que o parser está rejeitando'
    case 'test-failure':     return 'alinhar a expectativa do teste com a mudança mais recente'
    default: break
  }
  if (state.surface_type === 'document' || state.surface_type === 'text') {
    return 'ligar essa leitura ao ponto exato que ele quer destravar'
  }
  return 'confirmar qual trecho da tela está guiando a dúvida'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compacts a visual_summary string (which can be verbose) into a short phrase.
 * The LLM produces summaries like "Viewing a code editor with a TypeError in the main function."
 * We want just the core read: "code editor com TypeError na função principal"
 */
function compactSummary(summary: string): string {
  return summary
    .replace(/^(viewing|looking at|the screen shows?|tela mostra|tela com)\s+/i, '')
    .replace(/\.$/, '')
    .split(/[.!?]/)[0]  // keep only the first sentence
    .trim()
    .toLowerCase()
    .slice(0, 80)        // hard cap so it doesn't overflow the HUD
}

function simplifyFocus(focus: string): string {
  return focus
    .replace(/^.*?:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 60)
}

function finalize(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim()
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}
