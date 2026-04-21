import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createGlobalIntentState,
  deriveHeuristicIntent,
  resetGlobalIntentState,
  resolveGlobalIntent
} from '../src/main/services/global-intent.ts'
import type { PerceptionContextSnapshot } from '../src/shared/perception.types.ts'

function makeSnapshot(
  overrides: {
    semanticState?: Partial<PerceptionContextSnapshot['semanticState']>
    sessionMemory?: Partial<PerceptionContextSnapshot['sessionMemory']>
  } = {}
): PerceptionContextSnapshot {
  const now = 100_000
  const base: PerceptionContextSnapshot = {
    semanticState: {
      detected_text: 'TypeError: undefined is not a function',
      visual_summary: 'editor de codigo com erro TypeError em destaque',
      surface_type: 'code',
      change_summary: 'major',
      focus_region: 'centro',
      probable_user_focus: 'erro TypeError na chamada principal',
      inferred_intent: 'corrigir o erro visivel',
      pedagogical_topics: ['leitura de codigo'],
      capture_policy: 'allowed',
      sensitivity_reason: null,
      uncertainty: 0.2,
      capturedAt: now,
      app_identifier: 'Visual Studio Code'
    },
    sessionMemory: {
      session_id: 'session-1',
      started_at: now - 30_000,
      updated_at: now,
      expires_at: now + 60_000,
      frame_count: 4,
      continuity_summary: 'contexto tecnico estavel',
      incremental_summary: 'o erro ficou mais claro',
      probable_focus: 'erro TypeError na chamada principal',
      current_intent: 'entender e corrigir o erro atual',
      topic_candidates: ['leitura de codigo'],
      recent_states: [
        {
          capturedAt: now - 8_000,
          surface_type: 'code',
          change_summary: 'minor',
          detected_text: 'TypeError',
          visual_summary: 'codigo com erro',
          probable_user_focus: 'erro TypeError',
          inferred_intent: 'corrigir erro',
          uncertainty: 0.22,
          app_identifier: 'Visual Studio Code',
          emotional_signal: 'focused'
        },
        {
          capturedAt: now - 4_000,
          surface_type: 'code',
          change_summary: 'minor',
          detected_text: 'TypeError',
          visual_summary: 'codigo com erro',
          probable_user_focus: 'erro TypeError',
          inferred_intent: 'corrigir erro',
          uncertainty: 0.21,
          app_identifier: 'Visual Studio Code',
          emotional_signal: 'focused'
        }
      ]
    },
    globalIntent: createGlobalIntentState(),
    userProfile: {
      display_name: 'Victor',
      user_level: 'beginner',
      preferred_explanation_style: 'step_by_step',
      study_goals: ['javascript'],
      response_language: 'pt-BR',
      response_tone: 'didactic',
      updated_at: now
    },
    persisted_memory_summary: '',
    persisted_memory_highlights: [],
    intermediateThought: {
      primary: 'resolver erro',
      secondary: null,
      confidence: 0.7
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
    }
  }
}

test.beforeEach(() => {
  resetGlobalIntentState()
})

test('deriveHeuristicIntent maps vscode/code to technical_focus', () => {
  const candidate = deriveHeuristicIntent({
    semanticState: makeSnapshot().semanticState,
    sessionMemory: makeSnapshot().sessionMemory,
    previous: null,
    recentContext: [],
    connectors: { vscode: true, spotify: false, tradingview: false },
    appSwitchDetected: false,
    explicitOperatorMode: false,
    idleHint: false
  })

  assert.equal(candidate.mode, 'technical_focus')
})

test('deriveHeuristicIntent maps tradingview/operator to decision', () => {
  const candidate = deriveHeuristicIntent({
    semanticState: makeSnapshot({
      semanticState: {
        surface_type: 'graphic',
        app_identifier: 'TradingView'
      }
    }).semanticState,
    sessionMemory: makeSnapshot().sessionMemory,
    previous: null,
    recentContext: [],
    connectors: { vscode: false, spotify: false, tradingview: true },
    appSwitchDetected: true,
    explicitOperatorMode: true,
    idleHint: false
  })

  assert.equal(candidate.mode, 'decision')
})

test('deriveHeuristicIntent maps spotify idle session to light', () => {
  const candidate = deriveHeuristicIntent({
    semanticState: makeSnapshot({
      semanticState: {
        surface_type: 'text',
        app_identifier: 'Spotify',
        change_summary: 'none'
      }
    }).semanticState,
    sessionMemory: makeSnapshot().sessionMemory,
    previous: null,
    recentContext: [],
    connectors: { vscode: false, spotify: true, tradingview: false },
    appSwitchDetected: false,
    explicitOperatorMode: false,
    idleHint: true
  })

  assert.equal(candidate.mode, 'light')
})

test('deriveHeuristicIntent maps document reading to study', () => {
  const candidate = deriveHeuristicIntent({
    semanticState: makeSnapshot({
      semanticState: {
        surface_type: 'document',
        app_identifier: 'Chrome',
        probable_user_focus: 'artigo tecnico aberto'
      }
    }).semanticState,
    sessionMemory: makeSnapshot().sessionMemory,
    previous: null,
    recentContext: [],
    connectors: { vscode: false, spotify: false, tradingview: false },
    appSwitchDetected: false,
    explicitOperatorMode: false,
    idleHint: true
  })

  assert.equal(candidate.mode, 'study')
})

test('resolveGlobalIntent keeps previous mode when classifier fails', async () => {
  const snapshot = makeSnapshot()

  const first = await resolveGlobalIntent(snapshot, {
    classify: async () => ({
      mode: 'technical_focus',
      confidence: 0.88,
      reason: 'codigo visivel',
      evidence: ['codigo']
    })
  })

  const second = await resolveGlobalIntent(snapshot, {
    classify: async () => null
  })

  assert.equal(first.mode, 'technical_focus')
  assert.equal(second.mode, 'technical_focus')
})

test('resolveGlobalIntent hysteresis blocks single low-confidence switch', async () => {
  const snapshot = makeSnapshot()

  await resolveGlobalIntent(snapshot, {
    classify: async () => ({
      mode: 'technical_focus',
      confidence: 0.87,
      reason: 'codigo',
      evidence: ['codigo']
    })
  })

  const switched = await resolveGlobalIntent(
    makeSnapshot({
      semanticState: {
        surface_type: 'document',
        app_identifier: 'Chrome',
        probable_user_focus: 'documentacao aberta'
      }
    }),
    {
      classify: async () => ({
        mode: 'study',
        confidence: 0.49,
        reason: 'talvez leitura',
        evidence: ['texto']
      })
    }
  )

  assert.equal(switched.mode, 'technical_focus')
  assert.equal(switched.candidateMode, 'study')
  assert.equal(switched.stabilityState, 'holding')
})

test('resolveGlobalIntent accepts repeated candidate after confirmation window', async () => {
  await resolveGlobalIntent(makeSnapshot(), {
    classify: async () => ({
      mode: 'technical_focus',
      confidence: 0.87,
      reason: 'codigo',
      evidence: ['codigo']
    })
  })

  const studySnapshot = makeSnapshot({
    semanticState: {
      surface_type: 'document',
      app_identifier: 'Chrome',
      probable_user_focus: 'apostila e explicacao teorica'
    }
  })

  await resolveGlobalIntent(studySnapshot, {
    classify: async () => ({
      mode: 'study',
      confidence: 0.69,
      reason: 'leitura consistente',
      evidence: ['documento']
    })
  })
  const confirmed = await resolveGlobalIntent(studySnapshot, {
    classify: async () => ({
      mode: 'study',
      confidence: 0.71,
      reason: 'leitura consistente',
      evidence: ['documento']
    })
  })

  assert.equal(confirmed.mode, 'study')
  assert.equal(confirmed.stabilityState, 'switching')
})

test('resolveGlobalIntent allows immediate app-switch into decision mode', async () => {
  await resolveGlobalIntent(makeSnapshot(), {
    classify: async () => ({
      mode: 'technical_focus',
      confidence: 0.86,
      reason: 'codigo',
      evidence: ['codigo']
    })
  })

  const switched = await resolveGlobalIntent(
    makeSnapshot({
      semanticState: {
        surface_type: 'graphic',
        app_identifier: 'TradingView',
        probable_user_focus: 'grafico e candles'
      }
    }),
    {
      appSwitchDetected: true,
      explicitOperatorMode: true,
      classify: async () => ({
        mode: 'decision',
        confidence: 0.81,
        reason: 'tradingview aberto',
        evidence: ['grafico']
      })
    }
  )

  assert.equal(switched.mode, 'decision')
  assert.equal(switched.stabilityState, 'switching')
})
