import { useEffect, useLayoutEffect, useRef, KeyboardEvent } from 'react'
import { useSpeechInput } from '@renderer/hooks/useSpeechInput'
import { CaptureIndicator } from './CaptureIndicator'
import { GlasswingThinkingIndicator } from './GlasswingThinkingIndicator'
import { LogoMark } from './LogoMark'
import { SendIcon } from './SendIcon'
import { StageCompactIcon, StageIntermediateIcon, StageExpandedIcon } from './StageIcons'
import { useDragWindow } from '@renderer/hooks/useDragWindow'
import type {
  IntermediateThought,
  SemanticState,
  SessionMemory,
  TutorResponse
} from '@shared/perception.types'

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
  intermediateThought: IntermediateThought | null
  isCapturing: boolean
  isPrivate: boolean
  onTogglePrivate: () => void
  voiceEnabled?: boolean
  onShowStage1: () => void
  onShowStage2: () => void
  onShowStage3: () => void
}

export function HudIntermediate({
  inputValue, onInputChange, onSubmit,
  onInputFocus, onInputBlur, onActivity,
  onCollapse: _onCollapse, response, responseMeta: _responseMeta, isStreaming,
  semanticState, sessionMemory: _sessionMemory, intermediateThought, isCapturing, isPrivate, onTogglePrivate,
  voiceEnabled,
  onShowStage1, onShowStage2, onShowStage3
}: HudIntermediateProps) {
  const { handleMouseDown } = useDragWindow()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const hasFullResponse = Boolean(response?.trim())

  const surface = semanticState?.surface_type ?? 'unknown'
  const inputPlaceholder =
    surface === 'code'                           ? 'o que quer entender sobre esse código?' :
    surface === 'document' || surface === 'text' ? 'o que quer saber sobre esse texto?' :
    surface === 'dashboard'                      ? 'o que quer analisar aqui?' :
    'o que está na sua tela agora?'

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '24px'
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`
  }, [inputValue])

  const { isListening, isSupported, toggle: toggleMic } = useSpeechInput(transcript => {
    const next = inputValue.trim() ? `${inputValue} ${transcript}` : transcript
    onInputChange(next)
    onActivity()
  })

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onActivity()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !isStreaming) onSubmit()
    }
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--ares-surface-0)' }}
      onMouseMove={onActivity}
      onMouseDown={onActivity}
      onWheel={onActivity}
    >
      <div
        className="flex items-center gap-2.5 px-4 pt-3.5 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="w-9 h-5 flex-shrink-0 flex items-center justify-center">
          <LogoMark className="h-[24px] w-auto text-white" />
        </div>
        <div className="flex items-center gap-4">
          {([
            { stage: 1, Icon: StageCompactIcon,      label: 'Compacto',     active: false },
            { stage: 2, Icon: StageIntermediateIcon, label: 'Intermediário', active: true  },
            { stage: 3, Icon: StageExpandedIcon,     label: 'Expandido',    active: false },
          ] as const).map(({ stage, Icon, label, active }) => {
            const onPress = stage === 1 ? onShowStage1 : stage === 2 ? onShowStage2 : onShowStage3
            return (
              <button
                key={stage}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onPress() }}
                className="flex items-center justify-center transition-opacity duration-150 min-w-[28px] min-h-[28px]"
                style={{ color: active ? 'var(--ares-accent)' : 'var(--ares-text-muted)' }}
                aria-label={label}
              >
                <Icon className={
                  stage === 1 ? 'w-[var(--ares-icon-md)] h-auto' :
                  stage === 2 ? 'w-[var(--ares-icon-lg)] h-auto' :
                  'w-[var(--ares-icon-sm)] h-auto'
                } />
              </button>
            )
          })}
        </div>
        <div className="flex-1" />

        {isStreaming && (
          <div className="flex items-center">
            <GlasswingThinkingIndicator size={34} emphasis="strong" />
          </div>
        )}

        <CaptureIndicator isCapturing={isCapturing} isPrivate={isPrivate} onTogglePrivate={onTogglePrivate} />
      </div>

      {intermediateThought && !isStreaming && (
        <div className="flex-1 px-4 overflow-hidden">
          <div className="h-full overflow-y-auto scrollbar-none flex flex-col justify-center pr-1">
            <p
              className="text-[13px] leading-[1.5] selectable"
              style={{
                color: 'rgba(214,214,214,0.72)',
                fontSize: 'calc(var(--hud-font-size, 15px) - 1px)',
                letterSpacing: 'var(--hud-muted-tracking, -0.01em)'
              }}
            >
              {intermediateThought.primary}
            </p>

            {intermediateThought.secondary && (
              <p
                className="mt-2 text-[12px] leading-[1.5] selectable"
                style={{
                  color: 'rgba(174,174,174,0.54)',
                  fontSize: 'calc(var(--hud-font-size, 15px) - 2px)'
                }}
              >
                {intermediateThought.secondary}
              </p>
            )}

            {hasFullResponse && (
              <button
                onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                onClick={e => { e.stopPropagation(); onShowStage3() }}
                className="mt-3 self-start text-[12px] px-2.5 py-1 rounded-full transition-opacity duration-150 hover:opacity-80"
                style={{
                  color: 'var(--ares-text-secondary)',
                  background: 'color-mix(in srgb, var(--ares-surface-1) 80%, transparent)',
                  border: '1px solid var(--ares-border-soft)'
                }}
              >
                ver resposta completa
              </button>
            )}
          </div>
        </div>
      )}

      {!intermediateThought && !isStreaming && <div className="flex-1" />}

      <div className="flex-shrink-0 px-4 pb-3.5 pt-3">
        <div
          className={`pt-3${isStreaming ? ' ares-stream-pulse' : ''}`}
          style={{ borderTop: '1px solid rgba(255,255,255,0.42)', transition: 'border-color 0.3s ease' }}
        >
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              className="flex-1 resize-none bg-transparent outline-none scrollbar-none overflow-y-auto selectable"
              style={{
                color: 'var(--ares-text-primary)',
                fontSize: 'var(--hud-font-size, 15px)',
                lineHeight: 'var(--hud-body-leading, 1.66)',
                letterSpacing: 'var(--hud-input-tracking, -0.015em)',
                minHeight: 24,
                maxHeight: 72
              }}
              placeholder={inputPlaceholder}
              rows={1}
              value={inputValue}
              disabled={isStreaming}
              onChange={e => { onInputChange(e.target.value); onActivity() }}
              onKeyDown={handleKey}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            />

            {voiceEnabled && isSupported && (
              <button
                onMouseDown={e => { e.preventDefault(); toggleMic() }}
                disabled={isStreaming}
                className="w-8 h-8 flex items-center justify-center flex-shrink-0 transition-opacity duration-150 relative"
                style={{ color: isListening ? 'var(--ares-danger)' : 'var(--ares-text-muted)' }}
                aria-label={isListening ? 'Parar gravação' : 'Gravar voz'}
              >
                {isListening && (
                  <span className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--ares-danger-soft)', animation: 'capture-pulse 1.2s ease-out infinite' }} />
                )}
                <MicIconSm />
              </button>
            )}

            <button
              onMouseDown={e => { e.preventDefault(); onSubmit() }}
              disabled={isStreaming || !inputValue.trim()}
              className="w-8 h-8 flex items-center justify-center flex-shrink-0 transition-opacity duration-150"
              style={{
                color: inputValue.trim() && !isStreaming ? 'var(--ares-text-primary)' : 'var(--ares-text-muted)'
              }}
              aria-label="Enviar"
            >
              <SendIcon className="w-[var(--ares-icon-lg)] h-auto" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MicIconSm() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none"
      aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <rect x="6" y="1" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 9a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="15" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
