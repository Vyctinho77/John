import type { MarketRegime, MarketSessionState } from '@shared/market-autonomy.types'
import type { TradingViewConnectorState } from '@shared/perception.types'

const CRYPTO_HINTS = ['BINANCE', 'BYBIT', 'OKX', 'COINBASE', 'KRAKEN']
const FOREX_HINTS = ['FX', 'FOREX', 'OANDA', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF']
const US_EQUITY_EXCHANGES = ['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'CBOE']

export interface MarketRegimeAssessment {
  marketRegime: MarketRegime
  session: MarketSessionState
  reasons: string[]
}

export function assessMarketRegime(state: TradingViewConnectorState): MarketRegimeAssessment {
  const session = inferMarketSession(state)
  const reasons: string[] = []

  if (!state.connected || !state.symbol) {
    return {
      marketRegime: 'uncertain',
      session,
      reasons: ['connector_unavailable']
    }
  }

  if (
    state.lowConfidence
    || state.ohlcConfidence < 0.45
    || (!state.currentPrice && !state.ohlc.close)
  ) {
    return {
      marketRegime: 'low_liquidity',
      session,
      reasons: ['low_observation_confidence']
    }
  }

  const priceChangePct = parsePercent(state.priceChange)
  const hasExpansionHints = hasAnyHint(state, [
    'range-expansion',
    'outside-bar',
    'impulse-candle'
  ])
  const hasCompressionHints = hasAnyHint(state, [
    'range-compression',
    'three-candle-tightening',
    'inside-bar',
    'indecision'
  ])
  const bullishBias = hasAnyHint(state, [
    'higher-structure',
    'directional-sequence',
    'macd-positive',
    'rsi-firm'
  ]) || state.candleDirection === 'bullish'
  const bearishBias = hasAnyHint(state, [
    'lower-structure',
    'directional-sequence',
    'macd-negative',
    'rsi-soft'
  ]) || state.candleDirection === 'bearish'

  if (
    state.rangeState === 'expanding'
    && (hasExpansionHints || (priceChangePct != null && Math.abs(priceChangePct) >= 1))
  ) {
    reasons.push('range_expanding')
    if (hasExpansionHints) reasons.push('expansion_pattern_detected')
    if (priceChangePct != null && Math.abs(priceChangePct) >= 1) reasons.push('price_change_elevated')
    return { marketRegime: 'high_volatility', session, reasons }
  }

  if (
    bullishBias !== bearishBias
    && (
      hasAnyHint(state, ['higher-structure', 'lower-structure'])
      || state.rangeState === 'expanding'
      || hasAnyHint(state, ['directional-sequence'])
    )
  ) {
    reasons.push(bullishBias ? 'bullish_bias' : 'bearish_bias')
    if (state.rangeState === 'expanding') reasons.push('range_supports_trend')
    return { marketRegime: 'trending', session, reasons }
  }

  if (
    state.rangeState === 'contracting'
    || state.rangeState === 'balanced'
    || hasCompressionHints
  ) {
    if (state.rangeState !== 'unknown') reasons.push(`range_${state.rangeState}`)
    if (hasCompressionHints) reasons.push('compression_pattern_detected')
    return { marketRegime: 'ranging', session, reasons }
  }

  return {
    marketRegime: 'uncertain',
    session,
    reasons: ['insufficient_structure']
  }
}

export function inferMarketSession(state: TradingViewConnectorState): MarketSessionState {
  if (!state.symbol) return 'unknown'

  const exchange = (state.exchange ?? '').toUpperCase()
  const symbol = state.symbol.toUpperCase()

  if (containsAny(exchange, CRYPTO_HINTS) || /\b(BTC|ETH|SOL|XRP|USDT|USDC)\b/.test(symbol)) {
    return 'open'
  }

  if (containsAny(exchange, FOREX_HINTS) || /^[A-Z]{6}$/.test(symbol)) {
    return 'open'
  }

  if (!containsAny(exchange, US_EQUITY_EXCHANGES)) {
    return 'unknown'
  }

  const now = getUsMarketClockParts()
  if (!now) return 'unknown'

  const minutes = now.hour * 60 + now.minute
  if (minutes >= 240 && minutes < 570) return 'pre_market'
  if (minutes >= 570 && minutes < 960) return 'open'
  if (minutes >= 960 && minutes < 1200) return 'after_hours'
  return 'closed'
}

function hasAnyHint(
  state: TradingViewConnectorState,
  expectedHints: string[]
): boolean {
  const hintSet = new Set([
    ...state.patternHints,
    ...state.structureHints,
    ...state.contextualPatternHints,
    ...state.sequencePatternHints,
    ...state.indicatorSignals
  ])

  return expectedHints.some(hint => hintSet.has(hint))
}

function containsAny(value: string, hints: string[]): boolean {
  return hints.some(hint => value.includes(hint))
}

function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/[+-]?\d[\d.,]*/)
  if (!match?.[0]) return null
  return parseNormalizedNumber(match[0])
}

function parseNormalizedNumber(value: string): number | null {
  const normalized = value
    .replace(/\s+/g, '')
    .replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function getUsMarketClockParts(): { hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(new Date())

    const hour = Number(parts.find(part => part.type === 'hour')?.value ?? NaN)
    const minute = Number(parts.find(part => part.type === 'minute')?.value ?? NaN)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
    return { hour, minute }
  } catch {
    return null
  }
}
