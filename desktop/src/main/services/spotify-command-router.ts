import type {
  SpotifyActionPayload,
  SpotifyCommandResult,
  SpotifyEntityType,
  TutorAction,
  TutorResponse
} from '../../shared/perception.types.ts'
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

  if (/^(proxima|proximo|pr[óo]xima|next|skip|pula)( faixa)?$/.test(prompt)) {
    return { kind: 'next' }
  }

  if (/^(volta|anterior|faixa anterior|previous|prev)$/.test(prompt)) {
    return { kind: 'previous' }
  }

  if (/^(pausa|pause|para( a musica)?|parar)$/.test(prompt)) {
    return { kind: 'pause' }
  }

  if (/^(continua|continue|retoma|retomar|volta a tocar|play)$/.test(prompt)) {
    return { kind: 'resume' }
  }

  if (/^(toca ou pausa|toggle)$/.test(prompt)) {
    return { kind: 'toggle' }
  }

  if (
    /^(o que ta tocando|o que esta tocando|qual musica ta tocando|qual musica esta tocando|que musica ta tocando|que musica esta tocando|que musica e essa|qual faixa ta tocando)$/.test(prompt)
  ) {
    return { kind: 'what_is_playing' }
  }

  const playMatch = /^(toca|coloca|poe|põe|bota|manda tocar|quero ouvir)\s+(.+)$/.exec(prompt)
  if (!playMatch) return null

  let query = playMatch[2].trim()
  let preferredType: SpotifyEntityType | undefined

  const explicitTypePatterns: Array<{ type: SpotifyEntityType; pattern: RegExp }> = [
    { type: 'playlist', pattern: /^(a\s+)?playlist\s+(.+)$/ },
    { type: 'album', pattern: /^(o\s+)?album\s+(.+)$/ },
    { type: 'artist', pattern: /^(o\s+)?artista\s+(.+)$/ },
    { type: 'track', pattern: /^((a|a)\s+)?(musica|música|faixa)\s+(.+)$/ }
  ]

  for (const entry of explicitTypePatterns) {
    const match = entry.pattern.exec(query)
    if (match) {
      preferredType = entry.type
      query = match[match.length - 1].trim()
      break
    }
  }

  query = query.replace(/^(do|da|de)\s+/, '').trim()
  if (!query) return null

  return { kind: 'play_query', query, preferredType }
}

export async function maybeHandleSpotifyTutorRequest(
  prompt: string,
  deps?: SpotifyCommandDependencies
): Promise<TutorResponse | null> {
  const effectiveDeps = deps ?? await getDefaultSpotifyDeps()
  const intent = parseSpotifyIntent(prompt)
  if (!intent) return null

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
