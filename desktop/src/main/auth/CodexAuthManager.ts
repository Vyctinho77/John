import { shell, app } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { generatePKCE } from './pkce'
import { waitForCallback } from './LocalCallbackServer.ts'
import type { CodexTokens, AuthStatus } from '../../shared/auth.types'

const CLIENT_ID    = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH_URL     = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL    = 'https://auth.openai.com/oauth/token'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const SCOPES       = 'openid profile email offline_access'

const TOKEN_PATH = path.join(app.getPath('userData'), 'codex-auth.json')

export class CodexAuthManager {
  private tokens: CodexTokens | null = null

  constructor() {
    this.loadFromDisk()
  }

  // ── Persistência ──────────────────────────────────────────────

  private loadFromDisk() {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        this.tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'))
      }
    } catch {
      this.tokens = null
    }
  }

  private saveToDisk() {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(this.tokens, null, 2), 'utf-8')
  }

  private clearDisk() {
    if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH)
  }

  // ── Login ──────────────────────────────────────────────────────

  async login(): Promise<AuthStatus> {
    // Limpa token anterior para garantir que os novos scopes sejam solicitados
    this.tokens = null
    this.clearDisk()

    const { codeVerifier, codeChallenge } = generatePKCE()
    const state = crypto.randomBytes(16).toString('base64url')

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             CLIENT_ID,
      redirect_uri:          REDIRECT_URI,
      scope:                 SCOPES,
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    })

    const authURL = `${AUTH_URL}?${params}`

    const [code] = await Promise.all([
      waitForCallback(state),
      shell.openExternal(authURL),
    ])

    const tokens = await this.exchangeCode(code, codeVerifier)
    this.tokens = tokens
    this.saveToDisk()
    return this.getStatus()
  }

  private async exchangeCode(code: string, codeVerifier: string): Promise<CodexTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        code_verifier: codeVerifier,
      }),
    })

    if (!res.ok) throw new Error(`Token exchange falhou: ${res.status}`)

    const data = await res.json()

    const claims = JSON.parse(
      Buffer.from(data.access_token.split('.')[1], 'base64url').toString()
    )
    const idClaims = JSON.parse(
      Buffer.from(data.id_token.split('.')[1], 'base64url').toString()
    )

    return {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token,
      idToken:      data.id_token,
      accountId:    idClaims.sub,
      expires:      claims.exp * 1000,
      planType:     idClaims['https://api.openai.com/profile']?.plan_type ?? 'plus',
      email:        idClaims.email ?? '',
    }
  }

  // ── Refresh automático ─────────────────────────────────────────

  async getValidToken(): Promise<string> {
    if (!this.tokens) throw new Error('Não autenticado. Faça login primeiro.')

    if (Date.now() > this.tokens.expires - 5 * 60 * 1000) {
      await this.refresh()
    }

    return this.tokens.accessToken
  }

  private async refresh() {
    if (!this.tokens?.refreshToken) throw new Error('Sem refresh token')

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: this.tokens.refreshToken,
        client_id:     CLIENT_ID,
      }),
    })

    if (!res.ok) {
      this.tokens = null
      this.clearDisk()
      throw new Error('Sessão expirada. Faça login novamente.')
    }

    const data = await res.json()
    const claims = JSON.parse(
      Buffer.from(data.access_token.split('.')[1], 'base64url').toString()
    )

    this.tokens = {
      ...this.tokens,
      accessToken:  data.access_token,
      refreshToken: data.refresh_token ?? this.tokens.refreshToken,
      expires:      claims.exp * 1000,
    }
    this.saveToDisk()
  }

  // ── Status e Logout ────────────────────────────────────────────

  getStatus(): AuthStatus {
    if (!this.tokens) return { authenticated: false }
    return {
      authenticated: true,
      email:         this.tokens.email,
      planType:      this.tokens.planType,
      expiresAt:     this.tokens.expires,
    }
  }

  logout() {
    this.tokens = null
    this.clearDisk()
  }
}
