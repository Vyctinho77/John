import type { TutorAction } from '@shared/perception.types'

interface TutorActionChipsProps {
  actions: TutorAction[]
  pendingActionIds: string[]
  compact?: boolean
  onExecuteAction: (action: TutorAction) => void
}

export function TutorActionChips({
  actions,
  pendingActionIds,
  compact = false,
  onExecuteAction
}: TutorActionChipsProps) {
  if (!actions.length) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: compact ? 6 : 8,
        marginTop: compact ? 8 : 10
      }}
    >
      {actions.map(action => {
        const pending = pendingActionIds.includes(action.id)

        return (
          <button
            key={action.id}
            onMouseDown={e => e.preventDefault()}
            onClick={() => !pending && onExecuteAction(action)}
            disabled={pending}
            style={{
              padding: compact ? '6px 9px' : '7px 11px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.12)',
              background: pending ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
              color: pending ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.72)',
              fontSize: compact ? 11 : 12,
              lineHeight: 1.2,
              transition: 'opacity 0.15s ease, background 0.15s ease',
              opacity: pending ? 0.9 : 1
            }}
          >
            {pending ? 'Executando…' : action.label}
          </button>
        )
      })}
    </div>
  )
}
