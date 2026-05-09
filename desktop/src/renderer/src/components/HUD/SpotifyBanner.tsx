import type { SpotifyPlaybackState } from '../../../../preload/index.d'

interface SpotifyBannerProps {
  state: SpotifyPlaybackState
  onTogglePlay: () => void
  onNext: () => void
  onPrev: () => void
  onShuffle: () => void
  onRepeat: () => void
}

export function SpotifyBanner({
  state,
  onTogglePlay,
  onNext,
  onPrev,
  onShuffle,
  onRepeat
}: SpotifyBannerProps) {
  const progress = state.durationMs > 0
    ? Math.min(100, (state.progressMs / state.durationMs) * 100)
    : 0

  const green = 'var(--ares-success)'
  const dim   = 'var(--ares-text-muted)'

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--ares-radius-md)',
        width: '100%',
        marginTop: 16,
        boxShadow: 'var(--ares-shadow-floating)'
      }}
    >
      {/* ── Blurred album art background ───────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: -10,
          backgroundImage: state.albumArtUrl ? `url(${state.albumArtUrl})` : undefined,
          backgroundColor: state.albumArtUrl ? undefined : 'var(--ares-surface-0)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(22px) brightness(0.36) saturate(1.4)',
          transform: 'scale(1.14)',
          pointerEvents: 'none'
        }}
      />

      {/* ── Gradient scrim — deeper on left so text is legible ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(105deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.10) 100%)',
          pointerEvents: 'none'
        }}
      />

      {/* ── Content ─────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: '12px 14px 16px',
          gap: 12
        }}
      >
        {/* Album art thumbnail */}
        {state.albumArtUrl ? (
          <img
            src={state.albumArtUrl}
            width={50}
            height={50}
            style={{
              borderRadius: 8,
              objectFit: 'cover',
              flexShrink: 0,
              boxShadow: '0 2px 12px rgba(0,0,0,0.55)'
            }}
            alt=""
            aria-hidden="true"
          />
        ) : (
          <div style={{
            width: 50, height: 50, borderRadius: 8, flexShrink: 0,
            background: 'color-mix(in srgb, var(--ares-surface-2) 72%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <SpotifyLogo />
          </div>
        )}

        {/* Track info + controls */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            className="truncate"
            style={{ fontSize: 13, fontWeight: 500, color: 'var(--ares-text-strong)', lineHeight: 1.3, letterSpacing: 'var(--hud-muted-tracking, -0.01em)' }}
          >
            {state.trackName ?? '—'}
          </p>
          <p
            className="truncate"
            style={{ fontSize: 11, color: 'var(--ares-text-tertiary)', marginTop: 2, lineHeight: 1.3 }}
          >
            {state.artistName ?? ''}
          </p>

          {/* Playback controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 11 }}>
            {/* Shuffle */}
            <CtrlBtn
              onClick={onShuffle}
              label="Shuffle"
              style={{ color: state.shuffle ? green : dim }}
            >
              <ShuffleIcon />
            </CtrlBtn>

            {/* Prev */}
            <CtrlBtn onClick={onPrev} label="Anterior" style={{ color: 'var(--ares-text-secondary)' }}>
              <PrevIcon />
            </CtrlBtn>

            {/* Play / Pause — slightly bigger */}
            <CtrlBtn
              onClick={onTogglePlay}
              label={state.isPlaying ? 'Pausar' : 'Reproduzir'}
              style={{ color: 'var(--ares-text-strong)' }}
            >
              {state.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </CtrlBtn>

            {/* Next */}
            <CtrlBtn onClick={onNext} label="Próxima" style={{ color: 'rgba(255,255,255,0.72)' }}>
              <NextIcon />
            </CtrlBtn>

            {/* Repeat */}
            <CtrlBtn
              onClick={onRepeat}
              label="Repeat"
              style={{ color: state.repeat !== 'off' ? green : dim, position: 'relative' }}
            >
              <RepeatIcon />
              {state.repeat === 'track' && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  fontSize: 7, fontWeight: 700, lineHeight: 1,
                  color: green
                }}>1</span>
              )}
            </CtrlBtn>
          </div>
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────── */}
        <div style={{ height: 3, background: 'var(--ares-border-soft)' }}>
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'var(--ares-text-secondary)',
            borderRadius: '0 2px 2px 0',
            transition: 'width 1s linear'
          }}
        />
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────

function CtrlBtn({
  children, onClick, label, style
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  style?: React.CSSProperties
}) {
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      className="transition-opacity duration-150 hover:opacity-80 active:opacity-50"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}
    >
      {children}
    </button>
  )
}

function SpotifyLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 168 168" fill="none" aria-hidden="true">
      <circle cx="84" cy="84" r="84" fill="#1DB954" />
      <path d="M120.5 116.8c-1.6 2.6-4.9 3.4-7.5 1.8-20.6-12.6-46.5-15.4-77.1-8.4-2.9.7-5.8-1.1-6.5-4-.7-2.9 1.1-5.8 4-6.5 33.5-7.6 62.2-4.5 85.4 9.6 2.6 1.6 3.4 4.9 1.7 7.5zm10.2-22.6c-2 3.2-6.2 4.2-9.4 2.2-23.5-14.5-59.4-18.6-87.1-10.2-3.6 1.1-7.4-.9-8.5-4.5-1.1-3.6.9-7.4 4.5-8.5 31.5-9.5 70.9-5 97.8 11.6 3.2 2 4.2 6.2 2.7 9.4zm.9-23.5C103.5 53.6 58.7 51.9 32.5 60c-4.1 1.2-8.4-1-9.7-5.1-1.2-4.1 1-8.4 5.1-9.7 30.2-9.2 80.4-7.4 112.1 13.1 3.7 2.2 4.9 7 2.7 10.7-2.2 3.7-7 4.9-10.7 2.7z" fill="white"/>
    </svg>
  )
}

function PrevIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M2 2.5v10M13 2.5L6 7.5l7 5v-10Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M4 2.5l12 6.5-12 6.5V2.5Z" fill="currentColor"/>
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <path d="M5.5 3h2v11h-2V3ZM10 3h2v11h-2V3Z" fill="currentColor"/>
    </svg>
  )
}

function NextIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M13 2.5v10M2 2.5l7 5-7 5v-10Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function ShuffleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 4.5h3a3.5 3.5 0 0 1 3 1.75M1 9.5h3a3.5 3.5 0 0 0 3-1.75M9 3l1.5-1.5L12 3M9 11l1.5 1.5L12 11M10.5 1.5v3a3.5 3.5 0 0 1-.5 1.75 3.5 3.5 0 0 1 .5 1.75v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function RepeatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 4.5h10M2 9.5h10M10 2l2.5 2.5L10 7M4 7l-2.5 2.5L4 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
