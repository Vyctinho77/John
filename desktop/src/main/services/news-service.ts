import https from 'https'
import type { MarketNewsItem, MarketNewsSnapshot } from '@shared/perception.types'

type NewsCallback = (snapshot: MarketNewsSnapshot) => void

const CACHE_TTL_MS = 5 * 60 * 1000
const STALE_GRACE_MS = 10 * 60 * 1000
const MAX_ITEMS = 8
const MAX_PROMPT_ITEMS = 5
const MAX_TITLE_LEN = 110

const QUERY_MAP: Array<[RegExp, string]> = [
  [/^(XAUUSD|GOLD|GC|GLD)$/i, 'gold'],
  [/^(XAGUSD|SI)$/i, 'silver'],
  [/^(BTCUSDT|BTCUSD|BTC)$/i, 'bitcoin'],
  [/^(ETHUSDT|ETHUSD|ETH)$/i, 'ethereum'],
  [/^EURUSD$/i, 'euro dollar'],
  [/^GBPUSD$/i, 'british pound'],
  [/^(USOIL|CL|WTIUSD)$/i, 'oil price'],
  [/^(SPX|SPY|ES)$/i, 'S&P 500'],
  [/^(NDX|QQQ|NQ)$/i, 'Nasdaq'],
]

// Score 2 = evento macro crítico, Score 1 = relevante, Score 0 = neutro
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

function parseRssItems(xml: string): MarketNewsItem[] {
  const items: MarketNewsItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml)) !== null && items.length < MAX_ITEMS) {
    const block = match[1]
    const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) ?? /<title>(.*?)<\/title>/.exec(block))?.[1]?.trim() ?? ''
    const link = (/<link>(.*?)<\/link>/.exec(block))?.[1]?.trim() ?? ''
    const pubDate = (/<pubDate>(.*?)<\/pubDate>/.exec(block))?.[1]?.trim() ?? ''
    if (title && link) items.push({ title, link, pubDate })
  }
  return items
}

function fetchHeadlines(query: string): Promise<MarketNewsItem[]> {
  return new Promise(resolve => {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(query)}&region=US&lang=en-US`
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try {
          resolve(parseRssItems(body))
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
let snapshot: MarketNewsSnapshot = { symbol: '', query: '', items: [], hotItems: [], fetchedAt: null }
let timer: ReturnType<typeof setInterval> | null = null
const listeners: Set<NewsCallback> = new Set()

function emit() {
  for (const cb of listeners) cb(snapshot)
}

async function doFetch() {
  if (!currentQuery) return
  const items = await fetchHeadlines(currentQuery)
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
  setSymbol(sym: string) {
    const trimmed = sym.trim().toUpperCase()
    if (trimmed === currentSymbol) return
    currentSymbol = trimmed
    currentQuery = trimmed ? resolveQuery(trimmed) : ''
    snapshot = { symbol: currentSymbol, query: currentQuery, items: [], hotItems: [], fetchedAt: null }
    if (currentQuery) {
      startTimer()
    } else {
      if (timer) { clearInterval(timer); timer = null }
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
        const t = item.title.length > MAX_TITLE_LEN ? item.title.slice(0, MAX_TITLE_LEN - 1) + '…' : item.title
        return `[${i + 1}] ${t}`
      })
    return `--- Market News (${snapshot.symbol} / ${snapshot.query}) ---\n${lines.join('\n')}\n---`
  },

  hasHotNews(): boolean {
    return snapshot.hotItems.length > 0
  },

  onUpdate(cb: NewsCallback): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  stop() {
    if (timer) { clearInterval(timer); timer = null }
    listeners.clear()
    currentSymbol = ''
    currentQuery = ''
  }
}
