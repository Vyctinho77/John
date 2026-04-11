import { useEffect, useRef, KeyboardEvent } from 'react'
import type { TutorResponse } from '@shared/perception.types'
import { LogoMark } from './LogoMark'
import { SendIcon } from './SendIcon'

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
}

interface HudSidebarProps {
  side: 'left' | 'right'
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  inputValue: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  onInputFocus: () => void
  onInputBlur: () => void
  onActivity: () => void
  onUnsnap: () => void
}

export function HudSidebar({
  side,
  messages,
  isStreaming,
  streamingContent,
  inputValue,
  onInputChange,
  onSubmit,
  onInputFocus,
  onInputBlur,
  onActivity,
  onUnsnap
}: HudSidebarProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // ── Resize handle drag ─────────────────────────────────────────────
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX     = e.screenX
    const startWidth = window.innerWidth

    const onMove = (ev: MouseEvent) => {
      const dx       = ev.screenX - startX
      const newWidth = side === 'left' ? startWidth + dx : startWidth - dx
      window.hudAPI?.sidebarResize(newWidth)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onActivity()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !isStreaming) onSubmit()
    }
  }

  return (
    <div
      className="flex flex-col"
      style={{ width: '100%', height: '100%', color: '#e8e8e8', position: 'relative' }}
    >
      {/* ── Resize handle — thin strip on the free edge ───────────── */}
      <div
        style={{
          position:   'absolute',
          top:        0,
          bottom:     0,
          [side === 'left' ? 'right' : 'left']: 0,
          width:      6,
          cursor:     'ew-resize',
          zIndex:     20,
          transition: 'background 0.15s'
        }}
        onMouseDown={handleResizeMouseDown}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      />

      {/* ── Header ────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 16px',
          height:         52,
          borderBottom:   '1px solid rgba(255,255,255,0.06)',
          flexShrink:     0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark className="h-[26px] w-[10px] text-white" />
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: 'rgba(255,255,255,0.32)', letterSpacing: '0.1em', userSelect: 'none'
          }}>
            JOHN
          </span>
        </div>

        <button
          onClick={onUnsnap}
          title="Desacoplar sidebar"
          style={{
            background:   'transparent',
            border:       '1px solid rgba(255,255,255,0.1)',
            borderRadius: 7,
            color:        'rgba(255,255,255,0.38)',
            cursor:       'pointer',
            fontSize:     14,
            lineHeight:   1,
            padding:      '4px 9px',
            transition:   'all 0.15s'
          }}
          onMouseEnter={e => {
            const b = e.currentTarget
            b.style.background  = 'rgba(255,255,255,0.08)'
            b.style.color       = 'rgba(255,255,255,0.75)'
            b.style.borderColor = 'rgba(255,255,255,0.22)'
          }}
          onMouseLeave={e => {
            const b = e.currentTarget
            b.style.background  = 'transparent'
            b.style.color       = 'rgba(255,255,255,0.38)'
            b.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
        >
          {side === 'left' ? '›' : '‹'}
        </button>
      </div>

      {/* ── Messages ──────────────────────────────────────────────── */}
      <div
        style={{
          flex:           1,
          overflowY:      'auto',
          padding:        '14px 16px 8px',
          display:        'flex',
          flexDirection:  'column',
          gap:            12,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.08) transparent'
        }}
      >
        {messages.length === 0 && (
          <div style={{
            color: 'rgba(255,255,255,0.18)', fontSize: 13,
            textAlign: 'center', marginTop: 48, lineHeight: 1.6
          }}>
            John está aqui.<br />Pergunte o que quiser.
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {isStreaming && streamingContent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Label>JOHN</Label>
            <div style={{
              fontSize: 13, lineHeight: 1.55,
              color: 'rgba(255,255,255,0.82)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word'
            }}>
              {streamingContent}
              <span style={{
                display: 'inline-block', width: 5, height: 13,
                background: 'rgba(255,255,255,0.45)', marginLeft: 2,
                borderRadius: 1, verticalAlign: 'text-bottom',
                animation: 'sb-blink 0.9s step-end infinite'
              }} />
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div style={{ display: 'flex', gap: 5, padding: '4px 0', alignItems: 'center' }}>
            {[0, 1, 2].map(n => (
              <div key={n} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: 'rgba(255,255,255,0.28)',
                animation: `sb-pulse 1.2s ease-in-out ${n * 0.2}s infinite`
              }} />
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input — same style as stage 2/3: horizontal divider + textarea + send ── */}
      <div
        style={{
          flexShrink: 0,
          padding:    '0 16px 20px'
        }}
        onMouseMove={onActivity}
      >
        {/* Divider line — matches HudIntermediate / HudExpanded */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.42)', paddingTop: 12 }}>
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              className="flex-1 resize-none bg-transparent outline-none scrollbar-none overflow-y-auto selectable"
              style={{
                color:      'rgba(255,255,255,0.88)',
                fontSize:   15,
                lineHeight: 1.3,
                minHeight:  24,
                maxHeight:  96,
                opacity:    isStreaming ? 0.45 : 1
              }}
              placeholder="Pergunte ao John..."
              rows={1}
              value={inputValue}
              disabled={isStreaming}
              onChange={e => { onInputChange(e.target.value); onActivity() }}
              onKeyDown={handleKey}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            />

            <button
              onMouseDown={e => {
                e.preventDefault()
                if (!isStreaming && inputValue.trim()) onSubmit()
              }}
              disabled={isStreaming || !inputValue.trim()}
              className="w-8 h-8 flex items-center justify-center flex-shrink-0 transition-opacity duration-150"
              style={{
                color: inputValue.trim() && !isStreaming
                  ? 'rgba(255,255,255,0.82)'
                  : 'rgba(255,255,255,0.28)'
              }}
              aria-label="Enviar"
            >
              <SendIcon className="w-[20px] h-auto" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sb-blink {
          0%, 100% { opacity: 1 }
          50%       { opacity: 0 }
        }
        @keyframes sb-pulse {
          0%, 80%, 100% { transform: scale(0.55); opacity: 0.25 }
          40%            { transform: scale(1);    opacity: 0.75 }
        }
      `}</style>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600,
      letterSpacing: '0.08em', color: 'rgba(255,255,255,0.22)'
    }}>
      {children}
    </span>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      alignItems: isUser ? 'flex-end' : 'flex-start'
    }}>
      <Label>{isUser ? 'VOCÊ' : 'JOHN'}</Label>
      <div style={{
        background:   isUser ? 'rgba(255,255,255,0.07)' : 'transparent',
        borderRadius: isUser ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
        padding:      isUser ? '7px 11px' : '0',
        fontSize:     13,
        lineHeight:   1.55,
        color:        isUser ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.82)',
        whiteSpace:   'pre-wrap',
        wordBreak:    'break-word',
        maxWidth:     '100%'
      }}>
        {message.content}
      </div>
    </div>
  )
}
