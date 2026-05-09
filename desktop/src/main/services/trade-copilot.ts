import type {
  ExecutionIntent,
  MarketGuardStatus,
  MarketSnapshot,
  RiskDecision,
  TradeIdea
} from '@shared/market-autonomy.types'

export interface TradeCopilotProposal {
  status: 'no_trade' | 'blocked' | 'candidate'
  symbol: string
  timeframe: string
  marketRegime: MarketSnapshot['marketRegime']
  strategyId: string | null
  side: TradeIdea['side'] | null
  confidence: number | null
  entryPrice: number | null
  stopLossPrice: number | null
  takeProfitPrice: number | null
  quantity: number | null
  notionalUsd: number | null
  riskUsd: number | null
  thesis: string | null
  invalidation: string | null
  blockedBy: string[]
  marketGuards: MarketGuardStatus
}

export function buildTradeCopilotProposal(input: {
  snapshot: MarketSnapshot
  idea: TradeIdea | null
  riskDecision: RiskDecision | null
  executionIntent: ExecutionIntent | null
  marketGuards: MarketGuardStatus
}): TradeCopilotProposal {
  const { snapshot, idea, riskDecision, executionIntent, marketGuards } = input

  if (!idea) {
    return {
      status: 'no_trade',
      symbol: snapshot.symbol,
      timeframe: snapshot.timeframe,
      marketRegime: snapshot.marketRegime,
      strategyId: null,
      side: null,
      confidence: null,
      entryPrice: null,
      stopLossPrice: null,
      takeProfitPrice: null,
      quantity: null,
      notionalUsd: null,
      riskUsd: null,
      thesis: null,
      invalidation: null,
      blockedBy: [],
      marketGuards
    }
  }

  const blockedBy = riskDecision?.violations ?? []
  const status = !riskDecision
    ? 'blocked'
    : riskDecision.allowed
      ? 'candidate'
      : 'blocked'

  return {
    status,
    symbol: snapshot.symbol,
    timeframe: snapshot.timeframe,
    marketRegime: snapshot.marketRegime,
    strategyId: idea.strategyId,
    side: idea.side,
    confidence: idea.confidence,
    entryPrice: idea.entry.price ?? null,
    stopLossPrice: idea.stopLoss?.price ?? null,
    takeProfitPrice: idea.takeProfit?.price ?? null,
    quantity: executionIntent?.quantity ?? riskDecision?.positionSize?.quantity ?? null,
    notionalUsd: riskDecision?.positionSize?.notional ?? null,
    riskUsd: riskDecision?.positionSize?.riskUsd ?? null,
    thesis: idea.thesis,
    invalidation: idea.invalidation,
    blockedBy,
    marketGuards
  }
}
