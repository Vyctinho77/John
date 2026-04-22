import type {
  MarketRegime,
  MarketSnapshot,
  TradeIdea
} from '@shared/market-autonomy.types'

export interface StrategyIdeaResult {
  eligible: boolean
  reason: string
  idea: TradeIdea | null
}

export function evaluateBreakoutIdea(snapshot: MarketSnapshot): StrategyIdeaResult {
  const currentCandle = snapshot.candles[snapshot.candles.length - 1] ?? null
  const previousCandle = snapshot.candles[snapshot.candles.length - 2] ?? null

  if (!currentCandle || !previousCandle) {
    return {
      eligible: false,
      reason: 'insufficient_candles',
      idea: null
    }
  }

  if (!isBreakoutRegime(snapshot.marketRegime)) {
    return {
      eligible: false,
      reason: 'regime_not_breakout_friendly',
      idea: null
    }
  }

  const breakoutUp = snapshot.lastPrice >= previousCandle.high && currentCandle.close > currentCandle.open
  const breakoutDown = snapshot.lastPrice <= previousCandle.low && currentCandle.close < currentCandle.open

  if (!breakoutUp && !breakoutDown) {
    return {
      eligible: false,
      reason: 'no_breakout_trigger',
      idea: null
    }
  }

  const side = breakoutUp ? 'long' : 'short'
  const entryPrice = snapshot.lastPrice
  const stopPrice = breakoutUp
    ? Math.min(currentCandle.low, previousCandle.low)
    : Math.max(currentCandle.high, previousCandle.high)
  const riskDistance = Math.abs(entryPrice - stopPrice)

  if (riskDistance <= 0) {
    return {
      eligible: false,
      reason: 'invalid_stop_distance',
      idea: null
    }
  }

  const takeProfit = breakoutUp
    ? entryPrice + riskDistance * 1.8
    : entryPrice - riskDistance * 1.8
  const breakoutStrength = Math.abs(currentCandle.close - previousCandle.close)
  const baselineRange = Math.max(previousCandle.high - previousCandle.low, 0.000001)
  const confidence = clampNumber(0.55 + breakoutStrength / baselineRange * 0.2, 0.55, 0.92)

  return {
    eligible: true,
    reason: breakoutUp ? 'bullish_breakout_confirmed' : 'bearish_breakout_confirmed',
    idea: {
      strategyId: 'breakout_v1',
      symbol: snapshot.symbol,
      side,
      confidence: Number(confidence.toFixed(2)),
      thesis: buildBreakoutThesis(snapshot, side, previousCandle),
      invalidation: side === 'long'
        ? `Perde o fundo de ${stopPrice.toFixed(4)} e falha em sustentar o rompimento.`
        : `Retoma acima de ${stopPrice.toFixed(4)} e invalida a ruptura para baixo.`,
      marketRegime: snapshot.marketRegime,
      entry: {
        type: 'limit',
        price: entryPrice
      },
      stopLoss: {
        price: Number(stopPrice.toFixed(4))
      },
      takeProfit: {
        price: Number(takeProfit.toFixed(4))
      },
      timeHorizon: resolveTimeHorizon(snapshot.timeframe),
      tags: [
        'breakout',
        side === 'long' ? 'momentum_up' : 'momentum_down',
        snapshot.marketRegime,
        snapshot.timeframe
      ]
    }
  }
}

function buildBreakoutThesis(
  snapshot: MarketSnapshot,
  side: 'long' | 'short',
  previousCandle: MarketSnapshot['candles'][number]
): string {
  if (side === 'long') {
    return `Preco trabalha acima da maxima anterior em ${previousCandle.high.toFixed(4)} com continuidade de fluxo no ${snapshot.timeframe}.`
  }

  return `Preco rompe a minima anterior em ${previousCandle.low.toFixed(4)} e acelera a favor da venda no ${snapshot.timeframe}.`
}

function isBreakoutRegime(regime: MarketRegime): boolean {
  return regime === 'trending' || regime === 'high_volatility'
}

function resolveTimeHorizon(timeframe: string): TradeIdea['timeHorizon'] {
  const normalized = timeframe.toLowerCase()
  if (normalized.endsWith('m')) return 'scalp'
  if (normalized.endsWith('h')) return 'intraday'
  return 'swing'
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
