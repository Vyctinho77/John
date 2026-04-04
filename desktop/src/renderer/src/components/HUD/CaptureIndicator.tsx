interface CaptureIndicatorProps {
  isCapturing: boolean
  isPrivate: boolean
  onTogglePrivate: () => void
}

export function CaptureIndicator({ isCapturing, isPrivate, onTogglePrivate }: CaptureIndicatorProps) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onTogglePrivate() }}
      className="flex items-center gap-1.5 transition-opacity duration-150"
      style={{ opacity: isPrivate ? 0.4 : 1 }}
      title={isPrivate ? 'Modo privado ativo — clique para retomar visão' : 'Visão ativa — clique para pausar'}
      aria-label={isPrivate ? 'Retomar visão' : 'Pausar visão'}
    >
      {isPrivate ? (
        // Eye-off icon
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: 'rgba(255,255,255,0.35)' }}>
          <path d="M2 2L12 12M5.5 5.64A2 2 0 0 0 8.36 8.5M3.17 3.77A6.8 6.8 0 0 0 1 7s2.25 4 6 4a6 6 0 0 0 2.83-.72M6 3.07A6 6 0 0 1 7 3c3.75 0 6 4 6 4a7.1 7.1 0 0 1-1.17 1.66"
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      ) : (
        <>
          {/* Pulsing dot — pure CSS animation, no JS overhead */}
          <span className="relative flex h-2 w-2">
            {isCapturing && (
              <span
                className="absolute inline-flex h-full w-full rounded-full"
                style={{
                  background: 'rgba(74,213,130,0.5)',
                  animation: 'capture-pulse 1.2s ease-out infinite'
                }}
              />
            )}
            <span className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: isCapturing ? '#4ad582' : 'rgba(255,255,255,0.2)' }} />
          </span>
          <style>{`
            @keyframes capture-pulse {
              0% { transform: scale(1); opacity: 0.6; }
              100% { transform: scale(1.8); opacity: 0; }
            }
          `}</style>
        </>
      )}
    </button>
  )
}
