import type {
  BrokerOrderRequest,
  ExecutionIntent,
  RiskDecision,
  TradeIdea
} from '@shared/market-autonomy.types'

export function buildExecutionIntent(
  idea: TradeIdea,
  riskDecision: RiskDecision,
  broker: ExecutionIntent['broker'] = 'paper'
): ExecutionIntent | null {
  const positionSize = riskDecision.positionSize
  if (!riskDecision.allowed || !positionSize || positionSize.quantity <= 0) {
    return null
  }

  const entryOrder = {
    symbol: idea.symbol,
    side: idea.side === 'long' ? 'buy' as const : 'sell' as const,
    type: resolveEntryOrderType(idea),
    quantity: positionSize.quantity,
    limitPrice: idea.entry.type === 'market' ? undefined : idea.entry.price,
    stopPrice: undefined,
    clientOrderId: `entry-${idea.strategyId}-${Date.now()}`
  }

  const protectiveOrders: BrokerOrderRequest[] = []

  if (idea.stopLoss?.price) {
    protectiveOrders.push({
      symbol: idea.symbol,
      side: idea.side === 'long' ? 'sell' as const : 'buy' as const,
      type: 'stop' as const,
      quantity: positionSize.quantity,
      stopPrice: idea.stopLoss.price,
      clientOrderId: `stop-${idea.strategyId}-${Date.now()}`
    })
  }

  if (idea.takeProfit?.price) {
    protectiveOrders.push({
      symbol: idea.symbol,
      side: idea.side === 'long' ? 'sell' as const : 'buy' as const,
      type: 'limit' as const,
      quantity: positionSize.quantity,
      limitPrice: idea.takeProfit.price,
      clientOrderId: `tp-${idea.strategyId}-${Date.now()}`
    })
  }

  return {
    broker,
    symbol: idea.symbol,
    side: entryOrder.side,
    quantity: positionSize.quantity,
    entryOrder,
    protectiveOrders
  }
}

function resolveEntryOrderType(idea: TradeIdea): ExecutionIntent['entryOrder']['type'] {
  if (idea.entry.type === 'stop_limit') return 'stop_limit'
  if (idea.entry.type === 'market') return 'market'
  return 'limit'
}
