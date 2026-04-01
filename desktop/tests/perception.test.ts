import test from 'node:test'
import assert from 'node:assert/strict'
import type { PerceptionResult } from '../src/shared/perception.types'
import { extractPrimaryContentText, looksLikeBrowserChromeOnly } from '../src/main/services/perception-helpers.ts'

test('extractPrimaryContentText prioritizes central document content over browser tabs', () => {
  const perception: PerceptionResult = {
    rawText: 'bitcoin paper github x tabs\nBitcoin: A Peer-to-Peer Electronic Cash System\nAbstract. A purely peer-to-peer version of electronic cash...',
    confidence: 71,
    capturedAt: Date.now(),
    regions: [
      {
        text: 'btc paper github x',
        confidence: 82,
        bbox: { x: 120, y: 42, width: 280, height: 36 }
      },
      {
        text: 'tradingview wikipedia tab',
        confidence: 78,
        bbox: { x: 430, y: 44, width: 260, height: 34 }
      },
      {
        text: 'Bitcoin: A Peer-to-Peer Electronic Cash System',
        confidence: 88,
        bbox: { x: 230, y: 190, width: 720, height: 54 }
      },
      {
        text: 'Abstract. A purely peer-to-peer version of electronic cash would allow online payments',
        confidence: 90,
        bbox: { x: 210, y: 278, width: 810, height: 96 }
      }
    ]
  }

  const primaryText = extractPrimaryContentText(perception)

  assert.match(primaryText, /Peer-to-Peer Electronic Cash System/)
  assert.match(primaryText, /Abstract\./)
  assert.doesNotMatch(primaryText, /^btc paper github x$/)
})

test('looksLikeBrowserChromeOnly identifies tab-like OCR noise', () => {
  const chromeOnlyText = [
    'github',
    'tradingview btc',
    'wikipedia',
    'x',
    'drive'
  ].join('\n')

  assert.equal(looksLikeBrowserChromeOnly(chromeOnlyText), true)
  assert.equal(
    looksLikeBrowserChromeOnly('Bitcoin: A Peer-to-Peer Electronic Cash System\nAbstract. A purely peer-to-peer version...'),
    false
  )
})
