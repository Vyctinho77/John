import type { UserProfile } from './perception.types'

export type PersistedMemoryKind =
  | 'identity'
  | 'interaction_preference'
  | 'long_term_memory'
  | 'working_summary'

export type PersistedMemoryScope =
  | 'profile'
  | 'interaction'
  | 'learning'
  | 'session'

export interface PersistedMemoryItem {
  id: string
  kind: PersistedMemoryKind
  scope: PersistedMemoryScope
  text: string
  tags: string[]
  confidence: number
  source: string
  created_at: number
  updated_at: number
  expires_at?: number | null
}

export interface PersistedMemorySnapshot {
  schema_version: 1
  card_id: string
  created_at: number
  updated_at: number
  owner_name: string
  profile: UserProfile
  items: PersistedMemoryItem[]
}

export interface MemoryCardManifest {
  schema_version: number
  card_id: string
  created_at: number
  app_version: string
  owner_name: string
  export_scope: 'profile+memory'
  item_count: number
}

export interface MemoryCardSummary {
  card_id: string
  owner_name: string
  created_at: number
  updated_at: number
  item_count: number
  profile_summary: string
  impact_summary: string
  highlight_texts: string[]
}

export type MemoryImportMode = 'merge' | 'replace'

export interface MemoryImportPreview {
  file_path: string
  file_name: string
  manifest: MemoryCardManifest
  summary: MemoryCardSummary
  conflicts: number
  import_mode_default: MemoryImportMode
  include_profile_default: boolean
}

export interface MemoryExportResult {
  path: string
  summary: MemoryCardSummary
}

export interface ApplyMemoryImportInput {
  filePath: string
  mode: MemoryImportMode
  includeProfile: boolean
}

export interface MemoryEmbeddingRecord {
  memory_item_id: string
  embedding_model: 'text-embedding-3-small'
  vector: number[]
  content_hash: string
  embedded_at: number
  text_snapshot: string
}

export interface MemoryEmbeddingIndex {
  schema_version: 1
  embedding_model: 'text-embedding-3-small'
  updated_at: number
  records: MemoryEmbeddingRecord[]
}

export type EmbeddingSyncState =
  | 'idle'
  | 'syncing'
  | 'ready'
  | 'unavailable'
  | 'error'

export interface MemoryEmbeddingStatus {
  state: EmbeddingSyncState
  embedding_model: 'text-embedding-3-small'
  indexed_count: number
  last_synced_at: number | null
  error: string | null
}
