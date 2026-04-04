import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { AICostSnapshot, AIProviderId } from '../../shared/ai-provider.types'
import { getAppSettings } from './settings'

interface AICostEntry {
  providerId: AIProviderId
  model: string
  operation: 'chat' | 'embedding'
  costUsd: number
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  at: number
}

interface StoredAICostState {
  day: string
  updatedAt: number | null
  entries: AICostEntry[]
}

const AI_COSTS_PATH = join(app.getPath('userData'), 'ai-costs.json')
let cachedState: StoredAICostState | null = null

export async function getAICostSnapshot(): Promise<AICostSnapshot> {
  const settings = await getAppSettings()
  const state = await getStoredState()
  const spentUsd = roundUsd(state.entries.reduce((sum, entry) => sum + entry.costUsd, 0))
  const openaiSpentUsd = roundUsd(
    state.entries
      .filter(entry => entry.providerId === 'openai')
      .reduce((sum, entry) => sum + entry.costUsd, 0)
  )
  const remainingUsd =
    settings.dailyCostLimitUsd === null
      ? null
      : roundUsd(Math.max(0, settings.dailyCostLimitUsd - spentUsd))

  return {
    date: state.day,
    dailyLimitUsd: settings.dailyCostLimitUsd,
    spentUsd,
    remainingUsd,
    openaiSpentUsd,
    lastUpdatedAt: state.updatedAt,
    blocked: settings.dailyCostLimitUsd !== null && spentUsd >= settings.dailyCostLimitUsd
  }
}

export async function assertOpenAIBudgetAvailable(): Promise<void> {
  const snapshot = await getAICostSnapshot()
  if (snapshot.blocked) {
    throw new Error('Limite diário da OpenAI atingido.')
  }
}

export async function recordAICost(entry: AICostEntry): Promise<void> {
  if (entry.costUsd <= 0) return

  const state = await getStoredState()
  const next: StoredAICostState = {
    day: state.day,
    updatedAt: Date.now(),
    entries: [
      ...state.entries,
      {
        ...entry,
        costUsd: roundUsd(entry.costUsd)
      }
    ]
  }

  cachedState = next
  await persistState(next)
}

async function getStoredState(): Promise<StoredAICostState> {
  const today = getTodayKey()
  if (cachedState && cachedState.day === today) return cachedState

  try {
    const raw = await readFile(AI_COSTS_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StoredAICostState>
    cachedState = normalizeState(parsed, today)
  } catch {
    cachedState = createEmptyState(today)
    await persistState(cachedState)
  }

  if (cachedState.day !== today) {
    cachedState = createEmptyState(today)
    await persistState(cachedState)
  }

  return cachedState
}

function normalizeState(state: Partial<StoredAICostState>, today: string): StoredAICostState {
  if (state.day !== today) return createEmptyState(today)

  return {
    day: today,
    updatedAt: typeof state.updatedAt === 'number' ? state.updatedAt : null,
    entries: Array.isArray(state.entries)
      ? state.entries.filter(entry =>
        entry
        && typeof entry.providerId === 'string'
        && typeof entry.model === 'string'
        && typeof entry.costUsd === 'number'
      ).map(entry => ({
        providerId: entry.providerId,
        model: entry.model,
        operation: entry.operation === 'embedding' ? 'embedding' : 'chat',
        costUsd: roundUsd(entry.costUsd),
        inputTokens: typeof entry.inputTokens === 'number' ? entry.inputTokens : 0,
        cachedInputTokens: typeof entry.cachedInputTokens === 'number' ? entry.cachedInputTokens : 0,
        outputTokens: typeof entry.outputTokens === 'number' ? entry.outputTokens : 0,
        at: typeof entry.at === 'number' ? entry.at : Date.now()
      }))
      : []
  }
}

function createEmptyState(day: string): StoredAICostState {
  return {
    day,
    updatedAt: null,
    entries: []
  }
}

async function persistState(state: StoredAICostState): Promise<void> {
  await mkdir(dirname(AI_COSTS_PATH), { recursive: true })
  await writeFile(AI_COSTS_PATH, JSON.stringify(state, null, 2), 'utf-8')
}

function getTodayKey(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return formatter.format(new Date())
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6))
}
