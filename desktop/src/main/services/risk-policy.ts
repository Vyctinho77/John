import type { MarketAutonomyPolicy } from '../../shared/market-autonomy.types'

export const READ_ONLY_POLICY: MarketAutonomyPolicy = {
  mode: 'read_only',
  allowedSymbols: [],
  allowedTimeframes: [],
  allowedStrategies: [],
  maxRiskPerTradeUsd: 0,
  maxDailyLossUsd: 0,
  maxTradesPerSession: 0,
  maxOpenPositions: 0,
  maxOpenOrders: 0,
  requireStopLoss: false,
  requireTakeProfit: false,
  allowMarketOrders: false,
  allowOvernight: false,
  cooldownAfterLossSec: 0,
  blockNearMacroEventsMin: 0
}

export const COPILOT_POLICY: MarketAutonomyPolicy = {
  mode: 'copilot',
  allowedSymbols: ['BTCUSDT'],
  allowedTimeframes: ['5m'],
  allowedStrategies: ['breakout_v1'],
  maxRiskPerTradeUsd: 25,
  maxDailyLossUsd: 75,
  maxTradesPerSession: 5,
  maxOpenPositions: 1,
  maxOpenOrders: 2,
  requireStopLoss: true,
  requireTakeProfit: true,
  allowMarketOrders: false,
  allowOvernight: false,
  cooldownAfterLossSec: 900,
  blockNearMacroEventsMin: 15
}

export const PAPER_AUTO_POLICY: MarketAutonomyPolicy = {
  ...COPILOT_POLICY,
  mode: 'paper_auto',
  maxTradesPerSession: 3,
  maxOpenOrders: 1
}

export function resolveMarketAutonomyPolicy(
  mode: MarketAutonomyPolicy['mode']
): MarketAutonomyPolicy {
  switch (mode) {
    case 'copilot':
      return COPILOT_POLICY
    case 'paper_auto':
      return PAPER_AUTO_POLICY
    case 'live_guarded':
      return {
        ...PAPER_AUTO_POLICY,
        mode: 'live_guarded',
        maxRiskPerTradeUsd: 10,
        maxDailyLossUsd: 30,
        maxTradesPerSession: 2
      }
    case 'read_only':
    default:
      return READ_ONLY_POLICY
  }
}
