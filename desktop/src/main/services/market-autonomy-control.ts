import type { MarketAutonomyKillSwitchState } from '../../shared/market-autonomy-view.types'

let killSwitchState: MarketAutonomyKillSwitchState = {
  enabled: false,
  reason: null,
  updatedAt: null
}

export function getMarketAutonomyKillSwitch(): MarketAutonomyKillSwitchState {
  return { ...killSwitchState }
}

export function setMarketAutonomyKillSwitch(
  input: { enabled: boolean; reason?: string | null }
): MarketAutonomyKillSwitchState {
  killSwitchState = {
    enabled: input.enabled,
    reason: normalizeReason(input.reason),
    updatedAt: Date.now()
  }
  return getMarketAutonomyKillSwitch()
}

export function resetMarketAutonomyKillSwitchForTests(): void {
  killSwitchState = {
    enabled: false,
    reason: null,
    updatedAt: null
  }
}

function normalizeReason(reason?: string | null): string | null {
  if (typeof reason !== 'string') return null
  const trimmed = reason.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 160) : null
}
