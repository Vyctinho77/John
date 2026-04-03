import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDerivedItems,
  buildSummary,
  countConflicts,
  mergeMemoryItems,
  normalizeSnapshot
} from '../src/shared/memory-card.helpers.ts'
import type { SessionMemory, UserProfile } from '../src/shared/perception.types.ts'
import type { PersistedMemoryItem } from '../src/shared/memory.types.ts'

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    display_name: 'Victor',
    user_level: 'beginner',
    preferred_explanation_style: 'step_by_step',
    study_goals: ['javascript'],
    response_language: 'pt-BR',
    response_tone: 'didactic',
    updated_at: 100_000,
    ...overrides
  }
}

function makeSessionMemory(overrides: Partial<SessionMemory> = {}): SessionMemory {
  return {
    session_id: 'session-1',
    started_at: 90_000,
    updated_at: 100_000,
    expires_at: 160_000,
    frame_count: 4,
    continuity_summary: 'o contexto continua no editor com foco no mesmo erro',
    incremental_summary: 'o stack trace mudou na ultima interacao',
    probable_focus: 'erro TypeError na chamada principal',
    current_intent: 'entender e corrigir o erro atual',
    topic_candidates: ['leitura de codigo'],
    recent_states: [],
    ...overrides
  }
}

test('buildDerivedItems creates profile and recent-session memories', () => {
  const items = buildDerivedItems(makeProfile(), makeSessionMemory())

  assert.ok(items.some(item => item.id === 'profile:style'))
  assert.ok(items.some(item => item.id === 'profile:goal:javascript'))
  assert.ok(items.some(item => item.id === 'session:continuity'))
  assert.ok(items.some(item => item.id === 'session:intent'))
})

test('mergeMemoryItems prefers newer items by id', () => {
  const older: PersistedMemoryItem = {
    id: 'session:intent',
    kind: 'working_summary',
    scope: 'session',
    text: 'Intenção recente: entender o erro.',
    tags: ['intent'],
    confidence: 0.7,
    source: 'imported_card',
    created_at: 1,
    updated_at: 10,
    expires_at: null
  }
  const newer: PersistedMemoryItem = {
    ...older,
    text: 'Intenção recente: corrigir e validar o erro.',
    updated_at: 20
  }

  const merged = mergeMemoryItems([older], [newer])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].text, newer.text)
})

test('countConflicts reports changed text for identical ids', () => {
  const current: PersistedMemoryItem[] = [{
    id: 'profile:style',
    kind: 'interaction_preference',
    scope: 'interaction',
    text: 'Estilo preferido: summary.',
    tags: ['style'],
    confidence: 0.9,
    source: 'derived_profile',
    created_at: 1,
    updated_at: 1,
    expires_at: null
  }]
  const incoming: PersistedMemoryItem[] = [{
    ...current[0],
    text: 'Estilo preferido: direct.'
  }]

  assert.equal(countConflicts(current, incoming), 1)
})

test('buildSummary creates premium preview metadata from snapshot', () => {
  const snapshot = normalizeSnapshot({
    schema_version: 1,
    card_id: 'mc_1',
    created_at: 1,
    updated_at: 2,
    owner_name: 'Victor',
    profile: makeProfile(),
    items: buildDerivedItems(makeProfile(), makeSessionMemory())
  }, makeProfile())

  const summary = buildSummary(snapshot)

  assert.equal(summary.card_id, 'mc_1')
  assert.match(summary.profile_summary, /Victor/)
  assert.ok(summary.item_count >= 4)
  assert.ok(summary.highlight_texts.length > 0)
})
