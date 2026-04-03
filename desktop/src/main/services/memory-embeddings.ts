import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  MemoryEmbeddingIndex,
  MemoryEmbeddingRecord,
  MemoryEmbeddingStatus,
  PersistedMemorySnapshot
} from '../../shared/memory.types'
import {
  buildMemoryContentHash,
  isEmbeddableMemoryItem,
  rankRelevantMemories
} from '../../shared/memory-embedding.helpers'
import {
  generateOpenAIEmbeddings,
  getOpenAIEmbeddingAvailability
} from './ai-provider'
import { getPersistedMemorySnapshot } from './memory-card'

const EMBEDDING_SCHEMA_VERSION = 1 as const
const EMBEDDING_MODEL = 'text-embedding-3-small' as const
const EMBEDDING_BATCH_SIZE = 16

let cachedIndex: MemoryEmbeddingIndex | null = null
let cachedStatus: MemoryEmbeddingStatus = {
  state: 'idle',
  embedding_model: EMBEDDING_MODEL,
  indexed_count: 0,
  last_synced_at: null,
  error: null
}
let syncTask: Promise<MemoryEmbeddingStatus> | null = null

export async function getMemoryEmbeddingStatus(): Promise<MemoryEmbeddingStatus> {
  const index = await getStoredIndex()
  const availability = await getOpenAIEmbeddingAvailability().catch(() => ({
    available: false,
    reason: 'OpenAI embeddings indisponivel.'
  }))

  const state =
    cachedStatus.state === 'syncing'
      ? 'syncing'
      : !availability.available
        ? 'unavailable'
        : cachedStatus.state === 'error'
          ? 'error'
          : index.records.length > 0
            ? 'ready'
            : 'idle'

  return {
    state,
    embedding_model: EMBEDDING_MODEL,
    indexed_count: index.records.length,
    last_synced_at: index.records.length > 0 ? index.updated_at : null,
    error: state === 'unavailable' ? availability.reason : cachedStatus.error
  }
}

export async function syncMemoryEmbeddings(input: {
  snapshot?: PersistedMemorySnapshot
  force?: boolean
} = {}): Promise<MemoryEmbeddingStatus> {
  if (syncTask && !input.force) return syncTask

  syncTask = performSync(input).finally(() => {
    syncTask = null
  })

  return syncTask
}

export async function rebuildMemoryEmbeddings(): Promise<MemoryEmbeddingStatus> {
  return syncMemoryEmbeddings({ force: true })
}

export async function clearMemoryEmbeddingIndex(): Promise<void> {
  cachedIndex = createEmptyIndex()
  cachedStatus = {
    state: 'idle',
    embedding_model: EMBEDDING_MODEL,
    indexed_count: 0,
    last_synced_at: null,
    error: null
  }

  await rm(getEmbeddingIndexPath(), { force: true })
}

export async function retrieveRelevantMemories(input: {
  query: string
  limit?: number
}): Promise<string[]> {
  const query = input.query.trim()
  if (query.length < 12) return []

  const availability = await getOpenAIEmbeddingAvailability().catch(() => ({
    available: false,
    reason: null
  }))
  if (!availability.available) return []

  const index = await getStoredIndex()
  if (index.records.length === 0) {
    void syncMemoryEmbeddings()
    return []
  }

  try {
    const [queryVector] = await generateOpenAIEmbeddings([query])
    const snapshot = await getPersistedMemorySnapshot()
    const relevant = rankRelevantMemories({
      items: snapshot.items.filter(isEmbeddableMemoryItem),
      records: index.records,
      queryVector,
      limit: input.limit ?? 4
    })

    return relevant.map(item => item.text)
  } catch {
    return []
  }
}

async function performSync(input: {
  snapshot?: PersistedMemorySnapshot
  force?: boolean
}): Promise<MemoryEmbeddingStatus> {
  const availability = await getOpenAIEmbeddingAvailability().catch(() => ({
    available: false,
    reason: 'OpenAI embeddings indisponivel.'
  }))

  if (!availability.available) {
    cachedStatus = {
      state: 'unavailable',
      embedding_model: EMBEDDING_MODEL,
      indexed_count: cachedIndex?.records.length ?? 0,
      last_synced_at: cachedIndex?.updated_at ?? null,
      error: availability.reason
    }
    return getMemoryEmbeddingStatus()
  }

  cachedStatus = {
    ...cachedStatus,
    state: 'syncing',
    error: null
  }

  try {
    const snapshot = input.snapshot ?? await getPersistedMemorySnapshot()
    const currentIndex = input.force ? createEmptyIndex() : await getStoredIndex()
    const embeddableItems = snapshot.items.filter(isEmbeddableMemoryItem)
    const nextRecords = buildRetainedRecords(currentIndex.records, embeddableItems, input.force ?? false)
    const pendingItems = embeddableItems.filter(item => shouldEmbedItem(item, currentIndex.records, input.force ?? false))

    for (const batch of chunk(pendingItems, EMBEDDING_BATCH_SIZE)) {
      const vectors = await generateOpenAIEmbeddings(batch.map(item => item.text))
      batch.forEach((item, index) => {
        nextRecords.push({
          memory_item_id: item.id,
          embedding_model: EMBEDDING_MODEL,
          vector: vectors[index],
          content_hash: buildMemoryContentHash(item.text),
          embedded_at: Date.now(),
          text_snapshot: item.text
        })
      })
    }

    const dedupedRecords = dedupeRecords(nextRecords)
    const nextIndex: MemoryEmbeddingIndex = {
      schema_version: EMBEDDING_SCHEMA_VERSION,
      embedding_model: EMBEDDING_MODEL,
      updated_at: Date.now(),
      records: dedupedRecords
    }

    cachedIndex = nextIndex
    await persistIndex(nextIndex)
    cachedStatus = {
      state: 'ready',
      embedding_model: EMBEDDING_MODEL,
      indexed_count: nextIndex.records.length,
      last_synced_at: nextIndex.updated_at,
      error: null
    }
  } catch (error) {
    cachedStatus = {
      state: 'error',
      embedding_model: EMBEDDING_MODEL,
      indexed_count: cachedIndex?.records.length ?? 0,
      last_synced_at: cachedIndex?.updated_at ?? null,
      error: error instanceof Error ? error.message : 'Falha ao sincronizar embeddings.'
    }
  }

  return getMemoryEmbeddingStatus()
}

function buildRetainedRecords(
  currentRecords: MemoryEmbeddingRecord[],
  embeddableItems: PersistedMemorySnapshot['items'],
  force: boolean
): MemoryEmbeddingRecord[] {
  if (force) return []

  const activeIds = new Set(embeddableItems.map(item => item.id))
  return currentRecords.filter(record => activeIds.has(record.memory_item_id))
}

function shouldEmbedItem(
  item: PersistedMemorySnapshot['items'][number],
  currentRecords: MemoryEmbeddingRecord[],
  force: boolean
): boolean {
  if (force) return true

  const current = currentRecords.find(record => record.memory_item_id === item.id)
  if (!current) return true
  return current.content_hash !== buildMemoryContentHash(item.text)
}

function dedupeRecords(records: MemoryEmbeddingRecord[]): MemoryEmbeddingRecord[] {
  const byId = new Map<string, MemoryEmbeddingRecord>()

  for (const record of records) {
    const existing = byId.get(record.memory_item_id)
    if (!existing || record.embedded_at >= existing.embedded_at) {
      byId.set(record.memory_item_id, record)
    }
  }

  return [...byId.values()].sort((a, b) => b.embedded_at - a.embedded_at)
}

async function getStoredIndex(): Promise<MemoryEmbeddingIndex> {
  if (cachedIndex) return cachedIndex

  try {
    const raw = await readFile(getEmbeddingIndexPath(), 'utf-8')
    cachedIndex = normalizeIndex(JSON.parse(raw) as Partial<MemoryEmbeddingIndex>)
  } catch {
    cachedIndex = createEmptyIndex()
  }

  return cachedIndex
}

function createEmptyIndex(): MemoryEmbeddingIndex {
  return {
    schema_version: EMBEDDING_SCHEMA_VERSION,
    embedding_model: EMBEDDING_MODEL,
    updated_at: Date.now(),
    records: []
  }
}

function normalizeIndex(index: Partial<MemoryEmbeddingIndex>): MemoryEmbeddingIndex {
  return {
    schema_version: EMBEDDING_SCHEMA_VERSION,
    embedding_model: EMBEDDING_MODEL,
    updated_at: typeof index.updated_at === 'number' ? index.updated_at : Date.now(),
    records: Array.isArray(index.records)
      ? index.records.filter(record =>
        record
        && typeof record.memory_item_id === 'string'
        && typeof record.content_hash === 'string'
        && Array.isArray(record.vector)
        && record.vector.length > 0
      ).map(record => ({
        memory_item_id: record.memory_item_id,
        embedding_model: EMBEDDING_MODEL,
        vector: record.vector,
        content_hash: record.content_hash,
        embedded_at: typeof record.embedded_at === 'number' ? record.embedded_at : Date.now(),
        text_snapshot: typeof record.text_snapshot === 'string' ? record.text_snapshot : ''
      }))
      : []
  }
}

async function persistIndex(index: MemoryEmbeddingIndex): Promise<void> {
  const filePath = getEmbeddingIndexPath()
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(index, null, 2), 'utf-8')
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

function getEmbeddingIndexPath(): string {
  return join(app.getPath('userData'), 'memory-embeddings.json')
}
