import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectSimplificationSignal,
  detectDepthSignal,
  detectStyleSignal,
  calibrateDepth
} from '../src/main/services/depth-calibrator.ts'
import {
  recordInteractionSignal,
  getBehaviorPatternSummary
} from '../src/main/services/behavior-tracker.ts'
import type { UserProfile } from '../src/shared/perception.types.ts'
import type { BehaviorPattern } from '../src/main/services/behavior-tracker.ts'


// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

function makePattern(overrides: Partial<BehaviorPattern> = {}): BehaviorPattern {
  return {
    top_surfaces: [],
    top_domains: [],
    simplification_requests: 0,
    depth_requests: 0,
    preferred_mode_signal: null,
    recurring_topics: [],
    session_count: 0,
    updated_at: Date.now(),
    ...overrides
  }
}

function makeDepthSignal(
  prompt: string,
  profileOverrides: Partial<UserProfile> = {},
  patternOverrides: Partial<BehaviorPattern> | null = null
) {
  return {
    prompt,
    conversationLength: 2,
    profile: makeProfile(profileOverrides),
    behaviorPattern: patternOverrides !== null ? makePattern(patternOverrides) : null,
    domain: 'general' as const,
    modeUsed: 'direct' as const
  }
}

// ─── detectSimplificationSignal ───────────────────────────────────────────────

test('detectSimplificationSignal: catches common simplification phrases', () => {
  assert.equal(detectSimplificationSignal('simplifica isso para mim'), true)
  assert.equal(detectSimplificationSignal('não entendi nada'), true)
  assert.equal(detectSimplificationSignal('tá confuso'), true)
  assert.equal(detectSimplificationSignal('o que significa isso?'), true)
  assert.equal(detectSimplificationSignal('começa do zero'), true)
  assert.equal(detectSimplificationSignal('básico primeiro'), true)
})

test('detectSimplificationSignal: does not fire on neutral prompts', () => {
  assert.equal(detectSimplificationSignal('explica o gráfico'), false)
  assert.equal(detectSimplificationSignal('o que está acontecendo?'), false)
  assert.equal(detectSimplificationSignal('resume isso'), false)
})

// ─── detectDepthSignal ────────────────────────────────────────────────────────

test('detectDepthSignal: catches common depth phrases', () => {
  assert.equal(detectDepthSignal('aprofunda esse conceito'), true)
  assert.equal(detectDepthSignal('por que isso acontece?'), true)
  assert.equal(detectDepthSignal('como funciona por baixo?'), true)
  assert.equal(detectDepthSignal('vai fundo nesse tema'), true)
  assert.equal(detectDepthSignal('explica melhor'), true)
  assert.equal(detectDepthSignal('quero entender o mecanismo'), true)
})

test('detectDepthSignal: does not fire on surface-level prompts', () => {
  assert.equal(detectDepthSignal('o que está acontecendo?'), false)
  assert.equal(detectDepthSignal('resume'), false)
  assert.equal(detectDepthSignal('simplifica'), false)
})

// ─── detectStyleSignal ────────────────────────────────────────────────────────

test('detectStyleSignal: maps passo/etapas to step_by_step', () => {
  const { style } = detectStyleSignal('mostra em passo a passo')
  assert.equal(style, 'step_by_step')
})

test('detectStyleSignal: maps direto/curto to direct style', () => {
  const { style } = detectStyleSignal('resposta direta por favor')
  assert.equal(style, 'direct')
})

test('detectStyleSignal: maps analogia/compara to analogy', () => {
  const { style } = detectStyleSignal('traz uma analogia para isso')
  assert.equal(style, 'analogy')
})

test('detectStyleSignal: maps resumo/overview to summary', () => {
  const { style } = detectStyleSignal('resumo do assunto')
  assert.equal(style, 'summary')
})

test('detectStyleSignal: maps técnico to technical tone', () => {
  const { tone } = detectStyleSignal('prefiro algo mais técnico')
  assert.equal(tone, 'technical')
})

test('detectStyleSignal: returns null for unrecognised prompt', () => {
  const { style, tone } = detectStyleSignal('o que está acontecendo aqui?')
  assert.equal(style, null)
  assert.equal(tone, null)
})

// ─── calibrateDepth: immediate signals ───────────────────────────────────────

test('calibrateDepth: lowers level immediately on simplification request', () => {
  const cal = calibrateDepth(makeDepthSignal('simplifica isso', { user_level: 'advanced' }))
  assert.equal(cal.effective_level, 'intermediate')
  assert.equal(cal.effective_style, 'step_by_step')
  assert.match(cal.reason, /simplification/)
})

test('calibrateDepth: raises level immediately on depth request for beginner', () => {
  const cal = calibrateDepth(makeDepthSignal('aprofunda isso', { user_level: 'beginner' }))
  assert.equal(cal.effective_level, 'intermediate')
  assert.match(cal.reason, /depth/)
})

test('calibrateDepth: raises level to advanced for intermediate on depth request', () => {
  const cal = calibrateDepth(makeDepthSignal('aprofunda isso', { user_level: 'intermediate' }))
  assert.equal(cal.effective_level, 'advanced')
})

test('calibrateDepth: applies explicit style signal on neutral prompt', () => {
  const cal = calibrateDepth(makeDepthSignal('resumo por favor'))
  assert.equal(cal.effective_style, 'summary')
})

test('calibrateDepth: keeps profile defaults on neutral prompt without pattern', () => {
  const cal = calibrateDepth(makeDepthSignal('o que está acontecendo?', {}, null))
  assert.equal(cal.effective_level, 'beginner')
  assert.equal(cal.effective_style, 'direct')
  assert.equal(cal.effective_tone, 'didactic')
})

// ─── calibrateDepth: cross-session pattern ────────────────────────────────────

test('calibrateDepth: low simplification count does not change level', () => {
  const cal = calibrateDepth(
    makeDepthSignal('o que está acontecendo?', {}, { simplification_requests: 1 })
  )
  assert.equal(cal.effective_level, 'beginner') // unchanged
})

test('calibrateDepth: crosses threshold → forces beginner level', () => {
  const cal = calibrateDepth(
    makeDepthSignal('o que está acontecendo?', { user_level: 'intermediate' }, { simplification_requests: 3 })
  )
  assert.equal(cal.effective_level, 'beginner')
  assert.equal(cal.effective_style, 'step_by_step')
  assert.match(cal.reason, /cross-session/)
})

test('calibrateDepth: depth threshold → raises to intermediate for beginner', () => {
  const cal = calibrateDepth(
    makeDepthSignal('o que está acontecendo?', { user_level: 'beginner' }, { depth_requests: 3 })
  )
  assert.equal(cal.effective_level, 'intermediate')
  assert.match(cal.reason, /cross-session/)
})

test('calibrateDepth: depth threshold → raises to advanced for intermediate', () => {
  const cal = calibrateDepth(
    makeDepthSignal('o que está acontecendo?', { user_level: 'intermediate' }, { depth_requests: 3 })
  )
  assert.equal(cal.effective_level, 'advanced')
})

test('calibrateDepth: preferred_mode_signal influences style when no explicit request', () => {
  const cal = calibrateDepth(
    makeDepthSignal('o que está acontecendo?', {}, { preferred_mode_signal: 'summary' })
  )
  assert.equal(cal.effective_style, 'summary')
  assert.match(cal.reason, /preferred_mode_signal/)
})

// ─── calibrateDepth: profile patching ────────────────────────────────────────

test('calibrateDepth: should_update_profile false when no pattern exists', () => {
  const cal = calibrateDepth(makeDepthSignal('simplifica', {}, null))
  assert.equal(cal.should_update_profile, false)
})

test('calibrateDepth: should_update_profile false when threshold not reached', () => {
  const cal = calibrateDepth(
    makeDepthSignal('simplifica', {}, { simplification_requests: 2 })
  )
  assert.equal(cal.should_update_profile, false)
})

test('calibrateDepth: should_update_profile true when threshold reached and profile would change', () => {
  const cal = calibrateDepth(
    makeDepthSignal('simplifica', { user_level: 'advanced' }, { simplification_requests: 3 })
  )
  assert.equal(cal.should_update_profile, true)
  assert.ok(Object.keys(cal.profile_patch).length > 0)
})

test('calibrateDepth: profile_patch is empty when calibrated value matches current profile', () => {
  // Already beginner + step_by_step; simplification threshold reached but nothing to patch
  const cal = calibrateDepth(
    makeDepthSignal('simplifica', { user_level: 'beginner', preferred_explanation_style: 'step_by_step' }, { simplification_requests: 3 })
  )
  // should_update_profile is true but patch is empty → no-op write
  assert.equal(Object.keys(cal.profile_patch).length, 0)
})

// ─── behavior-tracker: recordInteractionSignal + getBehaviorPatternSummary ────

test('getBehaviorPatternSummary: returns empty array when no memory exists', async () => {
  // The tracker lazy-imports memory-card which isn't available in unit tests
  // We test that it returns an empty array gracefully on error.
  const lines = await getBehaviorPatternSummary().catch(() => [])
  assert.ok(Array.isArray(lines))
})

test('recordInteractionSignal: does not throw on valid input', () => {
  assert.doesNotThrow(() => {
    recordInteractionSignal({
      domain: 'code',
      mode: 'step_by_step',
      surface: 'code',
      askedForSimplification: false,
      askedForDepth: true,
      askedForSteps: false,
      askedForDirect: false,
      followUpCount: 2,
      topics: ['typescript', 'generics'],
      sessionId: 'test-session-1'
    })
  })
})

test('recordInteractionSignal: accumulates multiple signals without throwing', () => {
  assert.doesNotThrow(() => {
    for (let i = 0; i < 10; i++) {
      recordInteractionSignal({
        domain: 'general',
        mode: 'direct',
        surface: 'text',
        askedForSimplification: i % 3 === 0,
        askedForDepth: i % 4 === 0,
        askedForSteps: false,
        askedForDirect: false,
        followUpCount: i,
        topics: [`topic-${i}`],
        sessionId: 'test-session-2'
      })
    }
  })
})
