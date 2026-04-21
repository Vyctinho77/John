import https from 'https'
import type { MarketNewsItem, MarketNewsSnapshot } from '@shared/perception.types'

type NewsCallback = (snapshot: MarketNewsSnapshot) => void

const CACHE_TTL_MS = 5 * 60 * 1000
const STALE_GRACE_MS = 10 * 60 * 1000
const MAX_PROMPT_ITEMS = 5
const MAX_TITLE_LEN = 110
const GLOBAL_FEED_LIMIT = 3   // items per global asset feed
const SYMBOL_FEED_LIMIT = 5   // items for the active chart symbol
const MAX_DISPLAY = 20        // total items shown in panel after merge

// Major globally traded assets — always fetched when service is active.
// Tickers are standard Yahoo Finance symbols accepted by the RSS headline endpoint.
const GLOBAL_FEEDS: Array<{ ticker: string; label: string }> = [
  { ticker: 'GC=F',     label: 'Ouro' },
  { ticker: '^GSPC',    label: 'S&P 500' },
  { ticker: '^NDX',     label: 'Nasdaq' },
  { ticker: 'BTC-USD',  label: 'Bitcoin' },
  { ticker: 'EURUSD=X', label: 'EUR/USD' },
  { ticker: 'CL=F',     label: 'Petróleo' },
  { ticker: 'DX-Y.NYB', label: 'Dólar' },
  { ticker: '^DJI',     label: 'Dow Jones' },
  { ticker: 'USDJPY=X', label: 'USD/JPY' },
]

const QUERY_MAP: Array<[RegExp, string]> = [
  [/^(XAUUSD|GOLD|GC|GLD)$/i, 'GC=F'],
  [/^(XAGUSD|SI)$/i, 'SI=F'],
  [/^(BTCUSDT|BTCUSD|BTC)$/i, 'BTC-USD'],
  [/^(ETHUSDT|ETHUSD|ETH)$/i, 'ETH-USD'],
  [/^EURUSD$/i, 'EURUSD=X'],
  [/^GBPUSD$/i, 'GBPUSD=X'],
  [/^USDJPY$/i, 'USDJPY=X'],
  [/^(USOIL|CL|WTIUSD)$/i, 'CL=F'],
  [/^(SPX|SPY|ES)$/i, '^GSPC'],
  [/^(NDX|QQQ|NQ)$/i, '^NDX'],
  [/^(DJI|YM|DJIA)$/i, '^DJI'],
]

// Score 2 = critical macro event, Score 1 = relevant, Score 0 = neutral
const HOT_THRESHOLD = 2

const SCORE_RULES: Array<[RegExp, number]> = [
  [/\b(fed|fomc|federal reserve|powell|rate hike|rate cut|interest rate)\b/i, 2],
  [/\b(cpi|inflation|pce|deflation|core inflation)\b/i, 2],
  [/\b(nfp|non-farm|payroll|unemployment|jobs report)\b/i, 2],
  [/\b(gdp|recession|contraction|economic crisis)\b/i, 2],
  [/\b(crash|collapse|default|bankruptcy|bank run|contagion)\b/i, 2],
  [/\b(earnings|revenue miss|guidance cut|profit warning)\b/i, 1],
  [/\b(rally|surge|soar|spike|breakout|all.?time high)\b/i, 1],
  [/\b(drop|plunge|tumble|slide|sell.?off|bearish)\b/i, 1],
  [/\b(war|sanctions|tariff|trade war|geopolitical)\b/i, 1],
  [/\b(opec|production cut|supply shock)\b/i, 1],
]

function scoreHeadline(title: string): number {
  let score = 0
  for (const [pattern, weight] of SCORE_RULES) {
    if (pattern.test(title)) score += weight
  }
  return score
}

function resolveQuery(symbol: string): string {
  const upper = symbol.toUpperCase()
  for (const [pattern, query] of QUERY_MAP) {
    if (pattern.test(upper)) return query
  }
  return symbol
}

function parseRssItems(xml: string, limit: number): MarketNewsItem[] {
  const items: MarketNewsItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml)) !== null && items.length < limit) {
    const block = match[1]
    const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) ?? /<title>(.*?)<\/title>/.exec(block))?.[1]?.trim() ?? ''
    const link = (/<link>(.*?)<\/link>/.exec(block))?.[1]?.trim() ?? ''
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(block))?.[1]?.trim() ?? ''
    if (title && link) items.push({ title, link, pubDate })
  }
  return items
}

function fetchHeadlines(ticker: string, source: string | undefined, limit: number): Promise<MarketNewsItem[]> {
  return new Promise(resolve => {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          const items = parseRssItems(body, limit)
          if (source) for (const item of items) item.source = source
          resolve(items)
        } catch {
          resolve([])
        }
      })
    })
    req.on('error', () => resolve([]))
    req.setTimeout(8_000, () => { req.destroy(); resolve([]) })
  })
}

let currentSymbol = ''
let currentQuery = ''
let active = false
let snapshot: MarketNewsSnapshot = { symbol: '', query: '', items: [], hotItems: [], fetchedAt: null }
let timer: ReturnType<typeof setInterval> | null = null
const listeners: Set<NewsCallback> = new Set()

function emit() {
  for (const cb of listeners) cb(snapshot)
}

// Returns true if the current symbol is already covered by a global feed
// (to avoid label duplication — e.g. BTCUSD → Bitcoin is already a global feed).
function symbolCoveredByGlobal(): boolean {
  if (!currentQuery) return false
  return GLOBAL_FEEDS.some(f => f.ticker === currentQuery)
}

async function doFetch() {
  if (!active) return

  const fetches: Promise<MarketNewsItem[]>[] = []

  // Always fetch all major global feeds in parallel
  for (const feed of GLOBAL_FEEDS) {
    fetches.push(fetchHeadlines(feed.ticker, feed.label, GLOBAL_FEED_LIMIT))
  }

  // Also fetch the active chart symbol unless it's already a global feed
  if (currentQuery && !symbolCoveredByGlobal()) {
    fetches.push(fetchHeadlines(currentQuery, currentSymbol || undefined, SYMBOL_FEED_LIMIT))
  }

  const results = await Promise.all(fetches)

  // Merge across all feeds, deduplicate by link
  const seen = new Set<string>()
  const merged: MarketNewsItem[] = []
  for (const items of results) {
    for (const item of items) {
      if (!seen.has(item.link)) {
        seen.add(item.link)
        merged.push(item)
      }
    }
  }

  // Sort most-recent first (invalid dates fall to the end)
  merged.sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
  })

  const items = merged.slice(0, MAX_DISPLAY)
  const hotItems = items.filter(item => scoreHeadline(item.title) >= HOT_THRESHOLD)
  snapshot = { symbol: currentSymbol, query: currentQuery, items, hotItems, fetchedAt: Date.now() }
  emit()
}

function startTimer() {
  if (timer) clearInterval(timer)
  void doFetch()
  timer = setInterval(() => void doFetch(), CACHE_TTL_MS)
}

export const newsService = {
  start() {
    if (active) return
    active = true
    startTimer()
  },

  setSymbol(sym: string) {
    const trimmed = sym.trim().toUpperCase()
    if (trimmed === currentSymbol && active) return
    currentSymbol = trimmed
    currentQuery = trimmed ? resolveQuery(trimmed) : ''
    if (active) {
      // Symbol changed while running — refresh immediately
      void doFetch()
    } else {
      // Auto-start on first setSymbol call
      active = true
      startTimer()
    }
  },

  getSnapshot(): MarketNewsSnapshot {
    return snapshot
  },

  async forceRefresh(): Promise<void> {
    await doFetch()
  },

  formatForPrompt(sym?: string): string {
    const s = sym?.trim().toUpperCase() ?? ''
    if (s && s !== currentSymbol) return ''
    if (!snapshot.fetchedAt || !snapshot.items.length) return ''
    const age = Date.now() - snapshot.fetchedAt
    if (age > STALE_GRACE_MS) return ''
    const lines = snapshot.items
      .slice(0, MAX_PROMPT_ITEMS)
      .map((item, i) => {
        const prefix = item.source ? `[${item.source}] ` : ''
        const t = item.title.length > MAX_TITLE_LEN ? item.title.slice(0, MAX_TITLE_LEN - 1) + '…' : item.title
        return `[${i + 1}] ${prefix}${t}`
      })
    return `--- Market News ---\n${lines.join('\n')}\n---`
  },

  hasHotNews(): boolean {
    return snapshot.hotItems.length > 0
  },

  onUpdate(cb: NewsCallback): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  stop() {
    active = false
    if (timer) { clearInterval(timer); timer = null }
    listeners.clear()
    currentSymbol = ''
    currentQuery = ''
    snapshot = { symbol: '', query: '', items: [], hotItems: [], fetchedAt: null }
  }
}
