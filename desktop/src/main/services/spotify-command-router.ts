import type {
  SpotifyActionPayload,
  SpotifyCommandResult,
  SpotifyEntityType,
  TutorAction,
  TutorResponse
} from '../../shared/perception.types.ts'
import { codexAuth, codexClient } from '../auth/codex-singleton.ts'
import { generateRemoteText } from './ai-provider.ts'
import type {
  SpotifyPlaybackState,
  SpotifyQueryResolution,
  SpotifySearchCandidate
} from './spotify.ts'

type SpotifyIntent =
  | { kind: 'play_query'; query: string; preferredType?: SpotifyEntityType }
  | { kind: 'resume' }
  | { kind: 'pause' }
  | { kind: 'toggle' }
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'what_is_playing' }

export interface SpotifyCommandDependencies {
  isAuthenticated(): boolean
  getState(): SpotifyPlaybackState | null
  executeAction(payload: SpotifyActionPayload): Promise<SpotifyCommandResult>
  resolvePlaybackQuery(query: string, preferredType?: SpotifyEntityType): Promise<SpotifyQueryResolution>
}

export function parseSpotifyIntent(rawPrompt: string): SpotifyIntent | null {
  const prompt = normalizePrompt(rawPrompt)
  if (!prompt) return null

  // ── O que tá tocando ────────────────────────────────────────────
  if (
    /\b(o que (ta|esta) tocando|qual (musica|faixa|song) (ta|esta|e)|que musica (ta|esta|e|toca)|o que e essa musica)\b/.test(prompt) ||
    /^(o que ta tocando|qual faixa)$/.test(prompt)
  ) {
    return { kind: 'what_is_playing' }
  }

  // ── Próxima ─────────────────────────────────────────────────────
  if (
    /^(proxima|proximo|next|skip)( (faixa|musica|essa|isso))?$/.test(prompt) ||
    /^(pula|passa)( (essa|isso|a musica|a faixa|pra proxima))?$/.test(prompt) ||
    /^(muda|troca)( (a )?(musica|faixa))?$/.test(prompt) ||
    /^(bota|coloca|poe) outra( musica| faixa)?$/.test(prompt) ||
    /^(quero|manda) outra( musica| faixa)?$/.test(prompt) ||
    /\b(skip|pula essa|passa essa|proxima faixa|vai pra proxima|muda a musica|troca a musica|troca de musica)\b/.test(prompt)
  ) {
    return { kind: 'next' }
  }

  // ── Anterior ────────────────────────────────────────────────────
  if (
    /^(volta|anterior|previous|prev)( (faixa|musica))?$/.test(prompt) ||
    /^(musica|faixa) anterior$/.test(prompt) ||
    /\b(volta (a|pra) (anterior|faixa anterior|musica anterior))\b/.test(prompt)
  ) {
    return { kind: 'previous' }
  }

  // ── Pausar ──────────────────────────────────────────────────────
  if (
    /^(pausa|pause|parar?|silencia)( (a |a musica|a faixa|isso))?$/.test(prompt) ||
    (/\b(pausa|pause)\b/.test(prompt) && !/\b(toca|coloca|bota|quero ouvir)\b/.test(prompt)) ||
    /\bpara de tocar\b/.test(prompt) ||
    /\bdesliga (a musica|o spotify)\b/.test(prompt)
  ) {
    return { kind: 'pause' }
  }

  // ── Retomar ─────────────────────────────────────────────────────
  if (
    /^(continua|continue|retoma|retomar|volta a tocar|play|toca de novo|resume)$/.test(prompt) ||
    /\b(continua (tocando|a musica)|retoma (a musica|o spotify))\b/.test(prompt)
  ) {
    return { kind: 'resume' }
  }

  // ── Toggle ──────────────────────────────────────────────────────
  if (/^(toca ou pausa|toggle|pausar ou continuar)$/.test(prompt)) {
    return { kind: 'toggle' }
  }

  // ── Play query ──────────────────────────────────────────────────
  const playMatch = /\b(toca|coloca|poe|bota|manda tocar|quero ouvir|pesquisa|busca|abre|roda)\s+(.+)$/.exec(prompt)
  if (!playMatch) return null

  let query = playMatch[2].trim()
  let preferredType: SpotifyEntityType | undefined

  const explicitTypePatterns: Array<{ type: SpotifyEntityType; pattern: RegExp }> = [
    { type: 'playlist', pattern: /^(a\s+)?playlist\s+(.+)$/ },
    { type: 'album', pattern: /^(o\s+)?album\s+(.+)$/ },
    { type: 'artist', pattern: /^(o\s+)?artista\s+(.+)$/ },
    { type: 'track', pattern: /^(a\s+)?(musica|faixa)\s+(.+)$/ }
  ]

  for (const entry of explicitTypePatterns) {
    const match = entry.pattern.exec(query)
    if (match) {
      preferredType = entry.type
      query = match[match.length - 1].trim()
      break
    }
  }

  // Remove preposições iniciais: "do", "da", "de", "um", "uma", "algo de"
  query = query.replace(/^(algo de|um pouco de|um|uma|o|a)\s+/, '').replace(/^(do|da|de)\s+/, '').trim()
  if (!query) return null

  return { kind: 'play_query', query, preferredType }
}

export async function maybeHandleSpotifyTutorRequest(
  prompt: string,
  deps?: SpotifyCommandDependencies
): Promise<TutorResponse | null> {
  const effectiveDeps = deps ?? await getDefaultSpotifyDeps()
  const intent = parseSpotifyIntent(prompt) ?? await maybeInferSpotifyIntentWithLLM(prompt, effectiveDeps)
  if (!intent) {
    if (looksLikeSpotifyControlPrompt(prompt, effectiveDeps.isAuthenticated())) {
      return createSpotifyTutorResponse(
        'Se a ideia é controlar o Spotify, eu consigo fazer isso localmente. Tenta algo como "próxima", "pausa", "continua" ou "toca [nome]".',
        effectiveDeps.getState(),
        undefined,
        buildFollowUps(effectiveDeps.getState())
      )
    }
    return null
  }

  if (!effectiveDeps.isAuthenticated()) {
    return createSpotifyTutorResponse('Conecta o Spotify primeiro para eu conseguir controlar a reprodução.', null, undefined, [
      'Conectar Spotify',
      'O que dá pra controlar?'
    ])
  }

  switch (intent.kind) {
    case 'resume':
      return fromCommandResult(await effectiveDeps.executeAction({ action: 'resume' }))
    case 'pause':
      return fromCommandResult(await effectiveDeps.executeAction({ action: 'pause' }))
    case 'next':
      return fromCommandResult(await effectiveDeps.executeAction({ action: 'next' }))
    case 'previous':
      return fromCommandResult(await effectiveDeps.executeAction({ action: 'prev' }))
    case 'toggle': {
      const action = effectiveDeps.getState()?.isPlaying ? 'pause' : 'resume'
      return fromCommandResult(await effectiveDeps.executeAction({ action }))
    }
    case 'what_is_playing':
      return fromCommandResult(await effectiveDeps.executeAction({ action: 'report_state' }))
    case 'play_query':
      return handlePlayQuery(intent.query, intent.preferredType, effectiveDeps)
  }
}

async function getDefaultSpotifyDeps(): Promise<SpotifyCommandDependencies> {
  const mod = await import('./spotify.ts')
  return mod.spotifyService
}

function normalizePrompt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!?.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeSpotifyControlPrompt(rawPrompt: string, isAuthenticated: boolean): boolean {
  if (!isAuthenticated) return false

  const prompt = normalizePrompt(rawPrompt)
  if (!prompt) return false

  const hasSpotifyContext = /\b(spotify|musica|faixa|album|playlist|artista|som)\b/.test(prompt)
  const hasControlVerb = /\b(muda|troca|pula|passa|pausa|continua|retoma|volta|skip|next|previous|play|toca|coloca|bota|quero ouvir|manda tocar|poe|solta|mete|deixa tocando)\b/.test(prompt)
  return hasSpotifyContext && hasControlVerb
}

async function maybeInferSpotifyIntentWithLLM(
  rawPrompt: string,
  deps: SpotifyCommandDependencies
): Promise<SpotifyIntent | null> {
  if (!deps.isAuthenticated()) return null
  if (!looksLikeSpotifyControlPrompt(rawPrompt, true)) return null

  const state = deps.getState()
  const prompt = [
    'Classifique este pedido de controle do Spotify.',
    'Responda apenas JSON válido.',
    'Formato:',
    '{"intent":"resume|pause|toggle|next|previous|what_is_playing|play_query|none","query":"...","preferredType":"track|artist|album|playlist|null"}',
    'Regras:',
    '- use "next" para pedidos como mudar música, trocar faixa, botar outra, passar, pular',
    '- use "previous" para voltar música',
    '- use "resume" para continuar, retomar, voltar a tocar',
    '- use "pause" para pausar, parar música, silenciar',
    '- use "what_is_playing" para perguntar o que está tocando',
    '- use "play_query" quando o usuário pedir algo específico para tocar, abrir, buscar ou pesquisar',
    '- use "none" se não for claramente um comando do Spotify',
    `Faixa atual: ${state?.trackName ?? 'nenhuma'}`,
    `Artista atual: ${state?.artistName ?? 'nenhum'}`,
    `Álbum atual: ${state?.albumName ?? 'nenhum'}`,
    `Está tocando: ${state?.isPlaying ? 'sim' : 'não'}`,
    `Pedido: ${rawPrompt}`
  ].join('\n')

  let raw: string | null = null

  try {
    if (codexAuth.getStatus().authenticated) {
      raw = await codexClient.chat({
        model: 'codex-mini-latest',
        messages: [{ role: 'user', content: prompt }]
      })
    } else {
      const result = await generateRemoteText({
        sensitive: false,
        system: 'Você classifica comandos do Spotify em JSON estrito.',
        prompt
      })
      raw = result?.text ?? null
    }
  } catch {
    raw = null
  }

  if (!raw) return null

  return parseLLMSpotifyIntent(raw)
}

function parseLLMSpotifyIntent(raw: string): SpotifyIntent | null {
  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonText) return null

  try {
    const parsed = JSON.parse(jsonText) as {
      intent?: string
      query?: string | null
      preferredType?: SpotifyEntityType | null
    }

    switch (parsed.intent) {
      case 'resume':
      case 'pause':
      case 'toggle':
      case 'next':
      case 'previous':
      case 'what_is_playing':
        return { kind: parsed.intent }
      case 'play_query': {
        const query = typeof parsed.query === 'string' ? parsed.query.trim() : ''
        if (!query) return null
        return {
          kind: 'play_query',
          query,
          preferredType: isSpotifyEntityType(parsed.preferredType) ? parsed.preferredType : undefined
        }
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

function isSpotifyEntityType(value: unknown): value is SpotifyEntityType {
  return value === 'track' || value === 'artist' || value === 'album' || value === 'playlist'
}

async function handlePlayQuery(
  query: string,
  preferredType: SpotifyEntityType | undefined,
  deps: SpotifyCommandDependencies
): Promise<TutorResponse> {
  const resolution = await deps.resolvePlaybackQuery(query, preferredType)

  if (resolution.kind === 'none') {
    return createSpotifyTutorResponse(
      `Nao achei um resultado forte para "${query}" no Spotify.`,
      deps.getState(),
      undefined,
      ['Tenta outro nome', 'O que tá tocando?']
    )
  }

  if (resolution.kind === 'multiple') {
    return createSpotifyTutorResponse(
      `Achei algumas opcoes para "${query}". Escolhe uma:`,
      deps.getState(),
      resolution.candidates.map(candidate => candidateToAction(candidate, query)),
      ['Tenta outro nome', 'O que tá tocando?']
    )
  }

  const result = await deps.executeAction({
    action: 'play_uri',
    uri: resolution.candidate.uri,
    entityType: resolution.candidate.type,
    query
  })

  const fallback = `${describeCandidate(resolution.candidate)}.`
  return fromCommandResult(result, fallback)
}

function candidateToAction(candidate: SpotifySearchCandidate, query: string): TutorAction {
  return {
    id: `spotify:${candidate.type}:${candidate.uri}`,
    label: buildCandidateLabel(candidate),
    kind: 'spotify',
    payload: {
      action: 'play_uri',
      uri: candidate.uri,
      entityType: candidate.type,
      query
    }
  }
}

function buildCandidateLabel(candidate: SpotifySearchCandidate): string {
  const prefixMap: Record<SpotifyEntityType, string> = {
    track: 'Faixa',
    artist: 'Artista',
    album: 'Álbum',
    playlist: 'Playlist'
  }

  return candidate.subtitle
    ? `${prefixMap[candidate.type]}: ${candidate.name} — ${candidate.subtitle}`
    : `${prefixMap[candidate.type]}: ${candidate.name}`
}

function describeCandidate(candidate: SpotifySearchCandidate): string {
  const nounMap: Record<SpotifyEntityType, string> = {
    track: 'Tocando',
    artist: 'Tocando artista',
    album: 'Tocando álbum',
    playlist: 'Tocando playlist'
  }

  return candidate.subtitle
    ? `${nounMap[candidate.type]} ${candidate.name} — ${candidate.subtitle}`
    : `${nounMap[candidate.type]} ${candidate.name}`
}

function fromCommandResult(result: SpotifyCommandResult, fallbackMessage?: string): TutorResponse {
  const message = result.ok ? fallbackMessage ?? result.message : result.message
  return createSpotifyTutorResponse(message, result.state, undefined, buildFollowUps(result.state))
}

function createSpotifyTutorResponse(
  content: string,
  state: SpotifyPlaybackState | null,
  actions?: TutorAction[],
  suggested_follow_ups: string[] = buildFollowUps(state)
): TutorResponse {
  return {
    domain: 'general',
    mode: 'direct',
    content,
    provider: 'spotify-local',
    model: 'spotify-local',
    uncertainty: 0,
    should_ask_confirmation: false,
    needs_visual_confirmation: false,
    suggested_follow_ups,
    warning: null,
    actions
  }
}

function buildFollowUps(state: SpotifyPlaybackState | null): string[] {
  if (!state?.trackName) {
    return ['Toca alguma coisa', 'O que tá tocando?']
  }

  const followUps = new Set<string>()
  followUps.add(state.isPlaying ? 'Pausar' : 'Continuar')
  followUps.add('Próxima')
  if (state.albumName) followUps.add(`Toca o álbum ${state.albumName}`)
  followUps.add('O que tá tocando?')
  return [...followUps].slice(0, 4)
}
