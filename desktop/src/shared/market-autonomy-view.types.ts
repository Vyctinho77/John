import type {
  ExecutionIntent,
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

export interface MarketAutonomyViewSnapshot {
  snapshot: MarketSnapshot | null
  snapshotReasons: string[]
  strategy: MarketAutonomyStrategyView | null
  riskDecision: RiskDecision | null
  executionIntent: ExecutionIntent | null
  marketGuards: {
    hasHotNews: boolean
    macroBlocked: boolean
    hotNewsItems: MarketNewsItem[]
    upcomingMacroEvents: MacroEvent[]
  }
  lastValidSnapshot: MarketSnapshot | null
  invalidReason: string | null
  recentAuditTrail: TradeAuditRecord[]
}
