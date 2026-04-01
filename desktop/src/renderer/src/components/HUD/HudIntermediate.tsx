import { motion } from 'framer-motion'
import { HudInput } from './HudInput'
import { CaptureIndicator } from './CaptureIndicator'
import { ContextChip } from './ContextChip'
import { useDragWindow } from '@renderer/hooks/useDragWindow'
import type { SemanticState, SessionMemory, TutorResponse } from '@shared/perception.types'

interface HudIntermediateProps {
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  onInputFocus: () => void
  onInputBlur: () => void
  onActivity: () => void
  onCollapse: () => void
  response: string
  responseMeta: TutorResponse | null
  isStreaming: boolean
  semanticState: SemanticState | null
  sessionMemory: SessionMemory | null
  isCapturing: boolean
  isPrivate: boolean
  onTogglePrivate: () => void
}

export function HudIntermediate({
  inputValue, onInputChange, onSubmit,
  onInputFocus, onInputBlur, onActivity,
  onCollapse, response, responseMeta, isStreaming,
  semanticState, sessionMemory, isCapturing, isPrivate, onTogglePrivate
}: HudIntermediateProps) {
  const { handleMouseDown } = useDragWindow()

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-2.5 px-4 pt-3.5 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #6b7ff0 0%, #4a5abf 100%)' }}>
          <span className="text-white text-[9px] font-semibold">J</span>
        </div>
        <span className="text-[12px] font-medium flex-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
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
          className="w-5 h-5 rounded-full flex items-center justify-center transition-colors duration-150"
          style={{ color: 'rgba(255,255,255,0.25)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
          aria-label="Minimizar"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {semanticState && semanticState.surface_type !== 'unknown' && (
        <div className="px-4 pb-1.5">
          <ContextChip state={semanticState} />
        </div>
      )}

      {responseMeta && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(107,127,240,0.12)',
              color: 'rgba(107,127,240,0.9)',
              border: '1px solid rgba(107,127,240,0.18)'
            }}>
            modo: {responseMeta.mode}
          </span>

          {responseMeta.should_ask_confirmation && (
            <span className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: 'rgba(255,180,60,0.1)',
                color: 'rgba(255,180,60,0.82)',
                border: '1px solid rgba(255,180,60,0.14)'
              }}>
              pede confirmacao
            </span>
          )}
        </div>
      )}

      {response && !isStreaming && (
        <div className="flex-1 px-4 overflow-hidden">
          <p className="text-[13px] leading-relaxed line-clamp-3 selectable"
            style={{ color: 'rgba(255,255,255,0.72)' }}>
            {response}
          </p>
        </div>
      )}

      {!response && !isStreaming && sessionMemory && (
        <div className="flex-1 px-4 overflow-hidden">
          <p className="text-[12px] leading-relaxed line-clamp-3 selectable"
            style={{ color: 'rgba(255,255,255,0.58)' }}>
            {sessionMemory.incremental_summary}
          </p>
        </div>
      )}

      {!response && !isStreaming && !sessionMemory && <div className="flex-1" />}

      <div className="flex-shrink-0 px-4 pb-3.5 pt-2"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <HudInput
          value={inputValue}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          onActivity={onActivity}
          autoFocus
        />
      </div>
    </div>
  )
}
