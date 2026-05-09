import type {
  MarketSnapshot,
  OrderState,
  PositionState
} from '@shared/market-autonomy.types'
import type { TradingViewConnectorState } from '@shared/perception.types'
import { newsService } from './news-service.ts'
import { assessMarketRegime } from './market-regime.ts'

export interface BuildMarketSnapshotOptions {
  tradingViewState?: TradingViewConnectorState
  openPosition?: PositionState | null
  openOrders?: OrderState[]
}

export interface MarketSnapshotEnvelope {
  snapshot: MarketSnapshot | null
  reasons: string[]
}

export function getCurrentMarketSnapshot(
  options: BuildMarketSnapshotOptions = {}
): MarketSnapshotEnvelope {
  const state = options.tradingViewState
  if (!state) {
    return { snapshot: null, reasons: ['tradingview_state_unavailable'] }
  }
  return buildMarketSnapshotFromTradingView(state, options)
}

export function buildMarketSnapshotFromTradingView(
  state: TradingViewConnectorState,
  options: BuildMarketSnapshotOptions = {}
): MarketSnapshotEnvelope {
  const reasons: string[] = []
  const symbol = normalizeSymbol(state.symbol)
  const timeframe = normalizeTimeframe(state.timeframe)
  const lastPrice = parseTradingViewNumber(state.currentPrice ?? state.ohlc.close)

  if (!state.connected) reasons.push('tradingview_disconnected')
  if (!symbol) reasons.push('missing_symbol')
  if (!timeframe) reasons.push('missing_timeframe')
  if (lastPrice == null) reasons.push('missing_last_price')

  if (reasons.length > 0 || !symbol || !timeframe || lastPrice == null) {
    return { snapshot: null, reasons }
  }

  const regime = assessMarketRegime(state)
  const previousCandle = toCandle(state.previousOhlc, state.previousCandleTime, timeframe)
  const currentCandle = toCandle(state.ohlc, state.hoveredCandleTime, timeframe)
  const candles = [previousCandle, currentCandle].filter(Boolean) as MarketSnapshot['candles']
  const indicators = extractNumericIndicators(state.indicatorValues)
  const newsSnapshot = newsService.getSnapshot()

  if (newsSnapshot.symbol && newsSnapshot.symbol.toUpperCase() === symbol) {
    indicators.hot_news_count = newsSnapshot.hotItems.length
    indicators.news_item_count = newsSnapshot.items.length
  }

  return {
    snapshot: {
      symbol,
      venue: state.exchange ?? 'tradingview',
      timeframe,
      timestamp: state.lastObservedAt ?? Date.now(),
      marketRegime: regime.marketRegime,
      lastPrice,
      spreadBps: undefined,
      candles,
      indicators,
      openPosition: options.openPosition ?? null,
      openOrders: options.openOrders ?? [],
      session: regime.session
    },
    reasons: regime.reasons
  }
}

function toCandle(
  ohlc: TradingViewConnectorState['ohlc'] | null | undefined,
  candleTime: string | null,
  timeframe: string
) {
  const open = parseTradingViewNumber(ohlc?.open ?? null)
  const high = parseTradingViewNumber(ohlc?.high ?? null)
  const low = parseTradingViewNumber(ohlc?.low ?? null)
  const close = parseTradingViewNumber(ohlc?.close ?? null)

  if ([open, high, low, close].some(value => value == null)) {
    return null
  }

  return {
    timestamp: parseCandleTimestamp(candleTime, timeframe),
    open: open as number,
    high: high as number,
    low: low as number,
    close: close as number
  }
}

function parseCandleTimestamp(candleTime: string | null, timeframe: string): number {
  if (candleTime) {
    const parsed = Date.parse(candleTime)
    if (Number.isFinite(parsed)) return parsed
  }

  const timeframeMs = parseTimeframeMs(timeframe)
  return Date.now() - timeframeMs
}

function parseTimeframeMs(timeframe: string): number {
  const normalized = timeframe.trim().toLowerCase()
  const value = Number(normalized.replace(/[^\d]/g, ''))
  if (!Number.isFinite(value) || value <= 0) return 60_000

  if (normalized.endsWith('h')) return value * 60 * 60 * 1000
  if (normalized.endsWith('d')) return value * 24 * 60 * 60 * 1000
  return value * 60 * 1000
}

function normalizeSymbol(symbol: string | null | undefined): string | null {
  const trimmed = symbol?.trim().toUpperCase() ?? ''
  return trimmed || null
}

function normalizeTimeframe(timeframe: string | null | undefined): string | null {
  const trimmed = timeframe?.trim() ?? ''
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) return `${trimmed}m`
  return trimmed.toLowerCase()
}

function extractNumericIndicators(values: Record<string, string>): Record<string, number> {
  const indicators: Record<string, number> = {}
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const parsed = parseTradingViewNumber(rawValue)
    if (parsed == null) continue
    indicators[normalizeIndicatorKey(rawKey)] = parsed
  }
  return indicators
}

function normalizeIndicatorKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseTradingViewNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/[+-]?\d[\d.,]*/)
  if (!match?.[0]) return null
  const normalized = match[0]
    .replace(/\s+/g, '')
    .replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}
