import type { SessionMemory, UserProfile } from './perception.types'
import type { MemoryCardSummary, PersistedMemoryItem, PersistedMemorySnapshot } from './memory.types'

export function buildDerivedItems(userProfile: UserProfile, sessionMemory: SessionMemory): PersistedMemoryItem[] {
  const now = Date.now()
  const items: PersistedMemoryItem[] = []

  items.push(makeItem('profile:display_name', 'identity', 'profile', userProfile.display_name || 'Usuário sem nome definido.', ['profile', 'name'], 1, now, 'derived_profile'))
  items.push(makeItem('profile:language', 'identity', 'profile', `Idioma preferido: ${userProfile.response_language}.`, ['profile', 'language'], 0.98, now, 'derived_profile'))
  items.push(makeItem('profile:level', 'interaction_preference', 'interaction', `Nível do usuário: ${userProfile.user_level}.`, ['profile', 'level'], 0.96, now, 'derived_profile'))
  items.push(makeItem('profile:style', 'interaction_preference', 'interaction', `Estilo preferido: ${userProfile.preferred_explanation_style}.`, ['profile', 'style'], 0.96, now, 'derived_profile'))
  items.push(makeItem('profile:tone', 'interaction_preference', 'interaction', `Tom preferido: ${userProfile.response_tone}.`, ['profile', 'tone'], 0.95, now, 'derived_profile'))

  userProfile.study_goals.forEach(goal => {
    items.push(
      makeItem(
        `profile:goal:${slugify(goal)}`,
        'long_term_memory',
        'learning',
        `Objetivo de estudo: ${goal}.`,
        ['goal', 'learning'],
        0.92,
        now,
        'derived_profile'
      )
    )
  })

  if (sessionMemory.current_intent && sessionMemory.current_intent !== 'await more context') {
    items.push(makeItem('session:intent', 'working_summary', 'session', `Intenção recente: ${sessionMemory.current_intent}.`, ['intent', 'recent'], 0.72, now, 'derived_session', Date.now() + 7 * 24 * 60 * 60_000))
  }
  if (sessionMemory.continuity_summary && sessionMemory.continuity_summary !== 'No active continuity yet.') {
    items.push(makeItem('session:continuity', 'working_summary', 'session', `Continuidade recente: ${sessionMemory.continuity_summary}`, ['continuity', 'recent'], 0.76, now, 'derived_session', Date.now() + 7 * 24 * 60 * 60_000))
  }
  if (sessionMemory.probable_focus && sessionMemory.probable_focus !== 'unknown') {
    items.push(makeItem('session:focus', 'working_summary', 'session', `Foco recorrente: ${sessionMemory.probable_focus}.`, ['focus', 'recent'], 0.7, now, 'derived_session', Date.now() + 7 * 24 * 60 * 60_000))
  }
  if (sessionMemory.topic_candidates.length) {
    items.push(makeItem('session:topics', 'working_summary', 'session', `Tópicos recorrentes: ${sessionMemory.topic_candidates.join(', ')}.`, ['topics', 'recent'], 0.74, now, 'derived_session', Date.now() + 7 * 24 * 60 * 60_000))
  }

  return items
}

export function mergeMemoryItems(currentItems: PersistedMemoryItem[], incomingItems: PersistedMemoryItem[]): PersistedMemoryItem[] {
  const byId = new Map<string, PersistedMemoryItem>()
  const dedupeKeys = new Set<string>()

  for (const item of getActiveItems(currentItems)) {
    byId.set(item.id, item)
    dedupeKeys.add(dedupeKey(item))
  }

  for (const item of getActiveItems(incomingItems)) {
    const existing = byId.get(item.id)
    if (!existing || item.updated_at >= existing.updated_at) {
      byId.set(item.id, item)
      dedupeKeys.add(dedupeKey(item))
      continue
    }

    const key = dedupeKey(item)
    if (!dedupeKeys.has(key)) {
      byId.set(`${item.id}:${slugify(item.text).slice(0, 24)}`, item)
      dedupeKeys.add(key)
    }
  }

  return [...byId.values()].sort((a, b) => b.updated_at - a.updated_at)
}

export function countConflicts(currentItems: PersistedMemoryItem[], incomingItems: PersistedMemoryItem[]): number {
  const currentById = new Map(currentItems.map(item => [item.id, item]))
  let count = 0

  for (const item of incomingItems) {
    const existing = currentById.get(item.id)
    if (existing && existing.text !== item.text) count += 1
  }

  return count
}

export function normalizeSnapshot(
  snapshot: Partial<PersistedMemorySnapshot>,
  fallbackProfile: UserProfile
): PersistedMemorySnapshot {
  return {
    schema_version: 1,
    card_id: snapshot.card_id || 'mc_test',
    created_at: typeof snapshot.created_at === 'number' ? snapshot.created_at : Date.now(),
    updated_at: typeof snapshot.updated_at === 'number' ? snapshot.updated_at : Date.now(),
    owner_name: typeof snapshot.owner_name === 'string' ? snapshot.owner_name : fallbackProfile.display_name,
    profile: snapshot.profile ?? fallbackProfile,
    items: (snapshot.items ?? []).map(item => ({
      ...item,
      expires_at: typeof item.expires_at === 'number' ? item.expires_at : null
    }))
  }
}

export function buildSummary(snapshot: PersistedMemorySnapshot): MemoryCardSummary {
  const activeItems = getActiveItems(snapshot.items)
  const profile = snapshot.profile
  const profileSummary = [
    profile.display_name || 'sem nome',
    profile.user_level,
    profile.preferred_explanation_style,
    profile.response_tone
  ].join(' · ')

  return {
    card_id: snapshot.card_id,
    owner_name: snapshot.owner_name || profile.display_name || 'Ares user',
    created_at: snapshot.created_at,
    updated_at: snapshot.updated_at,
    item_count: activeItems.length,
    profile_summary: profileSummary,
    impact_summary:
      activeItems.length === 0
        ? 'Sem memórias persistidas além do perfil.'
        : `${activeItems.length} memórias prontas para reutilização.`,
    highlight_texts: activeItems.slice(0, 3).map(item => item.text)
  }
}

export function buildPromptContext(snapshot: PersistedMemorySnapshot): { summary: string; highlights: string[] } {
  const summary = buildSummary(snapshot)
  return {
    summary: `Perfil ${summary.profile_summary}. ${summary.impact_summary}`,
    highlights: summary.highlight_texts
  }
}

function makeItem(
  id: string,
  kind: PersistedMemoryItem['kind'],
  scope: PersistedMemoryItem['scope'],
  text: string,
  tags: string[],
  confidence: number,
  now: number,
  source: string,
  expires_at?: number
): PersistedMemoryItem {
  return {
    id,
    kind,
    scope,
    text,
    tags,
    confidence,
    source,
    created_at: now,
    updated_at: now,
    expires_at: expires_at ?? null
  }
}

function getActiveItems(items: PersistedMemoryItem[]): PersistedMemoryItem[] {
  const now = Date.now()
  return items.filter(item => !item.expires_at || item.expires_at > now)
}

function dedupeKey(item: PersistedMemoryItem): string {
  return `${item.kind}:${item.scope}:${item.text.toLowerCase().replace(/\s+/g, ' ').trim()}`
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
