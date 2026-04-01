import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCaptureSource } from '../src/main/services/capture-scope.ts'

test('capture scope blocks sources by keyword', () => {
  const result = evaluateCaptureSource(
    { id: 'window-1', name: '1Password Vault' },
    {
      mode: 'any-visible',
      selectedSourceId: null,
      selectedSourceName: null,
      blockedSourceKeywords: ['1password', 'bitwarden']
    }
  )

  assert.equal(result.blocked, true)
  assert.match(result.blockedReason ?? '', /keyword/i)
})

test('selected-source mode only allows the selected source', () => {
  const allowed = evaluateCaptureSource(
    { id: 'window-1', name: 'VS Code' },
    {
      mode: 'selected-source',
      selectedSourceId: 'window-1',
      selectedSourceName: 'VS Code',
      blockedSourceKeywords: []
    }
  )

  const denied = evaluateCaptureSource(
    { id: 'window-2', name: 'Browser' },
    {
      mode: 'selected-source',
      selectedSourceId: 'window-1',
      selectedSourceName: 'VS Code',
      blockedSourceKeywords: []
    }
  )

  assert.equal(allowed.blocked, false)
  assert.equal(allowed.selected, true)
  assert.equal(denied.blocked, true)
  assert.match(denied.blockedReason ?? '', /selected capture scope/i)
})
