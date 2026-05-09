import { motion } from 'framer-motion'
import type {
  HTMLAttributes,
  MouseEvent,
  ReactNode
} from 'react'

// Spring preset — snappy without bounce, feels physical
const SPRING_SNAPPY = { type: 'spring', stiffness: 500, damping: 32, mass: 0.8 } as const
const SPRING_LAYOUT = { type: 'spring', stiffness: 400, damping: 30 } as const

export function Toggle({ on }: { on: boolean }) {
  return (
    <motion.div
      style={{
        width: 44,
        height: 26,
        borderRadius: 999,
        padding: 3,
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        cursor: 'pointer',
        // Track color — accent when on, surface when off
        background: on
          ? 'var(--ares-accent)'
          : 'color-mix(in srgb, var(--ares-surface-2) 90%, transparent)',
        border: `1px solid ${on
          ? 'color-mix(in srgb, var(--ares-accent) 45%, transparent)'
          : 'var(--ares-border-soft)'}`,
        // Glow when active
        boxShadow: on
          ? '0 0 10px color-mix(in srgb, var(--ares-accent) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.10)'
          : 'none'
      }}
      animate={{
        background: on ? 'var(--ares-accent)' : 'var(--ares-surface-1)',
      }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <motion.div
        style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: on ? '#fff' : 'hsl(0 0% 40%)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.30), 0 0 0 0.5px rgba(0,0,0,0.08)',
          flexShrink: 0
        }}
        animate={{ x: on ? 18 : 0 }}
        transition={SPRING_SNAPPY}
      />
    </motion.div>
  )
}

export function SettingsRow({
  label,
  value,
  toggle,
  onClick,
  last = false,
  muted = false
}: {
  label: string
  value: string
  toggle?: boolean
  onClick?: () => void
  last?: boolean
  muted?: boolean
}) {
  const Wrapper = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? {
        onClick,
        onMouseDown: (e: MouseEvent) => e.preventDefault(),
        // Subtle background highlight on hover — more intentional than opacity fade
        className: 'w-full flex items-center justify-between text-left transition-colors duration-100 hover:bg-white/[0.035] active:bg-white/[0.06]'
      }
    : { className: 'w-full flex items-center justify-between' }

  return (
    <Wrapper
      {...(wrapperProps as HTMLAttributes<HTMLElement>)}
      style={{
        minHeight: 52,
        borderBottom: last ? 'none' : '1px solid var(--ares-border-soft)'
      }}
    >
      <span
        className="py-4 text-[14px] text-left"
        style={{
          color: muted ? 'var(--ares-text-tertiary)' : 'var(--ares-text-primary)',
          fontSize: 'var(--hud-font-size, 15px)'
        }}
      >
        {label}
      </span>
      {toggle !== undefined ? (
        <Toggle on={toggle} />
      ) : (
        <span
          className="inline-flex items-center gap-1.5 py-4"
          style={{
            color: 'var(--ares-text-secondary)',
            fontSize: 'var(--hud-font-size, 15px)',
            // Chevron shifts 2px right on hover — subtle directional cue
            transition: 'color 100ms ease'
          }}
        >
          {value}
          {onClick && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              style={{ opacity: 0.5, flexShrink: 0 }}
            >
              <path
                d="M2.25 4.25L6 8L9.75 4.25"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}
    </Wrapper>
  )
}

export function SettingsNavItem({
  label,
  active,
  onClick,
  icon
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
      style={{ color: active ? 'var(--ares-text-strong)' : 'var(--ares-text-tertiary)' }}
    >
      {/* Sliding active pill — animates between nav items with layoutId */}
      {active && (
        <motion.div
          layoutId="settings-nav-active-pill"
          className="absolute inset-0 rounded-xl"
          style={{ background: 'color-mix(in srgb, var(--ares-surface-2) 76%, transparent)' }}
          transition={SPRING_LAYOUT}
        />
      )}
      <span
        className="relative z-10 w-[20px] h-[20px] flex items-center justify-center flex-shrink-0"
        style={{
          color: active ? 'var(--ares-accent)' : 'var(--ares-text-muted)',
          transition: 'color 150ms ease'
        }}
      >
        {icon}
      </span>
      <span
        className="relative z-10 text-[12px] leading-none whitespace-nowrap"
        style={{ transition: 'color 150ms ease' }}
      >
        {label}
      </span>
    </button>
  )
}

export function TypographyChoice({
  label,
  active,
  secondaryLabel,
  onClick
}: {
  label: string
  active: boolean
  secondaryLabel?: string
  onClick: () => void
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      transition={SPRING_SNAPPY}
      className="px-3 py-2 rounded-2xl text-left"
      style={{
        background: active ? 'var(--ares-surface-2)' : 'var(--ares-surface-1)',
        color: active ? 'var(--ares-text-strong)' : 'var(--ares-text-secondary)',
        border: `1px solid ${active ? 'var(--ares-border-strong)' : 'var(--ares-border-soft)'}`,
        transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease'
      }}
    >
      <div className="text-[12px] leading-none">{label}</div>
      {secondaryLabel && (
        <div
          className="mt-1 text-[10px]"
          style={{ color: active ? 'var(--ares-text-secondary)' : 'var(--ares-text-tertiary)' }}
        >
          {secondaryLabel}
        </div>
      )}
    </motion.button>
  )
}

export function SectionTitle({
  children,
  className = 'text-[18px] font-medium mb-1'
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p
      className={className}
      style={{ color: 'var(--ares-text-strong)', letterSpacing: 'var(--hud-heading-tracking, -0.028em)' }}
    >
      {children}
    </p>
  )
}

export function SettingsCard({
  children,
  className = 'mt-4 rounded-[22px] p-4',
  elevated = false,
  style
}: {
  children: ReactNode
  className?: string
  elevated?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div
      className={className}
      style={{
        background: elevated ? 'var(--ares-surface-elevated)' : 'var(--ares-surface-1)',
        border: `1px solid ${elevated ? 'var(--ares-border-strong)' : 'var(--ares-border-soft)'}`,
        ...style
      }}
    >
      {children}
    </div>
  )
}

export function PillButton({
  children,
  onMouseDown,
  onClick,
  disabled = false,
  active = false,
  tone = 'neutral',
  className = 'px-3 py-1.5 rounded-full text-[10px]'
}: {
  children: ReactNode
  onMouseDown?: (e: MouseEvent<HTMLButtonElement>) => void
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  tone?: 'neutral' | 'strong' | 'danger' | 'accent' | 'success'
  className?: string
}) {
  const palette = {
    neutral: {
      background: active ? 'var(--ares-surface-2)' : 'var(--ares-surface-1)',
      color: active ? 'var(--ares-text-strong)' : 'var(--ares-text-secondary)',
      border: active ? 'var(--ares-border-strong)' : 'var(--ares-border-soft)'
    },
    strong: {
      background: 'var(--ares-surface-2)',
      color: 'var(--ares-text-strong)',
      border: 'var(--ares-border-strong)'
    },
    danger: {
      background: 'color-mix(in srgb, var(--ares-danger-soft) 60%, transparent)',
      color: 'var(--ares-danger)',
      border: 'color-mix(in srgb, var(--ares-danger) 40%, transparent)'
    },
    accent: {
      background: 'color-mix(in srgb, var(--ares-accent-soft) 60%, transparent)',
      color: 'var(--ares-accent)',
      border: 'color-mix(in srgb, var(--ares-accent) 35%, transparent)'
    },
    success: {
      background: 'color-mix(in srgb, var(--ares-success-soft) 60%, transparent)',
      color: 'var(--ares-success)',
      border: 'color-mix(in srgb, var(--ares-success) 35%, transparent)'
    }
  } as const

  const current = palette[tone]

  return (
    <motion.button
      onMouseDown={onMouseDown}
      onClick={onClick}
      disabled={disabled}
      className={className}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={SPRING_SNAPPY}
      style={{
        background: current.background,
        color: current.color,
        border: `1px solid ${current.border}`,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'default' : 'pointer'
      }}
    >
      {children}
    </motion.button>
  )
}

export function StatusBadge({
  children,
  tone = 'neutral',
  className = 'px-2.5 py-1 rounded-full text-[10px] font-medium'
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'danger'
  className?: string
}) {
  const palette = {
    neutral: {
      background: 'color-mix(in srgb, var(--ares-surface-1) 76%, transparent)',
      color: 'var(--ares-text-secondary)',
      border: 'var(--ares-border-soft)'
    },
    accent: {
      background: 'var(--ares-accent-soft)',
      color: 'var(--ares-accent)',
      border: 'color-mix(in srgb, var(--ares-accent) 18%, transparent)'
    },
    success: {
      background: 'var(--ares-success-soft)',
      color: 'var(--ares-success)',
      border: 'color-mix(in srgb, var(--ares-success) 18%, transparent)'
    },
    danger: {
      background: 'color-mix(in srgb, var(--ares-danger-soft) 60%, transparent)',
      color: 'var(--ares-danger)',
      border: 'color-mix(in srgb, var(--ares-danger) 40%, transparent)'
    }
  } as const

  const current = palette[tone]

  return (
    <span
      className={className}
      style={{
        background: current.background,
        color: current.color,
        border: `1px solid ${current.border}`
      }}
    >
      {children}
    </span>
  )
}

export function SettingsActionStrip({
  children,
  className = 'px-5 py-4 mt-3 flex gap-2.5 flex-wrap'
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{ borderTop: '1px solid var(--ares-border-soft)' }}
    >
      {children}
    </div>
  )
}

export function InlineEditableRow({
  label,
  editing,
  value,
  draft,
  placeholder,
  onStartEdit,
  onChangeDraft,
  onCommit,
  onCancel
}: {
  label: string
  editing: boolean
  value: string
  draft: string
  placeholder: string
  onStartEdit: () => void
  onChangeDraft: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{ minHeight: 52, borderBottom: '1px solid var(--ares-border-soft)' }}
    >
      <span className="text-[14px]" style={{ color: 'var(--ares-text-primary)' }}>
        {label}
      </span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={e => onChangeDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onCommit() }
              if (e.key === 'Escape') { onCancel() }
            }}
            placeholder={placeholder}
            className="bg-transparent outline-none text-[14px]"
            style={{
              color: 'var(--ares-text-primary)',
              borderBottom: '1px solid var(--ares-border-strong)',
              minWidth: 0,
              width: 140,
              direction: 'ltr'
            }}
            maxLength={40}
          />
          <PillButton
            onMouseDown={e => { e.preventDefault(); onCommit() }}
            className="flex-shrink-0"
            tone="strong"
          >
            salvar
          </PillButton>
        </div>
      ) : (
        <motion.button
          onMouseDown={e => e.preventDefault()}
          onClick={onStartEdit}
          whileTap={{ scale: 0.96 }}
          transition={SPRING_SNAPPY}
          className="inline-flex items-center gap-1.5 text-[14px] transition-colors duration-100 hover:text-white/70"
          style={{ color: value ? 'var(--ares-text-secondary)' : 'var(--ares-text-muted)' }}
        >
          {value || 'definir nome'}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.button>
      )}
    </div>
  )
}

export function FloatingFormCard({
  title,
  description,
  children
}: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <SettingsCard className="ares-accordion-open mt-3 rounded-[10px] p-4" elevated>
      <p className="text-[12px] font-medium mb-1" style={{ color: 'var(--ares-text-primary)' }}>
        {title}
      </p>
      <p className="text-[10px] mb-3" style={{ color: 'var(--ares-text-tertiary)', lineHeight: 1.5 }}>
        {description}
      </p>
      {children}
    </SettingsCard>
  )
}
