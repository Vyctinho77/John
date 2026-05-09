import { memo } from 'react'
import { useDragWindow } from '@renderer/hooks/useDragWindow'
import { LogoMark } from './LogoMark'
import { SendIcon } from './SendIcon'

interface HudCompactProps {
  onExpand: () => void
  onExpandFull: () => void
  onActivity: () => void
  isCapturing: boolean
  minimalMode: boolean
  passiveSuggestion: string | null
  fallbackLabel: string | null
  hasProactiveHint: boolean
}

export const HudCompact = memo(function HudCompact({
  onExpand,
  onExpandFull,
  onActivity,
  isCapturing: _isCapturing,
  minimalMode,
  passiveSuggestion,
  fallbackLabel,
  hasProactiveHint: _hasProactiveHint
}: HudCompactProps) {
  const { handleMouseDown, wasDragged } = useDragWindow()
  const label = minimalMode ? '' : passiveSuggestion ?? fallbackLabel ?? 'digite alguma coisa'
  const isSuggestion = !minimalMode && Boolean(passiveSuggestion)

  return (
    <div
      className="flex items-center gap-0 px-5 h-full cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onClick={() => {
        onActivity()
        if (!wasDragged()) onExpand()
      }}
      role="button"
      aria-label="Abrir HUD"
    >
      <div className="w-9 h-full flex-shrink-0 flex items-center justify-center mr-1">
        <LogoMark className="h-[24px] w-auto text-white" />
      </div>

      <div
        className="self-center h-7 w-px flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.52)' }}
      />

      <div className="flex-1 px-4 overflow-hidden">
        {!minimalMode && (
          <span
            className="flex items-center gap-1.5 truncate"
            style={{
              color: 'rgba(255,255,255,0.58)',
              letterSpacing: 'var(--hud-muted-tracking, -0.01em)',
              fontSize: 'var(--hud-font-size, 15px)'
            }}
          >
            {isSuggestion && (
              <span
                className="flex-shrink-0 w-1 h-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.45)' }}
              />
            )}
            <span className="truncate">{label}</span>
          </span>
        )}
      </div>

      <button
        onMouseDown={e => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onClick={e => {
          e.stopPropagation()
          onActivity()
          if (!wasDragged()) onExpandFull()
        }}
        className="w-10 h-full flex-shrink-0 flex items-center justify-center relative"
        style={{ color: 'var(--ares-text-secondary)' }}
        aria-label="Abrir painel completo"
      >
        <SendIcon className="w-[var(--ares-icon-lg)] h-auto" />
      </button>
    </div>
  )
})
