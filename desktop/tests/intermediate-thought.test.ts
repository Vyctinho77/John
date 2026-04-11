import test from 'node:test'
import assert from 'node:assert/strict'
import { buildIntermediateThought } from '../src/main/services/intermediate-thought.ts'
import type { SemanticState, SessionMemory } from '../src/shared/perception.types.ts'

function makeState(overrides: Partial<SemanticState> = {}): SemanticState {
  return {
    detected_text: '',
    visual_summary: 'editor de código aberto',
    surface_type: 'code',
    change_summary: 'minor',
    focus_region: 'centro',
    probable_user_focus: 'código em centro: fetchData',
    inferred_intent: 'understand code on screen',
    pedagogical_topics: [],
    capture_policy: 'allowed',
    sensitivity_reason: null,
    uncertainty: 0.22,
    capturedAt: 100_000,
    ...overrides
  }
}

function makeSession(overrides: Partial<SessionMemory> = {}): SessionMemory {
  return {
    session_id: 'session-1',
    started_at: 90_000,
    updated_at: 100_000,
    expires_at: 160_000,
    frame_count: 4,
    continuity_summary: 'contexto no editor',
    incremental_summary: 'pequena mudança',
    probable_focus: 'fetchData',
    current_intent: 'understand code on screen',
    topic_candidates: [],
    recent_states: [],
    ...overrides
  }
}

// ─── Code: error signals ──────────────────────────────────────────────────────

test('code: TypeError leads with specific blocker', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({ detected_text: 'TypeError: fetchData is not a function' }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /tem um problema/)
  assert.match(t.primary, /quebrando nessa função/)
  assert.ok(t.secondary !== null)
  assert.match(t.secondary!, /o mais provável é que|alinhar o valor/)
})

test('code: TypeError includes file name when code_context available', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      detected_text: 'TypeError: map is not a function',
      code_context: {
        file_name: 'api.ts',
        file_path: '/src/api.ts',
        language: 'typescript',
        visible_line_range: '42-68',
        active_function: 'fetchData',
        errors: [],
        terminal_output: null,
        git_indicators: null,
        open_tabs: [],
        cursor_area: null
      }
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /api\.ts/)
  assert.match(t.primary, /fetchData/)
})

test('code: ReferenceError reported correctly', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({ detected_text: 'ReferenceError: foo is not defined' }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /antes de existir no escopo/)
})

test('code: failing tests in terminal trigger terminal branch', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      code_context: {
        file_name: 'api.test.ts',
        file_path: null,
        language: 'typescript',
        visible_line_range: null,
        active_function: null,
        errors: [],
        terminal_output: '● Tests failed: expected 3 received 5',
        git_indicators: null,
        open_tabs: [],
        cursor_area: null
      }
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /teste falhando/)
  assert.match(t.secondary ?? '', /expected.*received|diff/)
})

test('code: passing tests in terminal trigger positive signal', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      code_context: {
        file_name: null, file_path: null, language: null, visible_line_range: null,
        active_function: null, errors: [],
        terminal_output: '✓ All tests passed (12/12)',
        git_indicators: null, open_tabs: [], cursor_area: null
      }
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /testes passando/)
})

test('code: active function shown without error', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      code_context: {
        file_name: 'store.ts', file_path: '/src/store.ts', language: 'typescript',
        visible_line_range: '80-110',
        active_function: 'useCartStore',
        errors: [], terminal_output: null, git_indicators: null, open_tabs: [], cursor_area: null
      }
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /useCartStore/)
  assert.match(t.primary, /store\.ts/)
})

// ─── Graphic ──────────────────────────────────────────────────────────────────

test('graphic: key_values shown when available', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      surface_type: 'graphic',
      key_values: { 'RSI': '68.4', 'Volume': '1.2M' },
      pedagogical_topics: ['RSI', 'volume'],
      probable_user_focus: 'gráfico em centro: resistência'
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /RSI|Volume/)
})

test('graphic: falls back to visual_summary when no key_values', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      surface_type: 'graphic',
      visual_summary: 'XAUUSD em consolidação lateral perto da resistência',
      key_values: {},
      pedagogical_topics: ['resistência'],
      probable_user_focus: 'gráfico: resistência'
    }),
    sessionMemory: makeSession()
  })
  // compactSummary strips "Viewing" prefix and lowercases
  assert.match(t.primary, /xauusd|consolidação|resistência/)
})

// ─── Dashboard ────────────────────────────────────────────────────────────────

test('dashboard: shows key metrics with app name', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      surface_type: 'dashboard',
      app_identifier: 'Datadog',
      key_values: { 'p99': '320ms', 'errors': '0.4%' },
      probable_user_focus: 'painel: latência'
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /p99|errors/)
})

test('dashboard: falls back to app-aware description', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      surface_type: 'dashboard',
      app_identifier: 'Grafana',
      key_values: {},
      pedagogical_topics: ['CPU'],
      probable_user_focus: 'painel em centro: uso de CPU'
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /Grafana/)
})

// ─── Text / Document ──────────────────────────────────────────────────────────

test('text: leads with two topics when both available', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      surface_type: 'text',
      pedagogical_topics: ['resistência à insulina', 'síndrome metabólica'],
      visual_summary: 'artigo médico sobre resistência à insulina e síndrome metabólica',
      probable_user_focus: 'texto: diagnóstico'
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /resistência à insulina/)
  assert.match(t.primary, /síndrome metabólica/)
})

test('document: single topic with focus as secondary', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      surface_type: 'document',
      pedagogical_topics: ['machine learning'],
      visual_summary: 'documento sobre fundamentos de ML',
      probable_user_focus: 'documento: gradient descent'
    }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /machine learning|ponto central/)
  assert.match(t.secondary ?? '', /gradient descent|parte importante/)
})

// ─── Context shift ────────────────────────────────────────────────────────────

test('shift: major change in code produces shift thought', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      surface_type: 'code',
      change_summary: 'major',
      probable_user_focus: 'código: useAuth',
      inferred_intent: 'understand code on screen'
    }),
    sessionMemory: makeSession({
      recent_states: [
        {
          capturedAt: 91_000,
          surface_type: 'code',
          change_summary: 'minor',
          detected_text: '',
          visual_summary: 'code',
          probable_user_focus: 'código: useCart',
          inferred_intent: 'understand code on screen',
          uncertainty: 0.3
        },
        {
          capturedAt: 100_000,
          surface_type: 'code',
          change_summary: 'major',
          detected_text: '',
          visual_summary: 'code',
          probable_user_focus: 'código: useAuth',
          inferred_intent: 'understand code on screen',
          uncertainty: 0.22
        }
      ]
    })
  })
  assert.match(t.primary, /usecart|useauth|saiu de|pulou/)
})

// ─── Low confidence ───────────────────────────────────────────────────────────

test('shift: text change keeps only the current reading thought', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({
      surface_type: 'text',
      change_summary: 'minor',
      probable_user_focus: 'texto: grid rendering and voronoi transitions',
      inferred_intent: 'read the current text on screen',
      visual_summary: 'technical document about grid rendering and voronoi transitions'
    }),
    sessionMemory: makeSession({
      recent_states: [
        {
          capturedAt: 91_000,
          surface_type: 'text',
          change_summary: 'minor',
          detected_text: '',
          visual_summary: 'technical description of the glasswing v2 project',
          probable_user_focus: 'texto: technical description of the glasswing v2 project',
          inferred_intent: 'read the current text on screen',
          uncertainty: 0.3
        },
        {
          capturedAt: 100_000,
          surface_type: 'text',
          change_summary: 'minor',
          detected_text: '',
          visual_summary: 'technical document about grid rendering and voronoi transitions',
          probable_user_focus: 'texto: grid rendering and voronoi transitions',
          inferred_intent: 'read the current text on screen',
          uncertainty: 0.22
        }
      ]
    })
  })
  assert.equal(t.primary, 'tentando entender technical document about grid rendering and voronoi transitions')
  assert.equal(t.secondary, null)
})

test('low confidence: stays minimal and honest', () => {
  const t = buildIntermediateThought({
    semanticState: makeState({ uncertainty: 0.72, surface_type: 'unknown' }),
    sessionMemory: makeSession()
  })
  assert.match(t.primary, /calibrando|capturando/)
  assert.ok(t.confidence < 0.36)
})
