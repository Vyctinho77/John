import { motion } from 'framer-motion'
import { useEffect, useRef, KeyboardEvent } from 'react'
import { CaptureIndicator } from './CaptureIndicator'
import { LogoMark } from './LogoMark'
import { MessageBody } from './MessageBody'
import { SendIcon } from './SendIcon'
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
  onShowStage1: () => void
  onShowStage2: () => void
  onShowStage3: () => void
}

export function HudIntermediate({
  inputValue, onInputChange, onSubmit,
  onInputFocus, onInputBlur, onActivity,
  onCollapse, response, responseMeta: _responseMeta, isStreaming,
  semanticState, sessionMemory, isCapturing, isPrivate, onTogglePrivate,
  onShowStage1, onShowStage2, onShowStage3
}: HudIntermediateProps) {
  const { handleMouseDown } = useDragWindow()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const previewText = response ? summarizeIntermediateResponse(response) : null

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
      onMouseMove={onActivity}
      onMouseDown={onActivity}
      onWheel={onActivity}
    >
      <div
        className="flex items-center gap-2.5 px-4 pt-3.5 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <div className="w-9 h-5 flex-shrink-0 flex items-center justify-center">
          <LogoMark className="h-[26px] w-[10px] text-white" />
        </div>
        <div className="flex items-center gap-5">
          {[1, 2, 3].map(stage => {
            const onPress =
              stage === 1 ? onShowStage1
              : stage === 2 ? onShowStage2
              : onShowStage3

            return (
              <button
                key={stage}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                onClick={e => { e.stopPropagation(); onPress() }}
                className="text-[11px] transition-opacity duration-150"
                style={{ color: stage === 2 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.62)' }}
                aria-label={`Abrir estágio ${stage}`}
              >
                {stage}
              </button>
            )
          })}
        </div>
        <div className="flex-1" />

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

      {previewText && !isStreaming && (
        <div className="flex-1 px-4 overflow-hidden">
          <div
            className="h-full overflow-hidden"
            style={{
              maskImage: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 72%, rgba(0,0,0,0) 100%)'
            }}
          >
            <MessageBody content={previewText} compact />
            <button
              onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
              onClick={e => { e.stopPropagation(); onShowStage3() }}
              className="mt-3 text-[12px] transition-opacity duration-150 hover:opacity-80"
              style={{ color: 'rgba(255,255,255,0.46)' }}
            >
              ver resposta completa
            </button>
          </div>
        </div>
      )}

      {!previewText && !isStreaming && sessionMemory && (
        <div className="flex-1 px-4 overflow-hidden">
          <p className="text-[12px] leading-relaxed line-clamp-3 selectable"
            style={{ color: 'rgba(255,255,255,0.58)', fontSize: 'var(--hud-font-size, 15px)' }}>
            {sessionMemory.incremental_summary}
          </p>
        </div>
      )}

      {!previewText && !isStreaming && !sessionMemory && <div className="flex-1" />}

      <div className="flex-shrink-0 px-4 pb-3.5 pt-3">
        <div
          className="pt-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.42)' }}
        >
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              className="flex-1 resize-none bg-transparent outline-none scrollbar-none overflow-y-auto selectable"
              style={{
                color: 'rgba(255,255,255,0.88)',
                fontSize: 'var(--hud-font-size, 15px)',
                lineHeight: 1.3,
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

            <button
              onMouseDown={e => { e.preventDefault(); onSubmit() }}
              disabled={isStreaming || !inputValue.trim()}
              className="w-8 h-8 flex items-center justify-center flex-shrink-0 transition-opacity duration-150"
              style={{
                color: inputValue.trim() && !isStreaming ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.28)'
              }}
              aria-label="Enviar"
            >
              <SendIcon className="w-[20px] h-auto" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function summarizeIntermediateResponse(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  const blocks = normalized
    .split(/\n\s*\n/)
    .map(block => block.trim())
    .filter(Boolean)

  const selectedBlocks: string[] = []

  for (const block of blocks) {
    if (selectedBlocks.length >= 2) break

    if (block.startsWith('```')) {
      const language = block.split('\n')[0].replace(/```/, '').trim() || 'code'
      const codeBody = block
        .split('\n')
        .slice(1)
        .filter(line => line.trim() && line.trim() !== '```')
      const previewLines = codeBody.slice(0, 4).join('\n')
      selectedBlocks.push(`\`\`\`${language}\n${previewLines}${codeBody.length > 4 ? '\n...' : ''}\n\`\`\``)
      continue
    }

    const lines = block.split('\n').filter(line => line.trim())
    const shortBlock = lines.slice(0, 4).join('\n')
    selectedBlocks.push(shortBlock)
  }

  return selectedBlocks.join('\n\n')
}
