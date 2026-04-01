import { useRef, useEffect, KeyboardEvent } from 'react'

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
  placeholder = 'Pergunte sobre o que está na tela…',
  disabled = false,
  autoFocus = false
}: HudInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!autoFocus) return undefined

    // Slight delay so the shell animation doesn't fight with focus
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
    <textarea
      ref={ref}
      className="w-full resize-none bg-transparent outline-none scrollbar-none overflow-y-auto selectable"
      style={{
        color: 'rgba(255,255,255,0.88)',
        fontSize: 13,
        lineHeight: 1.55,
        minHeight: 22,
        maxHeight: 110,
        opacity: disabled ? 0.45 : 1,
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
  )
}
