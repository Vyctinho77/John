import type { MarketAutonomyPolicy, MarketSnapshot, TradeIdea } from '@shared/market-autonomy.types'
import { evaluateBreakoutIdea } from './strategy-rules/breakout.ts'
import { safeRecordDiagnosticEvent } from './observability.ts'

export interface StrategyEngineResult {
  strategyId: string
  eligible: boolean
  reason: string
  idea: TradeIdea | null
}

export function generateTradeIdea(
  snapshot: MarketSnapshot,
  policy?: MarketAutonomyPolicy
): StrategyEngineResult {
  if (
    policy?.allowedTimeframes.length
    && !policy.allowedTimeframes.includes(snapshot.timeframe)
  ) {
    const result: StrategyEngineResult = {
      strategyId: 'breakout_v1',
      eligible: false,
      reason: 'timeframe_not_allowed',
      idea: null
    }
    void emitStrategyDiagnostic(snapshot, result)
    return result
  }

  const result = toEngineResult(evaluateBreakoutIdea(snapshot))
  void emitStrategyDiagnostic(snapshot, result)
  return result
}

function toEngineResult(
  result: ReturnType<typeof evaluateBreakoutIdea>
): StrategyEngineResult {
  return {
    strategyId: 'breakout_v1',
    eligible: result.eligible,
    reason: result.reason,
    idea: result.idea
  }
}

async function emitStrategyDiagnostic(
  snapshot: MarketSnapshot,
  result: StrategyEngineResult
): Promise<void> {
  await safeRecordDiagnosticEvent({
    type: 'trace',
    source: 'main',
    action: 'strategy_engine_evaluated',
    details: {
      symbol: snapshot.symbol,
      timeframe: snapshot.timeframe,
      marketRegime: snapshot.marketRegime,
      strategyId: result.strategyId,
      eligible: result.eligible,
      reason: result.reason
    }
  })
}

