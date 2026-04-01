import type { SemanticState, SurfaceType } from '@shared/perception.types'

const SURFACE_LABEL: Record<SurfaceType, string> = {
  code:      'Código',
  text:      'Texto',
  graphic:   'Gráfico',
  document:  'Documento',
  dashboard: 'Dashboard',
  unknown:   'Desconhecido'
}

const SURFACE_ICON: Record<SurfaceType, string> = {
  code:      '{ }',
  text:      '¶',
  graphic:   '◧',
  document:  '▤',
  dashboard: '▦',
  unknown:   '·'
}

interface ContextChipProps {
  state: SemanticState
}

export function ContextChip({ state }: ContextChipProps) {
  const { surface_type, detected_text, probable_user_focus, change_summary, pedagogical_topics } = state
  if (surface_type === 'unknown' && !detected_text) return null

  const label = SURFACE_LABEL[surface_type]
  const icon  = SURFACE_ICON[surface_type]
  const showChange = change_summary === 'major'

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Surface badge */}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
        style={{
          background: 'rgba(107,127,240,0.12)',
          color: 'rgba(107,127,240,0.9)',
          border: '1px solid rgba(107,127,240,0.2)'
        }}>
        <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{icon}</span>
        {label}
      </span>

      {/* Change indicator */}
      {showChange && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px]"
          style={{
            background: 'rgba(255,180,60,0.1)',
            color: 'rgba(255,180,60,0.8)',
            border: '1px solid rgba(255,180,60,0.15)'
          }}>
          mudou
        </span>
      )}

      {/* Focus preview */}
      {probable_user_focus && (
        <span className="text-[11px] truncate max-w-[260px]"
          style={{ color: 'rgba(255,255,255,0.35)' }}>
          {probable_user_focus.slice(0, 80)}
        </span>
      )}

      {pedagogical_topics[0] && (
        <span className="text-[10px] truncate max-w-[160px]"
          style={{ color: 'rgba(107,127,240,0.62)' }}>
          {pedagogical_topics[0]}
        </span>
      )}
    </div>
  )
}
