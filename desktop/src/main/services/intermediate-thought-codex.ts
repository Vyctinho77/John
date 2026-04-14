import { codexAuth, codexClient } from '../auth/codex-singleton'
import type {
  IntermediateThought,
  SemanticState,
  SessionMemory
} from '../../shared/perception.types'

interface IntermediateThoughtCodexInput {
  semanticState: SemanticState
  sessionMemory: SessionMemory
  persistedMemoryHighlights?: string[]
  heuristicThought: IntermediateThought
}

interface CacheEntry {
  expiresAt: number
  thought: IntermediateThought | null
}

const SUCCESS_TTL_MS = 45_000
const FAILURE_TTL_MS = 5_000
const REQUEST_TIMEOUT_MS = 7_000
const PRIMARY_MAX_CHARS = 160
const SECONDARY_MAX_CHARS = 190

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<IntermediateThought | null>>()

export async function maybeRefineIntermediateThoughtWithCodex(
  input: IntermediateThoughtCodexInput
): Promise<IntermediateThought | null> {
  if (!codexAuth.getStatus().authenticated) return null
  if (input.semanticState.capture_policy !== 'allowed') return null
  if (input.heuristicThought.confidence < 0.42) return null

  const key = buildFingerprint(input)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.thought
  }

  const running = inFlight.get(key)
  if (running) return running

  const task = requestCodexThought(input)
    .then(thought => {
      cache.set(key, {
        expiresAt: Date.now() + (thought ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
        thought
      })
      return thought
    })
    .catch(() => {
      cache.set(key, { expiresAt: Date.now() + FAILURE_TTL_MS, thought: null })
      return null
    })
    .finally(() => {
      inFlight.delete(key)
    })

  inFlight.set(key, task)
  return task
}

async function requestCodexThought(
  input: IntermediateThoughtCodexInput
): Promise<IntermediateThought | null> {
  const response = await withTimeout(
    codexClient.chat({
      messages: [
        {
          role: 'system',
          content: [
            'Você escreve o pensamento interno do estágio 2 do John.',
            'Responda apenas JSON válido, sem markdown e sem comentários.',
            'Use este formato: {"primary":"...","secondary":"..."}',
            'Regras:',
            '- português natural e conciso',
            '- soar humano e variado, sem frases feitas repetidas',
            '- usar apenas os fatos fornecidos',
            '- nunca inventar intenção, erro ou contexto não citado',
            '- primary com até 150 caracteres',
            '- secondary com até 180 caracteres ou null',
            '- não mencionar "heurística", "json", "modelo", "captura" ou "LLM"',
            '- não usar listas, aspas decorativas ou markdown'
          ].join('\n')
        },
        {
          role: 'user',
          content: buildPrompt(input)
        }
      ],
      model: 'codex-mini-latest'
    }),
    REQUEST_TIMEOUT_MS
  )

  return parseThought(response, input.heuristicThought.confidence)
}

function buildPrompt(input: IntermediateThoughtCodexInput): string {
  const { semanticState, sessionMemory, persistedMemoryHighlights, heuristicThought } = input
  const recentFocus = sessionMemory.recent_states
    .slice(-3)
    .map(entry => `${entry.surface_type}:${trim(entry.probable_user_focus, 70)}`)
    .join(' | ')

  const lines = [
    `surface_type: ${semanticState.surface_type}`,
    `visual_summary: ${trim(semanticState.visual_summary, 180)}`,
    `detected_text: ${trim(semanticState.detected_text, 180)}`,
    `focus_region: ${semanticState.focus_region}`,
    `probable_user_focus: ${trim(semanticState.probable_user_focus, 140)}`,
    `inferred_intent: ${trim(semanticState.inferred_intent, 120)}`,
    `change_summary: ${semanticState.change_summary}`,
    `topics: ${semanticState.pedagogical_topics.join(', ') || 'none'}`,
    `app_identifier: ${semanticState.app_identifier ?? 'unknown'}`,
    `emotional_signal: ${semanticState.emotional_signal ?? 'unknown'}`,
    `session_continuity: ${trim(sessionMemory.continuity_summary, 150)}`,
    `recent_focus: ${recentFocus || 'none'}`,
    `memory_highlights: ${(persistedMemoryHighlights ?? []).slice(0, 3).map(item => trim(item, 80)).join(' | ') || 'none'}`,
    `heuristic_primary: ${trim(heuristicThought.primary, 120)}`,
    `heuristic_secondary: ${trim(heuristicThought.secondary ?? 'none', 120)}`
  ]

  if (semanticState.code_context) {
    lines.push(
      `code_file: ${semanticState.code_context.file_name ?? 'unknown'}`,
      `code_language: ${semanticState.code_context.language ?? 'unknown'}`,
      `code_scope: ${semanticState.code_context.active_function ?? 'unknown'}`,
      `code_errors: ${semanticState.code_context.errors.slice(0, 2).map(error => trim(error.message, 80)).join(' | ') || 'none'}`
    )
  }

  return lines.join('\n')
}

function parseThought(raw: string, confidence: number): IntermediateThought | null {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonText) return null

  try {
    const parsed = JSON.parse(jsonText) as { primary?: unknown; secondary?: unknown }
    const primary = sanitizeLine(parsed.primary, PRIMARY_MAX_CHARS)
    const secondary = parsed.secondary === null ? null : sanitizeLine(parsed.secondary, SECONDARY_MAX_CHARS)

    if (!primary) return null

    return {
      primary,
      secondary,
      confidence
    }
  } catch {
    return null
  }
}

function sanitizeLine(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = smartTrim(
    value
      .replace(/\s+/g, ' ')
      .replace(/^[-•]\s*/, '')
      .trim(),
    maxChars
  )

  return normalized || null
}

function buildFingerprint(input: IntermediateThoughtCodexInput): string {
  const { semanticState, sessionMemory, heuristicThought } = input
  const recent = sessionMemory.recent_states
    .slice(-2)
    .map(entry => `${entry.surface_type}:${trim(entry.probable_user_focus, 60)}`)
    .join('|')

  return [
    semanticState.surface_type,
    semanticState.change_summary,
    trim(semanticState.visual_summary, 120),
    trim(semanticState.probable_user_focus, 120),
    trim(semanticState.inferred_intent, 120),
    semanticState.app_identifier ?? '',
    recent,
    trim(heuristicThought.primary, 120),
    trim(heuristicThought.secondary ?? '', 120)
  ].join('||')
}

function trim(value: string, max: number): string {
  return smartTrim(value.replace(/\s+/g, ' ').trim(), max)
}

function smartTrim(value: string, max: number): string {
  if (value.length <= max) return value

  const sliced = value.slice(0, max + 1)
  const boundary = sliced.search(/\s+\S*$/)
  if (boundary > Math.floor(max * 0.65)) {
    return sliced.slice(0, boundary).trim()
  }

  return value.slice(0, max).trim()
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Codex thought timeout')), timeoutMs)
      })
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
