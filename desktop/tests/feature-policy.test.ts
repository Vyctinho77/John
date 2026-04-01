import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFeaturePolicySnapshot,
  resolveEffectiveFeatureFlags,
  stableBucket
} from '../src/main/services/feature-policy.ts'

test('stableBucket is deterministic', () => {
  const first = stableBucket('install-a:advancedPerception')
  const second = stableBucket('install-a:advancedPerception')

  assert.equal(first, second)
  assert.ok(first >= 0 && first < 100)
})

test('voice mode stays effectively disabled while rollout is zero', () => {
  const flags = resolveEffectiveFeatureFlags('install-a', {
    passiveSuggestions: true,
    advancedPerception: true,
    voiceMode: true,
    crashReporting: true
  })

  assert.equal(flags.voiceMode, false)
})

test('feature policy snapshot preserves requested and effective states', () => {
  const snapshot = buildFeaturePolicySnapshot('install-b', {
    passiveSuggestions: true,
    advancedPerception: true,
    voiceMode: true,
    crashReporting: false
  })

  assert.equal(snapshot.passiveSuggestions.requested, true)
  assert.equal(snapshot.voiceMode.effective, false)
  assert.equal(snapshot.crashReporting.requested, false)
})
