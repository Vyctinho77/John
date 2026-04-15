import { BrowserView, BrowserWindow, session } from 'electron'
import type { TradingViewConnectorState } from '../../shared/perception.types'

const TRADINGVIEW_PARTITION = 'persist:tradingview'
const TRADINGVIEW_URL = 'https://www.tradingview.com/chart/'
const OBSERVE_INTERVAL_MS = 2_500

type StatusListener = (state: TradingViewConnectorState) => void

const EMPTY_STATE: TradingViewConnectorState = {
  connected: false,
  loggedIn: false,
  lowConfidence: true,
  url: null,
  title: null,
  symbol: null,
  exchange: null,
  timeframe: null,
  crosshairActive: false,
  hoveredCandleTime: null,
  ohlcSource: 'unknown',
  currentPrice: null,
  priceChange: null,
  ohlc: {
    open: null,
    high: null,
    low: null,
    close: null
  },
  previousOhlc: null,
  previousCandleTime: null,
  candleDirection: 'unknown',
  candleStructure: null,
  patternHints: [],
  contextualPatternHints: [],
  sequencePatternHints: [],
  indicatorValues: {},
  layoutHints: [],
  watchlistVisible: false,
  indicatorsVisible: false,
  drawingToolsVisible: false,
  selectedPanel: null,
  lastObservedAt: null
}

const OBSERVER_SCRIPT = String.raw`
(() => {
  const bridge = window.__johnTradingViewBridge || (window.__johnTradingViewBridge = {
    installed: false,
    lastChartPointerAt: 0
  })
  if (!bridge.installed) {
    bridge.installed = true
    window.addEventListener('mousemove', (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target.closest('[data-name="pane"]')
        || target.closest('canvas')
        || target.closest('[class*="chart-container"]')
      ) {
        bridge.lastChartPointerAt = Date.now()
      }
    }, true)
    window.addEventListener('mouseleave', () => {
      bridge.lastChartPointerAt = 0
    }, true)
  }
  const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim()
  const visible = (node) => {
    if (!node) return false
    const style = window.getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 6 && rect.height > 6
  }
  const queryVisibleText = (selectors) => {
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector))
      for (const node of nodes) {
        if (!visible(node)) continue
        const text = textOf(node)
        if (text) return text
      }
    }
    return null
  }
  const queryVisibleTexts = (selectors, limit = 12) => {
    const out = []
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector))
      for (const node of nodes) {
        if (!visible(node)) continue
        const text = textOf(node)
        if (!text || out.includes(text)) continue
        out.push(text)
        if (out.length >= limit) return out
      }
    }
    return out
  }
  const parseOHLC = (texts) => {
    const joined = texts.join(' | ')
    const match = joined.match(/O\s*([0-9.,+-]+)\s*H\s*([0-9.,+-]+)\s*L\s*([0-9.,+-]+)\s*C\s*([0-9.,+-]+)/i)
    if (!match) {
      return { open: null, high: null, low: null, close: null }
    }
    return {
      open: match[1] || null,
      high: match[2] || null,
      low: match[3] || null,
      close: match[4] || null
    }
  }
  const parsePriceChange = (texts) => {
    const joined = texts.join(' | ')
    return joined.match(/[+-]?\d[\d.,]*%/)?.[0] || null
  }
  const parseCandleTime = (texts) => {
    const joined = texts.join(' | ')
    const patterns = [
      /\b\d{1,2}:\d{2}(?::\d{2})?\b/,
      /\b\d{4}-\d{2}-\d{2}\b/,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b/i
    ]
    for (const pattern of patterns) {
      const match = joined.match(pattern)
      if (match?.[0]) return match[0]
    }
    return null
  }
  const parseCurrentPrice = (texts, close) => {
    const joined = texts.join(' | ')
    const exact = joined.match(/(?:last|price|preço)\s*([0-9][\d.,+-]*)/i)?.[1]
    return exact || close || null
  }
  const parseIndicators = (texts, symbol, timeframe) => {
    const map = {}
    for (const text of texts) {
      if (!text) continue
      if (symbol && text.includes(symbol)) continue
      if (timeframe && text === timeframe) continue
      if (/^(watchlist|alert|object tree|pine editor|strategy tester)$/i.test(text)) continue
      const compact = text.replace(/\s+/g, ' ').trim()
      const colonMatch = compact.match(/^([^:]{2,40}):\s*([0-9.,%+\- ].{0,32})$/)
      if (colonMatch) {
        map[colonMatch[1].trim()] = colonMatch[2].trim()
        continue
      }
      const pairMatch = compact.match(/^([A-Za-z][A-Za-z0-9 ()/_-]{1,32})\s+([0-9][0-9.,%+\- ]{0,24})$/)
      if (pairMatch) {
        map[pairMatch[1].trim()] = pairMatch[2].trim()
      }
    }
    return map
  }
  const parseNumeric = (value) => {
    if (!value) return null
    const normalized = value
      .replace(/\s+/g, '')
      .replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  const analyzeCandle = (ohlc) => {
    const open = parseNumeric(ohlc.open)
    const high = parseNumeric(ohlc.high)
    const low = parseNumeric(ohlc.low)
    const close = parseNumeric(ohlc.close)
    if ([open, high, low, close].some(value => value == null)) {
      return {
        candleDirection: 'unknown',
        candleStructure: null,
        patternHints: []
      }
    }
    const range = Math.max((high - low), 0)
    const body = Math.abs(close - open)
    const upperWick = high - Math.max(open, close)
    const lowerWick = Math.min(open, close) - low
    const bodyRatio = range > 0 ? body / range : 0
    const upperRatio = range > 0 ? upperWick / range : 0
    const lowerRatio = range > 0 ? lowerWick / range : 0
    const direction = close > open ? 'bullish' : close < open ? 'bearish' : 'neutral'
    const hints = []

    if (bodyRatio < 0.12) {
      hints.push('doji-ish')
    } else if (bodyRatio < 0.3) {
      hints.push('small-body')
    } else if (bodyRatio > 0.65) {
      hints.push('strong-body')
    }

    if (upperRatio > 0.45 && upperWick > lowerWick * 1.35) {
      hints.push('upper-wick-rejection')
    }
    if (lowerRatio > 0.45 && lowerWick > upperWick * 1.35) {
      hints.push('lower-wick-rejection')
    }
    if (upperRatio > 0.28 && lowerRatio > 0.28 && bodyRatio < 0.25) {
      hints.push('indecision')
    }
    if (range > 0 && bodyRatio > 0.55 && upperRatio < 0.15 && lowerRatio < 0.15) {
      hints.push('impulse-candle')
    }

    let structure = null
    if (hints.includes('doji-ish')) structure = 'corpo muito pequeno'
    else if (hints.includes('upper-wick-rejection')) structure = 'rejeição pelo pavio superior'
    else if (hints.includes('lower-wick-rejection')) structure = 'rejeição pelo pavio inferior'
    else if (hints.includes('impulse-candle')) structure = 'candle de impulso'
    else if (hints.includes('small-body')) structure = 'corpo pequeno'
    else if (hints.includes('strong-body')) structure = 'corpo dominante'

    return {
      candleDirection: direction,
      candleStructure: structure,
      patternHints: hints
    }
  }
  const bodyText = textOf(document.body).toLowerCase()
  const title = document.title || null
  const url = location.href
  const symbolFromPath = location.pathname.match(/\/symbols\/([^/?#]+)/i)?.[1] || null
  const symbolFromQuery = new URLSearchParams(location.search).get('symbol')
  const headerSymbol = queryVisibleText([
    '[data-name="legend-source-title"]',
    '[class*="tv-symbol-header"] [class*="title"]',
    '[data-symbol-short]',
    '[data-name="legend-source-item"] [class*="title"]'
  ])
  const symbol = headerSymbol || symbolFromQuery || symbolFromPath || title?.split(/[:|—-]/)[0]?.trim() || null
  const exchange = symbol && symbol.includes(':') ? symbol.split(':')[0] : null
  const timeframe = queryVisibleText([
    '[data-name="header-toolbar-intervals"] button[aria-pressed="true"]',
    '[data-name="header-toolbar-intervals"] button[class*="isActive"]',
    '[data-name="header-toolbar-intervals"] button',
    '[class*="interval"] [aria-pressed="true"]'
  ])
  const hasSignInButton = Boolean(Array.from(document.querySelectorAll('a,button')).find(node => /sign in|entrar/i.test(textOf(node))))
  const hasUserMenu = Boolean(document.querySelector('[data-name="header-user-menu-button"], [class*="user-menu"], button[aria-label*="profile" i]'))
  const layoutHints = Array.from(new Set(
    [
      bodyText.includes('watchlist') || bodyText.includes('lista de observação') ? 'watchlist' : null,
      bodyText.includes('alert') || bodyText.includes('alerta') ? 'alerts' : null,
      bodyText.includes('object tree') ? 'object-tree' : null,
      bodyText.includes('pine editor') ? 'pine-editor' : null,
      bodyText.includes('strategy tester') ? 'strategy-tester' : null
    ].filter(Boolean)
  ))
  const selectedPanel = queryVisibleText([
    '[role="tab"][aria-selected="true"]',
    '[class*="tab"][class*="active"]',
    '[data-name="right-toolbar"] [aria-pressed="true"]'
  ])
  const watchlistVisible = Boolean(document.querySelector('[data-name*="watchlist" i], [class*="watchlist"]'))
  const indicatorsVisible = Boolean(Array.from(document.querySelectorAll('button,[role="button"],div')).find(node => /indicator|indicador/i.test(textOf(node))))
  const drawingToolsVisible = Boolean(document.querySelector('[data-name*="drawing" i], [aria-label*="drawing" i], [class*="drawingToolbar"]'))
  const crosshairActive = Date.now() - (bridge.lastChartPointerAt || 0) < 1800
  const ohlcTexts = queryVisibleTexts([
    '[data-name="legend-source-item"]',
    '[data-name="legend-source-title"]',
    '[data-name="legend-series-item"]',
    '[class*="legend"]',
    '[data-name="pane"] [class*="value"]'
  ], 24)
  const ohlc = parseOHLC(ohlcTexts)
  const hoveredCandleTime = parseCandleTime(ohlcTexts)
  const priceCandidates = queryVisibleTexts([
    '[class*="lastPrice"]',
    '[data-name*="legend"] [class*="price"]',
    '[class*="price-axis"] [class*="value"]',
    '[class*="mainSeriesScalePrice"]',
    '[data-name="legend-source-item"]'
  ], 18)
  const currentPrice = parseCurrentPrice(priceCandidates, ohlc.close)
  const priceChange = parsePriceChange(priceCandidates)
  const indicatorTexts = queryVisibleTexts([
    '[data-name="legend-source-item"]',
    '[data-name="legend-indicator-item"]',
    '[class*="legend-source-item"]',
    '[class*="legend"] [class*="item"]'
  ], 32)
  const indicatorValues = parseIndicators(indicatorTexts, symbol, timeframe)
  const candleAnalysis = analyzeCandle(ohlc)
  return {
    loggedIn: hasUserMenu && !hasSignInButton,
    lowConfidence: !symbol || !timeframe || (!currentPrice && !ohlc.close),
    url,
    title,
    symbol,
    exchange,
    timeframe,
    crosshairActive,
    hoveredCandleTime,
    ohlcSource: ohlc.close ? (crosshairActive ? 'hovered' : 'last-visible') : 'unknown',
    currentPrice,
    priceChange,
    ohlc,
    candleDirection: candleAnalysis.candleDirection,
    candleStructure: candleAnalysis.candleStructure,
    patternHints: candleAnalysis.patternHints,
    indicatorValues,
    layoutHints,
    watchlistVisible,
    indicatorsVisible,
    drawingToolsVisible,
    selectedPanel: selectedPanel || null
  }
})()
`

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const aEntries = Object.entries(a)
  const bEntries = Object.entries(b)
  return aEntries.length === bEntries.length
    && aEntries.every(([key, value]) => b[key] === value)
}

function parseTradingViewNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const normalized = value
    .replace(/\s+/g, '')
    .replace(/(?<=\d)\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function hasValidOhlc(ohlc: TradingViewConnectorState['ohlc'] | null | undefined): ohlc is TradingViewConnectorState['ohlc'] {
  return Boolean(ohlc?.open && ohlc?.high && ohlc?.low && ohlc?.close)
}

function compareCandles(
  current: TradingViewConnectorState['ohlc'],
  previous: TradingViewConnectorState['ohlc'] | null
): string[] {
  if (!hasValidOhlc(previous)) return []

  const currentHigh = parseTradingViewNumber(current.high)
  const currentLow = parseTradingViewNumber(current.low)
  const previousHigh = parseTradingViewNumber(previous.high)
  const previousLow = parseTradingViewNumber(previous.low)
  const currentOpen = parseTradingViewNumber(current.open)
  const currentClose = parseTradingViewNumber(current.close)
  const previousOpen = parseTradingViewNumber(previous.open)
  const previousClose = parseTradingViewNumber(previous.close)

  if ([currentHigh, currentLow, previousHigh, previousLow, currentOpen, currentClose, previousOpen, previousClose].some(value => value == null)) {
    return []
  }

  const safeCurrentHigh = currentHigh as number
  const safeCurrentLow = currentLow as number
  const safePreviousHigh = previousHigh as number
  const safePreviousLow = previousLow as number
  const safeCurrentOpen = currentOpen as number
  const safeCurrentClose = currentClose as number
  const safePreviousOpen = previousOpen as number
  const safePreviousClose = previousClose as number

  const hints: string[] = []
  const currentRange = safeCurrentHigh - safeCurrentLow
  const previousRange = safePreviousHigh - safePreviousLow

  if (safeCurrentHigh <= safePreviousHigh && safeCurrentLow >= safePreviousLow) {
    hints.push('inside-bar')
  }
  if (safeCurrentHigh >= safePreviousHigh && safeCurrentLow <= safePreviousLow) {
    hints.push('outside-bar')
  }
  if (previousRange > 0) {
    if (currentRange > previousRange * 1.18) hints.push('range-expansion')
    if (currentRange < previousRange * 0.82) hints.push('range-contraction')
  }

  const currentBullish = safeCurrentClose > safeCurrentOpen
  const previousBullish = safePreviousClose > safePreviousOpen
  if (currentBullish !== previousBullish) {
    hints.push('direction-shift')
  }

  return hints
}

function candleDirectionFromOhlc(ohlc: TradingViewConnectorState['ohlc']): 'bullish' | 'bearish' | 'neutral' | 'unknown' {
  const open = parseTradingViewNumber(ohlc.open)
  const close = parseTradingViewNumber(ohlc.close)
  if (open == null || close == null) return 'unknown'
  if (close > open) return 'bullish'
  if (close < open) return 'bearish'
  return 'neutral'
}

function candleRange(ohlc: TradingViewConnectorState['ohlc']): number | null {
  const high = parseTradingViewNumber(ohlc.high)
  const low = parseTradingViewNumber(ohlc.low)
  if (high == null || low == null) return null
  return high - low
}

function analyzeCandleSequence(
  recent: Array<{ ohlc: TradingViewConnectorState['ohlc'] }>
): string[] {
  if (recent.length < 2) return []

  const hints: string[] = []
  const last = recent[recent.length - 1]?.ohlc
  const prev = recent[recent.length - 2]?.ohlc
  if (!last || !prev) return hints

  const lastDir = candleDirectionFromOhlc(last)
  const prevDir = candleDirectionFromOhlc(prev)
  const lastRange = candleRange(last)
  const prevRange = candleRange(prev)

  if (lastDir !== 'unknown' && prevDir !== 'unknown' && lastDir === prevDir) {
    hints.push('two-candle-continuation')
  }
  if (lastDir !== 'unknown' && prevDir !== 'unknown' && lastDir !== prevDir) {
    hints.push('failed-continuation')
  }
  if (lastRange != null && prevRange != null && prevRange > 0) {
    if (lastRange > prevRange * 1.25) hints.push('fresh-expansion')
    if (lastRange < prevRange * 0.8) hints.push('fresh-compression')
  }

  if (recent.length >= 3) {
    const first = recent[recent.length - 3]?.ohlc
    if (first) {
      const firstRange = candleRange(first)
      if (
        firstRange != null
        && prevRange != null
        && lastRange != null
        && prevRange < firstRange * 0.82
        && lastRange > prevRange * 1.2
      ) {
        hints.push('compression-then-expansion')
      }

      const firstDir = candleDirectionFromOhlc(first)
      if (
        firstDir !== 'unknown'
        && prevDir !== 'unknown'
        && lastDir !== 'unknown'
        && firstDir === prevDir
        && lastDir === prevDir
      ) {
        hints.push('three-candle-continuation')
      }
    }
  }

  return hints
}

function statesEqual(a: TradingViewConnectorState, b: TradingViewConnectorState): boolean {
  return a.connected === b.connected
    && a.loggedIn === b.loggedIn
    && a.lowConfidence === b.lowConfidence
    && a.url === b.url
    && a.title === b.title
    && a.symbol === b.symbol
    && a.exchange === b.exchange
    && a.timeframe === b.timeframe
    && a.crosshairActive === b.crosshairActive
    && a.hoveredCandleTime === b.hoveredCandleTime
    && a.ohlcSource === b.ohlcSource
    && a.currentPrice === b.currentPrice
    && a.priceChange === b.priceChange
    && a.ohlc.open === b.ohlc.open
    && a.ohlc.high === b.ohlc.high
    && a.ohlc.low === b.ohlc.low
    && a.ohlc.close === b.ohlc.close
    && a.previousOhlc?.open === b.previousOhlc?.open
    && a.previousOhlc?.high === b.previousOhlc?.high
    && a.previousOhlc?.low === b.previousOhlc?.low
    && a.previousOhlc?.close === b.previousOhlc?.close
    && a.previousCandleTime === b.previousCandleTime
    && a.candleDirection === b.candleDirection
    && a.candleStructure === b.candleStructure
    && sameArray(a.patternHints, b.patternHints)
    && sameArray(a.contextualPatternHints, b.contextualPatternHints)
    && sameArray(a.sequencePatternHints, b.sequencePatternHints)
    && sameRecord(a.indicatorValues, b.indicatorValues)
    && sameArray(a.layoutHints, b.layoutHints)
    && a.watchlistVisible === b.watchlistVisible
    && a.indicatorsVisible === b.indicatorsVisible
    && a.drawingToolsVisible === b.drawingToolsVisible
    && a.selectedPanel === b.selectedPanel
}

function buildChartUrl(symbol?: string | null, timeframe?: string | null): string {
  const url = new URL(TRADINGVIEW_URL)
  if (symbol) url.searchParams.set('symbol', symbol)
  if (timeframe) url.searchParams.set('interval', timeframe)
  return url.toString()
}

export class TradingViewService {
  private hostWindow: BrowserWindow | null = null
  private view: BrowserView | null = null
  private observeTimer: NodeJS.Timeout | null = null
  private webRequestHooked = false
  private state: TradingViewConnectorState = { ...EMPTY_STATE }
  private lastComparableCandle: {
    key: string
    symbol: string
    timeframe: string
    candleTime: string | null
    ohlc: TradingViewConnectorState['ohlc']
  } | null = null
  private recentComparableCandles: Array<{
    key: string
    symbol: string
    timeframe: string
    candleTime: string | null
    ohlc: TradingViewConnectorState['ohlc']
  }> = []
  private listeners = new Set<StatusListener>()

  onStatusChange(cb: StatusListener): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  getState(): TradingViewConnectorState {
    return {
      ...this.state,
      ohlc: { ...this.state.ohlc },
      previousOhlc: this.state.previousOhlc ? { ...this.state.previousOhlc } : null,
      patternHints: [...this.state.patternHints],
      contextualPatternHints: [...this.state.contextualPatternHints],
      sequencePatternHints: [...this.state.sequencePatternHints],
      indicatorValues: { ...this.state.indicatorValues },
      layoutHints: [...this.state.layoutHints]
    }
  }

  async open(): Promise<TradingViewConnectorState> {
    if (this.hostWindow && !this.hostWindow.isDestroyed()) {
      this.hostWindow.show()
      this.hostWindow.focus()
      void this.observeNow()
      return this.getState()
    }

    const partitionSession = session.fromPartition(TRADINGVIEW_PARTITION)
    this.hostWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 980,
      minHeight: 640,
      backgroundColor: '#0b0d11',
      title: 'TradingView',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        partition: TRADINGVIEW_PARTITION,
        sandbox: false,
        contextIsolation: true
      }
    })

    this.view = new BrowserView({
      webPreferences: {
        partition: TRADINGVIEW_PARTITION,
        sandbox: false,
        contextIsolation: true
      }
    })

    this.hostWindow.setBrowserView(this.view)
    this.syncBounds()
    this.hostWindow.on('resize', () => this.syncBounds())
    this.hostWindow.on('closed', () => {
      this.stopObserving()
      this.view = null
      this.hostWindow = null
      this.setState({
        ...EMPTY_STATE
      })
    })

    this.view.setAutoResize({ width: true, height: true })
    this.view.webContents.setWindowOpenHandler(({ url }) => {
      this.view?.webContents.loadURL(url)
      return { action: 'deny' }
    })

    const triggerObserve = () => {
      void this.observeNow()
    }

    this.view.webContents.on('did-finish-load', triggerObserve)
    this.view.webContents.on('did-navigate', triggerObserve)
    this.view.webContents.on('page-title-updated', triggerObserve)
    if (!this.webRequestHooked) {
      partitionSession.webRequest.onCompleted({ urls: ['https://www.tradingview.com/*'] }, () => {
        void this.observeNow()
      })
      this.webRequestHooked = true
    }

    await this.view.webContents.loadURL(buildChartUrl())
    this.hostWindow.show()
    this.hostWindow.focus()
    this.startObserving()
    return this.getState()
  }

  close(): TradingViewConnectorState {
    this.hostWindow?.close()
    if (!this.hostWindow) {
      this.setState({ ...EMPTY_STATE })
    }
    return this.getState()
  }

  async setSymbol(symbol: string): Promise<TradingViewConnectorState> {
    const trimmed = symbol.trim()
    if (!trimmed) return this.getState()
    await this.ensureOpen()
    await this.view?.webContents.loadURL(buildChartUrl(trimmed, this.state.timeframe))
    await this.observeNow()
    return this.getState()
  }

  async setTimeframe(timeframe: string): Promise<TradingViewConnectorState> {
    const trimmed = timeframe.trim()
    if (!trimmed) return this.getState()
    await this.ensureOpen()
    const currentSymbol = this.state.symbol
    if (currentSymbol) {
      await this.view?.webContents.loadURL(buildChartUrl(currentSymbol, trimmed))
      await this.observeNow()
      return this.getState()
    }

    if (this.view) {
      const escaped = JSON.stringify(trimmed)
      await this.view.webContents.executeJavaScript(`
        (() => {
          const target = ${escaped}
          const buttons = Array.from(document.querySelectorAll('button'))
          const match = buttons.find(button => (button.textContent || '').trim() === target)
          if (match) {
            match.click()
            return true
          }
          return false
        })()
      `, true)
    }

    await this.observeNow()
    return this.getState()
  }

  private async ensureOpen(): Promise<void> {
    if (!this.hostWindow || this.hostWindow.isDestroyed() || !this.view) {
      await this.open()
    }
  }

  private syncBounds(): void {
    if (!this.hostWindow || !this.view) return
    const bounds = this.hostWindow.getContentBounds()
    this.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
  }

  private startObserving(): void {
    this.stopObserving()
    this.observeTimer = setInterval(() => {
      void this.observeNow()
    }, OBSERVE_INTERVAL_MS)
  }

  private stopObserving(): void {
    if (this.observeTimer) {
      clearInterval(this.observeTimer)
      this.observeTimer = null
    }
  }

  private async observeNow(): Promise<void> {
    if (!this.view || this.view.webContents.isDestroyed()) return

    try {
      const observed = await this.view.webContents.executeJavaScript(OBSERVER_SCRIPT, true) as Omit<
        TradingViewConnectorState,
        'connected' | 'lastObservedAt'
      >

      const nextState: TradingViewConnectorState = {
        connected: true,
        loggedIn: Boolean(observed.loggedIn),
        lowConfidence: Boolean(observed.lowConfidence),
        url: observed.url ?? this.view.webContents.getURL() ?? null,
        title: observed.title ?? this.view.webContents.getTitle() ?? null,
        symbol: observed.symbol ?? null,
        exchange: observed.exchange ?? null,
        timeframe: observed.timeframe ?? null,
        crosshairActive: Boolean(observed.crosshairActive),
        hoveredCandleTime: observed.hoveredCandleTime ?? null,
        ohlcSource: observed.ohlcSource ?? 'unknown',
        currentPrice: observed.currentPrice ?? null,
        priceChange: observed.priceChange ?? null,
        ohlc: observed.ohlc ?? { ...EMPTY_STATE.ohlc },
        previousOhlc: this.state.previousOhlc ? { ...this.state.previousOhlc } : null,
        previousCandleTime: this.state.previousCandleTime ?? null,
        candleDirection: observed.candleDirection ?? 'unknown',
        candleStructure: observed.candleStructure ?? null,
        patternHints: Array.isArray(observed.patternHints) ? observed.patternHints : [],
        contextualPatternHints: [...this.state.contextualPatternHints],
        sequencePatternHints: [...this.state.sequencePatternHints],
        indicatorValues: observed.indicatorValues ?? {},
        layoutHints: Array.isArray(observed.layoutHints) ? observed.layoutHints : [],
        watchlistVisible: Boolean(observed.watchlistVisible),
        indicatorsVisible: Boolean(observed.indicatorsVisible),
        drawingToolsVisible: Boolean(observed.drawingToolsVisible),
        selectedPanel: observed.selectedPanel ?? null,
        lastObservedAt: Date.now()
      }

      const symbolChanged = this.state.symbol !== nextState.symbol || this.state.timeframe !== nextState.timeframe
      if (symbolChanged) {
        this.lastComparableCandle = null
        this.recentComparableCandles = []
        nextState.previousOhlc = null
        nextState.previousCandleTime = null
        nextState.contextualPatternHints = []
        nextState.sequencePatternHints = []
      }

      if (hasValidOhlc(nextState.ohlc) && nextState.symbol && nextState.timeframe) {
        const candleTime = nextState.hoveredCandleTime ?? `${nextState.ohlcSource}:${nextState.ohlc.open}:${nextState.ohlc.close}`
        const key = `${nextState.symbol}|${nextState.timeframe}|${candleTime}`
        if (this.lastComparableCandle && this.lastComparableCandle.key !== key) {
          if (
            this.lastComparableCandle.symbol === nextState.symbol
            && this.lastComparableCandle.timeframe === nextState.timeframe
          ) {
            nextState.previousOhlc = { ...this.lastComparableCandle.ohlc }
            nextState.previousCandleTime = this.lastComparableCandle.candleTime
            nextState.contextualPatternHints = compareCandles(nextState.ohlc, nextState.previousOhlc)
          }
        } else if (this.lastComparableCandle?.key === key) {
          nextState.contextualPatternHints = compareCandles(nextState.ohlc, nextState.previousOhlc)
        }

        const comparableCandle = {
          key,
          symbol: nextState.symbol,
          timeframe: nextState.timeframe,
          candleTime: nextState.hoveredCandleTime,
          ohlc: { ...nextState.ohlc }
        }
        this.lastComparableCandle = comparableCandle

        if (this.recentComparableCandles[this.recentComparableCandles.length - 1]?.key !== key) {
          this.recentComparableCandles = [...this.recentComparableCandles, comparableCandle].slice(-3)
        }
        nextState.sequencePatternHints = analyzeCandleSequence(this.recentComparableCandles)
      }

      this.setState(nextState)
    } catch (error) {
      console.warn(
        '[TradingView] falha ao observar a página:',
        error instanceof Error ? error.message : error
      )
      this.setState({
        ...this.state,
        connected: true,
        lowConfidence: true,
        url: this.view.webContents.getURL() || this.state.url,
        title: this.view.webContents.getTitle() || this.state.title,
        lastObservedAt: Date.now()
      })
    }
  }

  private setState(next: TradingViewConnectorState): void {
    const normalized: TradingViewConnectorState = {
      ...next,
      ohlc: { ...next.ohlc },
      previousOhlc: next.previousOhlc ? { ...next.previousOhlc } : null,
      patternHints: [...next.patternHints],
      contextualPatternHints: [...next.contextualPatternHints],
      sequencePatternHints: [...next.sequencePatternHints],
      indicatorValues: { ...next.indicatorValues },
      layoutHints: [...next.layoutHints]
    }
    const changed = !statesEqual(this.state, normalized)
    this.state = normalized
    if (!changed) return
    for (const listener of this.listeners) {
      listener(this.getState())
    }
  }
}

export const tradingViewService = new TradingViewService()
