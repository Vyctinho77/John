import { randomUUID } from 'crypto'
import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import JSZip from 'jszip'
import type { SessionMemory, UserProfile } from '../../shared/perception.types'
import type {
  ApplyMemoryImportInput,
  MemoryCardManifest,
  MemoryCardSummary,
  MemoryExportResult,
  MemoryImportPreview,
  PersistedMemoryItem,
  PersistedMemorySnapshot
} from '../../shared/memory.types'
import {
  buildDerivedItems,
  buildPromptContext,
  buildSummary,
  countConflicts,
  mergeMemoryItems
} from '../../shared/memory-card.helpers'
import { getUserProfile, setUserProfile } from './user-profile'

const MEMORY_CARD_SCHEMA_VERSION = 1 as const
export const MEMORY_CARD_EXTENSION = '.ares-memory'

let cachedSnapshot: PersistedMemorySnapshot | null = null

export async function getMemorySummary(): Promise<MemoryCardSummary> {
  const snapshot = await getStoredSnapshot()
  return buildSummary(snapshot)
}

export async function getMemoryContext(): Promise<{
  summary: string
  highlights: string[]
}> {
  const snapshot = await getStoredSnapshot()
  return buildPromptContext(snapshot)
}

export async function syncPersistedMemory(input: {
  userProfile: UserProfile
  sessionMemory: SessionMemory
}): Promise<PersistedMemorySnapshot> {
  const current = await getStoredSnapshot()
  const derivedItems = buildDerivedItems(input.userProfile, input.sessionMemory)
  const importedItems = current.items.filter(item => !isDerivedItem(item))
  const nextItems = mergeMemoryItems(
    [...importedItems, ...buildDerivedItems(current.profile, emptySessionMemory())],
    derivedItems
  )
  const next = normalizeSnapshot({
    ...current,
    owner_name: input.userProfile.display_name || current.owner_name,
    profile: input.userProfile,
    items: nextItems,
    updated_at: Date.now()
  })

  cachedSnapshot = next
  await persistSnapshot(next)
  void scheduleEmbeddingSync(next)
  return next
}

export async function exportMemoryCard(targetPath: string): Promise<MemoryExportResult> {
  const snapshot = await getStoredSnapshot()
  const manifest: MemoryCardManifest = {
    schema_version: MEMORY_CARD_SCHEMA_VERSION,
    card_id: snapshot.card_id,
    created_at: Date.now(),
    app_version: app.getVersion(),
    owner_name: snapshot.owner_name,
    export_scope: 'profile+memory',
    item_count: snapshot.items.length
  }

  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('summary.json', JSON.stringify(buildSummary(snapshot), null, 2))
  zip.file('memory.jsonl', snapshot.items.map(item => JSON.stringify(item)).join('\n'))
  zip.file('profile.json', JSON.stringify(snapshot.profile, null, 2))

  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content)

  return {
    path: targetPath,
    summary: buildSummary(snapshot)
  }
}

export async function previewImportCard(filePath: string): Promise<MemoryImportPreview> {
  const imported = await readMemoryCard(filePath)
  const current = await getStoredSnapshot()
  const conflicts = countConflicts(current.items, imported.snapshot.items)

  return {
    file_path: filePath,
    file_name: basename(filePath),
    manifest: imported.manifest,
    summary: buildSummary(imported.snapshot),
    conflicts,
    import_mode_default: 'merge',
    include_profile_default: true
  }
}

export async function applyImportCard(input: ApplyMemoryImportInput): Promise<MemoryCardSummary> {
  const imported = await readMemoryCard(input.filePath)
  const current = await getStoredSnapshot()

  const nextSnapshot =
    input.mode === 'replace'
      ? normalizeSnapshot({
          ...imported.snapshot,
          card_id: imported.snapshot.card_id || current.card_id,
          updated_at: Date.now(),
          profile: input.includeProfile ? imported.snapshot.profile : current.profile
        })
      : normalizeSnapshot({
          ...current,
          updated_at: Date.now(),
          owner_name: input.includeProfile
            ? imported.snapshot.profile.display_name || current.owner_name
            : current.owner_name,
          profile: input.includeProfile ? imported.snapshot.profile : current.profile,
          items: mergeMemoryItems(current.items, imported.snapshot.items)
        })

  cachedSnapshot = nextSnapshot
  await persistSnapshot(nextSnapshot)
  void scheduleEmbeddingSync(nextSnapshot)

  if (input.includeProfile) {
    await setUserProfile(nextSnapshot.profile)
  }

  return buildSummary(nextSnapshot)
}

export async function clearPersistedMemory(): Promise<MemoryCardSummary> {
  const profile = await getUserProfile()
  cachedSnapshot = createDefaultSnapshot(profile)
  await rm(getMemorySnapshotPath(), { force: true })
  await persistSnapshot(cachedSnapshot)
  void clearEmbeddingIndex()
  return buildSummary(cachedSnapshot)
}

export async function getPersistedMemorySnapshot(): Promise<PersistedMemorySnapshot> {
  return getStoredSnapshot()
}

async function getStoredSnapshot(): Promise<PersistedMemorySnapshot> {
  if (cachedSnapshot) return cachedSnapshot

  const profile = await getUserProfile()

  try {
    const raw = await readFile(getMemorySnapshotPath(), 'utf-8')
    cachedSnapshot = normalizeSnapshot(JSON.parse(raw) as Partial<PersistedMemorySnapshot>, profile)
  } catch {
    cachedSnapshot = createDefaultSnapshot(profile)
    await persistSnapshot(cachedSnapshot)
  }

  return cachedSnapshot
}

function createDefaultSnapshot(profile: UserProfile): PersistedMemorySnapshot {
  const now = Date.now()
  return normalizeSnapshot({
    schema_version: MEMORY_CARD_SCHEMA_VERSION,
    card_id: `mc_${randomUUID()}`,
    created_at: now,
    updated_at: now,
    owner_name: profile.display_name,
    profile,
    items: buildDerivedItems(profile, emptySessionMemory())
  })
}

function normalizeSnapshot(
  snapshot: Partial<PersistedMemorySnapshot>,
  fallbackProfile?: UserProfile
): PersistedMemorySnapshot {
  const profile = snapshot.profile ?? fallbackProfile
  if (!profile) {
    throw new Error('missing profile for memory snapshot')
  }

  return {
    schema_version: MEMORY_CARD_SCHEMA_VERSION,
    card_id: snapshot.card_id || `mc_${randomUUID()}`,
    created_at: typeof snapshot.created_at === 'number' ? snapshot.created_at : Date.now(),
    updated_at: typeof snapshot.updated_at === 'number' ? snapshot.updated_at : Date.now(),
    owner_name: typeof snapshot.owner_name === 'string' ? snapshot.owner_name : profile.display_name,
    profile,
    items: normalizeItems(snapshot.items ?? [])
  }
}

function normalizeItems(items: PersistedMemoryItem[]): PersistedMemoryItem[] {
  return items
    .filter(item => item && typeof item.text === 'string' && item.text.trim())
    .map(item => ({
      ...item,
      text: item.text.trim(),
      tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 8) : [],
      confidence: clampConfidence(item.confidence),
      created_at: typeof item.created_at === 'number' ? item.created_at : Date.now(),
      updated_at: typeof item.updated_at === 'number' ? item.updated_at : Date.now(),
      expires_at: typeof item.expires_at === 'number' ? item.expires_at : null
    }))
}

async function persistSnapshot(snapshot: PersistedMemorySnapshot): Promise<void> {
  const snapshotPath = getMemorySnapshotPath()
  await mkdir(dirname(snapshotPath), { recursive: true })
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')
}

async function readMemoryCard(filePath: string): Promise<{
  manifest: MemoryCardManifest
  snapshot: PersistedMemorySnapshot
}> {
  let zip: JSZip

  try {
    const raw = await readFile(filePath)
    zip = await JSZip.loadAsync(raw)
  } catch {
    throw new Error('Arquivo invalido ou ZIP corrompido.')
  }

  const manifestRaw = await zip.file('manifest.json')?.async('string')
  const summaryRaw = await zip.file('summary.json')?.async('string')
  const memoryRaw = await zip.file('memory.jsonl')?.async('string')
  const profileRaw = await zip.file('profile.json')?.async('string')

  if (!manifestRaw || !memoryRaw || !summaryRaw || !profileRaw) {
    throw new Error('Cartao incompleto: faltam arquivos obrigatorios.')
  }

  const manifest = JSON.parse(manifestRaw) as MemoryCardManifest
  if (manifest.schema_version !== MEMORY_CARD_SCHEMA_VERSION) {
    throw new Error('Schema de memory card incompativel.')
  }

  const summary = JSON.parse(summaryRaw) as Partial<MemoryCardSummary>
  const profile = JSON.parse(profileRaw) as UserProfile
  const items = memoryRaw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as PersistedMemoryItem)

  return {
    manifest,
    snapshot: normalizeSnapshot({
      schema_version: MEMORY_CARD_SCHEMA_VERSION,
      card_id: manifest.card_id,
      created_at: manifest.created_at,
      updated_at: typeof summary.updated_at === 'number' ? summary.updated_at : Date.now(),
      owner_name: manifest.owner_name,
      profile,
      items
    }, profile)
  }
}

function isDerivedItem(item: PersistedMemoryItem): boolean {
  return item.source === 'derived_profile' || item.source === 'derived_session'
}

function clampConfidence(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

function emptySessionMemory(): SessionMemory {
  const now = Date.now()
  return {
    session_id: `session-${now}`,
    started_at: now,
    updated_at: now,
    expires_at: now,
    frame_count: 0,
    continuity_summary: 'No active continuity yet.',
    incremental_summary: '',
    probable_focus: 'unknown',
    current_intent: 'await more context',
    topic_candidates: [],
    recent_states: []
  }
}

async function scheduleEmbeddingSync(snapshot: PersistedMemorySnapshot): Promise<void> {
  try {
    const { syncMemoryEmbeddings } = await import('./memory-embeddings')
    await syncMemoryEmbeddings({ snapshot })
  } catch {
    // Embeddings are a derived layer; memory persistence remains the source of truth.
  }
}

async function clearEmbeddingIndex(): Promise<void> {
  try {
    const { clearMemoryEmbeddingIndex } = await import('./memory-embeddings')
    await clearMemoryEmbeddingIndex()
  } catch {
    // Ignore derived-index cleanup failures.
  }
}

export const __memoryCardInternals = {
  buildDerivedItems,
  mergeMemoryItems,
  countConflicts,
  buildSummary,
  buildPromptContext,
  normalizeSnapshot,
  MEMORY_CARD_EXTENSION
}

function getMemorySnapshotPath(): string {
  return join(app.getPath('userData'), 'memory-snapshot.json')
}
