/**
 * behavior-tracker-internal.ts
 *
 * Internal helper for behavior-tracker.ts that directly patches the persisted
 * memory snapshot without going through the full syncPersistedMemory pipeline
 * (which would overwrite behavior items with derived profile items).
 *
 * Kept separate to avoid circular imports with memory-card.ts.
 */

import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { PersistedMemoryItem, PersistedMemorySnapshot } from '../../shared/memory.types'

function getMemorySnapshotPath(): string {
  return join(app.getPath('userData'), 'memory-snapshot.json')
}

/**
 * Applies behavior-derived memory items directly to the persisted snapshot,
 * replacing any existing items with the same IDs.
 */
export async function applyBehaviorItems(items: PersistedMemoryItem[]): Promise<void> {
  const snapshotPath = getMemorySnapshotPath()

  let snapshot: PersistedMemorySnapshot
  try {
    const raw = await readFile(snapshotPath, 'utf-8')
    snapshot = JSON.parse(raw) as PersistedMemorySnapshot
  } catch {
    // If snapshot doesn't exist yet, skip the behavior flush —
    // it will be applied on the next flush after memory-card initializes.
    return
  }

  const behaviorIds = new Set(items.map(i => i.id))
  const baseItems = (snapshot.items ?? []).filter(i => !behaviorIds.has(i.id))
  const nextItems = [...baseItems, ...items].sort((a, b) => b.updated_at - a.updated_at)

  const next: PersistedMemorySnapshot = {
    ...snapshot,
    items: nextItems,
    updated_at: Date.now()
  }

  await mkdir(dirname(snapshotPath), { recursive: true })
  await writeFile(snapshotPath, JSON.stringify(next, null, 2), 'utf-8')
}
