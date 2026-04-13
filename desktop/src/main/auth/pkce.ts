import crypto from 'crypto'

export interface PKCECodes {
  codeVerifier: string
  codeChallenge: string
}

export function generatePKCE(): PKCECodes {
  const bytes = crypto.randomBytes(32)
  const codeVerifier = bytes.toString('base64url')
  const hash = crypto.createHash('sha256').update(codeVerifier).digest()
  const codeChallenge = hash.toString('base64url')
  return { codeVerifier, codeChallenge }
}
