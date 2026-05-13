import { useRef, useEffect, useState, useCallback, KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type {
  MacroEvent,
  MarketNewsSnapshot,
  OperatorAnalysis,
  TutorResponse,
  TutorStep,
  TradingViewConnectorState
} from '@shared/perception.types'
import { LogoMark } from './LogoMark'
import { MessageBody } from './MessageBody'
import { SendIcon } from './SendIcon'
import { StreamingTimeline } from './StreamingTimeline'
import { useDragWindow } from '@renderer/hooks/useDragWindow'
import { useSpeechInput } from '@renderer/hooks/useSpeechInput'

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
  proactive?: boolean
}

export interface HudOperatorProps {
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  streamingSteps: TutorStep[]
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  onInputFocus: () => void
  onInputBlur: () => void
  onActivity: () => void
  onExitOperator: () => void
  onAnalyzeNow?: () => void
  tradingViewState: TradingViewConnectorState | null
  symbol?: string
  newsSnapshot?: MarketNewsSnapshot | null
  approachingEvent?: MacroEvent | null
  voiceEnabled?: boolean
}

const NEWS_PANEL_W = 250
const CHAT_PANEL_MIN_W = 250
const CHAT_PANEL_MAX_W = 420
const MAIN_HUD_W = 840
const FLOATING_GAP = 11

function buildChartUrl(symbol: string): string {
  const params = new URLSearchParams({
    symbol,
    interval: '240',
    theme: 'dark',
    style: '1',
    locale: 'pt_BR',
    enable_publishing: '0',
    hide_side_toolbar: '0',
    allow_symbol_change: '1',
    save_image: '0',
    hide_volume: '0'
  })
  return `https://www.tradingview.com/widgetembed/?${params.toString()}`
}

const TF: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '120': '2h',
  '240': '4h',
  D: '1D',
  W: '1S'
}

function relativeTime(pubDate: string): string {
  try {
    const ms = Date.now() - new Date(pubDate).getTime()
    const min = Math.floor(ms / 60000)
    if (min < 1) return 'agora'
    if (min < 60) return `${min}min`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  } catch {
    return ''
  }
}

function clipText(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

function deriveNewsContext(title: string, fallback: string): string {
  const parts = title
    .split(/(?:\s[-|:]\s)/g)
    .map(part => part.trim())
    .filter(Boolean)

  if (parts.length >= 2) {
    const candidate = parts.slice(1).join(' ').trim()
    if (candidate) return clipText(candidate, 66)
  }

  return fallback
}

function NewsPanel({
  snapshot,
  symbol
}: {
  snapshot: MarketNewsSnapshot | null
  symbol: string
}) {
  const items = snapshot?.items ?? []
  const hotLinks = new Set(snapshot?.hotItems.map(item => item.link) ?? [])
  const fallbackContext = symbol ? `fluxo ligado em ${symbol}` : 'monitorando o fluxo'

  return (
    <motion.aside
      key="operator-news-panel"
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -40, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="h-full flex-shrink-0 overflow-hidden"
      style={{
        width: NEWS_PANEL_W,
        borderRadius: '18px 0 0 18px',
        background: '#050505',
        boxShadow: '0 18px 38px rgba(0,0,0,0.34)',
        border: '1px solid rgba(255,255,255,0.08)'
      }}
    >
      <div className="flex h-full flex-col">
        <div className="px-3 pt-3 pb-2">
          <p
            className="text-[10px]"
            style={{ color: 'rgba(255,255,255,0.76)', letterSpacing: '0.01em' }}
          >
            Notícias
          </p>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-none px-3 pb-4 pt-1">
          {items.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
                Sem notícias no momento.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {items.slice(0, 10).map((item, index) => {
                const isHot = hotLinks.has(item.link)
                const timeLabel = relativeTime(item.pubDate)
                const context = deriveNewsContext(item.title, fallbackContext)
                const sourceLabel = item.source ?? timeLabel ?? 'mercado'

                return (
                  <a
                    key={`${item.link}-${index}`}
                    href={item.link}
                    onClick={e => {
                      e.preventDefault()
                      window.open(item.link, '_blank')
                    }}
                    className="block transition-opacity hover:opacity-80"
                    style={{ textDecoration: 'none' }}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      {isHot ? (
                        <p
                          className="text-[10px] font-semibold uppercase"
                          style={{ color: '#ff4a4a', letterSpacing: '0.03em' }}
                        >
                          Agora
                        </p>
                      ) : (
                        <p
                          className="text-[10px] uppercase"
                          style={{ color: 'rgba(255,255,255,0.44)', letterSpacing: '0.06em' }}
                        >
                          {sourceLabel}
                        </p>
                      )}
                      {timeLabel && item.source ? (
                        <p
                          className="text-[9px]"
                          style={{ color: 'rgba(255,255,255,0.28)', letterSpacing: '0.04em' }}
                        >
                          {timeLabel}
                        </p>
                      ) : null}
                    </div>

                    <p
                      className="text-[12px] font-semibold underline"
                      style={{
                        color: '#f7f7f7',
                        textUnderlineOffset: '2px',
                        lineHeight: 1.35
                      }}
                    >
                      {clipText(item.title, 60)}
                    </p>

                    <p
                      className="mt-2 text-[11px]"
                      style={{
                        color: 'rgba(255,255,255,0.80)',
                        lineHeight: 1.5
                      }}
                    >
                      {context}
                    </p>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  )
}

function DiaryEntry({ entry }: { entry: OperatorAnalysis }) {
  const [expanded, setExpanded] = useState(false)
  const date = new Date(entry.timestamp)
  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const isShort = entry.summary.length < 180

  return (
    <div
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 10,
        marginBottom: 10
      }}
    >
      <div className="mb-2 flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
        <span className="text-[9px]" style={{ color: 'var(--ares-text-muted)' }}>
          {dateStr} {timeStr}
        </span>
        {entry.timeframe ? (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--ares-text-secondary)'
            }}
          >
            {entry.timeframe}
          </span>
        ) : null}
      </div>

      <p
        className="text-[11px]"
        style={{
          color: 'var(--ares-text-secondary)',
          lineHeight: 1.55,
          display: '-webkit-box',
          WebkitLineClamp: expanded || isShort ? undefined : 4,
          WebkitBoxOrient: 'vertical' as const,
          overflow: expanded || isShort ? 'visible' : 'hidden'
        }}
      >
        {entry.summary}
      </p>

      {!isShort ? (
        <button
          onClick={() => setExpanded(value => !value)}
          className="mt-2 text-[9.5px] transition-opacity hover:opacity-70"
          style={{ color: 'var(--ares-text-muted)' }}
        >
          {expanded ? 'menos' : 'mais'}
        </button>
      ) : null}
    </div>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="6" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 9a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="9" y1="15" x2="9" y2="17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function HudOperator({
  messages,
  isStreaming,
  streamingContent,
  streamingSteps,
  inputValue,
  onInputChange,
  onSubmit,
  onInputFocus,
  onInputBlur,
  onActivity,
  onExitOperator,
  onAnalyzeNow,
  tradingViewState,
  symbol,
  newsSnapshot,
  approachingEvent,
  voiceEnabled = false
}: HudOperatorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chartWebviewRef = useRef<Electron.WebviewTag | null>(null)
  const prevMsgLen = useRef(messages.length)
  const { handleMouseDown } = useDragWindow()

  const [newsPanelOpen, setNewsPanelOpen] = useState(true)
  const [chatPanelOpen, setChatPanelOpen] = useState(true)
  const [chatPanelWidth, setChatPanelWidth] = useState(CHAT_PANEL_MIN_W)
  const [activeTab, setActiveTab] = useState<'chat' | 'diary'>('chat')
  const [diaryEntries, setDiaryEntries] = useState<OperatorAnalysis[]>([])
  const [diaryLoading, setDiaryLoading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [countdown, setCountdown] = useState<string | null>(null)
  const [chartVisible, setChartVisible] = useState(true)

  useEffect(() => {
    if (!approachingEvent) {
      setCountdown(null)
      return
    }

    const update = () => {
      const min = Math.round((approachingEvent.timestamp - Date.now()) / 60000)
      setCountdown(min > 0 ? `${min}min` : 'agora')
    }

    update()
    const timer = setInterval(update, 15_000)
    return () => clearInterval(timer)
  }, [approachingEvent])

  useEffect(() => {
    if (messages.length > prevMsgLen.current) {
      setIsAnalyzing(false)
      prevMsgLen.current = messages.length
    }
  }, [messages.length])

  const loadDiary = useCallback(async () => {
    setDiaryLoading(true)
    try {
      const activeSymbol = symbol ?? tradingViewState?.symbol ?? undefined
      const entries = await window.analysisAPI.list(activeSymbol)
      setDiaryEntries(entries)
    } catch {
      setDiaryEntries([])
    } finally {
      setDiaryLoading(false)
    }
  }, [symbol, tradingViewState?.symbol])

  const handleToggleNewsPanel = useCallback(() => {
    setNewsPanelOpen(current => !current)
  }, [])

  const handleToggleChatPanel = useCallback(() => {
    setChatPanelOpen(current => !current)
  }, [])

  const handleChatResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = chatPanelWidth

    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(
        CHAT_PANEL_MIN_W,
        Math.min(CHAT_PANEL_MAX_W, startWidth + (moveEvent.clientX - startX))
      )
      setChatPanelWidth(nextWidth)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [chatPanelWidth])

  const handleOpenDiary = useCallback(() => {
    setActiveTab('diary')
    void loadDiary()
  }, [loadDiary])

  const handleAnalyzeNow = useCallback(() => {
    if (!onAnalyzeNow || isAnalyzing || isStreaming) return
    setIsAnalyzing(true)
    void onAnalyzeNow()
  }, [isAnalyzing, isStreaming, onAnalyzeNow])

  const clearChartWebview = useCallback(() => {
    const webview = chartWebviewRef.current
    if (webview) webview.src = 'about:blank'
  }, [])

  const teardownChartWebview = useCallback(() => {
    clearChartWebview()
    setChartVisible(false)
  }, [clearChartWebview])

  const handleExitOperator = useCallback(() => {
    teardownChartWebview()
    requestAnimationFrame(() => onExitOperator())
  }, [onExitOperator, teardownChartWebview])

  useEffect(() => {
    return () => clearChartWebview()
  }, [clearChartWebview])

  const handleTranscript = useCallback((text: string) => {
    const next = inputValue.trim() ? `${inputValue} ${text}` : text
    onInputChange(next)
    onActivity()
    setTimeout(() => {
      if (next.trim()) onSubmit()
    }, 400)
  }, [inputValue, onActivity, onInputChange, onSubmit])

  const { isListening, isSupported, toggle: toggleMic } = useSpeechInput(handleTranscript)

  const activeSymbol = symbol ?? tradingViewState?.symbol ?? 'XAUUSD'
  const chartUrl = buildChartUrl(activeSymbol)
  const tf = tradingViewState?.timeframe
  const price = tradingViewState?.currentPrice
  const change = tradingViewState?.priceChange
  const positive = change ? !change.startsWith('-') : null

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, streamingContent, activeTab, diaryEntries])

  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.style.height = 'auto'
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 96)}px`
  }, [inputValue])

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !isStreaming) onSubmit()
    }
  }

  return (
    <div
      className="pointer-events-none relative h-full w-full overflow-visible"
      onMouseMove={onActivity}
      onWheel={onActivity}
    >
      <div className="relative h-full w-full overflow-visible">
        <section
          className="pointer-events-auto absolute left-1/2 top-4 flex h-[calc(100%-2rem)] min-w-0 -translate-x-1/2 flex-col overflow-hidden"
          style={{
            width: MAIN_HUD_W,
            borderRadius: 22,
            background: '#040404',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 18px 44px rgba(0,0,0,0.42)'
          }}
        >
          <div
            className="flex flex-shrink-0 items-center gap-3 px-5"
            style={{ height: 54, cursor: 'grab' }}
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-3">
              <LogoMark className="h-[24px] w-auto text-white" />
              <span
                className="text-[15px] font-semibold"
                style={{ color: '#ff4a4a', letterSpacing: '-0.01em' }}
              >
                Ao Vivo
              </span>

              <button
                onMouseDown={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleToggleNewsPanel()
                }}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-75"
                style={{
                  color: newsPanelOpen ? 'rgba(255,255,255,0.68)' : '#f3f3f3',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)'
                }}
                aria-label={newsPanelOpen ? 'Recolher notícias' : 'Expandir notícias'}
                title={newsPanelOpen ? 'Recolher notícias' : 'Expandir notícias'}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  {newsPanelOpen ? (
                    <path d="M7.75 2.25L4.25 6L7.75 9.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M4.25 2.25L7.75 6L4.25 9.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              {tf ? (
                <span
                  className="rounded-full px-2 py-1"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--ares-text-secondary)'
                  }}
                >
                  {TF[tf] ?? tf}
                </span>
              ) : null}
              {price ? (
                <span style={{ color: 'var(--ares-text-primary)' }}>{price}</span>
              ) : null}
              {change && positive !== null ? (
                <span style={{ color: positive ? 'var(--ares-success)' : 'var(--ares-danger)' }}>
                  {change}
                </span>
              ) : null}
            </div>

            <div className="flex-1" />

            {approachingEvent && countdown ? (
              <div
                className="mr-2 flex items-center gap-2 rounded-full px-3 py-1"
                style={{
                  background: 'rgba(255,173,51,0.08)',
                  border: '1px solid rgba(255,173,51,0.22)',
                  color: '#ffb74d'
                }}
              >
                <span className="text-[10px]">{approachingEvent.title}</span>
                <span className="text-[10px] opacity-75">{countdown}</span>
              </div>
            ) : null}

            <button
              onMouseDown={e => {
                e.preventDefault()
                e.stopPropagation()
                handleToggleChatPanel()
              }}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-75"
              style={{
                color: chatPanelOpen ? 'rgba(255,255,255,0.68)' : '#f3f3f3',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)'
              }}
              aria-label={chatPanelOpen ? 'Recolher chat' : 'Expandir chat'}
              title={chatPanelOpen ? 'Recolher chat' : 'Expandir chat'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                {chatPanelOpen ? (
                  <path d="M4.25 2.25L7.75 6L4.25 9.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M7.75 2.25L4.25 6L7.75 9.75" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>

            {onAnalyzeNow ? (
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleAnalyzeNow()
                }}
                disabled={isAnalyzing || isStreaming}
                className="rounded-full px-3 py-1 text-[10px] transition-opacity hover:opacity-80 disabled:opacity-35"
                style={{
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--ares-text-secondary)'
                }}
              >
                {isAnalyzing ? 'Analisando' : 'Analisar'}
              </button>
            ) : null}
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            {chartVisible ? (
              <webview
                ref={chartWebviewRef}
                src={chartUrl}
                partition="persist:ares-operator-tradingview"
                style={{ width: '100%', height: '100%', border: 'none' }}
                allowpopups=""
              />
            ) : null}

            <div
              className="absolute bottom-0 left-0 flex items-center gap-2 px-4"
              style={{ height: 34, pointerEvents: 'none', zIndex: 5 }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
                  style={{ background: 'var(--ares-text-muted)' }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--ares-text-muted)' }}
                />
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--ares-text-muted)', letterSpacing: '0.02em' }}
              >
                Modo autônomo ativado
              </span>
            </div>
          </div>
        </section>

        <AnimatePresence initial={false}>
          {newsPanelOpen ? (
            <motion.div
              key="floating-news-panel"
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="pointer-events-auto absolute top-4 z-20"
              style={{
                left: `calc(50% - ${MAIN_HUD_W / 2}px - ${FLOATING_GAP}px - ${NEWS_PANEL_W}px)`,
                height: 'calc(100% - 2rem)'
              }}
            >
              <NewsPanel
                snapshot={newsSnapshot ?? null}
                symbol={activeSymbol}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {chatPanelOpen ? (
            <motion.aside
              key="floating-chat-panel"
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="pointer-events-auto absolute top-4 z-20 flex flex-col overflow-hidden"
              style={{
                left: `calc(50% + ${MAIN_HUD_W / 2}px + ${FLOATING_GAP}px)`,
                height: 'calc(100% - 2rem)',
                width: chatPanelWidth,
                borderRadius: '0 22px 22px 0',
                background: '#050505',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 18px 44px rgba(0,0,0,0.42)'
              }}
            >
              <div
                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                onMouseDown={handleChatResizeStart}
                style={{ zIndex: 3 }}
              />
              <div className="flex flex-shrink-0 items-center justify-between px-4 pt-4">
                <div className="flex items-center gap-2">
                  {(['chat', 'diary'] as const).map(tab => (
                    <button
                      key={tab}
                      onMouseDown={e => {
                        e.preventDefault()
                        if (tab === 'diary') {
                          handleOpenDiary()
                          return
                        }
                        setActiveTab('chat')
                      }}
                      className="rounded-full px-2.5 py-1 text-[10px] transition-opacity hover:opacity-80"
                      style={{
                        color: activeTab === tab ? '#f7f7f7' : 'rgba(255,255,255,0.44)',
                        background: activeTab === tab ? 'rgba(255,255,255,0.08)' : 'transparent'
                      }}
                    >
                      {tab === 'chat' ? 'Chat' : 'Diário'}
                    </button>
                  ))}
                </div>

                <button
                  onMouseDown={e => {
                    e.preventDefault()
                    handleExitOperator()
                  }}
                  className="text-[14px] font-medium transition-opacity hover:opacity-75"
                  style={{ color: '#f3f3f3' }}
                >
                  Sair
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-4">
                {activeTab === 'chat' ? (
                  <>
                    <div
                      ref={scrollRef}
                      className="flex-1 overflow-y-auto scrollbar-none"
                      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                      {messages.length === 0 && !isStreaming ? (
                        <div className="flex flex-1 items-end justify-center pb-4">
                          <span
                            className="text-center text-[11px]"
                            style={{ color: 'var(--ares-text-muted)', lineHeight: 1.6 }}
                          >
                            Observando o mercado.
                          </span>
                        </div>
                      ) : null}

                      {messages.map((msg, index) => (
                        <div
                          key={index}
                          className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                        >
                          {msg.role === 'user' ? (
                            <div
                              className="max-w-[90%] rounded-2xl rounded-br-sm px-3 py-2 text-[12px]"
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                color: 'var(--ares-text-primary)',
                                lineHeight: 1.55
                              }}
                            >
                              {msg.content}
                            </div>
                          ) : (
                            <div className="max-w-full">
                              {msg.proactive ? (
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="relative flex h-1.5 w-1.5">
                                    <span
                                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40"
                                      style={{ background: 'var(--ares-success)' }}
                                    />
                                    <span
                                      className="relative inline-flex h-1.5 w-1.5 rounded-full"
                                      style={{ background: 'var(--ares-success)' }}
                                    />
                                  </span>
                                  <span
                                    className="text-[9px] uppercase"
                                    style={{ color: 'var(--ares-success)', letterSpacing: '0.14em' }}
                                  >
                                    auto
                                  </span>
                                </div>
                              ) : null}
                              <MessageBody content={msg.content} compact />
                            </div>
                          )}
                        </div>
                      ))}

                      {isStreaming ? (
                        <div className="flex justify-start">
                          <div className="w-full max-w-full">
                            {streamingSteps.length > 0 ? (
                              <div className="mb-2">
                                <StreamingTimeline steps={streamingSteps} streamingContent={streamingContent} />
                              </div>
                            ) : null}

                            {streamingContent ? (
                              <MessageBody content={streamingContent} compact streaming />
                            ) : (
                              <div className="flex items-center gap-1 py-1">
                                {[0, 1, 2].map(item => (
                                  <span
                                    key={item}
                                    className="h-1 w-1 rounded-full animate-bounce"
                                    style={{
                                      background: 'var(--ares-text-muted)',
                                      animationDelay: `${item * 0.15}s`
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex-shrink-0">
                      <div
                        className={isStreaming ? 'ares-stream-pulse' : undefined}
                        style={{
                          borderTop: '1px solid rgba(255,255,255,0.28)',
                          paddingTop: 12
                        }}
                      >
                        <div className="flex items-end gap-3">
                          <textarea
                            ref={inputRef}
                            rows={1}
                            value={inputValue}
                            disabled={isStreaming}
                            onChange={e => {
                              onInputChange(e.target.value)
                              onActivity()
                            }}
                            onKeyDown={handleKey}
                            onFocus={onInputFocus}
                            onBlur={onInputBlur}
                            placeholder="Fale com ares"
                            className="flex-1 resize-none bg-transparent outline-none scrollbar-none overflow-y-auto"
                            style={{
                              color: 'var(--ares-text-secondary)',
                              fontSize: 'calc(var(--hud-font-size, 15px) - 1px)',
                              lineHeight: 'var(--hud-body-leading, 1.66)',
                              letterSpacing: 'var(--hud-input-tracking, -0.015em)',
                              minHeight: 22,
                              maxHeight: 96,
                              caretColor: 'white'
                            }}
                          />

                          {voiceEnabled && isSupported ? (
                            <button
                              onMouseDown={e => e.preventDefault()}
                              onClick={toggleMic}
                              disabled={isStreaming}
                              className="relative mb-0.5 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center transition-opacity duration-150 disabled:opacity-30 hover:opacity-70"
                              style={{ color: isListening ? 'var(--ares-danger)' : 'var(--ares-text-muted)' }}
                              aria-label={isListening ? 'Parar gravação' : 'Gravar voz'}
                            >
                              {isListening ? (
                                <span
                                  className="absolute inset-0 rounded-full animate-ping opacity-30"
                                  style={{ background: 'var(--ares-danger)' }}
                                />
                              ) : null}
                              <MicIcon className="relative h-[16px] w-[16px]" />
                            </button>
                          ) : null}

                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              if (!isStreaming && inputValue.trim()) onSubmit()
                            }}
                            disabled={isStreaming || !inputValue.trim()}
                            className="mb-0.5 flex-shrink-0 transition-opacity duration-150 disabled:opacity-30 hover:opacity-70"
                            style={{ color: 'var(--ares-text-primary)' }}
                            aria-label="Enviar"
                          >
                            <SendIcon className="h-[18px] w-[18px]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none">
                      {diaryLoading ? (
                        <div className="flex h-full items-center justify-center">
                          <span className="text-[11px]" style={{ color: 'var(--ares-text-muted)' }}>
                            Carregando…
                          </span>
                        </div>
                      ) : diaryEntries.length === 0 ? (
                        <div className="flex h-full items-center justify-center">
                          <span
                            className="text-center text-[11px]"
                            style={{ color: 'var(--ares-text-muted)', lineHeight: 1.6 }}
                          >
                            Nenhuma análise salva ainda.
                          </span>
                        </div>
                      ) : (
                        diaryEntries.map(entry => (
                          <DiaryEntry key={entry.id} entry={entry} />
                        ))
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      <button
                        onMouseDown={e => {
                          e.preventDefault()
                          setActiveTab('chat')
                        }}
                        className="text-[10px] transition-opacity hover:opacity-70"
                        style={{ color: 'var(--ares-text-secondary)' }}
                      >
                        Voltar ao chat
                      </button>

                      {diaryEntries.length > 0 ? (
                        <button
                          onMouseDown={async e => {
                            e.preventDefault()
                            await window.analysisAPI.clear()
                            setDiaryEntries([])
                          }}
                          className="text-[10px] transition-opacity hover:opacity-70"
                          style={{ color: 'var(--ares-danger)' }}
                        >
                          Limpar
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
