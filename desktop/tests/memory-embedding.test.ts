import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMemoryContentHash,
  cosineSimilarity,
  isEmbeddableMemoryItem,
  rankRelevantMemories
} from '../src/shared/memory-embedding.helpers.ts'
import type { MemoryEmbeddingRecord, PersistedMemoryItem } from '../src/shared/memory.types.ts'

function makeItem(overrides: Partial<PersistedMemoryItem> = {}): PersistedMemoryItem {
  return {
    id: 'memory-1',
    kind: 'interaction_preference',
    scope: 'interaction',
    text: 'Prefere respostas naturais e menos estruturadas.',
    tags: ['style'],
    confidence: 0.96,
    source: 'imported_card',
    created_at: 1,
    updated_at: Date.now(),
    expires_at: null,
    ...overrides
  }
}

test('buildMemoryContentHash is stable for equivalent text', () => {
  assert.equal(
    buildMemoryContentHash('teste de memoria'),
    buildMemoryContentHash('teste de memoria')
  )
})

test('cosineSimilarity favors aligned vectors', () => {
  assert.ok(cosineSimilarity([1, 0], [1, 0]) > cosineSimilarity([1, 0], [0, 1]))
})

test('isEmbeddableMemoryItem ignores short or expired items', () => {
  assert.equal(isEmbeddableMemoryItem(makeItem()), true)
  assert.equal(isEmbeddableMemoryItem(makeItem({ text: 'curto demais' })), false)
  assert.equal(isEmbeddableMemoryItem(makeItem({ expires_at: Date.now() - 1 })), false)
})

test('rankRelevantMemories returns the most semantically relevant items first', () => {
  const items: PersistedMemoryItem[] = [
    makeItem({
      id: 'memory-1',
      text: 'Prefere respostas naturais e menos estruturadas.',
      kind: 'interaction_preference'
    }),
    makeItem({
      id: 'memory-2',
      text: 'Opera scalp em ouro e observa rompimentos curtos.',
      kind: 'long_term_memory',
      scope: 'learning'
    })
  ]

  const records: MemoryEmbeddingRecord[] = [
    {
      memory_item_id: 'memory-1',
      embedding_model: 'text-embedding-3-small',
      vector: [1, 0],
      content_hash: buildMemoryContentHash(items[0].text),
      embedded_at: Date.now(),
      text_snapshot: items[0].text
    },
    {
      memory_item_id: 'memory-2',
      embedding_model: 'text-embedding-3-small',
      vector: [0, 1],
      content_hash: buildMemoryContentHash(items[1].text),
      embedded_at: Date.now(),
      text_snapshot: items[1].text
    }
  ]

  const ranked = rankRelevantMemories({
    items,
    records,
    queryVector: [0.95, 0.05],
    limit: 2
  })

  assert.equal(ranked[0]?.id, 'memory-1')
  assert.equal(ranked.length, 2)
})
