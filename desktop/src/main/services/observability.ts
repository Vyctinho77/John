import { app } from 'electron'
import { appendFile, mkdir, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  ConsentRecord,
  DiagnosticEvent,
  DiagnosticsSnapshot,
  PerformanceTrace,
  PrivacySnapshot,
  ReplayEvent,
  TutorDebugSummary
} from '../../shared/perception.types'
import { getAppSettings, getFeaturePolicySnapshot } from './settings'

const eventsPath = () => join(app.getPath('userData'), 'diagnostics', 'events.log')
const consentPath = () => join(app.getPath('userData'), 'diagnostics', 'consent.json')

const recentEvents: DiagnosticEvent[] = []
const recentTraces: PerformanceTrace[] = []
const consentTrail: ConsentRecord[] = []
const MAX_EVENTS = 80
const MAX_TRACES = 50
const MAX_CONSENTS = 40
let lastDataDeletionAt: number | null = null

export async function recordDiagnosticEvent(
  event: Omit<DiagnosticEvent, 'id' | 'at'>
): Promise<void> {
  const fullEvent: DiagnosticEvent = {
    ...event,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now()
  }

  recentEvents.push(fullEvent)
  if (recentEvents.length > MAX_EVENTS) recentEvents.shift()

  const settings = await getAppSettings()
  if (!settings.telemetryOptIn) return

  const path = eventsPath()
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(fullEvent)}\n`, 'utf-8')
}

export async function safeRecordDiagnosticEvent(
  event: Omit<DiagnosticEvent, 'id' | 'at'>
): Promise<void> {
  try {
    await recordDiagnosticEvent(event)
  } catch (error) {
    console.error('[observability] recordDiagnosticEvent failed', {
      action: event.action,
      source: event.source,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function recordPerformanceTrace(input: {
  operation: string
  durationMs: number
  status: 'ok' | 'error'
}): Promise<void> {
  const trace: PerformanceTrace = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    operation: input.operation,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    status: input.status,
    at: Date.now()
  }

  recentTraces.push(trace)
  if (recentTraces.length > MAX_TRACES) recentTraces.shift()

  const settings = await getAppSettings()
  if (!settings.telemetryOptIn) return

  const path = eventsPath()
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify({ type: 'performance', ...trace })}\n`, 'utf-8')
}

export async function getDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot> {
  const settings = await getAppSettings()
  const featurePolicy = await getFeaturePolicySnapshot()
  const durations = recentTraces.map(trace => trace.durationMs)
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : 0

  return {
    appVersion: app.getVersion(),
    telemetryOptIn: settings.telemetryOptIn,
    eventCount: recentEvents.length,
    recentEvents: [...recentEvents].reverse().slice(0, 20),
    replayEvents: [...recentEvents].reverse().slice(0, 12).map(toReplayEvent),
    latestTutorDebug: getLatestTutorDebugSummary(),
    performance: {
      traceCount: recentTraces.length,
      averageDurationMs,
      slowestDurationMs: durations.length ? Math.max(...durations) : 0,
      recentTraces: [...recentTraces].reverse().slice(0, 12)
    },
    featurePolicy
  }
}

export async function installCrashHandlers(): Promise<void> {
  process.on('uncaughtException', error => {
    void recordDiagnosticEvent({
      type: 'error',
      source: 'main',
      action: 'uncaught_exception',
      details: {
        name: error.name,
        hasMessage: Boolean(error.message)
      }
    })

    void recordPerformanceTrace({
      operation: 'process.crash',
      durationMs: 0,
      status: 'error'
    })
  })

  process.on('unhandledRejection', reason => {
    const message = reason instanceof Error ? reason.message : String(reason)
    void recordDiagnosticEvent({
      type: 'error',
      source: 'main',
      action: 'unhandled_rejection',
      details: {
        hasMessage: Boolean(message)
      }
    })

    void recordPerformanceTrace({
      operation: 'process.rejection',
      durationMs: 0,
      status: 'error'
    })
  })
}

export async function recordConsentChange(input: {
  action: string
  enabled: boolean
  source?: 'user' | 'system'
}): Promise<void> {
  const record: ConsentRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action: input.action,
    enabled: input.enabled,
    source: input.source ?? 'user',
    at: Date.now()
  }

  consentTrail.push(record)
  if (consentTrail.length > MAX_CONSENTS) consentTrail.shift()

  const path = consentPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(consentTrail, null, 2), 'utf-8')
}

export async function getPrivacySnapshot(): Promise<PrivacySnapshot> {
  return {
    consentTrail: [...consentTrail].reverse().slice(0, 20),
    lastDataDeletionAt
  }
}

export async function clearDiagnostics(): Promise<void> {
  recentEvents.length = 0
  recentTraces.length = 0
  await rm(eventsPath(), { force: true })
}

export async function clearConsentTrail(): Promise<void> {
  consentTrail.length = 0
  await rm(consentPath(), { force: true })
}

export function markDataDeletion(): void {
  lastDataDeletionAt = Date.now()
}

function getLatestTutorDebugSummary(): TutorDebugSummary | null {
  const latestTutorEvent = [...recentEvents]
    .reverse()
    .find(event => event.source === 'tutor' && event.action === 'generate_response')

  if (!latestTutorEvent) return null

  const { details } = latestTutorEvent
  const connectorsRaw = typeof details.connectorsUsed === 'string' ? details.connectorsUsed : ''
  const connectorsUsed = connectorsRaw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean) as TutorDebugSummary['connectorsUsed']

  return {
    provider: typeof details.provider === 'string' ? details.provider : 'unknown',
    model: typeof details.model === 'string' ? details.model : 'unknown',
    dominantContextSource:
      typeof details.dominantSource === 'string'
        ? details.dominantSource as TutorDebugSummary['dominantContextSource']
        : 'unknown',
    connectorsUsed,
    latencyMs: typeof details.latencyMs === 'number' ? details.latencyMs : null,
    screenAgeMs: typeof details.screenAgeMs === 'number' ? details.screenAgeMs : null,
    staleContextGuarded: Boolean(details.staleContextGuarded)
  }
}

function toReplayEvent(event: DiagnosticEvent): ReplayEvent {
  const detailKeys = Object.keys(event.details)
  const detailSummary = detailKeys.length
    ? ` | metadados: ${detailKeys.join(', ')}`
    : ''

  return {
    id: event.id,
    at: event.at,
    source: event.source,
    action: event.action,
    sessionId: event.sessionId,
    summary: `[${event.source}] ${event.action}${detailSummary}`
  }
}
