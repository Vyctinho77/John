import https from 'https'

export interface TickerQuote {
  symbol: string
  price: string
  change: string
  positive: boolean
}

type TickerCallback = (quote: TickerQuote | null) => void

const POLL_INTERVAL_MS = 15_000

let symbol = ''
let timer: ReturnType<typeof setInterval> | null = null
let lastQuote: TickerQuote | null = null
const listeners: Set<TickerCallback> = new Set()

function emit(quote: TickerQuote | null) {
  lastQuote = quote
  for (const cb of listeners) cb(quote)
}

function fetchQuote(sym: string): Promise<TickerQuote | null> {
  return new Promise(resolve => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(body)
          const meta = json?.chart?.result?.[0]?.meta
          if (!meta) { resolve(null); return }

          const price: number = meta.regularMarketPrice ?? meta.chartPreviousClose
          if (!price) { resolve(null); return }

          const prevClose: number =
            meta.regularMarketPreviousClose ??
            meta.chartPreviousClose ??
            meta.previousClose ??
            0

          const changePct: number =
            (meta.regularMarketChangePercent != null && meta.regularMarketChangePercent !== 0)
              ? meta.regularMarketChangePercent
              : prevClose > 0
                ? ((price - prevClose) / prevClose) * 100
                : 0

          const formatted = price >= 1000
            ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : price.toFixed(price < 1 ? 4 : 2)

          const changeStr = (changePct >= 0 ? '+' : '') + changePct.toFixed(2) + '%'

          resolve({
            symbol: (meta.symbol ?? sym).split(':').pop() ?? sym,
            price: formatted,
            change: changeStr,
            positive: changePct >= 0
          })
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(8_000, () => { req.destroy(); resolve(null) })
  })
}

async function poll() {
  if (!symbol) return
  const quote = await fetchQuote(symbol)
  emit(quote)
}

function startPolling() {
  if (timer) clearInterval(timer)
  void poll()
  timer = setInterval(() => void poll(), POLL_INTERVAL_MS)
}

function stopPolling() {
  if (timer) { clearInterval(timer); timer = null }
  emit(null)
}

export const tickerService = {
  setSymbol(sym: string) {
    const trimmed = sym.trim().toUpperCase()
    if (trimmed === symbol) return
    symbol = trimmed
    if (symbol) {
      startPolling()
    } else {
      stopPolling()
    }
  },

  getQuote(): TickerQuote | null {
    return lastQuote
  },

  onQuoteUpdate(cb: TickerCallback): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  stop() {
    stopPolling()
    listeners.clear()
    symbol = ''
  }
}
