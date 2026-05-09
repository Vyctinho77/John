import type {
  ExecutionIntent,
  MarketAutonomyPolicy,
  MarketSnapshot,
  RiskDecision,
  TradeIdea
} from '../../shared/market-autonomy.types'
import { PaperBroker, type PaperBrokerScenario } from './brokers/paper-broker.ts'
import { evaluateTradeRisk } from './risk-engine.ts'
import { simulateTradeRun } from './trade-supervisor.ts'

export type ChaosScenarioId =
  | 'cooldown_active'
  | 'symbol_blocked'
  | 'strategy_blocked'
  | 'max_positions_reached'
  | 'broker_rejects_order'
  | 'partial_fill_then_cancel'
  | 'reconciliation_broken'

export interface ChaosScenarioInput {
  snapshot: MarketSnapshot
  idea: TradeIdea
  executionIntent: ExecutionIntent
  policy: MarketAutonomyPolicy
}

export interface ChaosScenarioResult {
  scenario: ChaosScenarioId
  riskDecision: RiskDecision
  executed: boolean
  eventTypes: string[]
  positionCountAfterRun: number
}

export async function runChaosScenario(
  scenario: ChaosScenarioId,
  input: ChaosScenarioInput
): Promise<ChaosScenarioResult> {
  const broker = new PaperBroker(resolvePaperScenario(scenario))
  const riskDecision = evaluateTradeRisk(input.idea, {
    policy: resolvePolicyOverride(scenario, input.policy, input.idea),
    openPositions: buildOpenPositionsOverride(scenario, input.idea.symbol),
    openOrderCount: 0,
    dailyRealizedPnlUsd: 0,
    tradesExecutedThisSession: 0,
    cooldownUntil: scenario === 'cooldown_active' ? Date.now() + 60_000 : null
  })

  const result = await simulateTradeRun({
    broker,
    snapshot: input.snapshot,
    idea: input.idea,
    riskDecision,
    executionIntent: input.executionIntent
  })

  return {
    scenario,
    riskDecision,
    executed: result.executed,
    eventTypes: result.orderEvents.map(event => event.type),
    positionCountAfterRun: result.openPositionsAfterRun.length
  }
}

export async function runAllChaosScenarios(
  input: ChaosScenarioInput
): Promise<ChaosScenarioResult[]> {
  const scenarios: ChaosScenarioId[] = [
    'cooldown_active',
    'symbol_blocked',
    'strategy_blocked',
    'max_positions_reached',
    'broker_rejects_order',
    'partial_fill_then_cancel',
    'reconciliation_broken'
  ]

  const results: ChaosScenarioResult[] = []
  for (const scenario of scenarios) {
    results.push(await runChaosScenario(scenario, input))
  }
  return results
}

function resolvePaperScenario(scenario: ChaosScenarioId): PaperBrokerScenario {
  switch (scenario) {
    case 'broker_rejects_order':
      return { rejectOrders: true, rejectionReason: 'simulated_broker_rejection' }
    case 'partial_fill_then_cancel':
      return { partialFillRatio: 0.5, cancelAfterPartialFill: true }
    case 'reconciliation_broken':
      return { breakReconciliation: true }
    default:
      return {}
  }
}

function resolvePolicyOverride(
  scenario: ChaosScenarioId,
  policy: MarketAutonomyPolicy,
  idea: TradeIdea
): MarketAutonomyPolicy {
  switch (scenario) {
    case 'symbol_blocked':
      return {
        ...policy,
        allowedSymbols: [idea.symbol === 'BTCUSDT' ? 'ETHUSDT' : 'BTCUSDT']
      }
    case 'strategy_blocked':
      return {
        ...policy,
        allowedStrategies: [idea.strategyId === 'breakout_v1' ? 'mean_reversion_v1' : 'breakout_v1']
      }
    default:
      return policy
  }
}

function buildOpenPositionsOverride(
  scenario: ChaosScenarioId,
  symbol: string
) {
  if (scenario !== 'max_positions_reached') return []

  return [{
    symbol,
    side: 'long' as const,
    quantity: 1,
    averageEntryPrice: 100,
    markPrice: 100,
    unrealizedPnl: 0,
    realizedPnl: 0,
    openedAt: Date.now(),
    updatedAt: Date.now()
  }]
}
