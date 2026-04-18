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
              borderRadius: 'var(--john-radius-pill)',
              border: '1px solid var(--john-border-strong)',
              background: pending
                ? 'color-mix(in srgb, var(--john-surface-2) 92%, var(--john-text-strong) 8%)'
                : 'color-mix(in srgb, var(--john-surface-1) 82%, transparent)',
              color: pending ? 'var(--john-text-strong)' : 'var(--john-text-secondary)',
              fontSize: compact ? 11 : 12,
              lineHeight: 1.2,
              letterSpacing: 'var(--hud-muted-tracking, -0.01em)',
              transition: 'opacity var(--john-transition-fast), background var(--john-transition-fast), border-color var(--john-transition-fast), color var(--john-transition-fast)',
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
