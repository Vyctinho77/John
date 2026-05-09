import { useEffect, useRef, KeyboardEvent } from 'react'
import { LogoMark } from './LogoMark'
import { SendIcon } from './SendIcon'

interface HudInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onFocus: () => void
  onBlur: () => void
  onActivity: () => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

export function HudInput({
  value, onChange, onSubmit, onFocus, onBlur, onActivity,
  placeholder = 'digite alguma coisa',
  disabled = false,
  autoFocus = false
}: HudInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!autoFocus) return undefined

    const t = setTimeout(() => ref.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [autoFocus])

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onActivity()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) onSubmit()
    }
  }

  return (
    <div
      className="flex items-center gap-0 rounded-full overflow-hidden"
      style={{
        minHeight: 56,
        background: 'var(--ares-bg-canvas)',
        border: '1px solid rgba(255,255,255,0.04)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 10px 24px rgba(0,0,0,0.26)',
        opacity: disabled ? 0.45 : 1
      }}
    >
      <div className="w-9 h-14 flex items-center justify-center flex-shrink-0">
        <LogoMark className="h-[24px] w-auto text-white" />
      </div>

      <div
        className="self-stretch w-px flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.46)' }}
      />

      <div className="flex-1 px-4 py-3">
        <textarea
          ref={ref}
          className="w-full resize-none bg-transparent outline-none scrollbar-none overflow-y-auto selectable"
          style={{
            color: 'rgba(255,255,255,0.88)',
            fontSize: 16,
            lineHeight: 1.35,
            minHeight: 24,
            maxHeight: 96
          }}
          placeholder={placeholder}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={e => { onChange(e.target.value); onActivity() }}
          onKeyDown={handleKey}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </div>

      <button
        onMouseDown={e => {
          e.preventDefault()
          if (!disabled && value.trim()) onSubmit()
        }}
        disabled={disabled || !value.trim()}
        className="w-14 h-14 flex items-center justify-center flex-shrink-0 transition-opacity duration-150"
        style={{
          color: value.trim() && !disabled ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.28)'
        }}
        aria-label="Enviar"
      >
        <SendIcon className="w-[22px] h-auto" />
      </button>
    </div>
  )
}
