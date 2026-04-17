import type {
  TradingViewActionPayload,
  TutorAction,
  TutorResponse,
  TradingViewConnectorState
} from '../../shared/perception.types'
import { codexAuth, codexClient } from '../auth/codex-singleton'
import { generateRemoteText } from './ai-provider'
import { tradingViewService } from './tradingview'

type TradingViewIntent =
  | { kind: 'open' }
  | { kind: 'set_symbol'; symbol: string; timeframe?: string | null }
  | { kind: 'set_timeframe'; timeframe: string }
  | { kind: 'report_state' }

type TradingViewDeps = Pick<
  typeof tradingViewService,
  'open' | 'setSymbol' | 'setTimeframe' | 'getState'
>

const TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1',
  '3m': '3',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '45m': '45',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '1d': '1D',
  '1s': '1S',
  '1w': '1W',
  '1mo': '1M',
  '1mes': '1M',
  diario: '1D',
  diário: '1D',
  semanal: '1W',
  mensal: '1M'
}

export async function maybeHandleTradingViewTutorRequest(
  prompt: string,
  deps: TradingViewDeps = tradingViewService
): Promise<TutorResponse | null> {
  const intent = parseTradingViewIntent(prompt) ?? await maybeInferTradingViewIntent(prompt)
  if (!intent) return null

  switch (intent.kind) {
    case 'open': {
      const state = await deps.open()
      return createTradingViewResponse('Abrindo o TradingView no app.', state, buildTradingViewActions(state))
    }
    case 'set_symbol': {
      let state = deps.getState()
      if (!state.connected) {
        state = await deps.open()
      }
      state = await deps.setSymbol(intent.symbol)
      if (intent.timeframe) {
        state = await deps.setTimeframe(intent.timeframe)
      }
      return createTradingViewResponse(
        buildNavigationMessage(intent.symbol, intent.timeframe, state),
        state,
        buildTradingViewActions(state)
      )
    }
    case 'set_timeframe': {
      let state = deps.getState()
      if (!state.connected) {
        state = await deps.open()
      }
      state = await deps.setTimeframe(intent.timeframe)
      return createTradingViewResponse(
        `Ajustando o gráfico para ${formatTimeframeLabel(intent.timeframe)}.`,
        state,
        buildTradingViewActions(state)
      )
    }
    case 'report_state':
      return createTradingViewResponse(
        buildStateSummary(deps.getState()),
        deps.getState(),
        buildTradingViewActions(deps.getState())
      )
  }
}

function parseTradingViewIntent(rawPrompt: string): TradingViewIntent | null {
  const normalized = normalizePrompt(rawPrompt)
  if (!normalized) return null

  const timeframe = extractTimeframe(normalized)
  const symbol = extractSymbol(rawPrompt)

  if (
    /\b(abr(e|ir)|abre ai|abre o tradingview|abre o grafico|abre o gráfico|mostra o grafico|mostra o gráfico)\b/.test(normalized)
    && !symbol
  ) {
    return { kind: 'open' }
  }

  if (
    /\b(qual ativo|qual timeframe|que ativo|que timeframe|o que ta no tradingview|o que está no tradingview|resume o grafico|resume o gráfico|le essa vela|lê essa vela|qual e essa vela|qual é essa vela|qual e essa candle|qual é essa candle)\b/.test(normalized)
  ) {
    return { kind: 'report_state' }
  }

  if (symbol && looksLikeTradingViewPrompt(normalized)) {
    return { kind: 'set_symbol', symbol, timeframe }
  }

  if (timeframe && looksLikeTradingViewPrompt(normalized)) {
    return { kind: 'set_timeframe', timeframe }
  }

  return null
}

function normalizePrompt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!?.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeTradingViewPrompt(normalizedPrompt: string): boolean {
  return /\b(tradingview|grafico|gráfico|ativo|par|ticker|timeframe|candle|vela|abre|mostra|vai para|muda|troca)\b/.test(normalizedPrompt)
}

function extractTimeframe(normalizedPrompt: string): string | null {
  const direct = normalizedPrompt.match(/\b(1m|3m|5m|15m|30m|45m|1h|2h|4h|1d|1w|1mo)\b/)
  if (direct?.[1]) return TIMEFRAME_MAP[direct[1]] ?? direct[1]

  const words = normalizedPrompt.match(/\b(diario|diário|semanal|mensal|1mes)\b/)
  if (words?.[1]) return TIMEFRAME_MAP[words[1]] ?? words[1]

  return null
}

function extractSymbol(rawPrompt: string): string | null {
  const compact = rawPrompt.replace(/\s+/g, ' ')
  const explicit = compact.match(/\b([A-Za-z]{2,12}:[A-Za-z0-9._-]{2,24}|[A-Za-z]{3,20}(?:USDT|USD|BTC|ETH|PERP|BRL)|[A-Za-z]{3,12}\/[A-Za-z]{3,12})\b/)
  if (explicit?.[1]) {
    return explicit[1].replace('/', '').toUpperCase()
  }

  const trailing = compact.match(/(?:de|do|da|para|pro|pra)\s+([A-Za-z0-9:_/-]{3,24})(?:\s+(?:em|no|na)\s+|$)/i)
  if (trailing?.[1]) {
    const candidate = trailing[1].replace('/', '').toUpperCase()
    if (/^[A-Z0-9:_-]{3,24}$/.test(candidate)) return candidate
  }

  return null
}

async function maybeInferTradingViewIntent(rawPrompt: string): Promise<TradingViewIntent | null> {
  const normalized = normalizePrompt(rawPrompt)
  if (!looksLikeTradingViewPrompt(normalized)) return null

  const state = tradingViewService.getState()
  const classifierPrompt = [
    'Classifique este pedido do usuário para o TradingView.',
    'Responda apenas JSON válido.',
    'Formato:',
    '{"intent":"open|set_symbol|set_timeframe|report_state|none","symbol":"...","timeframe":"..."}',
    'Regras:',
    '- use set_symbol quando o usuário quiser abrir ou trocar o ativo',
    '- use set_timeframe quando ele só quiser trocar timeframe',
    '- use report_state quando ele quiser um resumo do gráfico aberto',
    '- use open quando ele só quiser abrir o TradingView',
    '- timeframe deve sair no formato 1, 3, 5, 15, 30, 45, 60, 120, 240, 1D, 1W ou 1M',
    `Estado atual: símbolo=${state.symbol ?? 'nenhum'} timeframe=${state.timeframe ?? 'nenhum'}`,
    `Pedido: ${rawPrompt}`
  ].join('\n')

  let raw: string | null = null

  try {
    if (codexAuth.getStatus().authenticated) {
      raw = await codexClient.chat({
        model: 'codex-mini-latest',
        messages: [{ role: 'user', content: classifierPrompt }]
      })
    } else {
      const result = await generateRemoteText({
        sensitive: false,
        system: 'Você classifica pedidos de TradingView em JSON estrito.',
        prompt: classifierPrompt
      })
      raw = result?.text ?? null
    }
  } catch {
    raw = null
  }

  const jsonText = raw?.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonText) return null

  try {
    const parsed = JSON.parse(jsonText) as {
      intent?: string
      symbol?: string | null
      timeframe?: string | null
    }

    switch (parsed.intent) {
      case 'open':
        return { kind: 'open' }
      case 'report_state':
        return { kind: 'report_state' }
      case 'set_timeframe':
        if (parsed.timeframe) return { kind: 'set_timeframe', timeframe: parsed.timeframe }
        return null
      case 'set_symbol':
        if (!parsed.symbol) return null
        return {
          kind: 'set_symbol',
          symbol: parsed.symbol.toUpperCase(),
          timeframe: parsed.timeframe ?? null
        }
      default:
        return null
    }
  } catch {
    return null
  }
}

function createTradingViewResponse(
  content: string,
  state: TradingViewConnectorState,
  actions: TutorAction[] = []
): TutorResponse {
  return {
    domain: 'market',
    mode: 'direct',
    content,
    actions,
    provider: 'tradingview-local',
    model: 'tradingview-local',
    uncertainty: state.lowConfidence ? 0.28 : 0.12,
    should_ask_confirmation: false,
    needs_visual_confirmation: false,
    suggested_follow_ups: buildTradingViewFollowUps(state),
    warning: null,
    debug: {
      provider: 'tradingview-local',
      model: 'tradingview-local',
      latencyMs: 0,
      screenshotIncluded: false,
      screenCapturedAt: state.lastObservedAt,
      screenAgeMs: state.lastObservedAt ? Math.max(0, Date.now() - state.lastObservedAt) : null,
      changeSummary: null,
      connectorsUsed: ['tradingview'],
      dominantContextSource: 'tradingview',
      sourceConfidence: {
        bridge: 0.98,
        vision: 0,
        ocr: 0,
        memory: 0
      },
      staleContextGuarded: false
    }
  }
}

function buildTradingViewActions(state: TradingViewConnectorState): TutorAction[] {
  const actions: TutorAction[] = []

  if (!state.connected) {
    actions.push(tradingViewAction('Abrir TradingView', { action: 'open' }))
    return actions
  }

  actions.push(tradingViewAction('Resumir gráfico', { action: 'report_state' }))

  if (state.symbol !== 'BTCUSDT') {
    actions.push(tradingViewAction('Abrir BTCUSDT', { action: 'set_symbol', symbol: 'BTCUSDT' }))
  }

  if (state.timeframe !== '15') {
    actions.push(tradingViewAction('15m', { action: 'set_timeframe', timeframe: '15' }))
  }

  if (state.timeframe !== '60') {
    actions.push(tradingViewAction('1h', { action: 'set_timeframe', timeframe: '60' }))
  }

  return actions.slice(0, 4)
}

function tradingViewAction(
  label: string,
  payload: TradingViewActionPayload
): TutorAction {
  return {
    id: `tradingview:${payload.action}:${payload.symbol ?? payload.timeframe ?? label}`,
    label,
    kind: 'tradingview',
    payload
  }
}

function buildNavigationMessage(symbol: string, timeframe: string | null | undefined, state: TradingViewConnectorState): string {
  const effectiveSymbol = state.symbol ?? symbol
  const timeframeLabel = formatTimeframeLabel(timeframe ?? state.timeframe)
  return timeframeLabel
    ? `Abrindo ${effectiveSymbol} em ${timeframeLabel}.`
    : `Abrindo ${effectiveSymbol} no TradingView.`
}

function buildStateSummary(state: TradingViewConnectorState): string {
  if (!state.connected) {
    return 'O TradingView ainda não está aberto no app.'
  }

  const parts: string[] = []
  if (state.symbol) parts.push(`${state.symbol}${state.timeframe ? ` em ${formatTimeframeLabel(state.timeframe)}` : ''}`)
  if (state.currentPrice) parts.push(`preço ${state.currentPrice}`)
  if (state.priceChange) parts.push(`variação ${state.priceChange}`)

  let summary = parts.length ? `Estou com ${parts.join(' · ')}.` : 'Estou com o TradingView aberto.'

  if (state.crosshairActive && state.hoveredCandleTime) {
    summary += ` O mouse está sobre a vela de ${state.hoveredCandleTime}.`
  }

  if (state.ohlc.close) {
    summary += ` OHLC ${state.ohlcSource === 'hovered' ? 'da vela sob o mouse' : 'visível'}: O ${state.ohlc.open ?? '?'} | H ${state.ohlc.high ?? '?'} | L ${state.ohlc.low ?? '?'} | C ${state.ohlc.close ?? '?'}.`
  }

  return summary
}

function buildTradingViewFollowUps(state: TradingViewConnectorState): string[] {
  const followUps = new Set<string>()
  if (state.symbol) {
    followUps.add('Resume o gráfico')
  }
  if (state.crosshairActive) {
    followUps.add('Lê essa vela')
  }
  if (state.timeframe !== '15') followUps.add('Muda para 15m')
  if (state.timeframe !== '60') followUps.add('Muda para 1h')
  followUps.add('Abre BTCUSDT')
  return [...followUps].slice(0, 4)
}

function formatTimeframeLabel(timeframe: string | null | undefined): string | null {
  if (!timeframe) return null
  switch (timeframe) {
    case '1':
      return '1m'
    case '3':
      return '3m'
    case '5':
      return '5m'
    case '15':
      return '15m'
    case '30':
      return '30m'
    case '45':
      return '45m'
    case '60':
      return '1h'
    case '120':
      return '2h'
    case '240':
      return '4h'
    default:
      return timeframe
  }
}
