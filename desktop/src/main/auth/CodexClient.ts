import { CodexAuthManager } from './CodexAuthManager'

const BASE_URL            = 'https://chatgpt.com/backend-api'
const CODEX_RESPONSES_URL = `${BASE_URL}/codex/responses`

// Modelos conhecidos do Codex com Plus, em ordem de preferência
const FALLBACK_MODELS = ['codex-mini-latest', 'o4-mini', 'o3-mini', 'gpt-4.1-mini']

export interface CodexMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CodexRequestOptions {
  messages: CodexMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
}

export class CodexClient {
  private cachedModel: string | null = null

  constructor(private auth: CodexAuthManager) {}

  // ── Model discovery ────────────────────────────────────────────

  async listModels(): Promise<string[]> {
    const token = await this.auth.getValidToken()

    // Tenta vários endpoints conhecidos do backend do ChatGPT
    const endpoints = [
      `${BASE_URL}/codex/models?client_version=0.111.0`,
      `${BASE_URL}/models`,
      `${BASE_URL}/models?history_and_training_disabled=false`,
    ]

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) {
          console.log(`[Codex] ${url} → ${res.status}`)
          continue
        }
        const data = await res.json() as unknown
        console.log('[Codex] listModels raw:', JSON.stringify(data).slice(0, 800))
        const raw = Array.isArray(data) ? data : (data as { models?: unknown[] }).models ?? []
        const models = raw
          .map((m: unknown) => (typeof m === 'string' ? m : (m as { id?: string }).id ?? (m as { slug?: string }).slug ?? ''))
          .filter(Boolean)
        if (models.length) {
          console.log('[Codex] modelos encontrados:', models)
          return models
        }
      } catch (e) {
        console.log(`[Codex] ${url} falhou:`, e)
      }
    }

    console.log('[Codex] nenhum endpoint retornou modelos, usando fallback')
    return FALLBACK_MODELS
  }

  private async resolveModel(requested?: string): Promise<string> {
    if (requested && requested !== 'gpt-4o') return requested
    if (this.cachedModel) return this.cachedModel

    const models = await this.listModels()
    this.cachedModel = models[0]
    console.log('[Codex] modelo selecionado:', this.cachedModel)
    return this.cachedModel
  }

  // ── Chat ───────────────────────────────────────────────────────

  async chat(options: CodexRequestOptions): Promise<string> {
    const token = await this.auth.getValidToken()
    const model = await this.resolveModel(options.model)

    const systemMsg = options.messages.find(m => m.role === 'system')
    const input     = options.messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))

    const res = await fetch(CODEX_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: systemMsg?.content ?? '',
        input,
        stream: true,
        store:  false,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Codex API ${res.status}: ${err}`)
    }

    return this.parseSSE(res)
  }

  // ── SSE parsing ────────────────────────────────────────────────

  private async parseSSE(res: Response): Promise<string> {
    const reader  = res.body!.getReader()
    const decoder = new TextDecoder()
    let result = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue

        try {
          const json = JSON.parse(data)

          if (json.type === 'response.output_text.delta') {
            result += json.delta ?? ''
            continue
          }

          if (json.type === 'response.completed') {
            const text = json.response?.output?.[0]?.content?.[0]?.text
            if (text) return text
          }
        } catch { /* linha malformada */ }
      }
    }

    if (!result) throw new Error('Codex não retornou texto')
    return result
  }
}
