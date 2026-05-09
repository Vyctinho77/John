import { CodexAuthManager } from './CodexAuthManager.ts'

const BASE_URL              = 'https://chatgpt.com/backend-api'
const CODEX_RESPONSES_URL   = `${BASE_URL}/codex/responses`
const VISION_RESPONSES_URL  = `${BASE_URL}/responses`   // supports image inputs

// Modelos conhecidos do Codex com Plus, em ordem de preferência.
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
  imageDataUrl?: string | null
  signal?: AbortSignal
}

export class CodexClient {
  private cachedModel: string | null = null
  private cachedVisionModel: string | null = null

  constructor(private auth: CodexAuthManager) {}

  async listModels(): Promise<string[]> {
    const token = await this.auth.getValidToken()

    const endpoints = [
      `${BASE_URL}/codex/models?client_version=0.111.0`,
      `${BASE_URL}/models`,
      `${BASE_URL}/models?history_and_training_disabled=false`,
    ]

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) {
          console.log(`[Codex] ${url} -> ${res.status}`)
          continue
        }

        const data = await res.json() as unknown
        console.log('[Codex] listModels raw:', JSON.stringify(data).slice(0, 800))
        const raw = Array.isArray(data) ? data : (data as { models?: unknown[] }).models ?? []
        const models = raw
          .map((model: unknown) => {
            if (typeof model === 'string') return model
            const value = model as { id?: string; slug?: string }
            return value.id ?? value.slug ?? ''
          })
          .filter(Boolean)

        if (models.length) {
          console.log('[Codex] modelos encontrados:', models)
          return models
        }
      } catch (error) {
        console.log(`[Codex] ${url} falhou:`, error)
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

  private async resolveVisionModel(): Promise<string> {
    if (this.cachedVisionModel) return this.cachedVisionModel

    const models = await this.listModels()
    const visionPreference = ['gpt-4.1', 'gpt-4o', 'gpt-4-vision', 'gpt-4o-mini']

    for (const preference of visionPreference) {
      const match = models.find(model => model.startsWith(preference))
      if (match) {
        this.cachedVisionModel = match
        console.log('[Codex] modelo de visão selecionado:', this.cachedVisionModel)
        return this.cachedVisionModel
      }
    }

    this.cachedVisionModel = models[0]
    console.log('[Codex] modelo de visão (fallback):', this.cachedVisionModel)
    return this.cachedVisionModel
  }

  async chat(options: CodexRequestOptions): Promise<string> {
    const token = await this.auth.getValidToken()
    const model = options.imageDataUrl
      ? await this.resolveVisionModel()
      : await this.resolveModel(options.model)

    const systemMessage = options.messages.find(message => message.role === 'system')
    const nonSystemMessages = options.messages.filter(message => message.role !== 'system')

    const input = nonSystemMessages.map((message, index) => {
      if (options.imageDataUrl && message.role === 'user' && index === nonSystemMessages.length - 1) {
        return {
          role: message.role,
          content: [
            { type: 'input_text', text: message.content },
            { type: 'input_image', image_url: options.imageDataUrl, detail: 'auto' }
          ]
        }
      }
      return { role: message.role, content: message.content }
    })

    const url = options.imageDataUrl ? VISION_RESPONSES_URL : CODEX_RESPONSES_URL
    console.log(`[Codex] chat -> ${url} model=${model} vision=${Boolean(options.imageDataUrl)}`)

    const res = await fetch(url, {
      method: 'POST',
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: systemMessage?.content ?? '',
        input,
        stream: true,
        store: false,
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Codex ${url.includes('/codex/') ? 'codex' : 'vision'} API ${res.status}: ${errorText.slice(0, 300)}`)
    }

    return this.parseSSE(res)
  }

  private async parseSSE(res: Response): Promise<string> {
    const reader = res.body!.getReader()
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
        } catch {
          // Ignore malformed SSE lines.
        }
      }
    }

    if (!result) throw new Error('Codex não retornou texto')
    return result
  }
}
