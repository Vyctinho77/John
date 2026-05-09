import { app, shell } from 'electron'
import { createHash, randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type {
  SpotifyActionPayload,
  SpotifyCommandResult,
  SpotifyEntityType
} from '../../shared/perception.types'

interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  clientId: string
}

export interface SpotifyPlaybackState {
  isPlaying: boolean
  trackName: string | null
  artistName: string | null
  albumName: string | null
  albumArtUrl: string | null
  progressMs: number
  durationMs: number
  shuffle: boolean
  repeat: 'off' | 'track' | 'context'
  deviceName: string | null
  volumePercent: number | null
}

export interface SpotifySearchCandidate {
  uri: string
  type: SpotifyEntityType
  name: string
  subtitle: string
  imageUrl: string | null
  popularity: number
  score: number
}

export type SpotifyQueryResolution =
  | { kind: 'single'; candidate: SpotifySearchCandidate }
  | { kind: 'multiple'; candidates: SpotifySearchCandidate[] }
  | { kind: 'none' }

type SpotifyApiErrorCode =
  | 'not_authenticated'
  | 'no_active_device'
  | 'forbidden'
  | 'rate_limited'
  | 'not_found'
  | 'invalid_action'
  | 'unknown'

class SpotifyApiError extends Error {
  code: SpotifyApiErrorCode
  retryAfterMs?: number

  constructor(code: SpotifyApiErrorCode, message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'SpotifyApiError'
    this.code = code
    this.retryAfterMs = retryAfterMs
  }
}

const REDIRECT_URI = 'http://127.0.0.1:42002/callback'
const AUTH_CALLBACK_PORT = 42002
const SCOPES = 'user-read-playback-state user-modify-playback-state'
const TOKEN_FILE = () => join(app.getPath('userData'), 'ares-spotify-tokens.json')
const POLL_PLAYING_MS = 5_000
const POLL_PAUSED_MS = 15_000
const SEARCH_CACHE_TTL_MS = 8_000

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export class SpotifyService {
  private tokens: SpotifyTokens | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private currentState: SpotifyPlaybackState | null = null
  private retryAfterMs = 0
  private searchCache = new Map<string, { expiresAt: number; items: SpotifySearchCandidate[] }>()

  private _onState: ((s: SpotifyPlaybackState | null) => void) | null = null
  private _onAuth: ((connected: boolean) => void) | null = null

  constructor() {
    this.loadTokens()
  }

  onStateChange(cb: (s: SpotifyPlaybackState | null) => void): void {
    this._onState = cb
  }

  onAuthChange(cb: (connected: boolean) => void): void {
    this._onAuth = cb
  }

  async startAuth(clientId: string): Promise<void> {
    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallenge(verifier)
    const state = randomBytes(8).toString('hex')

    const code = await new Promise<string>((resolve, reject) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${AUTH_CALLBACK_PORT}`)
        if (url.pathname !== '/callback') return

        const receivedCode = url.searchParams.get('code')
        const receivedState = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`
          <html><body style="font-family:system-ui;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
              <p style="font-size:18px;font-weight:500">${error ? 'Autorizacao negada.' : 'Conectado ao Spotify.'}</p>
              <p style="color:rgba(255,255,255,0.5);font-size:13px">Pode fechar esta aba.</p>
            </div>
          </body></html>
        `)
        server.close()

        if (error || !receivedCode) return reject(new Error(error ?? 'No code received'))
        if (receivedState !== state) return reject(new Error('State mismatch'))
        resolve(receivedCode)
      })

      const timeout = setTimeout(() => {
        server.close()
        reject(new Error('Auth timeout (5 min)'))
      }, 5 * 60 * 1000)

      server.on('error', err => {
        clearTimeout(timeout)
        reject(err)
      })

      server.listen(AUTH_CALLBACK_PORT, '127.0.0.1', () => {
        const authUrl = new URL('https://accounts.spotify.com/authorize')
        authUrl.searchParams.set('client_id', clientId)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
        authUrl.searchParams.set('scope', SCOPES)
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('code_challenge_method', 'S256')
        authUrl.searchParams.set('code_challenge', challenge)
        void shell.openExternal(authUrl.toString())
      })

      server.on('close', () => clearTimeout(timeout))
    })

    await this.exchangeCodeForToken(code, verifier, clientId)
    this._onAuth?.(true)
    this.startPolling()
    await this.refreshState()
  }

  async executeAction(payload: SpotifyActionPayload): Promise<SpotifyCommandResult> {
    try {
      switch (payload.action) {
        case 'pause':
          await this.pause()
          return this.buildResult(true, 'Pausado.')
        case 'resume':
          await this.resume()
          return this.buildResult(true, 'Retomando a reprodução.')
        case 'next':
          await this.next()
          return this.buildResult(true, 'Pulando para a próxima faixa.')
        case 'prev':
          await this.prev()
          return this.buildResult(true, 'Voltando para a faixa anterior.')
        case 'report_state':
          return this.buildResult(true, this.describeCurrentState())
        case 'play_uri':
          if (!payload.uri || !payload.entityType) {
            throw new SpotifyApiError('invalid_action', 'Ação de playback incompleta.')
          }
          await this.playUri(payload.uri, payload.entityType)
          return this.buildResult(true, this.describePlaybackStarted(payload.entityType))
        default:
          throw new SpotifyApiError('invalid_action', 'Ação do Spotify não reconhecida.')
      }
    } catch (error) {
      return this.buildResult(false, this.mapErrorMessage(error), this.currentState, this.mapErrorCode(error))
    }
  }

  async resolvePlaybackQuery(
    query: string,
    preferredType?: SpotifyEntityType
  ): Promise<SpotifyQueryResolution> {
    const types = preferredType ? [preferredType] : ['track', 'artist', 'album', 'playlist'] as SpotifyEntityType[]
    const items = await this.searchCatalog(query, types)
    if (!items.length) return { kind: 'none' }

    const top = items[0]
    const second = items[1]
    if (top && (!second || top.score >= 135 || top.score - second.score >= 18)) {
      return { kind: 'single', candidate: top }
    }

    return { kind: 'multiple', candidates: items.slice(0, 3) }
  }

  async searchCatalog(query: string, types: SpotifyEntityType[]): Promise<SpotifySearchCandidate[]> {
    const normalizedQuery = normalizeForSearch(query)
    const typeKey = [...new Set(types)].sort().join(',')
    const cacheKey = `${normalizedQuery}|${typeKey}`
    const cached = this.searchCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.items
    }

    const token = await this.ensureValidToken()
    const url = new URL('https://api.spotify.com/v1/search')
    url.searchParams.set('q', query)
    url.searchParams.set('type', typeKey)
    url.searchParams.set('limit', '5')

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!res.ok) {
      await this.throwApiError(res)
    }

    const data = await res.json() as {
      tracks?: { items?: Array<Record<string, unknown>> }
      artists?: { items?: Array<Record<string, unknown>> }
      albums?: { items?: Array<Record<string, unknown>> }
      playlists?: { items?: Array<Record<string, unknown>> }
    }

    const candidates = [
      ...this.mapSearchItems(data.tracks?.items ?? [], 'track', normalizedQuery),
      ...this.mapSearchItems(data.artists?.items ?? [], 'artist', normalizedQuery),
      ...this.mapSearchItems(data.albums?.items ?? [], 'album', normalizedQuery),
      ...this.mapSearchItems(data.playlists?.items ?? [], 'playlist', normalizedQuery)
    ].sort((a, b) => b.score - a.score)

    this.searchCache.set(cacheKey, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      items: candidates
    })

    return candidates
  }

  async refreshState(): Promise<SpotifyPlaybackState | null> {
    await this.fetchPlaybackState()
    return this.currentState
  }

  async togglePlayPause(): Promise<void> {
    if (this.currentState?.isPlaying) {
      await this.pause()
    } else {
      await this.resume()
    }
  }

  async next(): Promise<void> {
    await this.apiCallStrict('POST', 'https://api.spotify.com/v1/me/player/next')
    setTimeout(() => { void this.refreshState() }, 300)
  }

  async prev(): Promise<void> {
    await this.apiCallStrict('POST', 'https://api.spotify.com/v1/me/player/previous')
    setTimeout(() => { void this.refreshState() }, 300)
  }

  async setVolume(percent: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)))
    await this.apiCallStrict('PUT', `https://api.spotify.com/v1/me/player/volume?volume_percent=${clamped}`)
    setTimeout(() => { void this.refreshState() }, 200)
  }

  async setShuffle(state: boolean): Promise<void> {
    await this.apiCallStrict('PUT', `https://api.spotify.com/v1/me/player/shuffle?state=${state}`)
    setTimeout(() => { void this.refreshState() }, 200)
  }

  async setRepeat(state: 'off' | 'track' | 'context'): Promise<void> {
    await this.apiCallStrict('PUT', `https://api.spotify.com/v1/me/player/repeat?state=${state}`)
    setTimeout(() => { void this.refreshState() }, 200)
  }

  getState(): SpotifyPlaybackState | null {
    return this.currentState
  }

  isAuthenticated(): boolean {
    return this.tokens !== null
  }

  disconnect(): void {
    this.stopPolling()
    this.tokens = null
    this.currentState = null
    this.searchCache.clear()
    this.saveTokens()
    this._onAuth?.(false)
    this._onState?.(null)
  }

  private async pause(): Promise<void> {
    await this.apiCallStrict('PUT', 'https://api.spotify.com/v1/me/player/pause')
    setTimeout(() => { void this.refreshState() }, 250)
  }

  private async resume(): Promise<void> {
    await this.apiCallStrict('PUT', 'https://api.spotify.com/v1/me/player/play')
    setTimeout(() => { void this.refreshState() }, 250)
  }

  private async playUri(uri: string, entityType: SpotifyEntityType): Promise<void> {
    if (entityType === 'track') {
      await this.apiCallStrict('PUT', 'https://api.spotify.com/v1/me/player/play', { uris: [uri] })
    } else {
      await this.apiCallStrict('PUT', 'https://api.spotify.com/v1/me/player/play', { context_uri: uri })
    }
    setTimeout(() => { void this.refreshState() }, 300)
  }

  private mapSearchItems(
    items: Array<Record<string, unknown>>,
    type: SpotifyEntityType,
    normalizedQuery: string
  ): SpotifySearchCandidate[] {
    return items
      .map(item => {
        const name = String(item['name'] ?? '').trim()
        const uri = String(item['uri'] ?? '').trim()
        if (!name || !uri) return null

        const popularity = typeof item['popularity'] === 'number' ? item['popularity'] as number : 0
        const subtitle = this.extractSubtitle(item, type)
        const imageUrl = this.extractImageUrl(item, type)
        const score = this.computeScore(normalizedQuery, name, subtitle, type, popularity)

        return { uri, type, name, subtitle, imageUrl, popularity, score }
      })
      .filter((candidate): candidate is SpotifySearchCandidate => candidate !== null)
  }

  private extractSubtitle(item: Record<string, unknown>, type: SpotifyEntityType): string {
    if (type === 'track') {
      const artists = Array.isArray(item['artists']) ? item['artists'] : []
      return artists
        .map(artist => String((artist as { name?: string }).name ?? '').trim())
        .filter(Boolean)
        .join(', ')
    }

    if (type === 'album') {
      const artists = Array.isArray(item['artists']) ? item['artists'] : []
      return artists
        .map(artist => String((artist as { name?: string }).name ?? '').trim())
        .filter(Boolean)
        .join(', ')
    }

    if (type === 'playlist') {
      const owner = item['owner'] as { display_name?: string } | undefined
      return owner?.display_name?.trim() ?? ''
    }

    if (type === 'artist') {
      const genres = Array.isArray(item['genres']) ? item['genres'] : []
      return genres.slice(0, 2).map(value => String(value)).join(', ')
    }

    return ''
  }

  private extractImageUrl(item: Record<string, unknown>, type: SpotifyEntityType): string | null {
    const source = type === 'track'
      ? (item['album'] as { images?: Array<{ url?: string }> } | undefined)?.images
      : (item['images'] as Array<{ url?: string }> | undefined)

    return source?.[0]?.url ?? null
  }

  private computeScore(
    normalizedQuery: string,
    name: string,
    subtitle: string,
    type: SpotifyEntityType,
    popularity: number
  ): number {
    const normalizedName = normalizeForSearch(name)
    const normalizedSubtitle = normalizeForSearch(subtitle)
    const combined = `${normalizedName} ${normalizedSubtitle}`.trim()

    let score = 0
    if (normalizedName === normalizedQuery) score += 120
    else if (combined === normalizedQuery) score += 112
    else if (normalizedName.startsWith(normalizedQuery)) score += 92
    else if (combined.startsWith(normalizedQuery)) score += 86
    else if (normalizedName.includes(normalizedQuery)) score += 74
    else if (combined.includes(normalizedQuery)) score += 66

    const queryWords = normalizedQuery.split(' ').filter(Boolean)
    const nameWords = new Set(combined.split(' ').filter(Boolean))
    const matches = queryWords.filter(word => nameWords.has(word)).length
    score += matches * 6
    score += popularity / 10

    if (type === 'track') score += 4
    if (type === 'album') score += 2

    return score
  }

  private describeCurrentState(): string {
    if (!this.currentState?.trackName) return 'Nada tocando agora.'
    const artist = this.currentState.artistName ? ` — ${this.currentState.artistName}` : ''
    const device = this.currentState.deviceName ? ` no ${this.currentState.deviceName}` : ''
    return `${this.currentState.isPlaying ? 'Tocando' : 'Pausado'}: ${this.currentState.trackName}${artist}${device}.`
  }

  private describePlaybackStarted(entityType: SpotifyEntityType): string {
    const current = this.currentState
    if (current?.trackName) {
      const artist = current.artistName ? ` — ${current.artistName}` : ''
      return `Tocando ${current.trackName}${artist}.`
    }

    switch (entityType) {
      case 'album':
        return 'Playback do álbum iniciado.'
      case 'artist':
        return 'Playback do artista iniciado.'
      case 'playlist':
        return 'Playlist iniciada.'
      default:
        return 'Reprodução iniciada.'
    }
  }

  private buildResult(
    ok: boolean,
    message: string,
    state = this.currentState,
    errorCode?: SpotifyCommandResult['errorCode']
  ): SpotifyCommandResult {
    return { ok, message, state, errorCode }
  }

  private mapErrorCode(error: unknown): SpotifyCommandResult['errorCode'] {
    if (error instanceof SpotifyApiError) return error.code
    return 'unknown'
  }

  private mapErrorMessage(error: unknown): string {
    if (!(error instanceof SpotifyApiError)) {
      return error instanceof Error ? error.message : 'Falha ao falar com o Spotify.'
    }

    switch (error.code) {
      case 'not_authenticated':
        return 'Conecta o Spotify primeiro.'
      case 'no_active_device':
        return 'Abre o Spotify em algum dispositivo ativo antes de tocar.'
      case 'forbidden':
        return 'O Spotify recusou essa ação para a conta ou dispositivo atual.'
      case 'rate_limited':
        return 'O Spotify limitou as requisições agora. Tenta de novo em alguns segundos.'
      case 'not_found':
        return 'Não achei um resultado bom o bastante no Spotify.'
      case 'invalid_action':
        return error.message
      default:
        return 'Não consegui concluir essa ação no Spotify.'
    }
  }

  private async exchangeCodeForToken(code: string, verifier: string, clientId: string): Promise<void> {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier
      })
    })
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    this.tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      clientId
    }
    this.saveTokens()
  }

  private async ensureValidToken(): Promise<string> {
    if (!this.tokens) throw new SpotifyApiError('not_authenticated', 'Not authenticated')
    if (Date.now() > this.tokens.expiresAt - 5 * 60 * 1000) {
      await this.refreshAccessToken()
    }
    if (!this.tokens) throw new SpotifyApiError('not_authenticated', 'Not authenticated')
    return this.tokens.accessToken
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens) return
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
        client_id: this.tokens.clientId
      })
    })
    if (!res.ok) {
      console.warn('[Spotify] Token refresh failed, re-auth required')
      this.tokens = null
      this.saveTokens()
      this._onAuth?.(false)
      return
    }
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number }
    this.tokens.accessToken = data.access_token
    this.tokens.expiresAt = Date.now() + data.expires_in * 1000
    if (data.refresh_token) this.tokens.refreshToken = data.refresh_token
    this.saveTokens()
  }

  private loadTokens(): void {
    try {
      const path = TOKEN_FILE()
      if (!existsSync(path)) return
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as SpotifyTokens
      if (raw.accessToken && raw.refreshToken) {
        this.tokens = raw
        this.startPolling()
        setImmediate(() => this._onAuth?.(true))
      }
    } catch {
      // ignore corrupt file
    }
  }

  private saveTokens(): void {
    try {
      writeFileSync(TOKEN_FILE(), JSON.stringify(this.tokens ?? null), 'utf-8')
    } catch {
      // ignore persistence issues
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return
    void this.poll()
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async poll(): Promise<void> {
    if (this.retryAfterMs > 0) {
      const wait = this.retryAfterMs
      this.retryAfterMs = 0
      this.pollTimer = setTimeout(() => { void this.poll() }, wait)
      return
    }

    await this.fetchPlaybackState()

    const interval = this.currentState?.isPlaying ? POLL_PLAYING_MS : POLL_PAUSED_MS
    this.pollTimer = setTimeout(() => { void this.poll() }, interval)
  }

  private async fetchPlaybackState(): Promise<void> {
    if (!this.tokens) return

    try {
      const token = await this.ensureValidToken()
      const res = await fetch('https://api.spotify.com/v1/me/player', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000)
      })

      if (res.status === 429) {
        const retryAfter = res.headers.get('retry-after')
        this.retryAfterMs = (parseInt(retryAfter ?? '5', 10) + 1) * 1000
        return
      }

      if (res.status === 204 || res.status === 202) {
        if (this.currentState !== null) {
          this.currentState = null
          this._onState?.(null)
        }
        return
      }

      if (!res.ok) return

      const data = await res.json() as Record<string, unknown>
      const nextState = this.mapPlaybackState(data)
      const changed = JSON.stringify(nextState) !== JSON.stringify(this.currentState)
      this.currentState = nextState
      if (changed) this._onState?.(nextState)
    } catch (err) {
      const isTransient = isNetworkError(err)
      if (!isTransient) console.error('[Spotify] Poll error:', err)
    }
  }

  private mapPlaybackState(data: Record<string, unknown>): SpotifyPlaybackState {
    const track = data['item'] as {
      name?: string
      duration_ms?: number
      artists?: Array<{ name?: string }>
      album?: { name?: string; images?: Array<{ url?: string }> }
    } | undefined

    return {
      isPlaying: Boolean(data['is_playing']),
      trackName: track?.name ?? null,
      artistName: track?.artists?.map(artist => artist.name).filter(Boolean).join(', ') ?? null,
      albumName: track?.album?.name ?? null,
      albumArtUrl: track?.album?.images?.[0]?.url ?? null,
      progressMs: typeof data['progress_ms'] === 'number' ? data['progress_ms'] as number : 0,
      durationMs: track?.duration_ms ?? 0,
      shuffle: Boolean(data['shuffle_state']),
      repeat: (data['repeat_state'] as 'off' | 'track' | 'context') ?? 'off',
      deviceName: (data['device'] as { name?: string } | undefined)?.name ?? null,
      volumePercent: (data['device'] as { volume_percent?: number } | undefined)?.volume_percent ?? null
    }
  }

  private async apiCallStrict(method: string, url: string, body?: unknown): Promise<void> {
    const token = await this.ensureValidToken()
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })

    if (res.ok || res.status === 204) return
    await this.throwApiError(res)
  }

  private async throwApiError(res: Response): Promise<never> {
    if (res.status === 401) {
      this.tokens = null
      this.saveTokens()
      this._onAuth?.(false)
      throw new SpotifyApiError('not_authenticated', 'Spotify auth expired.')
    }

    if (res.status === 404) {
      throw new SpotifyApiError('no_active_device', 'No active device')
    }

    if (res.status === 403) {
      throw new SpotifyApiError('forbidden', 'Forbidden')
    }

    if (res.status === 429) {
      const retryAfter = (parseInt(res.headers.get('retry-after') ?? '5', 10) + 1) * 1000
      this.retryAfterMs = retryAfter
      throw new SpotifyApiError('rate_limited', 'Rate limited', retryAfter)
    }

    throw new SpotifyApiError('unknown', `Spotify API returned ${res.status}`)
  }
}

function isNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code
    if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_SOCKET' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') return true
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return true
    const cause = (err as Error & { cause?: unknown }).cause
    if (cause instanceof Error) return isNetworkError(cause)
  }
  return false
}

export const spotifyService = new SpotifyService()
export { formatMs, normalizeForSearch }
