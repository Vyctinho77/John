import { createHash } from 'crypto'
import type { MemoryEmbeddingRecord, PersistedMemoryItem } from './memory.types'

export function buildMemoryContentHash(text: string): string {
  return createHash('sha256').update(text.trim(), 'utf-8').digest('hex')
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return -1
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function isEmbeddableMemoryItem(item: PersistedMemoryItem): boolean {
  if (!item.text.trim()) return false
  if (item.expires_at && item.expires_at <= Date.now()) return false
  return item.text.trim().length >= 18
}

export function rankRelevantMemories(input: {
  items: PersistedMemoryItem[]
  records: MemoryEmbeddingRecord[]
  queryVector: number[]
  limit: number
}): PersistedMemoryItem[] {
  const itemById = new Map(input.items.map(item => [item.id, item]))

  return input.records
    .map(record => {
      const item = itemById.get(record.memory_item_id)
      if (!item) return null

      const similarity = cosineSimilarity(input.queryVector, record.vector)
      if (similarity < 0) return null

      const recencyBoost = Math.min(0.08, Math.max(0, (Date.now() - item.updated_at) < 14 * 24 * 60 * 60_000 ? 0.04 : 0))
      const confidenceBoost = Math.min(0.06, item.confidence * 0.06)
      const score = similarity + recencyBoost + confidenceBoost + kindBoost(item.kind)

      return { item, score }
    })
    .filter((value): value is { item: PersistedMemoryItem; score: number } => Boolean(value))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit)
    .map(entry => entry.item)
}

function kindBoost(kind: PersistedMemoryItem['kind']): number {
  switch (kind) {
    case 'interaction_preference':
      return 0.08
    case 'long_term_memory':
      return 0.06
    case 'identity':
      return 0.03
    default:
      return 0
  }
}

