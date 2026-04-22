import type {
  ExecutionIntent,
  MarketAutonomyPolicy,
  MarketSnapshot,
  RiskDecision
} from '@shared/market-autonomy.types'
import type { BrokerAdapter } from './brokers/base'
import { buildExecutionIntent } from './execution-policy'
import {
  buildMarketSnapshotFromTradingView,
  type BuildMarketSnapshotOptions
} from './market-data'
import { marketStateStore } from './market-state-store'
import { recordDiagnosticEvent } from './observability'
import { evaluateTradeRisk } from './risk-engine'
import { generateTradeIdea, type StrategyEngineResult } from './strategy-engine'
import { simulateTradeRun, type SimulatedTradeRunResult } from './trade-supervisor'
import { tradingViewService } from './tradingview'

export interface EvaluateMarketRunOptions {
  policy: MarketAutonomyPolicy
  broker?: BrokerAdapter
  dailyRealizedPnlUsd?: number
  tradesExecutedThisSession?: number
  cooldownUntil?: number | null
  executeTrade?: boolean
  snapshotOptions?: Omit<BuildMarketSnapshotOptions, 'openOrders' | 'openPosition'>
}

export interface MarketAutonomyRunResult {
  snapshot: MarketSnapshot | null
  snapshotReasons: string[]
  strategy: StrategyEngineResult | null
  riskDecision: RiskDecision | null
  executionIntent: ExecutionIntent | null
  simulation: SimulatedTradeRunResult | null
}

export async function evaluateCurrentMarketRun(
  options: EvaluateMarketRunOptions
): Promise<MarketAutonomyRunResult> {
  const broker = options.broker
  const [openPositions, openOrders] = broker
    ? await Promise.all([broker.getOpenPositions(), broker.getOpenOrders()])
    : [[], []]

  const state = options.snapshotOptions?.tradingViewState ?? tradingViewService.getState()
  const snapshotEnvelope = buildMarketSnapshotFromTradingView(state, {
    ...options.snapshotOptions,
    openPosition: openPositions[0] ?? null,
    openOrders
  })

  if (!snapshotEnvelope.snapshot) {
    marketStateStore.markInvalid(snapshotEnvelope.reasons[0] ?? 'snapshot_unavailable')
    await recordDiagnosticEvent({
      type: 'trace',
      source: 'main',
      action: 'market_snapshot_unavailable',
      details: {
        reasons: snapshotEnvelope.reasons.join(',')
      }
    })
    return {
      snapshot: null,
      snapshotReasons: snapshotEnvelope.reasons,
      strategy: null,
      riskDecision: null,
      executionIntent: null,
      simulation: null
    }
  }

  const snapshot = snapshotEnvelope.snapshot
  marketStateStore.setSnapshot(snapshot)

  const strategy = generateTradeIdea(snapshot, options.policy)
  if (!strategy.idea) {
    return {
      snapshot,
      snapshotReasons: snapshotEnvelope.reasons,
      strategy,
      riskDecision: null,
      executionIntent: null,
      simulation: null
    }
  }

  const riskDecision = evaluateTradeRisk(strategy.idea, {
    policy: options.policy,
    openPositions,
    openOrderCount: openOrders.length,
    dailyRealizedPnlUsd: options.dailyRealizedPnlUsd ?? 0,
    tradesExecutedThisSession: options.tradesExecutedThisSession ?? 0,
    cooldownUntil: options.cooldownUntil ?? null,
    currentTimeframe: snapshot.timeframe
  })

  const executionIntent = buildExecutionIntent(
    strategy.idea,
    riskDecision,
    options.policy.mode === 'live_guarded' ? 'alpaca' : 'paper'
  )

  let simulation: SimulatedTradeRunResult | null = null
  if (options.executeTrade && broker && executionIntent) {
    simulation = await simulateTradeRun({
      broker,
      snapshot,
      idea: strategy.idea,
      riskDecision,
      executionIntent
    })
  }

  await recordDiagnosticEvent({
    type: 'trace',
    source: 'main',
    action: 'market_autonomy_run_evaluated',
    details: {
      symbol: snapshot.symbol,
      timeframe: snapshot.timeframe,
      marketRegime: snapshot.marketRegime,
      strategyId: strategy.strategyId,
      strategyEligible: strategy.eligible,
      riskAllowed: riskDecision.allowed,
      executed: Boolean(simulation?.executed)
    }
  })

  return {
    snapshot,
    snapshotReasons: snapshotEnvelope.reasons,
    strategy,
    riskDecision,
    executionIntent,
    simulation
  }
}
