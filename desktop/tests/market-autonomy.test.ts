import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildExecutionIntent } from '../src/main/services/execution-policy.ts'
import { buildMarketSnapshotFromTradingView } from '../src/main/services/market-data.ts'
import { evaluateCurrentMarketRun } from '../src/main/services/market-autonomy-runner.ts'
import { PaperBroker } from '../src/main/services/brokers/paper-broker.ts'
import { COPILOT_POLICY } from '../src/main/services/risk-policy.ts'
import { evaluateTradeRisk } from '../src/main/services/risk-engine.ts'
import { generateTradeIdea } from '../src/main/services/strategy-engine.ts'
import { runAllChaosScenarios } from '../src/main/services/trade-chaos-tests.ts'
import {
  appendTradeAuditRecord,
  clearTradeAuditRecords,
  listTradeAuditRecords,
  MAX_TRADE_AUDIT_RECORDS,
  resetTradeAuditCacheForTests
} from '../src/main/services/trade-audit-log.ts'
import {
  getMarketAutonomyPolicy,
  resetMarketAutonomyPolicy,
  resetMarketAutonomyPolicyCacheForTests,
  saveMarketAutonomyPolicyPatch
} from '../src/main/services/market-autonomy-policy-store.ts'
import type { MarketSnapshot, TradeIdea } from '../src/shared/market-autonomy.types.ts'
import type { TradingViewConnectorState } from '../src/shared/perception.types.ts'

function makeTradingViewState(overrides: Partial<TradingViewConnectorState> = {}): TradingViewConnectorState {
  return {
    connected: true,
    loggedIn: true,
    url: 'https://www.tradingview.com/chart',
    title: 'BTCUSDT chart',
    symbol: 'BTCUSDT',
    timeframe: '5',
    exchange: 'BINANCE',
    crosshairActive: true,
    currentPrice: '105',
    priceChange: '+2%',
    ohlc: { open: '100', high: '106', low: '99', close: '105' },
    previousOhlc: { open: '96', high: '104', low: '95', close: '100' },
    hoveredCandleTime: '2026-05-09T12:05:00.000Z',
    previousCandleTime: '2026-05-09T12:00:00.000Z',
    ohlcSource: 'last-visible',
    candleStructure: 'impulse',
    indicatorValues: { RSI: '66.2' },
    patternHints: ['range-expansion'],
    contextualPatternHints: ['impulse-candle'],
    sequencePatternHints: ['directional-sequence'],
    structureHints: ['higher-structure'],
    indicatorSignals: ['rsi-firm'],
    rangeState: 'expanding',
    recentHigh: '106',
    recentLow: '95',
    ohlcConfidence: 0.92,
    crosshairConfidence: 0.86,
    indicatorConfidence: 0.78,
    layoutHints: [],
    watchlistVisible: true,
    indicatorsVisible: true,
    drawingToolsVisible: false,
    selectedPanel: null,
    candleDirection: 'bullish',
    lowConfidence: false,
    lastObservedAt: 100_000,
    ...overrides
  }
}

function makeIdea(overrides: Partial<TradeIdea> = {}): TradeIdea {
  return {
    strategyId: 'breakout_v1',
    symbol: 'BTCUSDT',
    side: 'long',
    confidence: 0.72,
    thesis: 'Breakout test',
    invalidation: 'Back below stop',
    marketRegime: 'trending',
    entry: { type: 'limit', price: 105 },
    stopLoss: { price: 100 },
    takeProfit: { price: 114 },
    timeHorizon: 'scalp',
    tags: ['breakout'],
    ...overrides
  }
}

test.beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'ares-market-autonomy-'))
  process.env.ARES_TRADE_AUDIT_PATH = join(dir, 'trade-audit-records.json')
  process.env.ARES_MARKET_POLICY_PATH = join(dir, 'market-autonomy-policy.json')
  resetTradeAuditCacheForTests()
  resetMarketAutonomyPolicyCacheForTests()
  clearTradeAuditRecords()
  resetMarketAutonomyPolicy()
})

test('buildMarketSnapshotFromTradingView creates a normalized snapshot', () => {
  const result = buildMarketSnapshotFromTradingView(makeTradingViewState())
  assert.equal(result.snapshot?.symbol, 'BTCUSDT')
  assert.equal(result.snapshot?.timeframe, '5m')
  assert.equal(result.snapshot?.marketRegime, 'high_volatility')
  assert.equal(result.snapshot?.candles.length, 2)
  assert.equal(result.snapshot?.indicators.rsi, 66.2)
})

test('risk engine blocks read-only mode and sizes valid copilot ideas', () => {
  const blocked = evaluateTradeRisk(makeIdea(), {
    policy: { ...COPILOT_POLICY, mode: 'read_only' },
    openPositions: [],
    openOrderCount: 0,
    dailyRealizedPnlUsd: 0,
    tradesExecutedThisSession: 0,
    cooldownUntil: null,
    currentTimeframe: '5m'
  })
  assert.equal(blocked.allowed, false)
  assert.ok(blocked.violations.includes('mode_read_only'))

  const allowed = evaluateTradeRisk(makeIdea(), {
    policy: COPILOT_POLICY,
    openPositions: [],
    openOrderCount: 0,
    dailyRealizedPnlUsd: 0,
    tradesExecutedThisSession: 0,
    cooldownUntil: null,
    currentTimeframe: '5m',
    marketGuards: { hasHotNews: false, macroBlocked: false, hotNewsCount: 0, upcomingMacroEventCount: 0 }
  })
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.positionSize?.riskUsd, 25)
})

test('strategy, execution intent, and paper broker can complete a local run', async () => {
  const snapshot = buildMarketSnapshotFromTradingView(makeTradingViewState()).snapshot as MarketSnapshot
  const strategy = generateTradeIdea(snapshot, COPILOT_POLICY)
  assert.equal(strategy.eligible, true)
  assert.ok(strategy.idea)

  const broker = new PaperBroker()
  const result = await evaluateCurrentMarketRun({
    policy: COPILOT_POLICY,
    broker,
    executeTrade: true,
    snapshotOptions: { tradingViewState: makeTradingViewState() }
  })
  assert.equal(result.riskDecision?.allowed, true)
  assert.equal(result.simulation?.executed, true)
  assert.ok(result.executionIntent)
  assert.ok((await broker.getOpenPositions()).length > 0)
  assert.ok(listTradeAuditRecords().some(record => record.phase === 'execution'))
})

test('buildExecutionIntent returns null when risk blocks the idea', () => {
  const risk = evaluateTradeRisk(makeIdea(), {
    policy: { ...COPILOT_POLICY, allowedSymbols: ['ETHUSDT'] },
    openPositions: [],
    openOrderCount: 0,
    dailyRealizedPnlUsd: 0,
    tradesExecutedThisSession: 0,
    cooldownUntil: null,
    currentTimeframe: '5m'
  })
  assert.equal(risk.allowed, false)
  assert.equal(buildExecutionIntent(makeIdea(), risk), null)
})

test('trade audit records persist, reload, clear, and keep the last 300 records', () => {
  appendTradeAuditRecord({
    symbol: 'BTCUSDT',
    strategyId: 'breakout_v1',
    phase: 'execution',
    snapshotTimestamp: 1,
    payload: { accepted: true }
  })
  resetTradeAuditCacheForTests()
  assert.equal(listTradeAuditRecords().length, 1)
  clearTradeAuditRecords()
  resetTradeAuditCacheForTests()
  assert.equal(listTradeAuditRecords().length, 0)

  for (let index = 0; index < MAX_TRADE_AUDIT_RECORDS + 5; index += 1) {
    appendTradeAuditRecord({
      symbol: 'BTCUSDT',
      strategyId: 'breakout_v1',
      phase: 'risk',
      snapshotTimestamp: index,
      payload: { index }
    })
  }
  const records = listTradeAuditRecords()
  assert.equal(records.length, MAX_TRADE_AUDIT_RECORDS)
  assert.equal(records[0]?.payload.index, 5)
})

test('chaos scenarios block or emit broker events without ghost orders', async () => {
  const snapshot = buildMarketSnapshotFromTradingView(makeTradingViewState()).snapshot as MarketSnapshot
  const idea = makeIdea()
  const risk = evaluateTradeRisk(idea, {
    policy: COPILOT_POLICY,
    openPositions: [],
    openOrderCount: 0,
    dailyRealizedPnlUsd: 0,
    tradesExecutedThisSession: 0,
    cooldownUntil: null,
    currentTimeframe: '5m'
  })
  const executionIntent = buildExecutionIntent(idea, risk)
  assert.ok(executionIntent)

  const results = await runAllChaosScenarios({ snapshot, idea, executionIntent, policy: COPILOT_POLICY })
  const byScenario = new Map(results.map(result => [result.scenario, result]))

  for (const scenario of ['cooldown_active', 'symbol_blocked', 'strategy_blocked', 'max_positions_reached'] as const) {
    const result = byScenario.get(scenario)
    assert.ok(result)
    assert.equal(result.riskDecision.allowed, false)
    assert.equal(result.executed, false)
    assert.deepEqual(result.eventTypes, [])
    assert.equal(result.positionCountAfterRun, 0)
  }
  assert.deepEqual(byScenario.get('broker_rejects_order')?.eventTypes, ['rejected'])
  assert.equal(byScenario.get('broker_rejects_order')?.executed, false)
  assert.deepEqual(byScenario.get('partial_fill_then_cancel')?.eventTypes, ['accepted', 'partially_filled', 'canceled'])
  assert.equal(byScenario.get('partial_fill_then_cancel')?.executed, true)
  assert.deepEqual(byScenario.get('reconciliation_broken')?.eventTypes, ['accepted', 'filled'])
  assert.equal(byScenario.get('reconciliation_broken')?.positionCountAfterRun, 0)

  const phases = new Set(listTradeAuditRecords().map(record => record.phase))
  assert.ok(phases.has('blocked'))
  assert.ok(phases.has('execution'))
  assert.ok(phases.has('reconciliation'))
})

test('kill switch blocks paper execution with a risk violation', async () => {
  const broker = new PaperBroker()
  const result = await evaluateCurrentMarketRun({
    policy: COPILOT_POLICY,
    broker,
    executeTrade: true,
    killSwitchActive: true,
    snapshotOptions: { tradingViewState: makeTradingViewState() }
  })
  assert.equal(result.riskDecision?.allowed, false)
  assert.ok(result.riskDecision?.violations.includes('kill_switch_active'))
  assert.equal(result.simulation, null)
  assert.equal((await broker.getOpenPositions()).length, 0)
})

test('stored policy changes risk decisions and invalid values fall back safely', () => {
  assert.equal(getMarketAutonomyPolicy().allowedSymbols[0], COPILOT_POLICY.allowedSymbols[0])
  const saved = saveMarketAutonomyPolicyPatch({
    allowedSymbols: ['ETHUSDT'],
    maxRiskPerTradeUsd: 11,
    mode: 'read_only'
  })
  assert.equal(saved.allowedSymbols[0], 'ETHUSDT')
  assert.equal(saved.maxRiskPerTradeUsd, 11)
  assert.equal(saved.mode, 'read_only')

  resetMarketAutonomyPolicyCacheForTests()
  const reloaded = getMarketAutonomyPolicy()
  assert.equal(reloaded.allowedSymbols[0], 'ETHUSDT')
  const blocked = evaluateTradeRisk(makeIdea(), {
    policy: reloaded,
    openPositions: [],
    openOrderCount: 0,
    dailyRealizedPnlUsd: 0,
    tradesExecutedThisSession: 0,
    cooldownUntil: null,
    currentTimeframe: '5m'
  })
  assert.equal(blocked.allowed, false)
  assert.ok(blocked.violations.includes('mode_read_only'))

  const sanitized = saveMarketAutonomyPolicyPatch({
    allowedSymbols: [],
    maxRiskPerTradeUsd: -1,
    maxTradesPerSession: 0,
    mode: 'paper_auto'
  })
  assert.equal(sanitized.allowedSymbols[0], COPILOT_POLICY.allowedSymbols[0])
  assert.equal(sanitized.maxRiskPerTradeUsd, COPILOT_POLICY.maxRiskPerTradeUsd)
  assert.equal(sanitized.maxTradesPerSession, COPILOT_POLICY.maxTradesPerSession)
  assert.equal(sanitized.mode, COPILOT_POLICY.mode)
})
