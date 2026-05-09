import { randomUUID } from 'crypto'
import type {
  BrokerAdapter,
  UnsubscribeFn
} from './brokers/base.ts'
import type {
  BrokerOrderEvent,
  ExecutionIntent,
  ExecutionResult,
  MarketSnapshot,
  PositionState,
  RiskDecision,
  TradeIdea
} from '../../shared/market-autonomy.types'
import { appendTradeAuditRecord } from './trade-audit-log.ts'
import { safeRecordDiagnosticEvent } from './observability.ts'

export interface SimulatedTradeRunInput {
  broker: BrokerAdapter
  snapshot: MarketSnapshot
  idea: TradeIdea
  riskDecision: RiskDecision
  executionIntent: ExecutionIntent
}

export interface SimulatedTradeRunResult {
  runId: string
  executed: boolean
  riskAllowed: boolean
  executionResult: ExecutionResult | null
  orderEvents: BrokerOrderEvent[]
  openPositionsAfterRun: PositionState[]
}

export async function simulateTradeRun(
  input: SimulatedTradeRunInput
): Promise<SimulatedTradeRunResult> {
  const runId = randomUUID()
  const orderEvents: BrokerOrderEvent[] = []
  const unsubscribe = await subscribeAndCollect(input.broker, orderEvents)

  appendTradeAuditRecord({
    symbol: input.idea.symbol,
    strategyId: input.idea.strategyId,
    phase: 'idea',
    snapshotTimestamp: input.snapshot.timestamp,
    payload: {
      confidence: input.idea.confidence,
      marketRegime: input.snapshot.marketRegime,
      side: input.idea.side,
      entryType: input.idea.entry.type
    }
  })

  appendTradeAuditRecord({
    symbol: input.idea.symbol,
    strategyId: input.idea.strategyId,
    phase: input.riskDecision.allowed ? 'risk' : 'blocked',
    snapshotTimestamp: input.snapshot.timestamp,
    payload: {
      allowed: input.riskDecision.allowed,
      reason: input.riskDecision.reason,
      violations: input.riskDecision.violations.join(','),
      cooldownUntil: input.riskDecision.cooldownUntil
    }
  })

  let executionResult: ExecutionResult | null = null

  if (input.riskDecision.allowed) {
    appendTradeAuditRecord({
      symbol: input.idea.symbol,
      strategyId: input.idea.strategyId,
      phase: 'execution',
      snapshotTimestamp: input.snapshot.timestamp,
      payload: {
        broker: input.executionIntent.broker,
        quantity: input.executionIntent.quantity,
        side: input.executionIntent.side,
        protectiveOrderCount: input.executionIntent.protectiveOrders.length
      }
    })

    executionResult = await input.broker.placeOrder(input.executionIntent)

    void safeRecordDiagnosticEvent({
      type: 'trace',
      source: 'main',
      action: 'trade_run_executed',
      details: {
        symbol: input.idea.symbol,
        strategyId: input.idea.strategyId,
        accepted: executionResult.accepted,
        orderCount: executionResult.orderIds.length
      }
    })
  } else {
    void safeRecordDiagnosticEvent({
      type: 'trace',
      source: 'main',
      action: 'trade_run_blocked',
      details: {
        symbol: input.idea.symbol,
        strategyId: input.idea.strategyId,
        reason: input.riskDecision.reason,
        violations: input.riskDecision.violations.join(',')
      }
    })
  }

  const openPositionsAfterRun = await input.broker.getOpenPositions()

  appendTradeAuditRecord({
    symbol: input.idea.symbol,
    strategyId: input.idea.strategyId,
    phase: 'reconciliation',
    snapshotTimestamp: input.snapshot.timestamp,
    payload: {
      executed: Boolean(executionResult?.accepted),
      eventCount: orderEvents.length,
      positionCount: openPositionsAfterRun.length
    }
  })

  unsubscribe()

  return {
    runId,
    executed: Boolean(executionResult?.accepted),
    riskAllowed: input.riskDecision.allowed,
    executionResult,
    orderEvents,
    openPositionsAfterRun
  }
}

async function subscribeAndCollect(
  broker: BrokerAdapter,
  orderEvents: BrokerOrderEvent[]
): Promise<UnsubscribeFn> {
  return broker.subscribeOrderEvents(event => {
    orderEvents.push(event)
  })
}
