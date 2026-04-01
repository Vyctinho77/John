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
  hasProactiveHint: boolean
}

export function HudCompact({
  onExpand,
  onExpandFull,
  onActivity,
  isCapturing,
  minimalMode,
  passiveSuggestion,
  hasProactiveHint
}: HudCompactProps) {
  const { handleMouseDown, wasDragged } = useDragWindow()
  const label =
    minimalMode
      ? ''
      : passiveSuggestion
        ? `Sugestao: ${passiveSuggestion}`
        : 'digite alguma coisa'

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
      <div className="w-9 h-full flex-shrink-0 flex items-center justify-center relative">
        <LogoMark className="h-[26px] w-[10px] text-white" />
        {hasProactiveHint && (
          <span
            className="absolute ml-6 w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: 'rgba(255,255,255,0.84)', boxShadow: '0 0 10px rgba(255,255,255,0.35)' }}
          />
        )}
      </div>

      <div
        className="self-center h-7 w-px flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.52)' }}
      />

      <div className="flex-1 px-4 overflow-hidden">
        {!minimalMode && (
          <span
            className="block truncate text-[15px]"
            style={{
              color: 'rgba(255,255,255,0.58)',
              letterSpacing: '-0.02em',
              fontSize: 'var(--hud-font-size, 15px)'
            }}
          >
            {label}
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
        style={{ color: 'rgba(255,255,255,0.78)' }}
        aria-label="Abrir painel completo"
      >
        {isCapturing && (
          <span
            className="absolute right-1 top-2 w-1.5 h-1.5 rounded-full"
            style={{ background: '#4ad582', boxShadow: '0 0 8px rgba(74,213,130,0.55)' }}
          />
        )}
        <SendIcon className="w-[20px] h-auto" />
      </button>
    </div>
  )
}
