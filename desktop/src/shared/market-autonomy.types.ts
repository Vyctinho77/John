export type MarketRegime =
  | 'trending'
  | 'ranging'
  | 'high_volatility'
  | 'low_liquidity'
  | 'uncertain'

export type MarketSessionState =
  | 'pre_market'
  | 'open'
  | 'after_hours'
  | 'closed'
  | 'unknown'

export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface OrderState {
  id: string
  clientOrderId: string
  broker: string
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit' | 'stop' | 'stop_limit'
  status: 'pending' | 'accepted' | 'partially_filled' | 'filled' | 'canceled' | 'rejected'
  quantity: number
  filledQuantity: number
  remainingQuantity: number
  limitPrice: number | null
  stopPrice: number | null
  averageFillPrice: number | null
  createdAt: number
  updatedAt: number
  rejectionReason?: string | null
}

export interface PositionState {
  symbol: string
  side: 'long' | 'short'
  quantity: number
  averageEntryPrice: number
  markPrice: number
  unrealizedPnl: number
  realizedPnl: number
  openedAt: number
  updatedAt: number
}

export interface MarketSnapshot {
  symbol: string
  venue: string
  timeframe: string
  timestamp: number
  marketRegime: MarketRegime
  lastPrice: number
  bid?: number
  ask?: number
  spreadBps?: number
  candles: Candle[]
  indicators: Record<string, number>
  openPosition: PositionState | null
  openOrders: OrderState[]
  session: MarketSessionState
}

export interface TradeIdea {
  strategyId: string
  symbol: string
  side: 'long' | 'short'
  confidence: number
  thesis: string
  invalidation: string
  marketRegime: MarketRegime
  entry: {
    type: 'market' | 'limit' | 'stop_limit'
    price?: number
  }
  stopLoss?: {
    price: number
  }
  takeProfit?: {
    price: number
  }
  timeHorizon: 'scalp' | 'intraday' | 'swing'
  tags: string[]
}

export interface RiskDecision {
  allowed: boolean
  reason: string
  violations: string[]
  cooldownUntil: number | null
  positionSize?: {
    quantity: number
    notional: number
    riskUsd: number
  }
}

export interface MarketGuardStatus {
  hasHotNews: boolean
  macroBlocked: boolean
  hotNewsCount: number
  upcomingMacroEventCount: number
}

export interface BrokerOrderRequest {
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit' | 'stop' | 'stop_limit'
  quantity: number
  limitPrice?: number
  stopPrice?: number
  clientOrderId?: string
}

export interface ExecutionIntent {
  broker: 'paper' | 'alpaca' | 'ibkr' | 'unknown'
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  entryOrder: BrokerOrderRequest
  protectiveOrders: BrokerOrderRequest[]
}

export interface ExecutionResult {
  accepted: boolean
  orderIds: string[]
  message: string
}

export interface BrokerOrderEvent {
  type: 'accepted' | 'partially_filled' | 'filled' | 'canceled' | 'rejected'
  order: OrderState
  at: number
}

export interface AccountState {
  broker: string
  equityUsd: number
  cashUsd: number
  buyingPowerUsd: number
  realizedPnlUsd: number
  unrealizedPnlUsd: number
  updatedAt: number
}

export interface BrokerReplacePatch {
  quantity?: number
  limitPrice?: number
  stopPrice?: number
}

export interface TradeAuditRecord {
  id: string
  symbol: string
  strategyId: string
  phase: 'idea' | 'risk' | 'execution' | 'reconciliation' | 'closed' | 'blocked'
  snapshotTimestamp: number
  createdAt: number
  payload: Record<string, string | number | boolean | null>
}

export interface MarketAutonomyPolicy {
  mode: 'read_only' | 'copilot' | 'paper_auto' | 'live_guarded'
  allowedSymbols: string[]
  allowedTimeframes: string[]
  allowedStrategies: string[]
  maxRiskPerTradeUsd: number
  maxDailyLossUsd: number
  maxTradesPerSession: number
  maxOpenPositions: number
  maxOpenOrders: number
  requireStopLoss: boolean
  requireTakeProfit: boolean
  allowMarketOrders: boolean
  allowOvernight: boolean
  cooldownAfterLossSec: number
  blockNearMacroEventsMin: number
}
