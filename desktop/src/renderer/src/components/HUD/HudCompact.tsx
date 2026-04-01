import { useDragWindow } from '@renderer/hooks/useDragWindow'

interface HudCompactProps {
  onExpand: () => void
  isCapturing: boolean
}

export function HudCompact({ onExpand, isCapturing }: HudCompactProps) {
  const { handleMouseDown, wasDragged } = useDragWindow()

  return (
    <div
      className="flex items-center gap-3 px-4 h-full cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onClick={() => { if (!wasDragged()) onExpand() }}
      role="button"
      aria-label="Abrir John"
    >
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #6b7ff0 0%, #4a5abf 100%)' }}>
        <span className="text-white text-[11px] font-semibold tracking-tight">J</span>
      </div>

      <span className="text-[13px] flex-1 truncate" style={{ color: 'rgba(255,255,255,0.32)' }}>
        Pergunte sobre o que está na tela…
      </span>

      {/* Capture status dot */}
      <span className="relative flex h-2 w-2 flex-shrink-0">
        {isCapturing && (
          <span className="absolute inline-flex h-full w-full rounded-full animate-ping"
            style={{ background: 'rgba(74,213,130,0.5)' }} />
        )}
        <span className="relative inline-flex rounded-full h-2 w-2"
          style={{ background: isCapturing ? '#4ad582' : 'rgba(255,255,255,0.18)' }} />
      </span>
    </div>
  )
}
