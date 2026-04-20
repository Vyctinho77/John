import { useRef, useEffect, useState, KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TutorResponse, TutorStep, TradingViewConnectorState } from '@shared/perception.types'
import { LogoMark } from './LogoMark'
import { MessageBody } from './MessageBody'
import { SendIcon } from './SendIcon'
import { StreamingTimeline } from './StreamingTimeline'
import { useDragWindow } from '@renderer/hooks/useDragWindow'

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
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
}: HudOperatorProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const { handleMouseDown } = useDragWindow()

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
          style={{ height: 34, pointerEvents: 'none' }}
        >
          <span
            className="relative flex h-1.5 w-1.5"
          >
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

              {/* Input — mesmo padrão do HudExpanded */}
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
