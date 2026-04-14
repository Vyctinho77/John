import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { TutorAction, TutorResponse } from '@shared/perception.types'
import { LogoMark } from './LogoMark'
import { SendIcon } from './SendIcon'
import { MessageBody } from './MessageBody'
import { TutorActionChips } from './TutorActionChips'
import { GlasswingThinkingIndicator } from './GlasswingThinkingIndicator'

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
  onExecuteAction: (action: TutorAction) => void
  pendingActionIds: string[]
}

const COLLAPSED_WIDTH = 44
const DEFAULT_EXPANDED_WIDTH = 320

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
  onUnsnap,
  onExecuteAction,
  pendingActionIds
}: HudSidebarProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const expandedWidthRef = useRef(DEFAULT_EXPANDED_WIDTH)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const collapseChevron = side === 'left' ? '‹' : '›'
  const expandChevron = side === 'left' ? '›' : '‹'

  useEffect(() => {
    if (!isCollapsed) {
      expandedWidthRef.current = window.innerWidth
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingContent, isCollapsed])

  const setSidebarCollapsed = (next: boolean) => {
    setIsCollapsed(next)
    if (next) {
      expandedWidthRef.current = Math.max(expandedWidthRef.current, window.innerWidth)
      window.hudAPI?.sidebarResize(COLLAPSED_WIDTH)
      return
    }

    window.hudAPI?.sidebarResize(Math.max(280, expandedWidthRef.current || DEFAULT_EXPANDED_WIDTH))
  }

  const handleResizeMouseDown = (e: ReactMouseEvent) => {
    if (isCollapsed) return
    e.preventDefault()
    const startX = e.screenX
    const startWidth = window.innerWidth

    const onMove = (ev: MouseEvent) => {
      const dx = ev.screenX - startX
      const newWidth = side === 'left' ? startWidth + dx : startWidth - dx
      expandedWidthRef.current = newWidth
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
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          [side === 'left' ? 'right' : 'left']: 0,
          width: 6,
          cursor: isCollapsed ? 'default' : 'ew-resize',
          zIndex: 20,
          transition: 'background 0.15s'
        }}
        onMouseDown={handleResizeMouseDown}
        onMouseEnter={e => {
          e.currentTarget.style.background = isCollapsed ? 'transparent' : 'rgba(255,255,255,0.07)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent'
        }}
      />

      {isCollapsed ? (
        <button
          onClick={() => setSidebarCollapsed(false)}
          title="Expandir sidebar"
          style={{
            position: 'absolute',
            left: 10,
            bottom: 18,
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 30,
            lineHeight: 1,
            zIndex: 30,
            transition: 'color 0.15s ease, transform 0.15s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.96)'
            e.currentTarget.style.transform = 'translateX(-1px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
            e.currentTarget.style.transform = 'translateX(0)'
          }}
          aria-label="Expandir sidebar"
        >
          {expandChevron}
        </button>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              height: 52,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LogoMark className="h-[26px] w-[10px] text-white" />
              <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.32)',
                  letterSpacing: '0.1em',
                  userSelect: 'none'
                }}
              >
                JOHN
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setSidebarCollapsed(true)}
                title="Recolher sidebar"
                style={sidebarIconButtonStyle()}
                onMouseEnter={handleSidebarIconHover}
                onMouseLeave={handleSidebarIconLeave}
                aria-label="Recolher sidebar"
              >
                {collapseChevron}
              </button>

              <button
                onClick={onUnsnap}
                title="Desacoplar sidebar"
                style={sidebarIconButtonStyle()}
                onMouseEnter={handleSidebarIconHover}
                onMouseLeave={handleSidebarIconLeave}
                aria-label="Desacoplar sidebar"
              >
                {side === 'left' ? '›' : '‹'}
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 16px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.08) transparent'
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  color: 'rgba(255,255,255,0.18)',
                  fontSize: 13,
                  textAlign: 'center',
                  marginTop: 48,
                  lineHeight: 1.6
                }}
              >
                John está aqui.
                <br />
                Pergunte o que quiser.
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                onExecuteAction={onExecuteAction}
                pendingActionIds={pendingActionIds}
              />
            ))}

            {isStreaming && streamingContent && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label>JOHN</Label>
                <div style={{ color: 'rgba(255,255,255,0.82)', maxWidth: '100%' }}>
                  <MessageBody content={streamingContent} compact />
                  <span
                    style={{
                      display: 'inline-block',
                      width: 5,
                      height: 13,
                      background: 'rgba(255,255,255,0.45)',
                      marginLeft: 2,
                      borderRadius: 1,
                      verticalAlign: 'text-bottom',
                      animation: 'sb-blink 0.9s step-end infinite'
                    }}
                  />
                </div>
              </div>
            )}

            {isStreaming && !streamingContent && (
              <div style={{ display: 'flex', padding: '4px 0', alignItems: 'center' }}>
                <GlasswingThinkingIndicator size={40} emphasis="strong" />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div
            style={{
              flexShrink: 0,
              padding: '0 16px 20px'
            }}
            onMouseMove={onActivity}
          >
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.42)', paddingTop: 12 }}>
              <div className="flex items-end gap-3">
                <textarea
                  ref={inputRef}
                  className="flex-1 resize-none bg-transparent outline-none scrollbar-none overflow-y-auto selectable"
                  style={{
                    color: 'rgba(255,255,255,0.88)',
                    fontSize: 15,
                    lineHeight: 1.3,
                    minHeight: 24,
                    maxHeight: 96,
                    opacity: isStreaming ? 0.45 : 1
                  }}
                  placeholder="Pergunte ao John..."
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
        </>
      )}
      <style>{`
        @keyframes sb-blink {
          0%, 100% { opacity: 1 }
          50%       { opacity: 0 }
        }
      `}</style>
    </div>
  )
}

function sidebarIconButtonStyle(): CSSProperties {
  return {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 7,
    color: 'rgba(255,255,255,0.38)',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    padding: '4px 9px',
    transition: 'all 0.15s'
  }
}

function handleSidebarIconHover(e: ReactMouseEvent<HTMLButtonElement>) {
  const b = e.currentTarget
  b.style.background = 'rgba(255,255,255,0.08)'
  b.style.color = 'rgba(255,255,255,0.75)'
  b.style.borderColor = 'rgba(255,255,255,0.22)'
}

function handleSidebarIconLeave(e: ReactMouseEvent<HTMLButtonElement>) {
  const b = e.currentTarget
  b.style.background = 'transparent'
  b.style.color = 'rgba(255,255,255,0.38)'
  b.style.borderColor = 'rgba(255,255,255,0.1)'
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: 'rgba(255,255,255,0.22)'
      }}
    >
      {children}
    </span>
  )
}

function MessageBubble({
  message,
  onExecuteAction,
  pendingActionIds
}: {
  message: Message
  onExecuteAction: (action: TutorAction) => void
  pendingActionIds: string[]
}) {
  const isUser = message.role === 'user'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: isUser ? 'flex-end' : 'flex-start'
      }}
    >
      <Label>{isUser ? 'VOCÊ' : 'JOHN'}</Label>
      <div
        style={{
          background: isUser ? 'rgba(255,255,255,0.07)' : 'transparent',
          borderRadius: isUser ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
          padding: isUser ? '7px 11px' : '0',
          color: isUser ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.82)',
          maxWidth: '100%'
        }}
      >
        <MessageBody content={message.content} compact />
        {!isUser && message.meta?.actions?.length ? (
          <TutorActionChips
            actions={message.meta.actions}
            pendingActionIds={pendingActionIds}
            compact
            onExecuteAction={onExecuteAction}
          />
        ) : null}
      </div>
    </div>
  )
}
