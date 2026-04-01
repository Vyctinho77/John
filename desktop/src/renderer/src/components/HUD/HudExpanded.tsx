import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { HudInput } from './HudInput'
import { CaptureIndicator } from './CaptureIndicator'
import { ContextChip } from './ContextChip'
import { useDragWindow } from '@renderer/hooks/useDragWindow'
import type {
  SemanticState,
  SessionMemory,
  TutorResponse,
  UserProfile
} from '@shared/perception.types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
}

interface HudExpandedProps {
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  onInputFocus: () => void
  onInputBlur: () => void
  onActivity: () => void
  onCollapse: () => void
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  latestResponseMeta: TutorResponse | null
  semanticState: SemanticState | null
  sessionMemory: SessionMemory | null
  userProfile: UserProfile | null
  isCapturing: boolean
  isPrivate: boolean
  onTogglePrivate: () => void
  onCycleLevel: () => void
  onCycleStyle: () => void
  onClearContext: () => void
  onQuickPrompt: (value: string) => void
}

export function HudExpanded({
  inputValue, onInputChange, onSubmit,
  onInputFocus, onInputBlur, onActivity,
  onCollapse, messages, isStreaming, streamingContent,
  latestResponseMeta, semanticState, sessionMemory, userProfile,
  isCapturing, isPrivate, onTogglePrivate,
  onCycleLevel, onCycleStyle, onClearContext, onQuickPrompt
}: HudExpandedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { handleMouseDown } = useDragWindow()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingContent])

  const quickActions = latestResponseMeta?.suggested_follow_ups?.length
    ? latestResponseMeta.suggested_follow_ups
    : ['Explica melhor', 'Resume isso', 'Mostra em passos']

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-5 flex-shrink-0 cursor-grab active:cursor-grabbing"
        style={{ height: 48, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        onMouseDown={handleMouseDown}
      >
        <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #6b7ff0 0%, #4a5abf 100%)' }}>
          <span className="text-white text-[10px] font-semibold">J</span>
        </div>
        <span className="text-[13px] font-medium flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
          John
        </span>

        {isStreaming && (
          <div className="flex gap-1 items-center">
            {[0, 1, 2].map(i => (
              <motion.div key={i} className="w-1 h-1 rounded-full" style={{ background: '#6b7ff0' }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </div>
        )}

        <CaptureIndicator isCapturing={isCapturing} isPrivate={isPrivate} onTogglePrivate={onTogglePrivate} />

        <button
          onMouseDown={e => { e.preventDefault(); onCollapse() }}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-150 ml-1"
          style={{ color: 'rgba(255,255,255,0.25)' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.65)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'rgba(255,255,255,0.25)'
          }}
          aria-label="Minimizar"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {(semanticState || sessionMemory || userProfile) && (
        <div className="px-5 pt-3 pb-1.5 flex-shrink-0 flex flex-col gap-2">
          {semanticState && semanticState.surface_type !== 'unknown' && (
            <ContextChip state={semanticState} />
          )}

          <div className="flex flex-wrap gap-2">
            {userProfile && (
              <>
                <button
                  onMouseDown={e => { e.preventDefault(); onCycleLevel() }}
                  className="px-2.5 py-1 rounded-full text-[10px] transition-colors duration-150"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.68)',
                    border: '1px solid rgba(255,255,255,0.06)'
                  }}
                >
                  nivel: {userProfile.user_level}
                </button>
                <button
                  onMouseDown={e => { e.preventDefault(); onCycleStyle() }}
                  className="px-2.5 py-1 rounded-full text-[10px] transition-colors duration-150"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.68)',
                    border: '1px solid rgba(255,255,255,0.06)'
                  }}
                >
                  estilo: {userProfile.preferred_explanation_style}
                </button>
              </>
            )}

            {latestResponseMeta && (
              <span className="px-2.5 py-1 rounded-full text-[10px]"
                style={{
                  background: 'rgba(107,127,240,0.12)',
                  color: 'rgba(107,127,240,0.9)',
                  border: '1px solid rgba(107,127,240,0.18)'
                }}>
                tutor: {latestResponseMeta.mode}
              </span>
            )}

            {sessionMemory && (
              <button
                onMouseDown={e => { e.preventDefault(); onClearContext() }}
                className="px-2.5 py-1 rounded-full text-[10px] transition-colors duration-150"
                style={{
                  background: 'rgba(255,180,60,0.08)',
                  color: 'rgba(255,180,60,0.8)',
                  border: '1px solid rgba(255,180,60,0.14)'
                }}
              >
                limpar contexto
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none px-5 py-3">
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {semanticState && (
            <div className="mb-4 p-3.5 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
              <p className="text-[11px] uppercase tracking-[0.16em] mb-1.5"
                style={{ color: 'rgba(255,255,255,0.34)' }}>
                Estado Semantico
              </p>
              <p className="text-[13px] leading-[1.6]"
                style={{ color: 'rgba(255,255,255,0.78)' }}>
                {semanticState.visual_summary}
              </p>
              {sessionMemory && (
                <p className="text-[12px] leading-[1.55] mt-2"
                  style={{ color: 'rgba(255,255,255,0.52)' }}>
                  {sessionMemory.continuity_summary}
                </p>
              )}
            </div>
          )}

          {latestResponseMeta?.warning && (
            <div className="mb-4 p-3 rounded-2xl"
              style={{
                background: 'rgba(255,180,60,0.08)',
                border: '1px solid rgba(255,180,60,0.14)',
                color: 'rgba(255,220,170,0.86)'
              }}>
              <p className="text-[12px] leading-[1.55]">{latestResponseMeta.warning}</p>
            </div>
          )}

          {sessionMemory && sessionMemory.topic_candidates.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {sessionMemory.topic_candidates.map(topic => (
                <span
                  key={topic}
                  className="px-2.5 py-1 rounded-full text-[10px]"
                  style={{
                    background: 'rgba(107,127,240,0.12)',
                    color: 'rgba(107,127,240,0.9)',
                    border: '1px solid rgba(107,127,240,0.18)'
                  }}
                >
                  {topic}
                </span>
              ))}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`mb-4 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
              {msg.role === 'user' ? (
                <span className="inline-block text-[13px] leading-relaxed px-3.5 py-2 selectable"
                  style={{
                    background: 'rgba(107,127,240,0.15)',
                    color: 'rgba(255,255,255,0.85)',
                    borderRadius: '16px 16px 4px 16px',
                    maxWidth: '78%'
                  }}>
                  {msg.content}
                </span>
              ) : (
                <div>
                  <p className="text-[13px] leading-[1.6] selectable"
                    style={{ color: 'rgba(255,255,255,0.82)', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </p>
                  {msg.meta && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          color: 'rgba(255,255,255,0.58)',
                          border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                        {msg.meta.mode}
                      </span>
                      {msg.meta.should_ask_confirmation && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{
                            background: 'rgba(255,180,60,0.1)',
                            color: 'rgba(255,180,60,0.82)',
                            border: '1px solid rgba(255,180,60,0.14)'
                          }}>
                          confirmar contexto
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isStreaming && streamingContent && (
            <p className="text-[13px] leading-[1.6] mb-4 selectable"
              style={{ color: 'rgba(255,255,255,0.82)', whiteSpace: 'pre-wrap' }}>
              {streamingContent}
              <motion.span
                className="inline-block w-0.5 h-3.5 ml-0.5 align-middle"
                style={{ background: '#6b7ff0' }}
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.55, repeat: Infinity }}
              />
            </p>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 px-5 pb-4 pt-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div className="flex gap-2.5 items-end">
            <div className="flex-1">
              <HudInput
                value={inputValue}
                onChange={onInputChange}
                onSubmit={onSubmit}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
                onActivity={onActivity}
                disabled={isStreaming}
              />
            </div>
            <button
              onMouseDown={e => { e.preventDefault(); onSubmit() }}
              disabled={isStreaming || !inputValue.trim()}
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150 mb-0.5"
              style={{
                background: inputValue.trim() && !isStreaming ? '#6b7ff0' : 'rgba(107,127,240,0.2)',
                color: inputValue.trim() && !isStreaming ? 'white' : 'rgba(255,255,255,0.3)'
              }}
              aria-label="Enviar"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 10.5V2.5M2.5 6.5L6.5 2.5L10.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="flex gap-3 mt-2.5 flex-wrap">
            {quickActions.map(action => (
              <button key={action}
                onMouseDown={e => { e.preventDefault(); onQuickPrompt(action) }}
                className="text-[11px] transition-colors duration-150"
                style={{ color: 'rgba(255,255,255,0.28)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
