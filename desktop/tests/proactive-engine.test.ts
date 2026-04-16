import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOpportunityCandidates,
  decideOpportunity,
  detectSignals,
  resetProactiveState
} from '../src/main/services/proactive-engine.ts'
import type { PerceptionContextSnapshot } from '../src/shared/perception.types.ts'
import type { ProactiveState } from '../src/shared/proactive.types.ts'

type SnapshotOverrides = Partial<Omit<PerceptionContextSnapshot, 'semanticState' | 'sessionMemory' | 'userProfile'>> & {
  semanticState?: Partial<PerceptionContextSnapshot['semanticState']>
  sessionMemory?: Partial<PerceptionContextSnapshot['sessionMemory']>
  userProfile?: Partial<PerceptionContextSnapshot['userProfile']>
}

const baseSettings = {
  telemetryOptIn: false,
  alwaysVisible: true,
  minimalMode: false,
  passiveSuggestions: true,
  dailyCostLimitUsd: null,
  featureFlags: {
    passiveSuggestions: true,
    advancedPerception: false,
    voiceMode: false,
    crashReporting: false
  },
  captureScope: {
    mode: 'any-visible' as const,
    selectedSourceId: null,
    selectedSourceName: null,
    blockedSourceKeywords: []
  },
  hudPosition: null,
  updatedAt: Date.now()
}

function makeState(overrides: Partial<ProactiveState> = {}): ProactiveState {
  return {
    currentHint: null,
    recentHints: [],
    cooldownUntil: 0,
    ignoredStreak: 0,
    lastUserActivityAt: 0,
    lastActivityType: null,
    lastUserSubmitAt: null,
    lastHudExpandAt: null,
    lastStreamingAt: null,
    sessionStats: {
      emittedCount: 0,
      consumedCount: 0,
      dismissedCount: 0,
      expiredCount: 0,
      ignoredCount: 0,
      blockedCount: 0,
      lastEmitAt: null
    },
    recentBlockReasons: [],
    ...overrides
  }
}

function makeSnapshot(overrides: SnapshotOverrides = {}): PerceptionContextSnapshot {
  const now = 100_000
  const base: PerceptionContextSnapshot = {
    semanticState: {
      detected_text: 'TypeError: undefined is not a function',
      visual_summary: 'Viewing code in centro | main cue: TypeError',
      surface_type: 'code',
      change_summary: 'major',
      focus_region: 'centro',
      probable_user_focus: 'code em centro: TypeError',
      inferred_intent: 'understand code on screen',
      pedagogical_topics: ['leitura de codigo'],
      capture_policy: 'allowed',
      sensitivity_reason: null,
      uncertainty: 0.22,
      capturedAt: now
    },
    sessionMemory: {
      session_id: 'session-1',
      started_at: now - 60_000,
      updated_at: now,
      expires_at: now + 60_000,
      frame_count: 4,
      continuity_summary: 'The context remains on code.',
      incremental_summary: 'A small update happened.',
      probable_focus: 'code em centro: TypeError',
      current_intent: 'understand code',
      topic_candidates: ['leitura de codigo'],
      recent_states: [
        {
          capturedAt: now - 18_000,
          surface_type: 'code',
          change_summary: 'minor',
          detected_text: 'TypeError: undefined',
          visual_summary: 'code',
          probable_user_focus: 'code em centro: TypeError',
          inferred_intent: 'understand code',
          uncertainty: 0.24
        },
        {
          capturedAt: now - 9_000,
          surface_type: 'code',
          change_summary: 'minor',
          detected_text: 'TypeError: undefined',
          visual_summary: 'code',
          probable_user_focus: 'code em centro: TypeError',
          inferred_intent: 'understand code',
          uncertainty: 0.23
        },
        {
          capturedAt: now,
          surface_type: 'code',
          change_summary: 'major',
          detected_text: 'TypeError: undefined is not a function',
          visual_summary: 'code',
          probable_user_focus: 'code em centro: TypeError',
          inferred_intent: 'understand code',
          uncertainty: 0.22
        }
      ]
    },
    userProfile: {
      display_name: 'Victor',
      user_level: 'beginner',
      preferred_explanation_style: 'step_by_step',
      study_goals: ['javascript'],
      response_language: 'Português',
      response_tone: 'didactic',
      updated_at: now
    },
    persisted_memory_summary: 'Perfil Victor · beginner · step_by_step · didactic.',
    persisted_memory_highlights: ['Objetivo de estudo: javascript.'],
    intermediateThought: {
      primary: 'ele está tentando resolver esse código, mas o teste está falhando nesse ponto',
      secondary: 'deve fechar quando alinhar a expectativa do teste com a mudança recente desse fluxo',
      confidence: 0.76
    },
    screenshotDataUrl: null
  }

  return {
    ...base,
    ...overrides,
    semanticState: {
      ...base.semanticState,
      ...(overrides.semanticState ?? {})
    },
    sessionMemory: {
      ...base.sessionMemory,
      ...(overrides.sessionMemory ?? {})
    },
    userProfile: {
      ...base.userProfile,
      ...(overrides.userProfile ?? {})
    }
  }
}

test.beforeEach(() => {
  resetProactiveState()
})

test('detectSignals finds code error opportunity', () => {
  const signals = detectSignals(makeSnapshot(), makeState({ lastUserActivityAt: 0 }), 100_000)
  assert.ok(signals.eventTypes.includes('interesting-pattern'))
  assert.equal(signals.domainSignal, 'code-error')
})

test('buildOpportunityCandidates returns scored candidates', () => {
  const candidates = buildOpportunityCandidates(makeSnapshot(), makeState({ lastUserActivityAt: 0 }), 100_000)
  assert.ok(candidates.length > 0)
  assert.ok(candidates.some(candidate => candidate.eventType === 'interesting-pattern'))
  assert.ok(candidates.every(candidate => candidate.score.total >= 0))
})

test('decideOpportunity blocks hint during cooldown', () => {
  const decision = decideOpportunity(
    makeSnapshot(),
    makeState({
      lastUserActivityAt: 0,
      cooldownUntil: 100_500
    }),
    baseSettings,
    100_000
  )

  assert.equal(decision.emitted, false)
  assert.ok(decision.reasonCodes.includes('cooldown-active'))
})

test('decideOpportunity blocks hint during recent activity', () => {
  const decision = decideOpportunity(
    makeSnapshot(),
    makeState({
      lastUserActivityAt: 99_500,
      lastActivityType: 'typing'
    }),
    baseSettings,
    100_000
  )

  assert.equal(decision.emitted, false)
  assert.ok(decision.reasonCodes.includes('recent-user-activity'))
})

test('decideOpportunity blocks duplicate fingerprint', () => {
  const snapshot = makeSnapshot()
  const candidates = buildOpportunityCandidates(snapshot, makeState({ lastUserActivityAt: 0 }), 100_000)
  const target = candidates[0]
  assert.ok(target)

  const decision = decideOpportunity(
    snapshot,
    makeState({
      lastUserActivityAt: 0,
      recentHints: [
        {
          id: 'hint-1',
          eventType: target.eventType,
          level: 'hint',
          text: target.text,
          surfaceType: snapshot.semanticState.surface_type,
          fingerprint: target.fingerprint,
          score: target.score,
          sourceSignals: target.sourceSignals,
          reasonCodes: ['emitted'],
          outcome: 'ignored',
          createdAt: 99_700,
          expiresAt: 114_000
        }
      ]
    }),
    baseSettings,
    100_000
  )

  assert.equal(decision.emitted, false)
  assert.ok(decision.reasonCodes.includes('duplicate-fingerprint'))
})

test('decideOpportunity emits for strong code-error signal', () => {
  const decision = decideOpportunity(
    makeSnapshot(),
    makeState({
      lastUserActivityAt: 0
    }),
    baseSettings,
    100_000
  )

  assert.equal(decision.emitted, true)
  assert.equal(decision.candidate?.level, 'hint')
  assert.ok(decision.reasonCodes.includes('emitted'))
})

test('decideOpportunity allows new topic after cooldown window', () => {
  const snapshot = makeSnapshot({
    semanticState: {
      probable_user_focus: 'code em centro: ReferenceError',
      detected_text: 'ReferenceError: value is not defined'
    }
  })

  const decision = decideOpportunity(
    snapshot,
    makeState({
      lastUserActivityAt: 0,
      recentHints: [
        {
          id: 'old-hint',
          eventType: 'interesting-pattern',
          level: 'hint',
          text: 'isso aqui parece um erro importante',
          surfaceType: 'code',
          fingerprint: 'interesting-pattern:code:typeerror:isso aqui parece um erro importante',
          score: {
            relevance: 0.8,
            confidence: 0.8,
            user_interrupt_cost: 0.3,
            novelty: 0.6,
            fatigue_penalty: 0.1,
            user_match: 0.8,
            total: 0.72
          },
          sourceSignals: {
            lingerFrames: 2,
            revisitCount: 1,
            stableFocus: true,
            majorChangeDetected: true,
            domainSignal: 'code-error',
            semanticFocus: 'typeerror',
            topic: 'leitura de codigo',
            emotionalSignal: null,
            appIdentifier: null,
            appSwitchDetected: false
          },
          reasonCodes: ['emitted'],
          outcome: 'ignored',
          createdAt: 40_000,
          expiresAt: 54_000
        }
      ]
    }),
    baseSettings,
    100_000
  )

  assert.equal(decision.emitted, true)
})
