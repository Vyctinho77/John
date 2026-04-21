import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  AICostSnapshot,
  AIFeatureTask,
  AIFeatureTier,
  AIRoutingSettings,
  AIProviderId,
  AIProviderModelOption,
  AIProviderSnapshot,
  AISettingsSnapshot,
  SaveAIProviderInput,
  TestAIProviderResult
} from '../../shared/ai-provider.types'
import { assertOpenAIBudgetAvailable, getAICostSnapshot, recordAICost } from './ai-costs'
import { recordDiagnosticEvent } from './observability'

const AI_SETTINGS_PATH = join(app.getPath('userData'), 'ai-providers.json')

const DEFAULT_FEATURE_ROUTING: Record<AIFeatureTask, AIFeatureTier> = {
  tutor:  'strong',
  vision: 'strong',
  stage2: 'cheap',
  title:  'cheap',
  router: 'cheap'
}

const CHEAP_MODELS: Partial<Record<AIProviderId, string>> = {
  openai:    'gpt-4.1-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  gemini:    'gemini-2.5-flash-lite'
}

const DEFAULT_ROUTING: AIRoutingSettings = {
  textPrimary: null,
  textFallback: null,
  preferLocalForSensitive: true,
  featureRouting: DEFAULT_FEATURE_ROUTING
}

interface StoredAIProvider {
  id: AIProviderId
  enabled: boolean
  encryptedApiKey: string | null
  baseUrl: string
  selectedModel: string | null
  modelOptions: AIProviderModelOption[]
  status: AIProviderSnapshot['status']
  lastTestedAt: number | null
  lastError: string | null
}

interface StoredAISettings {
  providers: Record<AIProviderId, StoredAIProvider>
  routing: AIRoutingSettings
}

interface ProviderDefinition {
  id: AIProviderId
  label: string
  defaultBaseUrl: string
  defaultModel: string | null
  modelOptions: AIProviderModelOption[]
  capabilities: AIProviderSnapshot['capabilities']
}

export interface ProviderExecutionResult {
  providerId: AIProviderId
  model: string
  text: string
}

export interface OpenAIEmbeddingAvailability {
  available: boolean
  reason: string | null
}

interface RemoteChatRequest {
  system: string
  prompt: string
  imageDataUrl?: string | null
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  feature?: AIFeatureTask
}

interface FeatureBudget {
  maxOutputTokens: number
  temperature: number
}

interface OpenAIPromptCacheSettings {
  key: string
  retention?: 'in_memory' | '24h'
}

interface AnthropicCacheSettings {
  cacheControl: {
    type: 'ephemeral'
    ttl?: '5m' | '1h'
  }
}

let cachedSettings: StoredAISettings | null = null

const DEFAULT_FEATURE_BUDGET: FeatureBudget = {
  maxOutputTokens: 700,
  temperature: 0.35
}

const FEATURE_BUDGETS: Record<AIFeatureTask, FeatureBudget> = {
  tutor: {
    maxOutputTokens: 900,
    temperature: 0.35
  },
  vision: {
    maxOutputTokens: 420,
    temperature: 0.1
  },
  router: {
    maxOutputTokens: 140,
    temperature: 0
  },
  title: {
    maxOutputTokens: 80,
    temperature: 0.2
  },
  stage2: {
    maxOutputTokens: 320,
    temperature: 0.25
  }
}

const PROVIDER_DEFINITIONS: Record<AIProviderId, ProviderDefinition> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1',
    modelOptions: [
      { id: 'gpt-4.1',      label: 'GPT-4.1' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'o3',           label: 'o3 (reasoning)' },
      { id: 'o4-mini',      label: 'o4 mini (reasoning)' },
      { id: 'gpt-4o',       label: 'GPT-4o (legado)' },
      { id: 'gpt-4o-mini',  label: 'GPT-4o mini (legado)' }
    ],
    capabilities: {
      supportsStreaming: true,
      supportsVision: true,
      localOnly: false
    }
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    modelOptions: [
      { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6' },
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (legado)' }
    ],
    capabilities: {
      supportsStreaming: true,
      supportsVision: true,
      localOnly: false
    }
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    modelOptions: [
      { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' }
    ],
    capabilities: {
      supportsStreaming: true,
      supportsVision: true,
      localOnly: false
    }
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    defaultModel: null,
    modelOptions: [],
    capabilities: {
      supportsStreaming: true,
      supportsVision: false,
      localOnly: true
    }
  }
}

export async function getAISettingsSnapshot(): Promise<AISettingsSnapshot> {
  const settings = await getStoredSettings()
  return {
    providers: Object.values(settings.providers).map(toPublicProvider),
    routing: settings.routing,
    secureStorageAvailable: safeStorage.isEncryptionAvailable()
  }
}

export async function saveAIProvider(input: SaveAIProviderInput): Promise<AISettingsSnapshot> {
  const settings = await getStoredSettings()
  const provider = settings.providers[input.id]

  const nextProvider: StoredAIProvider = {
    ...provider,
    enabled: input.enabled ?? provider.enabled,
    baseUrl: input.baseUrl?.trim() || provider.baseUrl,
    selectedModel:
      input.selectedModel !== undefined
        ? input.selectedModel
        : provider.selectedModel,
    encryptedApiKey:
      input.apiKey !== undefined
        ? encodeSecret(input.apiKey.trim())
        : provider.encryptedApiKey,
    status: provider.status === 'valid' ? 'configured' : provider.status,
    lastError: null
  }

  settings.providers[input.id] = normalizeProvider(nextProvider)
  if (settings.routing.textPrimary === null && settings.providers[input.id].enabled) {
    settings.routing.textPrimary = input.id
  }
  cachedSettings = settings
  await persistSettings(settings)
  return getAISettingsSnapshot()
}

export async function removeAIProvider(providerId: AIProviderId): Promise<AISettingsSnapshot> {
  const settings = await getStoredSettings()
  const definition = PROVIDER_DEFINITIONS[providerId]

  settings.providers[providerId] = normalizeProvider({
    ...buildDefaultStoredProvider(definition),
    enabled: false
  })

  if (settings.routing.textPrimary === providerId) {
    settings.routing.textPrimary = null
  }
  if (settings.routing.textFallback === providerId) {
    settings.routing.textFallback = null
  }

  cachedSettings = settings
  await persistSettings(settings)
  return getAISettingsSnapshot()
}

export async function updateAIRouting(patch: Partial<AIRoutingSettings>): Promise<AISettingsSnapshot> {
  const settings = await getStoredSettings()
  settings.routing = {
    ...settings.routing,
    ...patch
  }
  cachedSettings = settings
  await persistSettings(settings)
  return getAISettingsSnapshot()
}

export async function testAIProvider(providerId: AIProviderId): Promise<TestAIProviderResult> {
  const settings = await getStoredSettings()
  const provider = settings.providers[providerId]

  try {
    const models = await loadProviderModels(provider)
    provider.modelOptions = models.length ? models : provider.modelOptions
    provider.status = 'valid'
    provider.lastError = null
    provider.lastTestedAt = Date.now()
    if (!provider.selectedModel) {
      provider.selectedModel = provider.modelOptions[0]?.id ?? provider.selectedModel
    }
    settings.providers[providerId] = normalizeProvider(provider)
    cachedSettings = settings
    await persistSettings(settings)

    return {
      providerId,
      ok: true,
      message: buildSuccessMessage(providerId, provider.selectedModel),
      snapshot: toPublicProvider(settings.providers[providerId])
    }
  } catch (error) {
    provider.status = hasSecret(provider) ? 'error' : 'invalid'
    provider.lastError = error instanceof Error ? error.message : 'Falha ao validar o provedor.'
    provider.lastTestedAt = Date.now()
    settings.providers[providerId] = normalizeProvider(provider)
    cachedSettings = settings
    await persistSettings(settings)

    return {
      providerId,
      ok: false,
      message: provider.lastError,
      snapshot: toPublicProvider(settings.providers[providerId])
    }
  }
}

// ─── SSE line generator ───────────────────────────────────────────────────────

async function* parseSSELines(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) yield line.slice(6).trim()
      }
    }
    if (buffer.startsWith('data: ')) yield buffer.slice(6).trim()
  } finally {
    reader.releaseLock()
  }
}

// ─── Streaming variant of generateRemoteText ─────────────────────────────────

export async function streamRemoteText(
  input: {
    sensitive: boolean
    system: string
    prompt: string
    imageDataUrl?: string | null
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    feature?: AIFeatureTask
  },
  onChunk: (text: string) => void
): Promise<ProviderExecutionResult | null> {
  const settings = await getStoredSettings()
  const featureRouting = settings.routing.featureRouting ?? DEFAULT_FEATURE_ROUTING
  const tier: AIFeatureTier = input.feature
    ? (featureRouting[input.feature] ?? DEFAULT_FEATURE_ROUTING[input.feature])
    : 'strong'

  if (tier === 'heuristic') return null

  const providerOrder = buildProviderOrder(settings.routing)
  const chatRequest: RemoteChatRequest = {
    system: input.system,
    prompt: input.prompt,
    imageDataUrl: input.imageDataUrl,
    messages: input.messages,
    feature: input.feature
  }

  if (settings.routing.preferLocalForSensitive && input.sensitive) {
    const ollama = settings.providers.ollama
    if (canUseProvider(ollama)) {
      return streamProviderChat(ollama, { ...chatRequest, imageDataUrl: null }, onChunk)
    }
  }

  for (const providerId of providerOrder) {
    const provider = settings.providers[providerId]
    if (!canUseProvider(provider)) continue
    const effectiveProvider = tier === 'cheap' && CHEAP_MODELS[provider.id]
      ? { ...provider, selectedModel: CHEAP_MODELS[provider.id]! }
      : provider
    try {
      return await streamProviderChat(effectiveProvider, chatRequest, onChunk)
    } catch {
      continue
    }
  }
  return null
}

async function streamProviderChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest,
  onChunk: (text: string) => void
): Promise<ProviderExecutionResult> {
  switch (provider.id) {
    case 'openai':    return streamOpenAIChat(provider, request, onChunk)
    case 'anthropic': return streamAnthropicChat(provider, request, onChunk)
    case 'gemini':    return streamGeminiChat(provider, request, onChunk)
    case 'ollama':    return streamOllamaChat(provider, request, onChunk)
  }
}

async function streamOpenAIChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest,
  onChunk: (text: string) => void
): Promise<ProviderExecutionResult> {
  await assertOpenAIBudgetAvailable()
  const apiKey = requireSecret(provider)
  const budget = resolveFeatureBudget(request.feature)
  const model = provider.selectedModel ?? PROVIDER_DEFINITIONS.openai.defaultModel ?? 'openai'
  const promptCache = resolveOpenAIPromptCacheSettings(model, request)
  const userContent = request.imageDataUrl
    ? [
        { type: 'text', text: request.prompt },
        { type: 'image_url', image_url: { url: request.imageDataUrl!, detail: 'auto' } }
      ]
    : request.prompt

  const response = await fetch(joinUrl(provider.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: budget.temperature,
      max_tokens: budget.maxOutputTokens,
      prompt_cache_key: promptCache.key,
      ...(promptCache.retention ? { prompt_cache_retention: promptCache.retention } : {}),
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: request.system },
        ...(request.messages ?? []).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ]
    })
  })
  if (!response.ok) throw new Error(`OpenAI respondeu ${response.status}.`)
  if (!response.body) throw new Error('OpenAI: resposta sem body.')

  type OpenAIUsage = {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }

  let fullText = ''
  let usageData: OpenAIUsage | null = null

  for await (const data of parseSSELines(response.body)) {
    if (data === '[DONE]') break
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>
        usage?: OpenAIUsage
      }
      const delta = parsed.choices?.[0]?.delta?.content
      if (delta) { fullText += delta; onChunk(delta) }
      if (parsed.usage) usageData = parsed.usage
    } catch { /* skip malformed lines */ }
  }

  if (!fullText) throw new Error('OpenAI nao retornou texto.')
  if (usageData) {
    const promptTokens = usageData.prompt_tokens ?? 0
    const completionTokens = usageData.completion_tokens ?? 0
    const cachedInputTokens = usageData.prompt_tokens_details?.cached_tokens ?? 0
    await recordAICost({
      providerId: 'openai', model, operation: 'chat', feature: request.feature,
      costUsd: calculateOpenAITextCost(model, promptTokens, completionTokens, cachedInputTokens),
      inputTokens: promptTokens, cachedInputTokens, outputTokens: completionTokens, at: Date.now()
    })
    void recordAIUsageDiagnostic({
      providerId: 'openai',
      model,
      feature: request.feature,
      inputTokens: promptTokens,
      cachedInputTokens,
      outputTokens: completionTokens,
      appliedBudget: budget.maxOutputTokens,
      promptCacheKey: promptCache.key,
      promptCacheRetention: promptCache.retention ?? 'in_memory'
    })
  }
  return { providerId: 'openai', model, text: fullText }
}

async function streamAnthropicChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest,
  onChunk: (text: string) => void
): Promise<ProviderExecutionResult> {
  const apiKey = requireSecret(provider)
  const budget = resolveFeatureBudget(request.feature)
  const cacheSettings = resolveAnthropicCacheSettings(request)
  const imageB64 = request.imageDataUrl ? extractBase64(request.imageDataUrl) : null
  const userContent = imageB64
    ? [
        { type: 'image', source: { type: 'base64', media_type: imageB64.mediaType, data: imageB64.data } },
        { type: 'text', text: request.prompt }
      ]
    : request.prompt

  const response = await fetch(joinUrl(provider.baseUrl, '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31'
    },
    body: JSON.stringify({
      model: provider.selectedModel ?? 'claude-sonnet-4-6',
      max_tokens: budget.maxOutputTokens,
      stream: true,
      cache_control: cacheSettings.cacheControl,
      system: [{ type: 'text', text: request.system, cache_control: cacheSettings.cacheControl }],
      messages: [
        ...(request.messages ?? []).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ]
    })
  })
  if (!response.ok) throw new Error(`Anthropic respondeu ${response.status}.`)
  if (!response.body) throw new Error('Anthropic: resposta sem body.')

  let fullText = ''
  let modelFromEvent = ''
  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationTokens = 0
  let cacheReadTokens = 0

  for await (const data of parseSSELines(response.body)) {
    try {
      const event = JSON.parse(data) as {
        type?: string
        delta?: { type?: string; text?: string }
        usage?: { output_tokens?: number }
        message?: {
          model?: string
          usage?: {
            input_tokens?: number
            output_tokens?: number
            cache_creation_input_tokens?: number
            cache_read_input_tokens?: number
          }
        }
      }
      if (event.type === 'message_start' && event.message) {
        if (event.message.model) modelFromEvent = event.message.model
        if (event.message.usage) {
          inputTokens = event.message.usage.input_tokens ?? 0
          outputTokens = event.message.usage.output_tokens ?? 0
          cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0
          cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0
        }
      }
      if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens ?? outputTokens
      }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
        fullText += event.delta.text
        onChunk(event.delta.text)
      }
    } catch { /* skip malformed lines */ }
  }

  if (!fullText) throw new Error('Anthropic nao retornou texto.')
  const model = modelFromEvent || provider.selectedModel || 'anthropic'
  if (inputTokens > 0 || outputTokens > 0) {
    await recordAICost({
      providerId: 'anthropic', model, operation: 'chat', feature: request.feature,
      costUsd: calculateAnthropicTextCost(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens),
      inputTokens, cachedInputTokens: cacheReadTokens, outputTokens, at: Date.now()
    })
    void recordAIUsageDiagnostic({
      providerId: 'anthropic',
      model,
      feature: request.feature,
      inputTokens,
      cachedInputTokens: cacheReadTokens,
      outputTokens,
      cacheCreationTokens,
      appliedBudget: budget.maxOutputTokens,
      anthropicCacheTtl: cacheSettings.cacheControl.ttl ?? '5m'
    })
  }
  return { providerId: 'anthropic', model, text: fullText }
}

async function streamGeminiChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest,
  onChunk: (text: string) => void
): Promise<ProviderExecutionResult> {
  const apiKey = requireSecret(provider)
  const budget = resolveFeatureBudget(request.feature)
  const model = provider.selectedModel ?? PROVIDER_DEFINITIONS.gemini.defaultModel ?? 'gemini-2.5-flash'
  const url = `${trimTrailingSlash(provider.baseUrl)}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [
        ...(request.messages ?? []).map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        {
          role: 'user',
          parts: [
            ...(request.imageDataUrl ? (() => {
              const b64 = extractBase64(request.imageDataUrl)
              return b64 ? [{ inlineData: { mimeType: b64.mediaType, data: b64.data } }] : []
            })() : []),
            { text: request.prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: budget.temperature,
        maxOutputTokens: budget.maxOutputTokens
      }
    })
  })
  if (!response.ok) throw new Error(`Gemini respondeu ${response.status}.`)
  if (!response.body) throw new Error('Gemini: resposta sem body.')

  let fullText = ''

  for await (const data of parseSSELines(response.body)) {
    try {
      const parsed = JSON.parse(data) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const chunk = parsed.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('')
      if (chunk) { fullText += chunk; onChunk(chunk) }
    } catch { /* skip malformed lines */ }
  }

  if (!fullText) throw new Error('Gemini nao retornou texto.')
  return { providerId: 'gemini', model, text: fullText }
}

async function streamOllamaChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest,
  onChunk: (text: string) => void
): Promise<ProviderExecutionResult> {
  const model = provider.selectedModel
  const budget = resolveFeatureBudget(request.feature)
  if (!model) throw new Error('Selecione um modelo do Ollama antes de usar este provedor.')

  const response = await fetch(joinUrl(provider.baseUrl, '/api/chat'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, stream: true,
      options: {
        temperature: budget.temperature,
        num_predict: budget.maxOutputTokens
      },
      messages: [
        { role: 'system', content: request.system },
        ...(request.messages ?? []).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: request.prompt }
      ]
    })
  })
  if (!response.ok) throw new Error(`Ollama respondeu ${response.status}.`)
  if (!response.body) throw new Error('Ollama: resposta sem body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as { message?: { content?: string } }
          const delta = parsed.message?.content
          if (delta) { fullText += delta; onChunk(delta) }
        } catch { /* skip */ }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!fullText) throw new Error('Ollama nao retornou texto.')
  return { providerId: 'ollama', model, text: fullText }
}

export async function generateRemoteText(input: {
  sensitive: boolean
  system: string
  prompt: string
  imageDataUrl?: string | null
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  feature?: AIFeatureTask
}): Promise<ProviderExecutionResult | null> {
  const settings = await getStoredSettings()

  // Resolve effective tier for this feature
  const featureRouting = settings.routing.featureRouting ?? DEFAULT_FEATURE_ROUTING
  const tier: AIFeatureTier = input.feature
    ? (featureRouting[input.feature] ?? DEFAULT_FEATURE_ROUTING[input.feature])
    : 'strong'

  // Heuristic tier means no LLM call
  if (tier === 'heuristic') return null

  const providerOrder = buildProviderOrder(settings.routing)

  const chatRequest: RemoteChatRequest = {
    system: input.system,
    prompt: input.prompt,
    imageDataUrl: input.imageDataUrl,
    messages: input.messages,
    feature: input.feature
  }

  if (settings.routing.preferLocalForSensitive && input.sensitive) {
    const ollama = settings.providers.ollama
    if (canUseProvider(ollama)) {
      return sendProviderChat(ollama, { ...chatRequest, imageDataUrl: null })
    }
  }

  for (const providerId of providerOrder) {
    const provider = settings.providers[providerId]
    if (!canUseProvider(provider)) continue

    // Apply cheap model override when tier is 'cheap'
    const effectiveProvider =
      tier === 'cheap' && CHEAP_MODELS[provider.id]
        ? { ...provider, selectedModel: CHEAP_MODELS[provider.id]! }
        : provider

    try {
      return await sendProviderChat(effectiveProvider, chatRequest)
    } catch {
      continue
    }
  }

  return null
}

export async function getOpenAIEmbeddingAvailability(): Promise<OpenAIEmbeddingAvailability> {
  const settings = await getStoredSettings()
  const provider = settings.providers.openai

  if (!provider.enabled) {
    return { available: false, reason: 'OpenAI desativado.' }
  }

  if (!hasSecret(provider)) {
    return { available: false, reason: 'Chave OpenAI ausente.' }
  }

  return { available: true, reason: null }
}

export async function getAICosts(): Promise<AICostSnapshot> {
  return getAICostSnapshot()
}

export async function generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  const trimmedInputs = texts.map(text => text.trim()).filter(Boolean)
  if (trimmedInputs.length === 0) return []

  const settings = await getStoredSettings()
  const provider = settings.providers.openai
  if (!canUseProvider(provider)) {
    throw new Error('OpenAI embeddings indisponiveis.')
  }
  await assertOpenAIBudgetAvailable()

  const apiKey = requireSecret(provider)
  const response = await fetch(joinUrl(provider.baseUrl, '/embeddings'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: trimmedInputs
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI embeddings respondeu ${response.status}.`)
  }

  const payload = await response.json() as {
    data?: Array<{ embedding?: number[]; index?: number }>
    usage?: {
      prompt_tokens?: number
      total_tokens?: number
    }
  }

  const vectors = (payload.data ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(entry => entry.embedding ?? [])

  if (vectors.length !== trimmedInputs.length || vectors.some(vector => vector.length === 0)) {
    throw new Error('OpenAI embeddings nao retornou vetores validos.')
  }

  const promptTokens = payload.usage?.prompt_tokens ?? payload.usage?.total_tokens ?? 0
  await recordAICost({
    providerId: 'openai',
    model: 'text-embedding-3-small',
    operation: 'embedding',
    costUsd: calculateEmbeddingCost('text-embedding-3-small', promptTokens),
    inputTokens: promptTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    at: Date.now()
  })

  return vectors
}

export async function resetAISettings(): Promise<AISettingsSnapshot> {
  cachedSettings = createDefaultSettings()
  await rm(AI_SETTINGS_PATH, { force: true })
  await persistSettings(cachedSettings)
  return getAISettingsSnapshot()
}

async function getStoredSettings(): Promise<StoredAISettings> {
  if (cachedSettings) return cachedSettings

  try {
    const raw = await readFile(AI_SETTINGS_PATH, 'utf-8')
    cachedSettings = normalizeStoredSettings(JSON.parse(raw) as Partial<StoredAISettings>)
  } catch {
    cachedSettings = createDefaultSettings()
    await persistSettings(cachedSettings)
  }

  return cachedSettings
}

function createDefaultSettings(): StoredAISettings {
  return normalizeStoredSettings({
    providers: {
      openai: buildDefaultStoredProvider(PROVIDER_DEFINITIONS.openai),
      anthropic: buildDefaultStoredProvider(PROVIDER_DEFINITIONS.anthropic),
      gemini: buildDefaultStoredProvider(PROVIDER_DEFINITIONS.gemini),
      ollama: buildDefaultStoredProvider(PROVIDER_DEFINITIONS.ollama)
    },
    routing: DEFAULT_ROUTING
  })
}

function normalizeStoredSettings(settings: Partial<StoredAISettings>): StoredAISettings {
  const providers = (settings.providers ?? {}) as Partial<Record<AIProviderId, StoredAIProvider>>
  return {
    providers: {
      openai: normalizeProvider(providers.openai ?? buildDefaultStoredProvider(PROVIDER_DEFINITIONS.openai)),
      anthropic: normalizeProvider(providers.anthropic ?? buildDefaultStoredProvider(PROVIDER_DEFINITIONS.anthropic)),
      gemini: normalizeProvider(providers.gemini ?? buildDefaultStoredProvider(PROVIDER_DEFINITIONS.gemini)),
      ollama: normalizeProvider(providers.ollama ?? buildDefaultStoredProvider(PROVIDER_DEFINITIONS.ollama))
    },
    routing: {
      textPrimary: settings.routing?.textPrimary ?? DEFAULT_ROUTING.textPrimary,
      textFallback: settings.routing?.textFallback ?? DEFAULT_ROUTING.textFallback,
      preferLocalForSensitive: settings.routing?.preferLocalForSensitive ?? DEFAULT_ROUTING.preferLocalForSensitive,
      featureRouting: normalizeFeatureRouting(settings.routing?.featureRouting)
    }
  }
}

function buildDefaultStoredProvider(definition: ProviderDefinition): StoredAIProvider {
  return {
    id: definition.id,
    enabled: false,
    encryptedApiKey: null,
    baseUrl: definition.defaultBaseUrl,
    selectedModel: definition.defaultModel,
    modelOptions: definition.modelOptions,
    status: 'unknown',
    lastTestedAt: null,
    lastError: null
  }
}

function normalizeProvider(provider: StoredAIProvider): StoredAIProvider {
  const definition = PROVIDER_DEFINITIONS[provider.id]
  return {
    id: provider.id,
    enabled: Boolean(provider.enabled),
    encryptedApiKey: provider.encryptedApiKey ?? null,
    baseUrl: provider.baseUrl?.trim() || definition.defaultBaseUrl,
    selectedModel: provider.selectedModel ?? definition.defaultModel,
    modelOptions: definition.modelOptions,
    status: provider.status ?? (hasSecret(provider) ? 'configured' : 'unknown'),
    lastTestedAt: typeof provider.lastTestedAt === 'number' ? provider.lastTestedAt : null,
    lastError: provider.lastError ?? null
  }
}

function toPublicProvider(provider: StoredAIProvider): AIProviderSnapshot {
  const definition = PROVIDER_DEFINITIONS[provider.id]
  return {
    id: provider.id,
    label: definition.label,
    enabled: provider.enabled,
    hasKey: hasSecret(provider),
    baseUrl: provider.baseUrl,
    selectedModel: provider.selectedModel,
    modelOptions: provider.modelOptions,
    capabilities: definition.capabilities,
    status: provider.status,
    lastTestedAt: provider.lastTestedAt,
    lastError: provider.lastError
  }
}

function normalizeFeatureRouting(
  stored: Partial<Record<AIFeatureTask, AIFeatureTier>> | undefined
): Record<AIFeatureTask, AIFeatureTier> {
  const validTiers: AIFeatureTier[] = ['heuristic', 'cheap', 'strong']
  const result = { ...DEFAULT_FEATURE_ROUTING }
  if (!stored) return result

  for (const task of Object.keys(DEFAULT_FEATURE_ROUTING) as AIFeatureTask[]) {
    const v = stored[task]
    if (v && validTiers.includes(v)) {
      result[task] = v
    }
  }
  return result
}

function buildProviderOrder(routing: AIRoutingSettings): AIProviderId[] {
  const ordered = [routing.textPrimary, routing.textFallback].filter(Boolean) as AIProviderId[]
  const fallbackOrder: AIProviderId[] = ['openai', 'anthropic', 'gemini', 'ollama']
  for (const providerId of fallbackOrder) {
    if (!ordered.includes(providerId)) ordered.push(providerId)
  }
  return ordered
}

function canUseProvider(provider: StoredAIProvider): boolean {
  if (!provider.enabled) return false
  if (provider.id === 'ollama') return true
  return hasSecret(provider)
}

function hasSecret(provider: Pick<StoredAIProvider, 'id' | 'encryptedApiKey'>): boolean {
  if (provider.id === 'ollama') return true
  return Boolean(provider.encryptedApiKey)
}

function encodeSecret(secret: string): string | null {
  if (!secret) return null
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(secret).toString('base64')}`
  }
  return `plain:${Buffer.from(secret, 'utf-8').toString('base64')}`
}

function decodeSecret(secret: string | null): string | null {
  if (!secret) return null
  if (secret.startsWith('safe:')) {
    const encrypted = Buffer.from(secret.slice(5), 'base64')
    return safeStorage.decryptString(encrypted)
  }
  if (secret.startsWith('plain:')) {
    return Buffer.from(secret.slice(6), 'base64').toString('utf-8')
  }
  return null
}

async function persistSettings(settings: StoredAISettings): Promise<void> {
  await mkdir(dirname(AI_SETTINGS_PATH), { recursive: true })
  await writeFile(AI_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}

async function loadProviderModels(provider: StoredAIProvider): Promise<AIProviderModelOption[]> {
  switch (provider.id) {
    case 'openai':
      return loadOpenAIModels(provider)
    case 'anthropic':
      await validateAnthropic(provider)
      return provider.modelOptions
    case 'gemini':
      return loadGeminiModels(provider)
    case 'ollama':
      return loadOllamaModels(provider)
  }
}

async function sendProviderChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest
): Promise<ProviderExecutionResult> {
  switch (provider.id) {
    case 'openai':
      return sendOpenAIChat(provider, request)
    case 'anthropic':
      return sendAnthropicChat(provider, request)
    case 'gemini':
      return sendGeminiChat(provider, request)
    case 'ollama':
      return sendOllamaChat(provider, request)
  }
}

async function loadOpenAIModels(provider: StoredAIProvider): Promise<AIProviderModelOption[]> {
  const apiKey = requireSecret(provider)
  const response = await fetch(joinUrl(provider.baseUrl, '/models'), {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  })
  if (!response.ok) {
    throw new Error(`OpenAI respondeu ${response.status}. Verifique a chave e a base URL.`)
  }
  const payload = await response.json() as { data?: Array<{ id: string }> }
  const models = (payload.data ?? [])
    .map(item => item.id)
    .filter(id => /^gpt-|^o\d/.test(id))
    .slice(0, 16)
    .map(id => ({ id, label: id }))

  return models.length ? models : provider.modelOptions
}

async function validateAnthropic(provider: StoredAIProvider): Promise<void> {
  const apiKey = requireSecret(provider)
  const response = await fetch(joinUrl(provider.baseUrl, '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: provider.selectedModel ?? 'claude-sonnet-4-6',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping' }]
    })
  })
  if (!response.ok) {
    throw new Error(`Anthropic respondeu ${response.status}. Verifique a chave, o modelo e a base URL.`)
  }
}

async function loadGeminiModels(provider: StoredAIProvider): Promise<AIProviderModelOption[]> {
  const apiKey = requireSecret(provider)
  const url = `${trimTrailingSlash(provider.baseUrl)}/models?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Gemini respondeu ${response.status}. Verifique a chave e a base URL.`)
  }
  const payload = await response.json() as { models?: Array<{ name: string; displayName?: string }> }
  const models = (payload.models ?? [])
    .map(model => ({
      id: model.name.replace(/^models\//, ''),
      label: model.displayName || model.name.replace(/^models\//, '')
    }))
    .filter(model => /gemini/i.test(model.id))
    .slice(0, 16)

  return models.length ? models : provider.modelOptions
}

async function loadOllamaModels(provider: StoredAIProvider): Promise<AIProviderModelOption[]> {
  const response = await fetch(joinUrl(provider.baseUrl, '/api/tags'))
  if (!response.ok) {
    throw new Error(`Ollama respondeu ${response.status}. Confirme se o servidor local esta ativo.`)
  }
  const payload = await response.json() as { models?: Array<{ name: string }> }
  const models = (payload.models ?? []).map(model => ({ id: model.name, label: model.name }))
  if (!models.length) {
    throw new Error('Nenhum modelo encontrado no Ollama local.')
  }
  return models
}

async function sendOpenAIChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest
): Promise<ProviderExecutionResult> {
  await assertOpenAIBudgetAvailable()
  const apiKey = requireSecret(provider)
  const budget = resolveFeatureBudget(request.feature)
  const model = provider.selectedModel ?? PROVIDER_DEFINITIONS.openai.defaultModel ?? 'openai'
  const promptCache = resolveOpenAIPromptCacheSettings(model, request)
  const userContent = request.imageDataUrl
    ? [
        { type: 'text', text: request.prompt },
        { type: 'image_url', image_url: { url: request.imageDataUrl!, detail: 'auto' } }
      ]
    : request.prompt

  const response = await fetch(joinUrl(provider.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: budget.temperature,
      max_tokens: budget.maxOutputTokens,
      prompt_cache_key: promptCache.key,
      ...(promptCache.retention ? { prompt_cache_retention: promptCache.retention } : {}),
      messages: [
        { role: 'system', content: request.system },
        ...(request.messages ?? []).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ]
    })
  })
  if (!response.ok) {
    throw new Error(`OpenAI respondeu ${response.status}.`)
  }
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    model?: string
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      prompt_tokens_details?: {
        cached_tokens?: number
      }
    }
  }
  const text = payload.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('OpenAI nao retornou texto.')
  const responseModel = payload.model ?? model
  const promptTokens = payload.usage?.prompt_tokens ?? 0
  const completionTokens = payload.usage?.completion_tokens ?? 0
  const cachedInputTokens = payload.usage?.prompt_tokens_details?.cached_tokens ?? 0
  await recordAICost({
    providerId: 'openai',
    model: responseModel,
    operation: 'chat',
    feature: request.feature,
    costUsd: calculateOpenAITextCost(responseModel, promptTokens, completionTokens, cachedInputTokens),
    inputTokens: promptTokens,
    cachedInputTokens,
    outputTokens: completionTokens,
    at: Date.now()
  })
  void recordAIUsageDiagnostic({
    providerId: 'openai',
    model: responseModel,
    feature: request.feature,
    inputTokens: promptTokens,
    cachedInputTokens,
    outputTokens: completionTokens,
    appliedBudget: budget.maxOutputTokens,
    promptCacheKey: promptCache.key,
    promptCacheRetention: promptCache.retention ?? 'in_memory'
  })

  return {
    providerId: 'openai',
    model: responseModel,
    text
  }
}

async function sendAnthropicChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest
): Promise<ProviderExecutionResult> {
  const apiKey = requireSecret(provider)
  const budget = resolveFeatureBudget(request.feature)
  const cacheSettings = resolveAnthropicCacheSettings(request)
  const imageB64 = request.imageDataUrl ? extractBase64(request.imageDataUrl) : null
  const userContent = imageB64
    ? [
        {
          type: 'image',
          source: { type: 'base64', media_type: imageB64.mediaType, data: imageB64.data }
        },
        { type: 'text', text: request.prompt }
      ]
    : request.prompt

  const response = await fetch(joinUrl(provider.baseUrl, '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31'
    },
    body: JSON.stringify({
      model: provider.selectedModel ?? 'claude-sonnet-4-6',
      max_tokens: budget.maxOutputTokens,
      cache_control: cacheSettings.cacheControl,
      system: [{ type: 'text', text: request.system, cache_control: cacheSettings.cacheControl }],
      messages: [
        ...(request.messages ?? []).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent }
      ]
    })
  })
  if (!response.ok) {
    throw new Error(`Anthropic respondeu ${response.status}.`)
  }
  const payload = await response.json() as {
    model?: string
    content?: Array<{ type: string; text?: string }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  const text = payload.content
    ?.filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('\n')
    .trim()
  if (!text) throw new Error('Anthropic nao retornou texto.')
  const model = payload.model ?? provider.selectedModel ?? 'anthropic'
  if (payload.usage) {
    const inputTokens = payload.usage.input_tokens ?? 0
    const outputTokens = payload.usage.output_tokens ?? 0
    const cacheCreationTokens = payload.usage.cache_creation_input_tokens ?? 0
    const cacheReadTokens = payload.usage.cache_read_input_tokens ?? 0
    await recordAICost({
      providerId: 'anthropic', model, operation: 'chat', feature: request.feature,
      costUsd: calculateAnthropicTextCost(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens),
      inputTokens, cachedInputTokens: cacheReadTokens, outputTokens, at: Date.now()
    })
    void recordAIUsageDiagnostic({
      providerId: 'anthropic',
      model,
      feature: request.feature,
      inputTokens,
      cachedInputTokens: cacheReadTokens,
      outputTokens,
      cacheCreationTokens,
      appliedBudget: budget.maxOutputTokens,
      anthropicCacheTtl: cacheSettings.cacheControl.ttl ?? '5m'
    })
  }
  return { providerId: 'anthropic', model, text }
}

async function sendGeminiChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest
): Promise<ProviderExecutionResult> {
  const apiKey = requireSecret(provider)
  const budget = resolveFeatureBudget(request.feature)
  const model = provider.selectedModel ?? PROVIDER_DEFINITIONS.gemini.defaultModel ?? 'gemini-2.5-flash'
  const url = `${trimTrailingSlash(provider.baseUrl)}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: request.system }]
      },
      contents: [
        ...(request.messages ?? []).map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        {
          role: 'user',
          parts: [
            ...(request.imageDataUrl
              ? (() => {
                  const b64 = extractBase64(request.imageDataUrl)
                  return b64
                    ? [{ inlineData: { mimeType: b64.mediaType, data: b64.data } }]
                    : []
                })()
              : []),
            { text: request.prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: budget.temperature,
        maxOutputTokens: budget.maxOutputTokens
      }
    })
  })
  if (!response.ok) {
    throw new Error(`Gemini respondeu ${response.status}.`)
  }
  const payload = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>
      }
    }>
  }
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('\n').trim()
  if (!text) throw new Error('Gemini nao retornou texto.')
  return {
    providerId: 'gemini',
    model,
    text
  }
}

async function sendOllamaChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest
): Promise<ProviderExecutionResult> {
  const model = provider.selectedModel
  const budget = resolveFeatureBudget(request.feature)
  if (!model) {
    throw new Error('Selecione um modelo do Ollama antes de usar este provedor.')
  }

  const response = await fetch(joinUrl(provider.baseUrl, '/api/chat'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        temperature: budget.temperature,
        num_predict: budget.maxOutputTokens
      },
      messages: [
        { role: 'system', content: request.system },
        ...(request.messages ?? []).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: request.prompt }
      ]
    })
  })
  if (!response.ok) {
    throw new Error(`Ollama respondeu ${response.status}.`)
  }
  const payload = await response.json() as {
    message?: {
      content?: string
    }
  }
  const text = payload.message?.content?.trim()
  if (!text) throw new Error('Ollama nao retornou texto.')
  return {
    providerId: 'ollama',
    model,
    text
  }
}

function requireSecret(provider: StoredAIProvider): string {
  const secret = decodeSecret(provider.encryptedApiKey)
  if (!secret) {
    throw new Error(`Nenhuma chave configurada para ${PROVIDER_DEFINITIONS[provider.id].label}.`)
  }
  return secret
}

function extractBase64(dataUrl: string): { data: string; mediaType: string } | null {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { mediaType: match[1], data: match[2] }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${trimTrailingSlash(baseUrl)}${path}`
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function buildSuccessMessage(providerId: AIProviderId, model: string | null): string {
  const providerName = PROVIDER_DEFINITIONS[providerId].label
  if (!model) return `${providerName} conectado com sucesso.`
  return `${providerName} conectado com o modelo ${model}.`
}

function calculateOpenAITextCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedInputTokens: number
): number {
  const pricing = resolveOpenAITextPricing(model)
  if (!pricing) return 0

  const billableInputTokens = Math.max(0, promptTokens - cachedInputTokens)
  return (
    (billableInputTokens / 1_000_000) * pricing.input
    + (cachedInputTokens / 1_000_000) * pricing.cachedInput
    + (completionTokens / 1_000_000) * pricing.output
  )
}

function calculateAnthropicTextCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number
): number {
  const normalized = model.toLowerCase()
  let inputPer1M = 3.0
  let outputPer1M = 15.0
  if (normalized.includes('opus')) {
    inputPer1M = 5.0; outputPer1M = 25.0
  } else if (normalized.includes('haiku')) {
    inputPer1M = 1.0; outputPer1M = 5.0
  }
  const cacheWritePer1M = inputPer1M * 1.25
  const cacheReadPer1M = inputPer1M * 0.1
  const billableInput = Math.max(0, inputTokens - cacheReadTokens - cacheCreationTokens)
  return (
    (billableInput / 1_000_000) * inputPer1M
    + (cacheCreationTokens / 1_000_000) * cacheWritePer1M
    + (cacheReadTokens / 1_000_000) * cacheReadPer1M
    + (outputTokens / 1_000_000) * outputPer1M
  )
}

function calculateEmbeddingCost(model: string, promptTokens: number): number {
  const pricing = resolveEmbeddingPricing(model)
  if (!pricing) return 0
  return (promptTokens / 1_000_000) * pricing.input
}

function resolveFeatureBudget(feature?: AIFeatureTask): FeatureBudget {
  const budget = feature ? FEATURE_BUDGETS[feature] : null
  return budget ?? DEFAULT_FEATURE_BUDGET
}

function resolveOpenAIPromptCacheSettings(
  model: string,
  request: RemoteChatRequest
): OpenAIPromptCacheSettings {
  const normalizedModel = model.toLowerCase()
  const retention = supportsExtendedOpenAIPromptCache(normalizedModel) ? '24h' : undefined
  return {
    key: buildOpenAIPromptCacheKey(model, request),
    retention
  }
}

function supportsExtendedOpenAIPromptCache(normalizedModel: string): boolean {
  return normalizedModel === 'gpt-4.1' || normalizedModel.startsWith('gpt-4.1-')
}

function buildOpenAIPromptCacheKey(model: string, request: RemoteChatRequest): string {
  const systemPrefix = request.system.slice(0, 240)
  const historyPrefix = (request.messages ?? [])
    .slice(0, 2)
    .map(message => `${message.role}:${message.content.slice(0, 120)}`)
    .join('|')
  const promptPrefix = request.prompt.slice(0, 120)
  const imageMarker = request.imageDataUrl ? 'image' : 'text'
  return [
    request.feature ?? 'unknown',
    model,
    imageMarker,
    `s${stableHash(systemPrefix)}`,
    `h${stableHash(historyPrefix)}`,
    `p${stableHash(promptPrefix)}`
  ].join(':')
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function resolveAnthropicCacheSettings(request: RemoteChatRequest): AnthropicCacheSettings {
  const shouldUseExtendedTtl = request.feature === 'tutor' && (request.messages?.length ?? 0) >= 2
  return {
    cacheControl: shouldUseExtendedTtl
      ? { type: 'ephemeral', ttl: '1h' }
      : { type: 'ephemeral' }
  }
}

function recordAIUsageDiagnostic(input: {
  providerId: AIProviderId
  model: string
  feature?: AIFeatureTask
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  appliedBudget?: number
  promptCacheKey?: string
  promptCacheRetention?: 'in_memory' | '24h'
  anthropicCacheTtl?: '5m' | '1h'
}): Promise<void> {
  const cacheHitRate = input.inputTokens > 0
    ? Number((input.cachedInputTokens / input.inputTokens).toFixed(4))
    : 0

  return recordDiagnosticEvent({
    type: 'trace',
    source: 'main',
    action: 'usage_recorded',
    details: {
      provider: input.providerId,
      model: input.model,
      feature: input.feature ?? 'unknown',
      inputTokens: input.inputTokens,
      cachedInputTokens: input.cachedInputTokens,
      cacheCreationTokens: input.cacheCreationTokens ?? 0,
      outputTokens: input.outputTokens,
      appliedBudget: input.appliedBudget ?? 0,
      cacheHitRate,
      promptCacheKey: input.promptCacheKey ?? '',
      promptCacheRetention: input.promptCacheRetention ?? '',
      anthropicCacheTtl: input.anthropicCacheTtl ?? ''
    }
  })
}

function resolveOpenAITextPricing(model: string): {
  input: number
  cachedInput: number
  output: number
} | null {
  const normalized = model.toLowerCase()

  if (normalized.startsWith('gpt-4.1-mini')) {
    return { input: 0.4, cachedInput: 0.1, output: 1.6 }
  }
  if (normalized.startsWith('gpt-4.1')) {
    return { input: 2, cachedInput: 0.5, output: 8 }
  }
  if (normalized.startsWith('gpt-4o-mini')) {
    return { input: 0.15, cachedInput: 0.075, output: 0.6 }
  }
  if (normalized.startsWith('gpt-4o')) {
    return { input: 2.5, cachedInput: 1.25, output: 10 }
  }
  if (normalized.startsWith('o4-mini')) {
    return { input: 1.1, cachedInput: 0.275, output: 4.4 }
  }
  if (normalized === 'o3' || normalized.startsWith('o3-')) {
    return { input: 2, cachedInput: 0.5, output: 8 }
  }

  return null
}

function resolveEmbeddingPricing(model: string): { input: number } | null {
  const normalized = model.toLowerCase()
  if (normalized === 'text-embedding-3-small') {
    return { input: 0.02 }
  }
  if (normalized === 'text-embedding-3-large') {
    return { input: 0.13 }
  }
  return null
}
