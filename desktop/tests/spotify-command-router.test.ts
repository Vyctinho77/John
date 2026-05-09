import test from 'node:test'
import assert from 'node:assert/strict'
import {
  maybeHandleSpotifyTutorRequest,
  parseSpotifyIntent,
  type SpotifyCommandDependencies
} from '../src/main/services/spotify-command-router.ts'
import type {
  SpotifyActionPayload,
  SpotifyCommandResult,
  SpotifyEntityType
} from '../src/shared/perception.types.ts'

function createDeps(overrides: Partial<SpotifyCommandDependencies> = {}): SpotifyCommandDependencies {
  return {
    ...createBaseDeps(),
    ...overrides
  } satisfies SpotifyCommandDependencies
}

function createBaseDeps(): SpotifyCommandDependencies {
  return {
    isAuthenticated: () => true,
    getState: () => ({
      isPlaying: true,
      trackName: 'Fix You',
      artistName: 'Coldplay',
      albumName: 'X&Y',
      albumArtUrl: null,
      progressMs: 10_000,
      durationMs: 295_000,
      shuffle: false,
      repeat: 'off' as const,
      deviceName: 'Desktop',
      volumePercent: 60
    }),
    executeAction: async (payload: SpotifyActionPayload): Promise<SpotifyCommandResult> => ({
      ok: true,
      message: `executed:${payload.action}:${payload.uri ?? ''}`,
      state: {
        isPlaying: true,
        trackName: 'Fix You',
        artistName: 'Coldplay',
        albumName: 'X&Y',
        albumArtUrl: null,
        progressMs: 10_000,
        durationMs: 295_000,
        shuffle: false,
        repeat: 'off',
        deviceName: 'Desktop',
        volumePercent: 60
      }
    }),
    resolvePlaybackQuery: async (query: string, preferredType?: SpotifyEntityType) => ({
      kind: 'single' as const,
      candidate: {
        uri: 'spotify:track:123',
        type: preferredType ?? 'track',
        name: query,
        subtitle: 'Coldplay',
        imageUrl: null,
        popularity: 90,
        score: 160
      }
    })
  }
}

test('parseSpotifyIntent detects track playback queries', () => {
  assert.deepEqual(parseSpotifyIntent('toca fix you'), {
    kind: 'play_query',
    query: 'fix you',
    preferredType: undefined
  })
})

test('parseSpotifyIntent preserves explicit entity type', () => {
  assert.deepEqual(parseSpotifyIntent('toca a playlist lo fi beats'), {
    kind: 'play_query',
    query: 'lo fi beats',
    preferredType: 'playlist'
  })
})

test('parseSpotifyIntent detects playback controls', () => {
  assert.deepEqual(parseSpotifyIntent('pausa'), { kind: 'pause' })
  assert.deepEqual(parseSpotifyIntent('continua'), { kind: 'resume' })
  assert.deepEqual(parseSpotifyIntent('próxima'), { kind: 'next' })
  assert.deepEqual(parseSpotifyIntent('volta'), { kind: 'previous' })
  assert.deepEqual(parseSpotifyIntent('o que tá tocando?'), { kind: 'what_is_playing' })
})

test('maybeHandleSpotifyTutorRequest does not intercept unrelated prompts', async () => {
  const result = await maybeHandleSpotifyTutorRequest('explica closures em javascript', createDeps())
  assert.equal(result, null)
})

test('maybeHandleSpotifyTutorRequest resolves direct playback for exact-ish matches', async () => {
  const executed: SpotifyActionPayload[] = []
  const result = await maybeHandleSpotifyTutorRequest('toca fix you', createDeps({
    executeAction: async payload => {
      executed.push(payload)
      return {
        ok: true,
        message: 'Tocando agora.',
        state: null
      }
    }
  }))

  assert.equal(executed.length, 1)
  assert.equal(executed[0]?.action, 'play_uri')
  assert.match(result?.content ?? '', /Tocando/i)
})

test('maybeHandleSpotifyTutorRequest returns 3 action chips for ambiguous results', async () => {
  const result = await maybeHandleSpotifyTutorRequest('toca fix you', createDeps({
    resolvePlaybackQuery: async () => ({
      kind: 'multiple',
      candidates: [
        { uri: 'spotify:track:1', type: 'track', name: 'Fix You', subtitle: 'Coldplay', imageUrl: null, popularity: 95, score: 120 },
        { uri: 'spotify:album:2', type: 'album', name: 'Fix You Live', subtitle: 'Coldplay', imageUrl: null, popularity: 80, score: 112 },
        { uri: 'spotify:playlist:3', type: 'playlist', name: 'Fix You Mix', subtitle: 'Ares', imageUrl: null, popularity: 50, score: 108 }
      ]
    })
  }))

  assert.equal(result?.actions?.length, 3)
  assert.match(result?.content ?? '', /Escolhe uma/i)
  assert.equal(result?.actions?.[0]?.payload.action, 'play_uri')
})

test('maybeHandleSpotifyTutorRequest handles no results cleanly', async () => {
  const result = await maybeHandleSpotifyTutorRequest('toca algo inexistente', createDeps({
    resolvePlaybackQuery: async () => ({ kind: 'none' })
  }))

  assert.match(result?.content ?? '', /Nao achei/i)
})

test('maybeHandleSpotifyTutorRequest asks for auth when spotify is disconnected', async () => {
  const result = await maybeHandleSpotifyTutorRequest('pausa', createDeps({
    isAuthenticated: () => false
  }))

  assert.match(result?.content ?? '', /Conecta o Spotify/i)
})
