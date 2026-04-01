import test from 'node:test'
import assert from 'node:assert/strict'
import { detectSensitiveSurface } from '../src/main/services/privacy-guards.ts'

test('detectSensitiveSurface flags credentials', () => {
  const result = detectSensitiveSurface('Use esta senha temporaria e o token OTP para entrar')

  assert.equal(result.isSensitive, true)
  assert.match(result.reason ?? '', /credential|authentication/i)
})

test('detectSensitiveSurface ignores ordinary study text', () => {
  const result = detectSensitiveSurface('Resumo sobre estruturas de dados, listas e filas')

  assert.equal(result.isSensitive, false)
  assert.equal(result.reason, null)
})
