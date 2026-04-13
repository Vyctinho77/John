# John — Integração Codex OAuth (ChatGPT Subscription)

## Objetivo

Substituir o billing por token da API OpenAI pelo consumo flat da assinatura ChatGPT Plus/Pro via OAuth do Codex. O usuário faz login uma vez com a conta ChatGPT, o John persiste o token localmente e o usa em todas as chamadas — sem API key, sem custo por token.

---

## Contexto Técnico

O Codex da OpenAI expõe um OAuth 2.0 com PKCE flow usando um **client ID público** — nenhum app precisa ser cadastrado na OpenAI:

```
Client ID:             app_EMoamEEZ73f0CkXaXp7hrann
Authorization URL:     https://auth.openai.com/oauth/authorize
Token URL:             https://auth.openai.com/oauth/token
Redirect URI:          http://localhost:1455/auth/callback
Scopes:                openid profile email offline_access
```

O token obtido é usado no header `Authorization: Bearer <token>` nas chamadas ao backend do ChatGPT, consumindo da assinatura flat em vez de créditos de API.

> **Importante:** A API OAuth do Codex exige um system prompt específico para validar a autorização. Sem ele, requests são rejeitados mesmo com token válido. O system prompt correto está documentado na seção de implementação abaixo.

---

## Stack do John

```
Electron (shell)
├── Main Process (Node.js)  ← OAuth flow + token storage + HTTP server
└── Renderer (React + TS)   ← UI de login + estado de autenticação
```

---

## Arquitetura da Solução

```
Renderer (React)
    │  IPC: auth:start / auth:status / auth:logout
    ▼
Main Process (Node.js)
    ├── CodexAuthManager       ← PKCE flow, token storage, auto-refresh
    ├── LocalCallbackServer    ← http server em localhost:1455
    └── CodexClient            ← wrapper do fetch com token injetado
    │
    ▼
auth.openai.com + chatgpt.com/backend-api
```

---

## Estrutura de Arquivos a Criar

```
src/
├── main/
│   ├── auth/
│   │   ├── CodexAuthManager.ts     ← gerencia todo o ciclo OAuth
│   │   ├── CodexClient.ts          ← cliente HTTP com token injetado
│   │   ├── LocalCallbackServer.ts  ← servidor localhost para callback
│   │   └── pkce.ts                 ← geração de code_verifier/challenge
│   └── ipc/
│       └── authHandlers.ts         ← handlers IPC para o renderer
├── renderer/
│   ├── hooks/
│   │   └── useCodexAuth.ts         ← hook React para estado de auth
│   └── components/
│       └── CodexLoginButton.tsx    ← botão de login/logout
└── shared/
    └── types/auth.ts               ← tipos compartilhados
```

---

## Implementação Detalhada

### 1. `src/shared/types/auth.ts`

```typescript
export interface CodexTokens {
  accessToken: string
  refreshToken: string
  idToken: string
  accountId: string
  expires: number        // timestamp ms
  planType: string       // 'plus' | 'pro' | 'team'
  email: string
}

export interface AuthStatus {
  authenticated: boolean
  email?: string
  planType?: string
  expiresAt?: number
}
```

---

### 2. `src/main/auth/pkce.ts`

Gerar `code_verifier` e `code_challenge` para o PKCE flow:

```typescript
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
```

---

### 3. `src/main/auth/LocalCallbackServer.ts`

Servidor HTTP temporário em `localhost:1455` para capturar o callback OAuth:

```typescript
import http from 'http'

const CALLBACK_PORT = 1455

export function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost:${CALLBACK_PORT}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      // Fecha a janela do browser com uma página simples
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff">
          <h2>${error ? '❌ Erro na autenticação' : '✅ John conectado!'}</h2>
          <p>Pode fechar esta janela.</p>
          <script>window.close()</script>
        </body></html>
      `)

      server.close()

      if (error) reject(new Error(error))
      else if (code) resolve(code)
      else reject(new Error('Nenhum code recebido'))
    })

    server.listen(CALLBACK_PORT, '127.0.0.1')
    server.on('error', reject)

    // Timeout de 5 minutos
    setTimeout(() => {
      server.close()
      reject(new Error('Timeout: login não completado em 5 minutos'))
    }, 5 * 60 * 1000)
  })
}
```

---

### 4. `src/main/auth/CodexAuthManager.ts`

Classe principal que gerencia todo o ciclo de vida do OAuth:

```typescript
import { shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { generatePKCE } from './pkce'
import { waitForCallback } from './LocalCallbackServer'
import type { CodexTokens, AuthStatus } from '../../shared/types/auth'

const CLIENT_ID    = 'app_EMoamEEZ73f0CkXaXp7hrann'
const AUTH_URL     = 'https://auth.openai.com/oauth/authorize'
const TOKEN_URL    = 'https://auth.openai.com/oauth/token'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const SCOPES       = 'openid profile email offline_access'

// Token salvo aqui — nunca commitar este arquivo
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

  async login(): Promise<CodexTokens> {
    const { codeVerifier, codeChallenge } = generatePKCE()

    // Monta URL de autorização
    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             CLIENT_ID,
      redirect_uri:          REDIRECT_URI,
      scope:                 SCOPES,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    })

    const authURL = `${AUTH_URL}?${params}`

    // Abre browser e aguarda callback em paralelo
    const [code] = await Promise.all([
      waitForCallback(),
      shell.openExternal(authURL),
    ])

    // Troca code por tokens
    const tokens = await this.exchangeCode(code, codeVerifier)
    this.tokens = tokens
    this.saveToDisk()
    return tokens
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

    // Extrai claims do JWT sem dependência externa
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
    if (!this.tokens) throw new Error('Não autenticado')

    // Refresh se expirar em menos de 5 minutos
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
      // Refresh falhou — força novo login
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
```

---

### 5. `src/main/auth/CodexClient.ts`

Cliente HTTP que injeta o token e o system prompt obrigatório:

```typescript
import { CodexAuthManager } from './CodexAuthManager'

// System prompt OBRIGATÓRIO — sem ele a API rejeita mesmo com token válido
const CODEX_SYSTEM_PROMPT = `You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-01
Current date: ${new Date().toISOString().split('T')[0]}`

const BACKEND_URL = 'https://chatgpt.com/backend-api/conversation'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface CodexRequestOptions {
  messages: Message[]
  model?: string
  temperature?: number
  max_tokens?: number
}

export class CodexClient {
  constructor(private auth: CodexAuthManager) {}

  async chat(options: CodexRequestOptions): Promise<string> {
    const token = await this.auth.getValidToken()

    // Injeta system prompt obrigatório se não houver um
    const messages = options.messages[0]?.role === 'system'
      ? options.messages
      : [{ role: 'system' as const, content: CODEX_SYSTEM_PROMPT }, ...options.messages]

    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Content-Type':   'application/json',
        'Accept':         'text/event-stream',
      },
      body: JSON.stringify({
        model:             options.model ?? 'gpt-4o',
        messages,
        stream:            true,
        temperature:       options.temperature ?? 0.7,
        max_tokens:        options.max_tokens ?? 4096,
        // Obrigatório para o backend do ChatGPT
        conversation_mode: { kind: 'primary_assistant' },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Codex API error ${res.status}: ${err}`)
    }

    // Processa SSE stream
    return this.parseStream(res)
  }

  private async parseStream(res: Response): Promise<string> {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let result = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta?.content
          if (delta) result += delta
        } catch {}
      }
    }

    return result
  }
}
```

---

### 6. `src/main/ipc/authHandlers.ts`

Registrar handlers IPC no processo main:

```typescript
import { ipcMain } from 'electron'
import { CodexAuthManager } from '../auth/CodexAuthManager'
import { CodexClient } from '../auth/CodexClient'

export function registerAuthHandlers(
  authManager: CodexAuthManager,
  codexClient: CodexClient
) {
  ipcMain.handle('auth:login',  () => authManager.login())
  ipcMain.handle('auth:logout', () => authManager.logout())
  ipcMain.handle('auth:status', () => authManager.getStatus())

  ipcMain.handle('codex:chat', (_, options) => codexClient.chat(options))
}
```

---

### 7. `src/main/index.ts` — Inicialização no Main Process

Adicionar ao entry point do Electron:

```typescript
import { CodexAuthManager } from './auth/CodexAuthManager'
import { CodexClient }      from './auth/CodexClient'
import { registerAuthHandlers } from './ipc/authHandlers'

const authManager = new CodexAuthManager()
const codexClient = new CodexClient(authManager)

registerAuthHandlers(authManager, codexClient)
```

---

### 8. `src/renderer/hooks/useCodexAuth.ts`

Hook React para o renderer consumir o estado de auth:

```typescript
import { ipcRenderer } from 'electron'
import { useState, useEffect, useCallback } from 'react'
import type { AuthStatus } from '../../shared/types/auth'

export function useCodexAuth() {
  const [status, setStatus] = useState<AuthStatus>({ authenticated: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const s = await ipcRenderer.invoke('auth:status')
    setStatus(s)
  }, [])

  useEffect(() => { refresh() }, [])

  const login = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await ipcRenderer.invoke('auth:login')
      await refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [refresh])

  const logout = useCallback(async () => {
    await ipcRenderer.invoke('auth:logout')
    setStatus({ authenticated: false })
  }, [])

  return { status, loading, error, login, logout }
}
```

---

### 9. `src/renderer/components/CodexLoginButton.tsx`

Componente de login para integrar no HUD do John:

```tsx
import { useCodexAuth } from '../hooks/useCodexAuth'

export function CodexLoginButton() {
  const { status, loading, error, login, logout } = useCodexAuth()

  if (status.authenticated) {
    return (
      <div>
        <span>✅ {status.email} ({status.planType})</span>
        <button onClick={logout}>Desconectar</button>
      </div>
    )
  }

  return (
    <div>
      <button onClick={login} disabled={loading}>
        {loading ? 'Abrindo browser...' : '🔑 Conectar ChatGPT'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
```

---

## Segurança

- O arquivo `codex-auth.json` é salvo em `app.getPath('userData')` — fora do projeto, nunca vai pro git
- Adicionar ao `.gitignore` por precaução: `**/codex-auth.json`
- O `code_verifier` é gerado por request e nunca persiste em disco
- O refresh token é sobrescrito a cada renovação (rotation)

---

## Notas Importantes

- **Uso pessoal apenas** — o OAuth do Codex é para uso individual da própria assinatura. Não distribuir o token nem usar em ambiente multi-usuário.
- **Modelo disponível** — `gpt-4o`, `gpt-4o-mini` e modelos Codex dependem do plano. Plus dá acesso ao `gpt-4o`.
- **Rate limits** — a assinatura tem limites de uso por período, diferentes dos limites de API.
- **Embeddings** — o Codex OAuth não cobre embeddings. Para isso usar `text-embedding-3-small` com uma API key separada (custo mínimo, poucos centavos/mês).

---

## Checklist de Implementação

- [ ] Criar `src/shared/types/auth.ts`
- [ ] Criar `src/main/auth/pkce.ts`
- [ ] Criar `src/main/auth/LocalCallbackServer.ts`
- [ ] Criar `src/main/auth/CodexAuthManager.ts`
- [ ] Criar `src/main/auth/CodexClient.ts`
- [ ] Criar `src/main/ipc/authHandlers.ts`
- [ ] Atualizar `src/main/index.ts`
- [ ] Criar `src/renderer/hooks/useCodexAuth.ts`
- [ ] Criar `src/renderer/components/CodexLoginButton.tsx`
- [ ] Adicionar `**/codex-auth.json` ao `.gitignore`
- [ ] Testar login, refresh automático e logout
- [ ] Verificar que o system prompt obrigatório está sendo injetado
