import { useRef, useEffect, useState, useCallback, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { MacroEvent, MarketNewsSnapshot, TutorResponse, TutorStep, TradingViewConnectorState } from '@shared/perception.types'
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
  tradingViewState: TradingViewConnectorState | null
  symbol?: string
  newsSnapshot?: MarketNewsSnapshot | null
  approachingEvent?: MacroEvent | null
  voiceEnabled?: boolean
}

const DRAWER_WIDTH = 260
const TOP_BAR_H = 44

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
    hide_volume: '0',
  })
  return `https://www.tradingview.com/widgetembed/?${params.toString()}`
}

const TF: Record<string, string> = {
  '1': '1m', '5': '5m', '15': '15m', '30': '30m',
  '60': '1h', '120': '2h', '240': '4h', 'D': '1D', 'W': '1S'
}

function NewsPill({ snapshot }: { snapshot: MarketNewsSnapshot }) {
  const [expanded, setExpanded] = useState(false)
  const isHot = snapshot.hotItems.length > 0
  const displayItems = expanded ? snapshot.items.slice(0, 5) : snapshot.items.slice(0, 1)
  if (!displayItems.length) return null

  const hotColor = 'var(--john-warning, #f59e0b)'
  const borderColor = isHot ? hotColor : 'var(--john-border-soft)'
  const iconColor = isHot ? hotColor : 'var(--john-text-muted)'

  return (
    <div
      className="absolute bottom-0 left-0 mb-8 ml-3"
      style={{ maxWidth: 280, zIndex: 10 }}
    >
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="news-list"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            className="mb-1.5 flex flex-col gap-1 px-3 py-2 rounded-xl"
            style={{
              background: 'color-mix(in srgb, var(--john-bg-panel-top) 92%, transparent)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${borderColor}`
            }}
          >
            {snapshot.items.slice(1, 5).map((item, i) => {
              const itemHot = snapshot.hotItems.some(h => h.link === item.link)
              return (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => { e.preventDefault(); window.open(item.link, '_blank') }}
                  className="text-[10.5px] leading-snug transition-opacity duration-150 hover:opacity-70 block"
                  style={{ color: itemHot ? hotColor : 'var(--john-text-secondary)' }}
                >
                  {itemHot && '⚡ '}
                  {item.title.length > 80 ? item.title.slice(0, 79) + '…' : item.title}
                </a>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-opacity duration-150 hover:opacity-80"
        style={{
          background: isHot
            ? 'color-mix(in srgb, var(--john-bg-panel-top) 88%, transparent)'
            : 'color-mix(in srgb, var(--john-bg-panel-top) 88%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: `1px solid ${borderColor}`,
          color: iconColor
        }}
      >
        {isHot ? (
          <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: hotColor }}
            />
            <span
              className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: hotColor }}
            />
          </span>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 3H5a2 2 0 0 0-2 2v14l4-4h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        )}
        <span
          className="text-[10.5px] max-w-[200px] truncate"
          style={{ color: isHot ? hotColor : 'var(--john-text-secondary)' }}
        >
          {displayItems[0].title.length > 48 ? displayItems[0].title.slice(0, 47) + '…' : displayItems[0].title}
        </span>
        <svg
          width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"
          style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: iconColor }}
        >
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
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
  tradingViewState,
  symbol,
  newsSnapshot,
  approachingEvent,
  voiceEnabled = false,
}: HudOperatorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const { handleMouseDown } = useDragWindow()

  const [countdown, setCountdown] = useState<string | null>(null)
  useEffect(() => {
    if (!approachingEvent) { setCountdown(null); return }
    const update = () => {
      const min = Math.round((approachingEvent.timestamp - Date.now()) / 60000)
      setCountdown(min > 0 ? `${min}min` : 'agora')
    }
    update()
    const t = setInterval(update, 15_000)
    return () => clearInterval(t)
  }, [approachingEvent])

  const handleTranscript = useCallback((text: string) => {
    const next = inputValue.trim() ? `${inputValue} ${text}` : text
    onInputChange(next)
    onActivity()
    // auto-submit no modo operador após 400ms (permite editar se quiser)
    setTimeout(() => {
      if (next.trim()) onSubmit()
    }, 400)
  }, [inputValue, onInputChange, onActivity, onSubmit])

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
  }, [messages, streamingContent])

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
      className="relative flex flex-col h-full w-full overflow-hidden"
      onMouseMove={onActivity}
      onWheel={onActivity}
    >
      {/* ── Top bar ─────────────────────────────────────── */}
      <div
        className="flex items-center gap-2.5 px-4 flex-shrink-0 cursor-grab active:cursor-grabbing z-10"
        style={{ height: TOP_BAR_H, position: 'relative' }}
        onMouseDown={handleMouseDown}
      >
        <LogoMark className="h-[22px] w-auto text-white flex-shrink-0" />

        <span
          className="text-[13px] font-semibold"
          style={{ color: 'var(--john-danger)', letterSpacing: '0.01em' }}
        >
          Ao Vivo
        </span>

        {tf && (
          <span
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{
              background: 'color-mix(in srgb, var(--john-surface-1) 80%, transparent)',
              color: 'var(--john-text-tertiary)'
            }}
          >
            {TF[tf] ?? tf}
          </span>
        )}

        {price && (
          <span className="text-[13px]" style={{ color: 'var(--john-text-primary)' }}>
            {price}
          </span>
        )}
        {change && positive !== null && (
          <span
            className="text-[11px]"
            style={{ color: positive ? 'var(--john-success)' : 'var(--john-danger)' }}
          >
            {change}
          </span>
        )}

        {approachingEvent && countdown && (
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md"
            style={{
              background: 'color-mix(in srgb, var(--john-warning, #f59e0b) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--john-warning, #f59e0b) 30%, transparent)'
            }}
          >
            <span
              className="relative flex h-1.5 w-1.5 flex-shrink-0"
            >
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
                style={{ background: 'var(--john-warning, #f59e0b)' }}
              />
              <span
                className="relative inline-flex rounded-full h-1.5 w-1.5"
                style={{ background: 'var(--john-warning, #f59e0b)' }}
              />
            </span>
            <span
              className="text-[10.5px] font-medium"
              style={{ color: 'var(--john-warning, #f59e0b)' }}
            >
              {approachingEvent.title} · {countdown}
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Chat toggle */}
        <button
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setDrawerOpen(v => !v) }}
          className="w-7 h-7 flex items-center justify-center transition-opacity duration-150 hover:opacity-70"
          style={{ color: drawerOpen ? 'var(--john-text-primary)' : 'var(--john-text-muted)' }}
          aria-label="Fale com John"
          title="Fale com John"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Exit */}
        <button
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onExitOperator() }}
          className="flex items-center gap-1 transition-opacity duration-150 hover:opacity-70 ml-1"
          style={{ color: 'var(--john-text-secondary)', fontSize: 13 }}
        >
          Sair
        </button>
      </div>

      {/* ── Chart — fills everything below top bar ────── */}
      <div className="relative flex-1 overflow-hidden" style={{ background: '#000' }}>
        <webview
          src={chartUrl}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allowpopups=""
        />

        {/* Autonomous label — bottom left of chart */}
        <div
          className="absolute bottom-0 left-0 flex items-center gap-2 px-4"
          style={{ height: 34, pointerEvents: 'none', zIndex: 5 }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
              style={{ background: 'var(--john-text-muted)' }}
            />
            <span
              className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: 'var(--john-text-muted)' }}
            />
          </span>
          <span
            className="text-[11px]"
            style={{ color: 'var(--john-text-muted)', letterSpacing: '0.02em' }}
          >
            Modo autônomo ativado
          </span>
        </div>

        {/* News pill — bottom left, above autonomous label */}
        {newsSnapshot && newsSnapshot.items.length > 0 && (
          <NewsPill snapshot={newsSnapshot} />
        )}

        {/* ── Chat drawer (slides in from right, overlays chart) ── */}
        <AnimatePresence>
          {drawerOpen && (
            <motion.div
              key="chat-drawer"
              initial={{ x: DRAWER_WIDTH, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: DRAWER_WIDTH, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="absolute top-0 right-0 h-full flex flex-col"
              style={{
                width: DRAWER_WIDTH,
                background: 'linear-gradient(180deg, var(--john-bg-panel-top) 0%, var(--john-bg-panel-bottom) 100%)',
                backdropFilter: 'blur(24px) saturate(160%)',
                WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                borderLeft: '1px solid var(--john-border-soft)'
              }}
            >
              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto scrollbar-none px-3 py-3"
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {messages.length === 0 && !isStreaming && (
                  <div className="flex-1 flex items-end justify-center pb-3">
                    <span
                      className="text-[11px] text-center"
                      style={{ color: 'var(--john-text-muted)', lineHeight: 1.6 }}
                    >
                      Observando o mercado.
                    </span>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    {msg.role === 'user' ? (
                      <div
                        className="px-3 py-2 rounded-2xl rounded-tr-sm text-[12px] max-w-[90%]"
                        style={{
                          background: 'color-mix(in srgb, var(--john-surface-2) 88%, transparent)',
                          color: 'var(--john-text-primary)',
                          lineHeight: 1.55
                        }}
                      >
                        {msg.content}
                      </div>
                    ) : (
                      <div className="max-w-full">
                        {msg.proactive && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="relative flex h-1.5 w-1.5">
                              <span
                                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40"
                                style={{ background: 'var(--john-success)' }}
                              />
                              <span
                                className="relative inline-flex rounded-full h-1.5 w-1.5"
                                style={{ background: 'var(--john-success)' }}
                              />
                            </span>
                            <span
                              className="text-[9.5px] uppercase tracking-widest"
                              style={{ color: 'var(--john-success)', opacity: 0.7 }}
                            >
                              auto
                            </span>
                            <span
                              className="text-[9px]"
                              style={{ color: 'var(--john-text-muted)', opacity: 0.5 }}
                              title="Análise salva no diário"
                            >
                              ✦ salvo
                            </span>
                          </div>
                        )}
                        <MessageBody content={msg.content} compact streaming={false} />
                      </div>
                    )}
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="max-w-full w-full">
                      {streamingSteps.length > 0 && (
                        <div className="mb-2">
                          <StreamingTimeline steps={streamingSteps} />
                        </div>
                      )}
                      {streamingContent ? (
                        <MessageBody content={streamingContent} compact streaming />
                      ) : (
                        <div className="flex items-center gap-1 py-1 px-1">
                          {[0, 1, 2].map(i => (
                            <span
                              key={i}
                              className="w-1 h-1 rounded-full animate-bounce"
                              style={{ background: 'var(--john-text-muted)', animationDelay: `${i * 0.15}s` }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div
                className="flex-shrink-0"
                style={{
                  borderTop: '1px solid var(--john-border-strong)',
                  paddingTop: 14,
                  paddingLeft: 10,
                  paddingRight: 6,
                  paddingBottom: 14
                }}
              >
                <div className="flex items-end gap-3">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={inputValue}
                    disabled={isStreaming}
                    onChange={e => { onInputChange(e.target.value); onActivity() }}
                    onKeyDown={handleKey}
                    onFocus={onInputFocus}
                    onBlur={onInputBlur}
                    placeholder="Fale com john"
                    className="flex-1 resize-none bg-transparent outline-none scrollbar-none overflow-y-auto"
                    style={{
                      color: 'var(--john-text-secondary)',
                      fontSize: 'calc(var(--hud-font-size, 15px) - 1px)',
                      lineHeight: 'var(--hud-body-leading, 1.66)',
                      letterSpacing: 'var(--hud-input-tracking, -0.015em)',
                      minHeight: 22,
                      maxHeight: 96,
                      caretColor: 'white'
                    }}
                  />
                  {voiceEnabled && isSupported && (
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={toggleMic}
                      disabled={isStreaming}
                      className="flex-shrink-0 transition-opacity duration-150 disabled:opacity-30 hover:opacity-70 mb-0.5 relative w-[22px] h-[22px] flex items-center justify-center"
                      style={{ color: isListening ? 'var(--john-danger)' : 'var(--john-text-muted)' }}
                      aria-label={isListening ? 'Parar gravação' : 'Gravar voz'}
                    >
                      {isListening && (
                        <span
                          className="absolute inset-0 rounded-full animate-ping opacity-30"
                          style={{ background: 'var(--john-danger)' }}
                        />
                      )}
                      <MicIcon className="w-[16px] h-[16px] relative" />
                    </button>
                  )}
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { if (!isStreaming && inputValue.trim()) onSubmit() }}
                    disabled={isStreaming || !inputValue.trim()}
                    className="flex-shrink-0 transition-opacity duration-150 disabled:opacity-30 hover:opacity-70 mb-0.5"
                    style={{ color: 'var(--john-text-primary)' }}
                    aria-label="Enviar"
                  >
                    <SendIcon className="w-[18px] h-[18px]" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
