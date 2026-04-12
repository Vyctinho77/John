import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { StoredMessage } from './conversation-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Chat {
  id: string
  title: string | null        // null = not yet generated
  messages: StoredMessage[]
  summary: string | null
  createdAt: number
  updatedAt: number
}

/** Lightweight descriptor — no messages — used by the sidebar list */
export interface ChatMeta {
  id: string
  title: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

interface ChatsFile {
  activeChatId: string | null
  chats: Chat[]
}

// ─── Config ───────────────────────────────────────────────────────────────────

const FILE_PATH         = join(app.getPath('userData'), 'john-chats.json')
const MAX_CHATS         = 30
const MAX_MESSAGES      = 40

// ─── Internal helpers ─────────────────────────────────────────────────────────

function readFile(): ChatsFile {
  try {
    if (!existsSync(FILE_PATH)) return { activeChatId: null, chats: [] }
    return JSON.parse(readFileSync(FILE_PATH, 'utf-8')) as ChatsFile
  } catch {
    return { activeChatId: null, chats: [] }
  }
}

function persist(data: ChatsFile): void {
  writeFileSync(FILE_PATH, JSON.stringify(data), 'utf-8')
}

function toMeta(chat: Chat): ChatMeta {
  return {
    id:           chat.id,
    title:        chat.title,
    createdAt:    chat.createdAt,
    updatedAt:    chat.updatedAt,
    messageCount: chat.messages.length
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function listChatMetas(): ChatMeta[] {
  const { chats } = readFile()
  return chats
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(toMeta)
}

export function getActiveChat(): { chat: Chat; activeChatId: string } {
  const data = readFile()

  const active = data.chats.find(c => c.id === data.activeChatId)
  if (active) return { chat: active, activeChatId: active.id }

  // No active chat — create a fresh one
  const fresh = createFreshChat()
  data.chats.unshift(fresh)
  data.activeChatId = fresh.id
  persist(data)
  return { chat: fresh, activeChatId: fresh.id }
}

export function createChat(): { chat: Chat; metas: ChatMeta[] } {
  const data = readFile()
  const chat = createFreshChat()
  data.chats.unshift(chat)
  data.activeChatId = chat.id

  // Trim to MAX_CHATS
  if (data.chats.length > MAX_CHATS) {
    data.chats = data.chats.slice(0, MAX_CHATS)
  }

  persist(data)
  return { chat, metas: data.chats.map(toMeta) }
}

export function loadChat(id: string): Chat | null {
  const { chats } = readFile()
  return chats.find(c => c.id === id) ?? null
}

export function saveChat(
  id: string,
  messages: StoredMessage[],
  summary: string | null
): void {
  const data = readFile()
  const idx  = data.chats.findIndex(c => c.id === id)
  if (idx === -1) return

  data.chats[idx] = {
    ...data.chats[idx],
    messages: messages.slice(-MAX_MESSAGES),
    summary,
    updatedAt: Date.now()
  }
  persist(data)
}

export function deleteChat(id: string): ChatMeta[] {
  const data = readFile()
  data.chats = data.chats.filter(c => c.id !== id)

  // If we deleted the active chat, point to the most recent remaining one
  if (data.activeChatId === id) {
    data.activeChatId = data.chats[0]?.id ?? null
  }

  persist(data)
  return data.chats.map(toMeta)
}

export function renameChat(id: string, title: string): void {
  const data = readFile()
  const chat = data.chats.find(c => c.id === id)
  if (chat) {
    chat.title = title.trim() || null
    persist(data)
  }
}

export function setTitleIfEmpty(id: string, title: string): void {
  const data = readFile()
  const chat = data.chats.find(c => c.id === id)
  if (chat && !chat.title) {
    chat.title = title.trim().slice(0, 60)
    persist(data)
  }
}

export function setActiveChat(id: string): void {
  const data = readFile()
  if (data.chats.some(c => c.id === id)) {
    data.activeChatId = id
    persist(data)
  }
}

// ─── Private ──────────────────────────────────────────────────────────────────

function createFreshChat(): Chat {
  const now = Date.now()
  return { id: randomUUID(), title: null, messages: [], summary: null, createdAt: now, updatedAt: now }
}
