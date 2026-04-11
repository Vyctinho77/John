import { app } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { TutorResponse } from '../../shared/perception.types'

// ─── Types ────────────────────────────────────────────────────────
export interface StoredMessage {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
}

interface ConversationFile {
  messages:  StoredMessage[]
  summary:   string | null
  savedAt:   number
}

// ─── Config ───────────────────────────────────────────────────────
const FILE_PATH  = join(app.getPath('userData'), 'john-conversation.json')
const MAX_STORED = 40                        // messages saved to disk
const TTL_MS     = 48 * 60 * 60 * 1000      // 48 hours

// ─── Public API ───────────────────────────────────────────────────
export async function loadConversation(): Promise<{ messages: StoredMessage[]; summary: string | null } | null> {
  try {
    const raw  = await readFile(FILE_PATH, 'utf-8')
    const data = JSON.parse(raw) as ConversationFile

    if (!data.savedAt || Date.now() - data.savedAt > TTL_MS) return null

    return {
      messages: data.messages ?? [],
      summary:  data.summary  ?? null
    }
  } catch {
    return null
  }
}

export async function saveConversation(
  messages: StoredMessage[],
  summary:  string | null
): Promise<void> {
  const file: ConversationFile = {
    messages: messages.slice(-MAX_STORED),
    summary,
    savedAt:  Date.now()
  }
  await writeFile(FILE_PATH, JSON.stringify(file), 'utf-8')
}
