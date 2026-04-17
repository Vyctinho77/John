import type { TutorResponse, TutorDominantContextSource } from '@shared/perception.types'

function labelSource(source: TutorDominantContextSource): string {
  switch (source) {
    case 'vscode':
      return 'VS Code'
    case 'spotify':
      return 'Spotify'
    case 'tradingview':
      return 'TradingView'
    case 'vision':
      return 'Tela'
    case 'ocr':
      return 'OCR'
    case 'memory':
      return 'Memoria'
    case 'local':
      return 'Local'
    default:
      return 'Contexto'
  }
}

function buildTitle(meta: TutorResponse): string | undefined {
  if (!meta.debug) return undefined

  const parts = [
    `fonte: ${labelSource(meta.debug.dominantContextSource)}`,
    `modelo: ${meta.debug.model}`,
    `latencia: ${meta.debug.latencyMs} ms`,
    meta.debug.staleContextGuarded ? 'fresh-screen guard ativo' : null
  ].filter(Boolean)

  return parts.join(' · ')
}

export function ResponseSourceBadge({
  meta,
  compact = false
}: {
  meta?: TutorResponse | null
  compact?: boolean
}) {
  const source = meta?.debug?.dominantContextSource

  if (!source || source === 'unknown') return null

  return (
    <span
      title={meta ? buildTitle(meta) : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: compact ? '2px 6px' : '3px 8px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)',
        color: 'rgba(255,255,255,0.5)',
        fontSize: compact ? 9 : 10,
        lineHeight: 1.1,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        userSelect: 'none'
      }}
    >
      {labelSource(source)}
    </span>
  )
}
