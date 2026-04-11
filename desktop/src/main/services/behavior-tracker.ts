/**
 * behavior-tracker.ts
 *
 * Tracks long-term behavioral patterns across sessions and persists them
 * to memory as structured insights. This feeds the "Memória de longo prazo
 * com padrões pessoais" feature.
 *
 * Design principles:
 * - All patterns are derived from explicit signals (surface usage, domains,
 *   error rates, feedback). No inference magic.
 * - Patterns stored as human-readable memory items so they surface naturally
 *   in prompt context.
 * - Expires are long (30d) to give persistence without bloat.
 * - Never stores raw screen content, only behavioral summaries.
 */

import { randomUUID } from 'crypto'
import type { SurfaceType, TutorDomain, TutorMode } from '../../shared/perception.types'
import type { PersistedMemoryItem } from '../../shared/memory.types'

export interface SessionBehaviorSignal {
  domain: TutorDomain
  mode: TutorMode
  surface: SurfaceType
  /** True when the user asked for simplification ("simplifica", "não entendi") */
  askedForSimplification: boolean
  /** True when the user asked for deeper content ("aprofunda", "explica melhor", "por que") */
  askedForDepth: boolean
  /** True when the user explicitly asked for step-by-step */
  askedForSteps: boolean
  /** True when the user asked for a direct answer */
  askedForDirect: boolean
  /** Number of follow-up questions in the same topic (lingering = complex topic) */
  followUpCount: number
  /** Topics that appeared across the session */
  topics: string[]
  sessionId: string
}

export interface BehaviorPattern {
  /** Surfaces the user interacts with most (ordered by frequency) */
  top_surfaces: SurfaceType[]
  /** Domains visited most often */
  top_domains: TutorDomain[]
  /** How many times the user has asked for simplification across sessions */
  simplification_requests: number
  /** How many times the user has asked to go deeper */
  depth_requests: number
  /** Preferred mode based on explicit user requests */
  preferred_mode_signal: TutorMode | null
  /** Topics the user returns to repeatedly */
  recurring_topics: string[]
  /** Number of sessions tracked */
  session_count: number
  /** Timestamp of last update */
  updated_at: number
}

const PATTERN_ITEM_ID = 'behavior:cross_session_pattern'
const PATTERN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// In-memory accumulator for the current session signals before flushing
let pendingSignals: SessionBehaviorSignal[] = []

/**
 * Records a single interaction signal from the current session.
 * Call this after every tutor response.
 */
export function recordInteractionSignal(signal: SessionBehaviorSignal): void {
  pendingSignals.push(signal)
}

/**
 * Flushes accumulated session signals into the persisted memory card.
 * Call this at session end or periodically (e.g., every 5 interactions).
 */
export async function flushBehaviorToMemory(): Promise<void> {
  if (!pendingSignals.length) return

  const signals = [...pendingSignals]
  pendingSignals = []

  try {
    const { getPersistedMemorySnapshot, syncPersistedMemory } = await import('./memory-card')
    const { getUserProfile } = await import('./user-profile')
    const snapshot = await getPersistedMemorySnapshot()
    const profile = await getUserProfile()

    // Load existing pattern or start fresh
    const existing = snapshot.items.find(item => item.id === PATTERN_ITEM_ID)
    const currentPattern: BehaviorPattern = existing
      ? parseBehaviorPattern(existing.text)
      : createEmptyPattern()

    // Merge new signals into the pattern
    const updated = mergeSignals(currentPattern, signals)

    // Build the memory item for the pattern
    const patternItem = buildPatternMemoryItem(updated)

    // Merge into the snapshot items (replace if exists, else add)
    const nextItems = [
      ...snapshot.items.filter(item => item.id !== PATTERN_ITEM_ID),
      patternItem
    ]

    // Also build individual insight items for top topics, preferred domain etc.
    const insightItems = buildInsightItems(updated, signals)

    const allItems = mergeInsightItems(nextItems, insightItems)

    // Persist via syncPersistedMemory to go through the full write path
    // We manually patch the snapshot's items and call the internal persist
    await syncPersistedMemory({
      userProfile: profile,
      sessionMemory: buildMinimalSessionMemory(updated)
    })

    // Directly patch snapshot items with our behavior data — we do this after
    // syncPersistedMemory to avoid overwriting derived items
    await applyBehaviorItems(allItems)
  } catch {
    // Behavior tracking is non-critical; never let it break the tutor
  }
}

/**
 * Returns the current behavior pattern from persisted memory.
 * Returns null if no pattern has been tracked yet.
 */
export async function getBehaviorPattern(): Promise<BehaviorPattern | null> {
  try {
    const { getPersistedMemorySnapshot } = await import('./memory-card')
    const snapshot = await getPersistedMemorySnapshot()
    const item = snapshot.items.find(i => i.id === PATTERN_ITEM_ID)
    if (!item) return null
    return parseBehaviorPattern(item.text)
  } catch {
    return null
  }
}

/**
 * Returns a human-readable summary of behavior patterns to inject into prompts.
 */
export async function getBehaviorPatternSummary(): Promise<string[]> {
  const pattern = await getBehaviorPattern()
  if (!pattern) return []

  const lines: string[] = []

  if (pattern.top_surfaces.length) {
    lines.push(`Superfícies mais usadas: ${pattern.top_surfaces.slice(0, 3).join(', ')}.`)
  }

  if (pattern.top_domains.length) {
    lines.push(`Domínios mais visitados: ${pattern.top_domains.slice(0, 3).join(', ')}.`)
  }

  if (pattern.recurring_topics.length) {
    lines.push(`Tópicos recorrentes entre sessões: ${pattern.recurring_topics.slice(0, 4).join(', ')}.`)
  }

  if (pattern.simplification_requests >= 3) {
    lines.push(
      `Este usuário já pediu simplificação ${pattern.simplification_requests} vezes no total — prefira vocabulário simples e progressão clara.`
    )
  }

  if (pattern.depth_requests >= 3) {
    lines.push(
      `Este usuário já pediu profundidade ${pattern.depth_requests} vezes no total — pode assumir que ele quer os mecanismos, não só a superfície.`
    )
  }

  if (pattern.preferred_mode_signal) {
    lines.push(
      `O usuário frequentemente prefere o modo "${pattern.preferred_mode_signal}" com base em pedidos explícitos.`
    )
  }

  return lines
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mergeSignals(
  current: BehaviorPattern,
  signals: SessionBehaviorSignal[]
): BehaviorPattern {
  const surfaceCounts = new Map<SurfaceType, number>()
  const domainCounts = new Map<TutorDomain, number>()
  const topicCounts = new Map<string, number>()
  const modeCounts = new Map<TutorMode, number>()

  // Seed from existing pattern (approximate reverse of top_X to restore rough counts)
  current.top_surfaces.forEach((s, i) => surfaceCounts.set(s, (current.session_count - i) * 2))
  current.top_domains.forEach((d, i) => domainCounts.set(d, (current.session_count - i) * 2))
  current.recurring_topics.forEach((t, i) => topicCounts.set(t, (current.session_count - i) * 2))

  // Accumulate new signals
  let simplificationRequests = current.simplification_requests
  let depthRequests = current.depth_requests

  for (const signal of signals) {
    surfaceCounts.set(signal.surface, (surfaceCounts.get(signal.surface) ?? 0) + 1)
    domainCounts.set(signal.domain, (domainCounts.get(signal.domain) ?? 0) + 1)

    for (const topic of signal.topics) {
      if (topic) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1)
    }

    if (signal.askedForSimplification) simplificationRequests++
    if (signal.askedForDepth) depthRequests++

    // Mode signals from explicit user choices
    if (signal.askedForSteps) modeCounts.set('step_by_step', (modeCounts.get('step_by_step') ?? 0) + 1)
    if (signal.askedForDirect) modeCounts.set('direct', (modeCounts.get('direct') ?? 0) + 1)
    if (signal.askedForDepth) modeCounts.set('layered', (modeCounts.get('layered') ?? 0) + 1)
  }

  const topSurfaces = sortByCount(surfaceCounts).slice(0, 4) as SurfaceType[]
  const topDomains = sortByCount(domainCounts).slice(0, 4) as TutorDomain[]
  const recurringTopics = sortByCount(topicCounts)
    .filter(t => (topicCounts.get(t as string) ?? 0) >= 2)
    .slice(0, 8) as string[]

  const preferredMode = resolvePreferredMode(modeCounts, current.preferred_mode_signal)

  return {
    top_surfaces: topSurfaces,
    top_domains: topDomains,
    simplification_requests: simplificationRequests,
    depth_requests: depthRequests,
    preferred_mode_signal: preferredMode,
    recurring_topics: recurringTopics,
    session_count: current.session_count + 1,
    updated_at: Date.now()
  }
}

function resolvePreferredMode(
  modeCounts: Map<TutorMode, number>,
  currentSignal: TutorMode | null
): TutorMode | null {
  if (!modeCounts.size) return currentSignal
  const sorted = sortByCount(modeCounts)
  const top = sorted[0] as TutorMode
  const topCount = modeCounts.get(top) ?? 0
  // Only establish a preference if there's clear signal (>= 3 explicit requests)
  if (topCount >= 3) return top
  return currentSignal
}

function sortByCount<K>(map: Map<K, number>): K[] {
  return [...map.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key)
}

function buildPatternMemoryItem(pattern: BehaviorPattern): PersistedMemoryItem {
  const now = Date.now()
  return {
    id: PATTERN_ITEM_ID,
    kind: 'long_term_memory',
    scope: 'learning',
    text: `BEHAVIOR_PATTERN_V1:${JSON.stringify(pattern)}`,
    tags: ['behavior', 'pattern', 'cross-session'],
    confidence: 0.85,
    source: 'behavior_tracker',
    created_at: now,
    updated_at: now,
    expires_at: now + PATTERN_TTL_MS
  }
}

function buildInsightItems(
  pattern: BehaviorPattern,
  signals: SessionBehaviorSignal[]
): PersistedMemoryItem[] {
  const now = Date.now()
  const items: PersistedMemoryItem[] = []
  const ttl = now + PATTERN_TTL_MS

  if (pattern.top_domains[0]) {
    items.push({
      id: 'behavior:top_domain',
      kind: 'interaction_preference',
      scope: 'learning',
      text: `Domínio de maior interesse histórico: ${pattern.top_domains[0]}.`,
      tags: ['behavior', 'domain'],
      confidence: 0.8,
      source: 'behavior_tracker',
      created_at: now,
      updated_at: now,
      expires_at: ttl
    })
  }

  if (pattern.recurring_topics.length) {
    items.push({
      id: 'behavior:recurring_topics',
      kind: 'long_term_memory',
      scope: 'learning',
      text: `Tópicos que o usuário retorna com frequência: ${pattern.recurring_topics.slice(0, 5).join(', ')}.`,
      tags: ['behavior', 'topics'],
      confidence: 0.82,
      source: 'behavior_tracker',
      created_at: now,
      updated_at: now,
      expires_at: ttl
    })
  }

  // Unique topics from this specific session (for short-term relevance)
  const sessionTopics = [...new Set(signals.flatMap(s => s.topics))].slice(0, 4)
  if (sessionTopics.length) {
    items.push({
      id: `behavior:session_topics:${signals[0]?.sessionId ?? randomUUID()}`,
      kind: 'working_summary',
      scope: 'session',
      text: `Tópicos desta sessão: ${sessionTopics.join(', ')}.`,
      tags: ['behavior', 'session', 'topics'],
      confidence: 0.75,
      source: 'behavior_tracker',
      created_at: now,
      updated_at: now,
      expires_at: now + 7 * 24 * 60 * 60 * 1000 // 7 days
    })
  }

  return items
}

function mergeInsightItems(
  baseItems: PersistedMemoryItem[],
  insights: PersistedMemoryItem[]
): PersistedMemoryItem[] {
  const byId = new Map(baseItems.map(i => [i.id, i]))
  for (const insight of insights) {
    byId.set(insight.id, insight)
  }
  return [...byId.values()]
}

function parseBehaviorPattern(text: string): BehaviorPattern {
  try {
    const json = text.replace(/^BEHAVIOR_PATTERN_V1:/, '')
    return JSON.parse(json) as BehaviorPattern
  } catch {
    return createEmptyPattern()
  }
}

function createEmptyPattern(): BehaviorPattern {
  return {
    top_surfaces: [],
    top_domains: [],
    simplification_requests: 0,
    depth_requests: 0,
    preferred_mode_signal: null,
    recurring_topics: [],
    session_count: 0,
    updated_at: Date.now()
  }
}

function buildMinimalSessionMemory(pattern: BehaviorPattern): {
  session_id: string; started_at: number; updated_at: number; expires_at: number
  frame_count: number; continuity_summary: string; incremental_summary: string
  probable_focus: string; current_intent: string; topic_candidates: string[]; recent_states: []
} {
  const now = Date.now()
  return {
    session_id: `behavior-flush-${now}`,
    started_at: now,
    updated_at: now,
    expires_at: now + 60_000,
    frame_count: 0,
    continuity_summary: 'Flush de padrões comportamentais.',
    incremental_summary: `Sessão ${pattern.session_count} registrada.`,
    probable_focus: pattern.top_domains[0] ?? 'unknown',
    current_intent: 'persist behavior pattern',
    topic_candidates: pattern.recurring_topics.slice(0, 3),
    recent_states: []
  }
}

/**
 * Applies behavior-derived memory items directly to the persisted snapshot,
 * replacing any existing items with the same IDs.
 * Inlined here to avoid a circular-import helper module.
 */
async function applyBehaviorItems(items: PersistedMemoryItem[]): Promise<void> {
  const { app } = await import('electron')
  const { mkdir, readFile, writeFile } = await import('fs/promises')
  const { dirname, join } = await import('path')

  const snapshotPath = join(app.getPath('userData'), 'memory-snapshot.json')

  let snapshot: Record<string, unknown>
  try {
    const raw = await readFile(snapshotPath, 'utf-8')
    snapshot = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // If snapshot doesn't exist yet, skip — will be applied on the next flush.
    return
  }

  const behaviorIds = new Set(items.map(i => i.id))
  const baseItems = ((snapshot['items'] as PersistedMemoryItem[] | undefined) ?? [])
    .filter(i => !behaviorIds.has(i.id))
  const nextItems = [...baseItems, ...items].sort((a, b) => b.updated_at - a.updated_at)

  const next = { ...snapshot, items: nextItems, updated_at: Date.now() }

  await mkdir(dirname(snapshotPath), { recursive: true })
  await writeFile(snapshotPath, JSON.stringify(next, null, 2), 'utf-8')
}
