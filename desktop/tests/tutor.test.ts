import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRemoteSystemPrompt,
  buildRemoteUserPrompt,
  composeResponse
} from '../src/main/services/tutor-prompt.ts'
import type { PerceptionContextSnapshot, TutorMode, TutorRequest, UserProfile } from '../src/shared/perception.types.ts'

type ContextOverrides = Partial<Omit<PerceptionContextSnapshot, 'semanticState' | 'sessionMemory' | 'userProfile'>> & {
  semanticState?: Partial<PerceptionContextSnapshot['semanticState']>
  sessionMemory?: Partial<PerceptionContextSnapshot['sessionMemory']>
  userProfile?: Partial<UserProfile>
}

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

function makeContext(overrides: ContextOverrides = {}): PerceptionContextSnapshot {
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
      uncertainty: 0.22,
      capturedAt: 100_000
    },
    sessionMemory: {
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
      recent_states: []
    },
    globalIntent: {
      mode: 'technical_focus',
      confidence: 0.84,
      reason: 'editor ativo com erro visivel',
      evidence: ['superficie de codigo', 'erro em destaque'],
      candidateMode: 'technical_focus',
      updatedAt: 100_000,
      stabilityState: 'stable'
    },
    userProfile: makeProfile(),
    persisted_memory_summary: 'Perfil Victor · beginner · step_by_step · didactic. 3 memorias prontas para reutilizacao.',
    persisted_memory_highlights: ['Objetivo de estudo: javascript.', 'Estilo preferido: step_by_step.'],
    intermediateThought: {
      primary: 'ele está tentando resolver esse código, mas alguma chamada está quebrando nessa função',
      secondary: 'deve fechar quando alinhar o valor recebido com a função que deveria existir ali',
      confidence: 0.78
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

function makeRequest(prompt = 'o que esta acontecendo aqui?'): TutorRequest {
  return {
    prompt,
    conversation: []
  }
}

test('buildRemoteSystemPrompt contains personality modules in fixed order', () => {
  const system = buildRemoteSystemPrompt('step_by_step', makeContext(), null)

  const personaIndex = system.indexOf('[PersonaCore]')
  const executiveIndex = system.indexOf('[Executive]')
  const strategistIndex = system.indexOf('[Strategist]')
  const professorIndex = system.indexOf('[Professor]')
  const modeIndex = system.indexOf('[ModeContract]')
  const safetyIndex = system.indexOf('[Safety/Uncertainty]')

  assert.ok(personaIndex >= 0)
  assert.ok(executiveIndex > personaIndex)
  assert.ok(professorIndex > executiveIndex)
  assert.ok(modeIndex > professorIndex)
  assert.ok(safetyIndex > modeIndex)
  assert.ok(strategistIndex > safetyIndex)
})

test('buildRemoteSystemPrompt adapts uncertainty and tone directives', () => {
  const advancedTechnical = makeContext({
    semanticState: { uncertainty: 0.74 },
    userProfile: makeProfile({
      user_level: 'advanced',
      preferred_explanation_style: 'summary',
      response_tone: 'technical'
    })
  })

  const system = buildRemoteSystemPrompt('summary', advancedTechnical, 'alto risco')

  assert.match(system, /High uncertainty:/)
  assert.match(system, /Move quickly to mechanism, trade-offs, and implications/)
  assert.match(system, /Increase conceptual density and precision/)
  assert.match(system, /Safety warning to respect: alto risco\./)
  assert.match(system, /First line = the answer or stance\. Always\./)
  assert.match(system, /Structure: key point/)
  assert.match(system, /\[GlobalIntent\]/)
  assert.match(system, /Current global mode: technical_focus\./)
  assert.match(system, /Think like Steven Pinker on explanation/)
})

test('buildRemoteSystemPrompt adds market voice for chart contexts', () => {
  const marketContext = makeContext({
    semanticState: {
      surface_type: 'graphic',
      visual_summary: 'grafico do xauusd em consolidacao lateral',
      probable_user_focus: 'preco preso em range curto perto da resistencia',
      pedagogical_topics: ['volume', 'rompimento', 'range'],
      detected_text: 'XAUUSD volume candles 4.680'
    }
  })

  const system = buildRemoteSystemPrompt('direct', marketContext, null)

  assert.match(system, /\[MarketVoice\]/)
  assert.match(system, /You are reading the chart LIVE with the user/)
  assert.match(system, /Open with the stance in one short punchy line/)
  assert.match(system, /GOOD example:/)
})

test('buildRemoteUserPrompt reinforces main read and next step', () => {
  const prompt = buildRemoteUserPrompt(
    makeRequest(),
    makeContext(),
    'foco em diagnostico',
    ['Prefere respostas naturais e menos estruturadas.']
  )

  assert.match(prompt, /Open with the main reading or recommendation first\./)
  assert.match(prompt, /Prioritize the next useful step before extra detail\./)
  assert.match(prompt, /Prefer natural transitions over visible section labels\./)
  assert.match(prompt, /Domain guidance: foco em diagnostico/)
  assert.match(prompt, /Global intent mode: technical_focus/)
  assert.match(prompt, /Global intent guidance: Be objective, prioritize error, cause, fix, and the next technical action\./)
  assert.match(prompt, /Persistent memory: Perfil Victor/)
  assert.match(prompt, /Memory highlights: Objetivo de estudo: javascript\./)
  assert.match(prompt, /Relevant persistent memory: Prefere respostas naturais e menos estruturadas\./)
})

test('composeResponse starts with main read and next step for step_by_step beginner', () => {
  const content = composeResponse({
    mode: 'step_by_step',
    context: makeContext(),
    shouldAskConfirmation: false,
    warning: null,
    domainBody: null
  })

  const lines = content.split('\n')
  assert.equal(lines[0], 'editor de codigo com erro TypeError em destaque.')
  assert.doesNotMatch(content, /Tese principal:/)
  assert.match(content, /Primeiro fixe o elemento central:/)
  assert.match(content, /Vou priorizar vocabulário simples/)
})

test('composeResponse keeps summary mode assertive for advanced users', () => {
  const context = makeContext({
    userProfile: makeProfile({
      user_level: 'advanced',
      preferred_explanation_style: 'summary',
      response_tone: 'technical'
    })
  })

  const content = composeResponse({
    mode: 'summary',
    context,
    shouldAskConfirmation: false,
    warning: null,
    domainBody: null
  })

  assert.match(content, /^editor de codigo com erro TypeError em destaque\./)
  assert.match(content, /O centro da leitura aqui é/)
  assert.match(content, /Na prática, vale validar/)
  assert.match(content, /Posso ir direto para nuances, tradeoffs e implicações\./)
})

test('composeResponse marks uncertainty without collapsing when context is ambiguous', () => {
  const context = makeContext({
    semanticState: {
      uncertainty: 0.78,
      surface_type: 'unknown',
      visual_summary: 'painel parcialmente visivel com contexto incompleto'
    }
  })

  const content = composeResponse({
    mode: 'direct',
    context,
    shouldAskConfirmation: true,
    warning: null,
    domainBody: null
  })

  assert.match(content, /^painel parcialmente visivel com contexto incompleto\./)
  assert.doesNotMatch(content, /nao consigo ver/i)
  assert.match(content, /Confirma se estou olhando para a área certa da tela\./)
})

test('composeResponse diagnostic mode handles ambiguous user references with a focused question', () => {
  const content = composeResponse({
    mode: 'diagnostic',
    context: makeContext(),
    shouldAskConfirmation: true,
    warning: null,
    domainBody: null
  })

  assert.match(content, /Antes de aprofundar, quero confirmar se/)
  assert.match(content, /Se você tivesse que nomear o conceito dominante/)
  assert.match(content, /Responda em uma frase e eu calibro a explicação\./)
})

test('composeResponse prefers provided domain body for fallback output', () => {
  const domainBody = 'Diagnostico rapido: o erro principal esta na chamada do metodo sem validacao previa.'
  const content = composeResponse({
    mode: 'direct' as TutorMode,
    context: makeContext(),
    shouldAskConfirmation: false,
    warning: null,
    domainBody
  })

  assert.match(content, /^editor de codigo com erro TypeError em destaque\./)
  assert.match(content, /Diagnostico rapido: o erro principal esta na chamada do metodo sem validacao previa\./)
})
