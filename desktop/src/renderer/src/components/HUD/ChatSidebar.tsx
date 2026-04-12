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
        transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)',
        background: open ? 'rgba(10,10,10,0.97)' : 'transparent',
        borderRight: open ? '1px solid rgba(255,255,255,0.07)' : 'none'
      }}
    >
      {open ? (
        <>
          <div
            className="flex-shrink-0 flex items-center justify-between px-3"
            style={{ height: 52, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2">
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  onToggle()
                }}
                className="flex items-center justify-center transition-opacity hover:opacity-80 active:opacity-50"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  color: 'rgba(255,255,255,0.66)',
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
              <span
                className="text-[12px] font-medium"
                style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em' }}
              >
                CHATS
              </span>
            </div>

            <button
              onMouseDown={e => {
                e.preventDefault()
                onNew()
              }}
              className="flex items-center gap-1 transition-opacity hover:opacity-80 active:opacity-50"
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.7)',
                padding: '3px 7px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent'
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Novo
            </button>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            {metas.length === 0 && (
              <p className="px-3 pt-4 text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                Nenhum chat ainda.
              </p>
            )}

            {metas.map(meta => {
              const isActive = meta.id === activeChatId
              const isEditing = editingId === meta.id

              return (
                <div
                  key={meta.id}
                  onMouseDown={() => !isEditing && onSelect(meta.id)}
                  className="group relative flex items-center gap-2 px-3 cursor-pointer"
                  style={{
                    height: 40,
                    background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                    borderLeft: isActive ? '2px solid rgba(255,255,255,0.4)' : '2px solid transparent'
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
                      style={{ color: 'rgba(255,255,255,0.88)', caretColor: 'white' }}
                    />
                  ) : (
                    <>
                      <span
                        className="flex-1 truncate select-none text-[12px]"
                        style={{ color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.55)' }}
                        onDoubleClick={e => {
                          e.stopPropagation()
                          startEdit(meta.id, meta.title)
                        }}
                      >
                        {meta.title ?? 'Novo chat'}
                      </span>
                      <span className="flex-shrink-0 text-[10px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
                        {timeLabel(meta.updatedAt)}
                      </span>
                    </>
                  )}

                  {!isEditing && (
                    <div
                      className="absolute right-2 hidden items-center gap-1 group-hover:flex"
                      style={{ background: 'rgba(10,10,10,0.97)', borderRadius: 4, padding: '1px 2px' }}
                    >
                      <button
                        onMouseDown={e => {
                          e.stopPropagation()
                          startEdit(meta.id, meta.title)
                        }}
                        className="p-1 transition-opacity hover:opacity-80"
                        title="Renomear"
                      >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path
                            d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5Z"
                            stroke="rgba(255,255,255,0.5)"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        onMouseDown={e => {
                          e.stopPropagation()
                          onDelete(meta.id)
                        }}
                        className="p-1 transition-opacity hover:opacity-80"
                        title="Apagar"
                      >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path
                            d="M2 3h7M4.5 3V2h2v1M4 3l.5 6M7 3l-.5 6"
                            stroke="rgba(255,255,255,0.4)"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
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
