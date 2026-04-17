/**
 * tutor-cache.ts
 *
 * In-memory response cache for the tutor pipeline.
 *
 * Skips re-firing the strong model when the context hasn't changed meaningfully:
 *   - same prompt
 *   - same dominant domain
 *   - same screenshot fingerprint (first bytes of dataUrl)
 *   - same connector state key
 *
 * TTL: 28 seconds — long enough to absorb rapid follow-ups, short enough
 * to never serve a stale screen reading.
 */

import type { TutorResponse } from '../../shared/perception.types'

const CACHE_TTL_MS = 28_000
const MAX_ENTRIES = 40

interface CacheEntry {
  response: TutorResponse
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export interface TutorCacheKeyInput {
  prompt: string
  domain: string
  imageDataUrlPrefix: string | null   // first 80 chars of screenshot dataUrl
  connectorKey: string                // serialised active connector state
}

export function buildTutorCacheKey(input: TutorCacheKeyInput): string {
  return [
    input.prompt.trim().slice(0, 200),
    input.domain,
    input.imageDataUrlPrefix?.slice(0, 80) ?? '__no_img__',
    input.connectorKey
  ].join('||')
}

export function getTutorCached(key: string): TutorResponse | null {
  const entry = cache.get(key)
  if (!entry) return null

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }

  return entry.response
}

export function setTutorCache(key: string, response: TutorResponse): void {
  cache.set(key, { response, expiresAt: Date.now() + CACHE_TTL_MS })
  pruneExpired()
}

function pruneExpired(): void {
  if (cache.size <= MAX_ENTRIES) return

  const now = Date.now()
  for (const [k, v] of cache.entries()) {
    if (v.expiresAt <= now) {
      cache.delete(k)
    }
  }

  // If still over budget, remove oldest entries
  if (cache.size > MAX_ENTRIES) {
    const keys = [...cache.keys()]
    for (const k of keys.slice(0, cache.size - MAX_ENTRIES)) {
      cache.delete(k)
    }
  }
}
