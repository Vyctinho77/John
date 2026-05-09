import { useEffect, useRef, useState } from 'react'

interface ChatMeta {
  id: string
  title: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

interface ChatSidebarProps {
  open: boolean
  metas: ChatMeta[]
  activeChatId: string | null
  onToggle: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

const OPEN_WIDTH = 220
const COLLAPSED_WIDTH = 32

function timeLabel(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'agora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

export function ChatSidebar({
  open,
  metas,
  activeChatId,
  onToggle,
  onSelect,
  onNew,
  onDelete,
  onRename
}: ChatSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hoveredTitleId, setHoveredTitleId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editingId) return
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timeoutId)
  }, [editingId])

  function startEdit(id: string, current: string | null) {
    setEditingId(id)
    setDraft(current ?? '')
  }

  function commitEdit(id: string) {
    if (draft.trim()) onRename(id, draft.trim())
    setEditingId(null)
  }

  return (
    <div
      className="absolute inset-y-0 left-0 z-20 flex flex-col overflow-hidden"
      style={{
        width: open ? OPEN_WIDTH : COLLAPSED_WIDTH,
        transition: 'width var(--ares-transition-panel)',
        background: open ? 'color-mix(in srgb, var(--ares-surface-overlay) 96%, transparent)' : 'transparent',
        borderRight: open ? '1px solid var(--ares-border-strong)' : 'none',
        pointerEvents: open ? 'auto' : 'none'
      }}
    >
      {open ? (
        <>
          <div
            className="flex-shrink-0 flex items-center justify-between px-3"
            style={{ height: 44 }}
          >
            <div className="flex items-center gap-1.5">
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  onToggle()
                }}
                className="flex items-center justify-center transition-opacity hover:opacity-80 active:opacity-50"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 'var(--ares-radius-sm)',
                  color: 'var(--ares-text-secondary)',
                  background: 'transparent'
                }}
                title="Recolher sidebar"
                aria-label="Recolher sidebar"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M6.5 1.5L3 5L6.5 8.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  onNew()
                }}
                className="transition-opacity hover:opacity-80 active:opacity-50"
                style={{
                  fontSize: 12,
                  color: 'var(--ares-text-primary)',
                  letterSpacing: 'var(--hud-muted-tracking, -0.01em)',
                  background: 'transparent'
                }}
              >
                Chat
              </button>
            </div>

            <button
              onMouseDown={e => {
                e.preventDefault()
                onNew()
              }}
              className="flex items-center justify-center transition-opacity hover:opacity-80 active:opacity-50"
              style={{
                width: 20,
                height: 20,
                color: 'var(--ares-text-tertiary)',
                borderRadius: 'var(--ares-radius-sm)',
                background: 'transparent'
              }}
              title="Novo chat"
              aria-label="Novo chat"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div
            className="flex-1 overflow-y-auto px-2 pb-3"
            style={{ scrollbarWidth: 'none' }}
          >
            {metas.map(meta => {
              const isActive = meta.id === activeChatId
              const isEditing = editingId === meta.id
              const showActions = hoveredTitleId === meta.id

              return (
                <div
                  key={meta.id}
                  onMouseDown={() => !isEditing && onSelect(meta.id)}
                  className="relative flex items-center gap-2 px-3 pr-2 cursor-pointer rounded-[10px]"
                  style={{
                    height: 34,
                    marginBottom: 4,
                    background: 'transparent'
                  }}
                >
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => commitEdit(meta.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(meta.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onMouseDown={e => e.stopPropagation()}
                      className="flex-1 bg-transparent outline-none text-[12px]"
                      style={{ color: 'var(--ares-text-primary)', caretColor: 'white' }}
                    />
                  ) : (
                    <>
                      <span
                        className="flex-1 truncate select-none text-[12px]"
                        style={{
                          color: isActive ? 'var(--ares-text-primary)' : 'var(--ares-text-secondary)',
                          letterSpacing: 'var(--hud-muted-tracking, -0.01em)'
                        }}
                        onMouseEnter={() => setHoveredTitleId(meta.id)}
                        onMouseLeave={() => setHoveredTitleId(current => (current === meta.id ? null : current))}
                        onDoubleClick={e => {
                          e.stopPropagation()
                          startEdit(meta.id, meta.title)
                        }}
                      >
                        {meta.title ?? 'Novo chat'}
                      </span>
                      <div className="relative flex-shrink-0 min-w-[34px] h-4">
                        <span
                          className="absolute inset-y-0 right-0 text-[10px] transition-opacity duration-150"
                          onMouseEnter={() => setHoveredTitleId(meta.id)}
                          onMouseLeave={() => setHoveredTitleId(current => (current === meta.id ? null : current))}
                          style={{ color: 'var(--ares-text-muted)' }}
                          aria-hidden={showActions}
                        >
                          <span style={{ opacity: showActions ? 0 : 1 }}>{timeLabel(meta.updatedAt)}</span>
                        </span>
                        <div
                          className="absolute inset-y-0 right-0 items-center gap-1"
                          style={{ display: showActions ? 'flex' : 'none' }}
                          onMouseEnter={() => setHoveredTitleId(meta.id)}
                          onMouseLeave={() => setHoveredTitleId(current => (current === meta.id ? null : current))}
                        >
                          <button
                            onMouseDown={e => {
                              e.stopPropagation()
                              startEdit(meta.id, meta.title)
                            }}
                            className="transition-opacity hover:opacity-80"
                            title="Renomear"
                            aria-label="Renomear"
                          >
                            <PenIcon />
                          </button>
                          <button
                            onMouseDown={e => {
                              e.stopPropagation()
                              onDelete(meta.id)
                            }}
                            className="transition-opacity hover:opacity-80"
                            title="Apagar"
                            aria-label="Apagar"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}

function PenIcon() {
  return (
    <svg width="11" height="16" viewBox="0 0 11 16" fill="none" aria-hidden="true">
      <path d="M7.9745 0.0412549L10.566 1.53747C10.7133 1.62249 10.7637 1.81078 10.6787 1.95803L9.63965 3.75773C9.55463 3.90498 9.36634 3.95543 9.21909 3.87042L6.62757 2.3742C6.48032 2.28919 6.42986 2.1009 6.51488 1.95364L7.55394 0.153943C7.63895 0.00669114 7.82724 -0.0437607 7.9745 0.0412549Z" fill="currentColor"/>
      <path d="M0.488518 15.2127L0.010162 13.3988C-0.0105514 13.3202 0.000615113 13.2367 0.0412307 13.1663L5.93763 2.95348C6.02264 2.80623 6.21093 2.75577 6.35818 2.84079L8.94971 4.33701C9.09696 4.42202 9.14741 4.61031 9.06239 4.75756L3.166 14.9704C3.12538 15.0408 3.05861 15.0922 2.98023 15.1135L1.17018 15.6062C1.12808 15.6177 1.0889 15.638 1.05524 15.6657L0.97727 15.73C0.757543 15.911 0.430854 15.7224 0.477816 15.4416L0.49448 15.3419C0.501676 15.2989 0.499643 15.2549 0.488518 15.2127Z" fill="currentColor"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="15" viewBox="0 0 14 15" fill="none" aria-hidden="true">
      <path d="M6.0733 0C5.67182 0 5.28824 0.153234 5.00403 0.427734L4.67035 0.75H0.787609C0.684707 0.748594 0.582542 0.766955 0.487051 0.804016C0.39156 0.841076 0.304648 0.896097 0.231365 0.96588C0.158083 1.03566 0.099891 1.11882 0.0601723 1.21051C0.0204536 1.3022 0 1.40061 0 1.5C0 1.59939 0.0204536 1.6978 0.0601723 1.78949C0.099891 1.88118 0.158083 1.96434 0.231365 2.03412C0.304648 2.1039 0.39156 2.15892 0.487051 2.19598C0.582542 2.23304 0.684707 2.25141 0.787609 2.25H13.2124C13.3153 2.25141 13.4175 2.23304 13.5129 2.19598C13.6084 2.15892 13.6954 2.1039 13.7686 2.03412C13.8419 1.96434 13.9001 1.88118 13.9398 1.78949C13.9795 1.6978 14 1.59939 14 1.5C14 1.40061 13.9795 1.3022 13.9398 1.21051C13.9001 1.11882 13.8419 1.03566 13.7686 0.96588C13.6954 0.896097 13.6084 0.841076 13.5129 0.804016C13.4175 0.766955 13.3153 0.748594 13.2124 0.75H9.32965L8.99597 0.427734C8.71253 0.153234 8.32818 0 7.9267 0H6.0733ZM1.07123 3.75L2.25729 13.6978C2.35979 14.4403 3.02174 15 3.79674 15H10.2017C10.9767 15 11.6394 14.4411 11.7427 13.6919L12.9288 3.75H1.07123Z" fill="#F31515"/>
    </svg>
  )
}
