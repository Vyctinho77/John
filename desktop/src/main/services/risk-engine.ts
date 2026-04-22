import type {
  MarketAutonomyPolicy,
  PositionState,
  RiskDecision,
  TradeIdea
} from '../../shared/market-autonomy.types'

export interface RiskContext {
  policy: MarketAutonomyPolicy
  openPositions: PositionState[]
  openOrderCount: number
  dailyRealizedPnlUsd: number
  tradesExecutedThisSession: number
  cooldownUntil: number | null
  currentTimeframe?: string | null
  now?: number
}

export function evaluateTradeRisk(
  idea: TradeIdea,
  context: RiskContext
): RiskDecision {
  const now = context.now ?? Date.now()
  const violations: string[] = []

  if (context.policy.mode === 'read_only') {
    violations.push('mode_read_only')
  }

  if (context.cooldownUntil !== null && now < context.cooldownUntil) {
    violations.push('cooldown_active')
  }

  if (
    context.policy.allowedSymbols.length > 0
    && !context.policy.allowedSymbols.includes(idea.symbol)
  ) {
    violations.push('symbol_not_allowed')
  }

  if (
    context.policy.allowedStrategies.length > 0
    && !context.policy.allowedStrategies.includes(idea.strategyId)
  ) {
    violations.push('strategy_not_allowed')
  }

  if (
    context.currentTimeframe
    && context.policy.allowedTimeframes.length > 0
    && !context.policy.allowedTimeframes.includes(context.currentTimeframe)
  ) {
    violations.push('timeframe_not_allowed')
  }

  if (context.openPositions.length >= context.policy.maxOpenPositions) {
    violations.push('max_open_positions_reached')
  }

  if (context.openOrderCount >= context.policy.maxOpenOrders) {
    violations.push('max_open_orders_reached')
  }

  if (context.tradesExecutedThisSession >= context.policy.maxTradesPerSession) {
    violations.push('max_trades_per_session_reached')
  }

  if (Math.abs(context.dailyRealizedPnlUsd) >= context.policy.maxDailyLossUsd && context.dailyRealizedPnlUsd < 0) {
    violations.push('max_daily_loss_reached')
  }

  if (context.policy.requireStopLoss && !idea.stopLoss) {
    violations.push('stop_loss_required')
  }

  if (context.policy.requireTakeProfit && !idea.takeProfit) {
    violations.push('take_profit_required')
  }

  if (!context.policy.allowMarketOrders && idea.entry.type === 'market') {
    violations.push('market_orders_not_allowed')
  }

  const positionSize = buildPositionSize(idea, context.policy.maxRiskPerTradeUsd)
  if (positionSize === null) {
    violations.push('invalid_position_size')
  }

  return {
    allowed: violations.length === 0,
    reason: violations.length === 0 ? 'allowed_by_policy' : violations[0],
    violations,
    cooldownUntil: context.cooldownUntil,
    positionSize: violations.length === 0 ? positionSize ?? undefined : undefined
  }
}

function buildPositionSize(
  idea: TradeIdea,
  maxRiskPerTradeUsd: number
): RiskDecision['positionSize'] | null {
  if (!idea.stopLoss?.price) return null

  const entryPrice = idea.entry.price ?? idea.takeProfit?.price ?? idea.stopLoss.price
  const stopDistance = Math.abs(entryPrice - idea.stopLoss.price)
  if (stopDistance <= 0 || maxRiskPerTradeUsd <= 0) return null

  const quantity = Number((maxRiskPerTradeUsd / stopDistance).toFixed(6))
  if (!Number.isFinite(quantity) || quantity <= 0) return null

  return {
    quantity,
    notional: Number((quantity * entryPrice).toFixed(2)),
    riskUsd: Number((quantity * stopDistance).toFixed(2))
  }
}

export function getCooldownUntilAfterLoss(
  policy: MarketAutonomyPolicy,
  lossRecordedAt: number
): number | null {
  if (policy.cooldownAfterLossSec <= 0) return null
  return lossRecordedAt + policy.cooldownAfterLossSec * 1000
}
