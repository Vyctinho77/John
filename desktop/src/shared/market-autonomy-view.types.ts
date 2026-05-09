import type {
  ExecutionIntent,
  MarketGuardStatus,
  MarketSnapshot,
  RiskDecision,
  TradeAuditRecord
} from './market-autonomy.types'
import type { MacroEvent, MarketNewsItem } from './perception.types'

export interface MarketAutonomyStrategyView {
  strategyId: string
  eligible: boolean
  reason: string
  idea: {
    symbol: string
    side: 'long' | 'short'
    confidence: number
    thesis: string
    invalidation: string
    entryType: 'market' | 'limit' | 'stop_limit'
    entryPrice?: number
    stopLossPrice?: number
    takeProfitPrice?: number
    tags: string[]
  } | null
}

export interface TradeCopilotProposalView {
  status: 'no_trade' | 'blocked' | 'candidate'
  symbol: string
  timeframe: string
  marketRegime: MarketSnapshot['marketRegime']
  strategyId: string | null
  side: 'long' | 'short' | null
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
}

export interface MarketAutonomyViewSnapshot {
  snapshot: MarketSnapshot | null
  snapshotReasons: string[]
  strategy: MarketAutonomyStrategyView | null
  proposal: TradeCopilotProposalView | null
  riskDecision: RiskDecision | null
  executionIntent: ExecutionIntent | null
  marketGuards: MarketGuardStatus & {
    hotNewsItems: MarketNewsItem[]
    upcomingMacroEvents: MacroEvent[]
  }
  lastValidSnapshot: MarketSnapshot | null
  invalidReason: string | null
  recentAuditTrail: TradeAuditRecord[]
}
