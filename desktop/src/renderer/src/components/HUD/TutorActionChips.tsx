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
              borderRadius: 'var(--ares-radius-pill)',
              border: '1px solid var(--ares-border-strong)',
              background: pending
                ? 'color-mix(in srgb, var(--ares-surface-2) 92%, var(--ares-text-strong) 8%)'
                : 'color-mix(in srgb, var(--ares-surface-1) 82%, transparent)',
              color: pending ? 'var(--ares-text-strong)' : 'var(--ares-text-secondary)',
              fontSize: compact ? 11 : 12,
              lineHeight: 1.2,
              letterSpacing: 'var(--hud-muted-tracking, -0.01em)',
              transition: 'opacity var(--ares-transition-fast), background var(--ares-transition-fast), border-color var(--ares-transition-fast), color var(--ares-transition-fast)',
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
