import https from 'https'
import type { MacroEvent, MacroCalendarSnapshot } from '@shared/perception.types'

type CalendarCallback = (snapshot: MacroCalendarSnapshot) => void
type ApproachingCallback = (event: MacroEvent) => void

const CACHE_TTL_MS   = 60 * 60 * 1000  // refetch a cada hora
const TICK_MS        = 60 * 1000        // verifica eventos próximos a cada minuto
const ALERT_WINDOW_MS  = 30 * 60 * 1000  // notifica quando evento < 30min
const BRIEFING_WINDOW_MS = 15 * 60 * 1000 // gera briefing quando evento < 15min
const STALE_GRACE_MS = 2 * 60 * 60 * 1000

const FF_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'

interface FFEvent {
  title?: string
  country?: string
  date?: string
  time?: string
  impact?: string
  forecast?: string
  previous?: string
}

function parseTimestamp(date: string, time: string): number {
  try {
    // date is ISO like "2025-04-21T00:00:00-04:00", time is like "8:30am"
    const base = new Date(date)
    const match = /^(\d{1,2}):(\d{2})(am|pm)$/i.exec(time.trim())
    if (!match) return base.getTime()
    let h = parseInt(match[1], 10)
    const m = parseInt(match[2], 10)
    const period = match[3].toLowerCase()
    if (period === 'pm' && h !== 12) h += 12
    if (period === 'am' && h === 12) h = 0
    // Apply hours/minutes to the base date (which already has EST offset)
    base.setUTCHours(base.getUTCHours() + h, base.getUTCMinutes() + m, 0, 0)
    return base.getTime()
  } catch {
    return 0
  }
}

function fetchEvents(): Promise<MacroEvent[]> {
  return new Promise(resolve => {
    const req = https.get(FF_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const raw: FFEvent[] = JSON.parse(body)
          const events: MacroEvent[] = raw
            .filter(e => e.impact === 'High' || e.impact === 'Medium')
            .map(e => ({
              title: e.title ?? '',
              country: e.country ?? '',
              impact: (e.impact as MacroEvent['impact']) ?? 'Medium',
              forecast: e.forecast?.trim() || null,
              previous: e.previous?.trim() || null,
              timestamp: parseTimestamp(e.date ?? '', e.time ?? '')
            }))
            .filter(e => e.title && e.timestamp > 0)
            .sort((a, b) => a.timestamp - b.timestamp)
          resolve(events)
        } catch {
          resolve([])
        }
      })
    })
    req.on('error', () => resolve([]))
    req.setTimeout(8_000, () => { req.destroy(); resolve([]) })
  })
}

let snapshot: MacroCalendarSnapshot = { events: [], fetchedAt: null }
let fetchTimer: ReturnType<typeof setInterval> | null = null
let tickTimer: ReturnType<typeof setInterval> | null = null
const alerted = new Set<string>()   // títulos já alertados nesta sessão
const briefed = new Set<string>()   // títulos já enviados para briefing

const updateListeners: Set<CalendarCallback> = new Set()
const approachingListeners: Set<ApproachingCallback> = new Set()

function emitUpdate() {
  for (const cb of updateListeners) cb(snapshot)
}

function emitApproaching(event: MacroEvent) {
  for (const cb of approachingListeners) cb(event)
}

async function doFetch() {
  const events = await fetchEvents()
  snapshot = { events, fetchedAt: Date.now() }
  alerted.clear()
  briefed.clear()
  emitUpdate()
}

function tick() {
  if (!snapshot.fetchedAt) return
  const now = Date.now()

  // Refetch se o cache expirou
  if (now - snapshot.fetchedAt > CACHE_TTL_MS) {
    void doFetch()
    return
  }

  for (const event of snapshot.events) {
    const until = event.timestamp - now
    if (until < 0 || until > ALERT_WINDOW_MS) continue

    const key = `${event.title}-${event.timestamp}`

    if (!alerted.has(key)) {
      alerted.add(key)
      emitApproaching(event)
    }
  }
}

export const calendarService = {
  start() {
    if (fetchTimer) return
    void doFetch()
    fetchTimer = setInterval(() => void doFetch(), CACHE_TTL_MS)
    tickTimer  = setInterval(tick, TICK_MS)
  },

  stop() {
    if (fetchTimer) { clearInterval(fetchTimer); fetchTimer = null }
    if (tickTimer)  { clearInterval(tickTimer);  tickTimer  = null }
    updateListeners.clear()
    approachingListeners.clear()
  },

  getSnapshot(): MacroCalendarSnapshot {
    return snapshot
  },

  getUpcoming(withinMs = ALERT_WINDOW_MS): MacroEvent[] {
    const now = Date.now()
    return snapshot.events.filter(e => {
      const until = e.timestamp - now
      return until >= 0 && until <= withinMs
    })
  },

  needsBriefing(event: MacroEvent): boolean {
    const key = `${event.title}-${event.timestamp}`
    const until = event.timestamp - Date.now()
    if (until < 0 || until > BRIEFING_WINDOW_MS) return false
    if (briefed.has(key)) return false
    briefed.add(key)
    return true
  },

  formatForPrompt(): string {
    if (!snapshot.fetchedAt) return ''
    const age = Date.now() - snapshot.fetchedAt
    if (age > STALE_GRACE_MS) return ''
    const now = Date.now()
    const today = snapshot.events.filter(e => {
      const d = new Date(e.timestamp)
      const t = new Date(now)
      return d.getUTCDate() === t.getUTCDate() && e.timestamp > now - 30 * 60 * 1000
    })
    if (!today.length) return ''
    const lines = today.map(e => {
      const until = e.timestamp - now
      const label = until > 0
        ? `em ${Math.round(until / 60000)}min`
        : 'ocorreu recentemente'
      const fc = e.forecast ? ` | prev: ${e.previous ?? '–'} fore: ${e.forecast}` : ''
      return `[${e.impact}] ${e.country} ${e.title} ${label}${fc}`
    })
    return `--- Calendário Macro (hoje) ---\n${lines.join('\n')}\n---`
  },

  onUpdate(cb: CalendarCallback): () => void {
    updateListeners.add(cb)
    return () => updateListeners.delete(cb)
  },

  onApproaching(cb: ApproachingCallback): () => void {
    approachingListeners.add(cb)
    return () => approachingListeners.delete(cb)
  }
}
