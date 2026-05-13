/**
 * intermediate-thought.ts
 *
 * Builds a short, grounded "thinking" display from perception data alone —
 * no LLM calls. Uses the vision-generated fields (visual_summary, inferred_intent)
 * as the primary source so thoughts are specific to what's actually on screen.
 *
 * Priority order:
 *  1. Code errors / terminal signals (most specific)
 *  2. visual_summary — already a sharp, screen-specific observation
 *  3. inferred_intent — what the user seems to be trying to do
 *  4. probable_user_focus + topics as last resort
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

  if (confidence < 0.36) {
    return buildLowConfidenceThought(semanticState, confidence)
  }

  switch (semanticState.surface_type) {
    case 'code':
      return buildCodeThought(semanticState, sessionMemory, confidence)
    case 'graphic':
      return buildGraphicThought(semanticState, confidence)
    case 'dashboard':
      return buildDashboardThought(semanticState, confidence)
    case 'document':
    case 'text':
      return buildTextThought(semanticState, confidence)
    default:
      return buildGenericThought(semanticState, confidence)
  }
}

// ─── Surface: code ────────────────────────────────────────────────────────────

function buildCodeThought(
  state: SemanticState,
  _session: SessionMemory,
  confidence: number
): IntermediateThought {
  const cc = state.code_context

  // 1. Real errors from code_context (most specific)
  if (cc?.errors?.length) {
    const top = cc.errors[0]
    const line = top.line != null ? ` (linha ${top.line})` : ''
    const file = cc.file_name ? ` — ${cc.file_name}` : ''
    const primary = `${top.message.slice(0, 90)}${line}${file}`
    const secondary = confidence >= 0.44
      ? inferNextStepFromError(top.message)
      : null
    return { primary: finalize(primary), secondary: secondary ? finalize(secondary) : null, confidence }
  }

  // 2. Error signal from detected text
  const errSignal = detectErrorSignal(state.detected_text)
  if (errSignal) {
    const filePart = cc?.file_name ? ` em ${cc.file_name}` : ''
    const primary = `${errSignal.blocker}${filePart}`
    const secondary = confidence >= 0.44
      ? (errSignal.cause ?? inferNextStepFromType(errSignal.type, state))
      : null
    return { primary: finalize(primary), secondary: secondary ? finalize(secondary) : null, confidence }
  }

  // 3. Terminal signal
  if (cc?.terminal_output) {
    const sig = detectTerminalSignal(cc.terminal_output)
    if (sig) {
      return {
        primary:   finalize(sig.summary),
        secondary: confidence >= 0.44 ? finalize(sig.next) : null,
        confidence
      }
    }
  }

  // 4. visual_summary (LLM already described the screen specifically)
  const summary = toThoughtLine(state.visual_summary)
  if (summary) {
    const intent = toThoughtLine(state.inferred_intent)
    return {
      primary:   finalize(summary),
      secondary: intent && intent !== summary && confidence >= 0.44 ? finalize(intent) : null,
      confidence
    }
  }

  // 5. Code context specifics as last resort
  const func = cc?.active_function ?? null
  const file = cc?.file_name ?? null
  const primary = func
    ? `função ${func}${file ? ` em ${file}` : ''}`
    : file
      ? `lendo ${file}`
      : 'olhando o código'
  const intent = toThoughtLine(state.inferred_intent)
  return {
    primary:   finalize(primary),
    secondary: intent && confidence >= 0.44 ? finalize(intent) : null,
    confidence
  }
}

// ─── Surface: graphic (charts, candlesticks, etc.) ────────────────────────────

function buildGraphicThought(state: SemanticState, confidence: number): IntermediateThought {
  const kv = state.key_values ?? {}
  const kvEntries = Object.entries(kv).slice(0, 3)

  // Lead with specific numbers when visible
  if (kvEntries.length >= 2) {
    const kvLine = kvEntries.map(([k, v]) => `${k} ${v}`).join(', ')
    const primary = `vendo ${kvLine}`
    const summary = toThoughtLine(state.visual_summary)
    const secondary = summary && summary !== primary && confidence >= 0.44
      ? summary
      : null
    return { primary: finalize(primary), secondary: secondary ? finalize(secondary) : null, confidence }
  }

  // visual_summary is the best source for chart observations
  const summary = toThoughtLine(state.visual_summary)
  if (summary) {
    const intent = toThoughtLine(state.inferred_intent)
    return {
      primary:   finalize(summary),
      secondary: intent && intent !== summary && confidence >= 0.44 ? finalize(intent) : null,
      confidence
    }
  }

  const focus = simplifyFocus(state.probable_user_focus)
  return {
    primary:   finalize(focus ? `analisando ${focus}` : 'lendo o gráfico'),
    secondary: null,
    confidence
  }
}

// ─── Surface: dashboard ───────────────────────────────────────────────────────

function buildDashboardThought(state: SemanticState, confidence: number): IntermediateThought {
  const kv = state.key_values ?? {}
  const kvEntries = Object.entries(kv).slice(0, 2)

  if (kvEntries.length) {
    const kvLine = kvEntries.map(([k, v]) => `${k}: ${v}`).join(' · ')
    const primary = `métricas — ${kvLine}`
    const intent = toThoughtLine(state.inferred_intent)
    return {
      primary:   finalize(primary),
      secondary: intent && confidence >= 0.44 ? finalize(intent) : null,
      confidence
    }
  }

  const summary = toThoughtLine(state.visual_summary)
  const intent  = toThoughtLine(state.inferred_intent)
  return {
    primary:   finalize(summary ?? `lendo o painel${state.app_identifier ? ` do ${state.app_identifier}` : ''}`),
    secondary: intent && intent !== summary && confidence >= 0.44 ? finalize(intent) : null,
    confidence
  }
}

// ─── Surface: text / document ─────────────────────────────────────────────────

function buildTextThought(state: SemanticState, confidence: number): IntermediateThought {
  // visual_summary already says what the text is about
  const summary = toThoughtLine(state.visual_summary)
  const intent  = toThoughtLine(state.inferred_intent)

  if (summary) {
    return {
      primary:   finalize(summary),
      secondary: intent && intent !== summary && confidence >= 0.44 ? finalize(intent) : null,
      confidence
    }
  }

  const topics = state.pedagogical_topics
  if (topics.length >= 2) {
    return {
      primary:   finalize(`lendo sobre ${topics[0]} e ${topics[1]}`),
      secondary: intent && confidence >= 0.44 ? finalize(intent) : null,
      confidence
    }
  }

  if (topics.length === 1) {
    return {
      primary:   finalize(`lendo sobre ${topics[0]}`),
      secondary: intent && confidence >= 0.44 ? finalize(intent) : null,
      confidence
    }
  }

  const focus = simplifyFocus(state.probable_user_focus)
  return {
    primary:   finalize(focus ? `lendo — ${focus}` : 'lendo o texto'),
    secondary: null,
    confidence
  }
}

// ─── Surface: unknown / generic ───────────────────────────────────────────────

function buildGenericThought(state: SemanticState, confidence: number): IntermediateThought {
  const summary = toThoughtLine(state.visual_summary)
  const intent  = toThoughtLine(state.inferred_intent)

  if (summary) {
    return {
      primary:   finalize(summary),
      secondary: intent && intent !== summary && confidence >= 0.44 ? finalize(intent) : null,
      confidence
    }
  }

  const app   = state.app_identifier
  const focus = simplifyFocus(state.probable_user_focus)
  const appPart = app ? ` no ${app}` : ''

  return {
    primary:   finalize(focus ? `${focus}${appPart}` : `olhando a tela${appPart}`),
    secondary: intent && confidence >= 0.44 ? finalize(intent) : null,
    confidence
  }
}

// ─── Low confidence ───────────────────────────────────────────────────────────

function buildLowConfidenceThought(state: SemanticState, confidence: number): IntermediateThought {
  const app = state.app_identifier
  const appPart = app ? ` (${app})` : ''
  return {
    primary: finalize(`calibrando leitura${appPart}`),
    secondary: state.surface_type !== 'unknown'
      ? finalize(`parece tela de ${surfaceLabelPt(state.surface_type)}`)
      : null,
    confidence
  }
}

// ─── Error signal detection ───────────────────────────────────────────────────

type ErrorSignal = { blocker: string; type: string; cause: string | null }

function detectErrorSignal(text: string): ErrorSignal | null {
  const n = text.toLowerCase()
  if (/typeerror:.*not a function/.test(n)) {
    return { blocker: 'chamada inválida — não é uma função', type: 'not-a-function', cause: 'valor chegando errado nesse ponto' }
  }
  if (/cannot read properties of (undefined|null)/.test(n)) {
    return { blocker: 'tentando acessar propriedade de valor nulo', type: 'undefined-access', cause: 'dado chega vazio antes de ser usado' }
  }
  if (/referenceerror/.test(n)) {
    return { blocker: 'nome usado antes de existir no escopo', type: 'reference-error', cause: null }
  }
  if (/syntaxerror/.test(n)) {
    return { blocker: 'erro de sintaxe impedindo execução', type: 'syntax-error', cause: null }
  }
  if (/assert|expected.*received|failing test|test failed/.test(n)) {
    return { blocker: 'teste falhando — expected não bateu', type: 'test-failure', cause: 'expectativa do teste divergiu da implementação' }
  }
  if (/\berror\b|\bexception\b|\btraceback\b|\bfalha\b/.test(n)) {
    return { blocker: 'erro visível no output', type: 'generic-error', cause: null }
  }
  return null
}

function inferNextStepFromError(message: string): string | null {
  const m = message.toLowerCase()
  if (/not a function/.test(m))           return 'conferir o tipo do valor antes da chamada'
  if (/cannot read|undefined|null/.test(m)) return 'rastrear de onde esse dado vem'
  if (/referenceerror/.test(m))           return 'declarar ou importar antes de usar'
  if (/syntaxerror/.test(m))              return 'achar a linha exata que o parser rejeita'
  if (/expected|received/.test(m))        return 'alinhar o teste com a mudança mais recente'
  return null
}

function inferNextStepFromType(type: string, _state: SemanticState): string | null {
  switch (type) {
    case 'not-a-function':   return 'alinhar o valor com o que a função espera'
    case 'undefined-access': return 'validar de onde esse valor deveria vir'
    case 'reference-error':  return 'declarar ou importar antes de usar'
    case 'syntax-error':     return 'achar a linha que o parser está rejeitando'
    case 'test-failure':     return 'alinhar a expectativa com a implementação'
    default:                 return null
  }
}

// ─── Terminal signal detection ────────────────────────────────────────────────

function detectTerminalSignal(terminal: string): { summary: string; next: string } | null {
  const t = terminal.toLowerCase()
  if (/tests? failed|✕|✗|● /.test(t))
    return { summary: 'teste falhando no terminal', next: 'diff entre expected e received mostra onde quebrou' }
  if (/build failed|error:/.test(t))
    return { summary: 'build quebrando', next: 'primeira linha de erro aponta o arquivo exato' }
  if (/tests? passed|✓|✔|all tests/.test(t))
    return { summary: 'testes passando', next: 'próximo passo: coverage ou próximo caso' }
  if (/command not found|enoent/.test(t))
    return { summary: 'comando ou arquivo não encontrado', next: 'checar se o pacote está instalado ou o path está certo' }
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Transforms a vision-generated description into a first-person observation.
 * Strips narrator prefixes ("A tela mostra...", "O usuário está...") and
 * returns a compact thought-style string.
 */
function toThoughtLine(text: string | null | undefined): string | null {
  if (!text) return null

  const cleaned = text
    .replace(/^(the screen (shows?|displays?)|tela (mostra|exibe|apresenta)|a tela (mostra|exibe))\s*/i, '')
    .replace(/^(the user (is|seems to be)|o usuário (está|parece estar))\s*/i, '')
    .replace(/^(looking at|viewing|reading|vendo|lendo|olhando para)\s*/i, '')
    .replace(/^(it appears|parece que|ao que parece)\s*/i, '')
    .split(/[.!?]/)[0]  // first sentence only
    ?.trim()
    .toLowerCase()
    ?? null

  if (!cleaned || cleaned.length <= 3) return null
  return smartTrim(cleaned, 128)
}


function simplifyFocus(focus: string): string {
  return smartTrim(
    focus
    .replace(/^.*?:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase(),
    72
  )
}

function finalize(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim()
}

function smartTrim(value: string, max: number): string {
  if (value.length <= max) return value

  const sliced = value.slice(0, max + 1)
  const boundary = sliced.search(/\s+\S*$/)
  if (boundary > Math.floor(max * 0.65)) {
    return sliced.slice(0, boundary).trim()
  }

  return value.slice(0, max).trim()
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}

function surfaceLabelPt(surface: SemanticState['surface_type']): string {
  switch (surface) {
    case 'code':
      return 'codigo'
    case 'text':
      return 'texto'
    case 'graphic':
      return 'grafico'
    case 'document':
      return 'documento'
    case 'dashboard':
      return 'painel'
    default:
      return 'contexto'
  }
}
