import type {
  ExecutionIntent,
  MarketGuardStatus,
  MarketAutonomyPolicy,
  MarketSnapshot,
  RiskDecision
} from '@shared/market-autonomy.types'
import type { BrokerAdapter } from './brokers/base.ts'
import { buildExecutionIntent } from './execution-policy.ts'
import {
  buildMarketSnapshotFromTradingView,
  type BuildMarketSnapshotOptions
} from './market-data.ts'
import { marketStateStore } from './market-state-store.ts'
import { newsService } from './news-service.ts'
import { evaluateTradeRisk } from './risk-engine.ts'
import { generateTradeIdea, type StrategyEngineResult } from './strategy-engine.ts'
import { simulateTradeRun, type SimulatedTradeRunResult } from './trade-supervisor.ts'
import { calendarService } from './calendar-service.ts'
import { safeRecordDiagnosticEvent } from './observability.ts'

export interface EvaluateMarketRunOptions {
  policy: MarketAutonomyPolicy
  broker?: BrokerAdapter
  dailyRealizedPnlUsd?: number
  tradesExecutedThisSession?: number
  cooldownUntil?: number | null
  executeTrade?: boolean
  killSwitchActive?: boolean
  snapshotOptions?: Omit<BuildMarketSnapshotOptions, 'openOrders' | 'openPosition'>
}

export interface MarketAutonomyRunResult {
  snapshot: MarketSnapshot | null
  snapshotReasons: string[]
  strategy: StrategyEngineResult | null
  riskDecision: RiskDecision | null
  executionIntent: ExecutionIntent | null
  marketGuards: MarketGuardStatus
  simulation: SimulatedTradeRunResult | null
}

export async function evaluateCurrentMarketRun(
  options: EvaluateMarketRunOptions
): Promise<MarketAutonomyRunResult> {
  const broker = options.broker
  const [openPositions, openOrders] = broker
    ? await Promise.all([broker.getOpenPositions(), broker.getOpenOrders()])
    : [[], []]

  const state = options.snapshotOptions?.tradingViewState ?? (await import('./tradingview.ts')).tradingViewService.getState()
  const snapshotEnvelope = buildMarketSnapshotFromTradingView(state, {
    ...options.snapshotOptions,
    openPosition: openPositions[0] ?? null,
    openOrders
  })

  if (!snapshotEnvelope.snapshot) {
    marketStateStore.markInvalid(snapshotEnvelope.reasons[0] ?? 'snapshot_unavailable')
    await safeRecordDiagnosticEvent({
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
      marketGuards: emptyMarketGuards(),
      simulation: null
    }
  }

  const snapshot = snapshotEnvelope.snapshot
  marketStateStore.setSnapshot(snapshot)
  const marketGuards = resolveMarketGuards(options.policy)

  const strategy = generateTradeIdea(snapshot, options.policy)
  if (!strategy.idea) {
    return {
      snapshot,
      snapshotReasons: snapshotEnvelope.reasons,
      strategy,
      riskDecision: null,
      executionIntent: null,
      marketGuards,
      simulation: null
    }
  }

  const baseRiskDecision = evaluateTradeRisk(strategy.idea, {
    policy: options.policy,
    openPositions,
    openOrderCount: openOrders.length,
    dailyRealizedPnlUsd: options.dailyRealizedPnlUsd ?? 0,
    tradesExecutedThisSession: options.tradesExecutedThisSession ?? 0,
    cooldownUntil: options.cooldownUntil ?? null,
    currentTimeframe: snapshot.timeframe,
    marketGuards
  })
  const riskDecision = options.killSwitchActive
    ? applyKillSwitch(baseRiskDecision)
    : baseRiskDecision

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

  await safeRecordDiagnosticEvent({
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
      hotNewsGuard: marketGuards.hasHotNews,
      macroGuard: marketGuards.macroBlocked,
      executed: Boolean(simulation?.executed)
    }
  })

  return {
    snapshot,
    snapshotReasons: snapshotEnvelope.reasons,
    strategy,
    riskDecision,
    executionIntent,
    marketGuards,
    simulation
  }
}

function applyKillSwitch(decision: RiskDecision): RiskDecision {
  return {
    ...decision,
    allowed: false,
    reason: 'kill_switch_active',
    violations: [...new Set([...decision.violations, 'kill_switch_active'])],
    positionSize: undefined
  }
}

function resolveMarketGuards(
  policy: MarketAutonomyPolicy
): MarketGuardStatus {
  const hotNewsCount = newsService.getSnapshot().hotItems.length
  const upcomingMacroEventCount = calendarService.getUpcoming(policy.blockNearMacroEventsMin * 60 * 1000).length

  return {
    hasHotNews: hotNewsCount > 0,
    macroBlocked: upcomingMacroEventCount > 0,
    hotNewsCount,
    upcomingMacroEventCount
  }
}

function emptyMarketGuards(): MarketGuardStatus {
  return {
    hasHotNews: false,
    macroBlocked: false,
    hotNewsCount: 0,
    upcomingMacroEventCount: 0
  }
}
