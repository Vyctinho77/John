import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import type { MarketAutonomyPolicy } from '../../shared/market-autonomy.types'
import { COPILOT_POLICY } from './risk-policy.ts'
import { getLocalUserDataPath } from './local-user-data.ts'

let cachedPolicy: MarketAutonomyPolicy | null = null
let loaded = false

export function getMarketAutonomyPolicy(): MarketAutonomyPolicy {
  loadPolicyIfNeeded()
  return clonePolicy(cachedPolicy ?? COPILOT_POLICY)
}

export function saveMarketAutonomyPolicyPatch(
  patch: Partial<MarketAutonomyPolicy>
): MarketAutonomyPolicy {
  loadPolicyIfNeeded()
  const next = sanitizeMarketAutonomyPolicy({
    ...(cachedPolicy ?? COPILOT_POLICY),
    ...patch
  })
  cachedPolicy = next
  writeFileSync(getPolicyStoragePath(), JSON.stringify(next, null, 2), 'utf8')
  return clonePolicy(next)
}

export function resetMarketAutonomyPolicy(): MarketAutonomyPolicy {
  cachedPolicy = clonePolicy(COPILOT_POLICY)
  loaded = true
  try {
    rmSync(getPolicyStoragePath(), { force: true })
  } catch {
    // Reset returns the safe default even if disk cleanup fails.
  }
  return clonePolicy(COPILOT_POLICY)
}

export function sanitizeMarketAutonomyPolicy(
  input: Partial<MarketAutonomyPolicy>
): MarketAutonomyPolicy {
  const merged = { ...COPILOT_POLICY, ...input }

  return {
    ...COPILOT_POLICY,
    mode: merged.mode === 'copilot' || merged.mode === 'read_only' ? merged.mode : COPILOT_POLICY.mode,
    allowedSymbols: normalizeStringList(merged.allowedSymbols, COPILOT_POLICY.allowedSymbols),
    allowedTimeframes: normalizeStringList(merged.allowedTimeframes, COPILOT_POLICY.allowedTimeframes),
    allowedStrategies: normalizeStringList(merged.allowedStrategies, COPILOT_POLICY.allowedStrategies),
    maxRiskPerTradeUsd: normalizePositiveNumber(merged.maxRiskPerTradeUsd, COPILOT_POLICY.maxRiskPerTradeUsd),
    maxDailyLossUsd: normalizePositiveNumber(merged.maxDailyLossUsd, COPILOT_POLICY.maxDailyLossUsd),
    maxTradesPerSession: normalizePositiveInteger(merged.maxTradesPerSession, COPILOT_POLICY.maxTradesPerSession),
    maxOpenPositions: normalizePositiveInteger(merged.maxOpenPositions, COPILOT_POLICY.maxOpenPositions),
    maxOpenOrders: normalizePositiveInteger(merged.maxOpenOrders, COPILOT_POLICY.maxOpenOrders),
    requireStopLoss: typeof merged.requireStopLoss === 'boolean' ? merged.requireStopLoss : COPILOT_POLICY.requireStopLoss,
    requireTakeProfit: typeof merged.requireTakeProfit === 'boolean' ? merged.requireTakeProfit : COPILOT_POLICY.requireTakeProfit,
    allowMarketOrders: typeof merged.allowMarketOrders === 'boolean' ? merged.allowMarketOrders : COPILOT_POLICY.allowMarketOrders,
    allowOvernight: typeof merged.allowOvernight === 'boolean' ? merged.allowOvernight : COPILOT_POLICY.allowOvernight,
    cooldownAfterLossSec: normalizePositiveInteger(merged.cooldownAfterLossSec, COPILOT_POLICY.cooldownAfterLossSec),
    blockNearMacroEventsMin: normalizePositiveInteger(merged.blockNearMacroEventsMin, COPILOT_POLICY.blockNearMacroEventsMin)
  }
}

export function resetMarketAutonomyPolicyCacheForTests(): void {
  cachedPolicy = null
  loaded = false
}

function loadPolicyIfNeeded(): void {
  if (loaded) return
  loaded = true

  const storagePath = getPolicyStoragePath()
  if (!existsSync(storagePath)) {
    cachedPolicy = clonePolicy(COPILOT_POLICY)
    return
  }

  try {
    cachedPolicy = sanitizeMarketAutonomyPolicy(JSON.parse(readFileSync(storagePath, 'utf8')))
  } catch {
    cachedPolicy = clonePolicy(COPILOT_POLICY)
  }
}

function getPolicyStoragePath(): string {
  return process.env.ARES_MARKET_POLICY_PATH ?? getLocalUserDataPath('market-autonomy-policy.json')
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const normalized = value
    .filter(item => typeof item === 'string')
    .map(item => item.trim().toUpperCase())
    .filter(Boolean)
  return normalized.length > 0 ? [...new Set(normalized)] : [...fallback]
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

function clonePolicy(policy: MarketAutonomyPolicy): MarketAutonomyPolicy {
  return {
    ...policy,
    allowedSymbols: [...policy.allowedSymbols],
    allowedTimeframes: [...policy.allowedTimeframes],
    allowedStrategies: [...policy.allowedStrategies]
  }
}
