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
import {
  getOpenAIConversationResponseId,
  resetOpenAIConversationResponseId,
  setOpenAIConversationResponseId
} from './ai-conversation-state'
import { resolveFeatureBudget, type FeatureBudget } from './ai-budget-policy'
import { recordDiagnosticEvent } from './observability'
import {
  buildOpenAIResponsesInput,
  resolveOpenAIInputTokenEstimate,
  shouldUseOpenAIResponsesAPI
} from './ai-token-meter'

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
  responseId?: string
  estimatedInputTokens?: number
  actualInputTokens?: number
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
  conversationKey?: string
  allowResponseState?: boolean
  resetResponseState?: boolean
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
    conversationKey?: string
    allowResponseState?: boolean
    resetResponseState?: boolean
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
    feature: input.feature,
    conversationKey: input.conversationKey,
    allowResponseState: input.allowResponseState,
    resetResponseState: input.resetResponseState
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
    if (!providerSupportsRequest(provider, chatRequest)) continue
    const effectiveProvider = resolveEffectiveProvider(provider, tier, chatRequest)
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
  const usingResponsesApi = shouldUseOpenAIResponsesAPI(model, request)
  if (request.resetResponseState && request.conversationKey) {
    resetOpenAIConversationResponseId(request.conversationKey)
  }
  const previousResponseId =
    usingResponsesApi && request.allowResponseState && request.conversationKey
      ? getOpenAIConversationResponseId(request.conversationKey)
      : null
  const inputEstimate = await resolveOpenAIInputTokenEstimate({
    baseUrl: provider.baseUrl,
    apiKey,
    model,
    request,
    previousResponseId,
    usingResponsesApi
  })
  const estimatedInputTokens = inputEstimate.estimatedInputTokens
  void recordOpenAIInputBudgetDiagnostic({
    feature: request.feature,
    model,
    estimatedInputTokens,
    maxInputTokens: budget.maxInputTokens,
    conversationKey: request.conversationKey,
    usingResponsesApi,
    usedPreviousResponseState: Boolean(previousResponseId),
    usedInputTokenCountEndpoint: inputEstimate.usedInputTokenCountEndpoint
  })

  if (usingResponsesApi) {
    return streamOpenAIResponses(provider, request, onChunk, {
      apiKey,
      budget,
      model,
      estimatedInputTokens,
      usedInputTokenCountEndpoint: inputEstimate.usedInputTokenCountEndpoint,
      previousResponseId
    })
  }

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
    const { inputTokens, outputTokens, cachedInputTokens } = resolveOpenAIUsageMetrics(usageData)
    void recordOpenAIInputEstimateAccuracy({
      model,
      feature: request.feature,
      estimatedInputTokens,
      actualInputTokens: inputTokens,
      usedInputTokenCountEndpoint: inputEstimate.usedInputTokenCountEndpoint,
      usingResponsesApi: false
    })
    await recordAICost({
      providerId: 'openai', model, operation: 'chat', feature: request.feature,
      costUsd: calculateOpenAITextCost(model, inputTokens, outputTokens, cachedInputTokens),
      inputTokens, cachedInputTokens, outputTokens, at: Date.now()
    })
    void recordAIUsageDiagnostic({
      providerId: 'openai',
      model,
      feature: request.feature,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      appliedBudget: budget.maxOutputTokens,
      maxInputTokens: budget.maxInputTokens,
      estimatedInputTokens,
      promptCacheKey: promptCache.key,
      promptCacheRetention: promptCache.retention ?? 'in_memory',
      usingResponsesApi: false,
      usedPreviousResponseState: false,
      usedInputTokenCountEndpoint: inputEstimate.usedInputTokenCountEndpoint
    })
  }
  return {
    providerId: 'openai',
    model,
    text: fullText,
    estimatedInputTokens,
    actualInputTokens: usageData ? resolveOpenAIUsageMetrics(usageData).inputTokens : undefined
  }
}

async function streamOpenAIResponses(
  provider: StoredAIProvider,
  request: RemoteChatRequest,
  onChunk: (text: string) => void,
  context: {
    apiKey: string
    budget: FeatureBudget
    model: string
    estimatedInputTokens: number
    usedInputTokenCountEndpoint: boolean
    previousResponseId: string | null
  }
): Promise<ProviderExecutionResult> {
  const payload = buildOpenAIResponsesPayload({
    model: context.model,
    request,
    budget: context.budget,
    previousResponseId: context.previousResponseId,
    stream: true
  })
  const promptCache = resolveOpenAIPromptCacheSettings(context.model, request)
  const response = await fetch(joinUrl(provider.baseUrl, '/responses'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${context.apiKey}`
    },
    body: JSON.stringify(payload)
  })
  if (!response.ok) throw new Error(`OpenAI responses respondeu ${response.status}.`)
  if (!response.body) throw new Error('OpenAI responses: resposta sem body.')

  let fullText = ''
  let responseId = ''
  let usageData: OpenAIUsage | null = null

  for await (const data of parseSSELines(response.body)) {
    if (data === '[DONE]') break
    try {
      const parsed = JSON.parse(data) as {
        type?: string
        delta?: string
        response?: {
          id?: string
          usage?: OpenAIUsage
          output?: OpenAIResponsesOutputItem[]
        }
      }
      if (parsed.type === 'response.output_text.delta' && parsed.delta) {
        fullText += parsed.delta
        onChunk(parsed.delta)
      }
      if (parsed.type === 'response.completed' && parsed.response) {
        responseId = parsed.response.id ?? responseId
        usageData = parsed.response.usage ?? usageData
        if (!fullText) {
          fullText = extractOpenAIResponseText(parsed.response.output)
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  if (!fullText) throw new Error('OpenAI responses nao retornou texto.')
  if (request.conversationKey && request.allowResponseState && responseId) {
    setOpenAIConversationResponseId(request.conversationKey, responseId)
  }
  if (usageData) {
    const { inputTokens, outputTokens, cachedInputTokens } = resolveOpenAIUsageMetrics(usageData)
    void recordOpenAIInputEstimateAccuracy({
      model: context.model,
      feature: request.feature,
      estimatedInputTokens: context.estimatedInputTokens,
      actualInputTokens: inputTokens,
      usedInputTokenCountEndpoint: context.usedInputTokenCountEndpoint,
      usingResponsesApi: true
    })
    await recordAICost({
      providerId: 'openai',
      model: context.model,
      operation: 'chat',
      feature: request.feature,
      costUsd: calculateOpenAITextCost(context.model, inputTokens, outputTokens, cachedInputTokens),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      at: Date.now()
    })
    void recordAIUsageDiagnostic({
      providerId: 'openai',
      model: context.model,
      feature: request.feature,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      appliedBudget: context.budget.maxOutputTokens,
      maxInputTokens: context.budget.maxInputTokens,
      estimatedInputTokens: context.estimatedInputTokens,
      promptCacheKey: promptCache.key,
      promptCacheRetention: promptCache.retention ?? 'in_memory',
      usingResponsesApi: true,
      usedPreviousResponseState: Boolean(context.previousResponseId),
      usedInputTokenCountEndpoint: context.usedInputTokenCountEndpoint,
      responseId
    })
  }

  return {
    providerId: 'openai',
    model: context.model,
    text: fullText,
    responseId,
    estimatedInputTokens: context.estimatedInputTokens,
    actualInputTokens: usageData ? resolveOpenAIUsageMetrics(usageData).inputTokens : undefined
  }
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
  return {
    providerId: 'anthropic',
    model,
    text: fullText,
    actualInputTokens: inputTokens || undefined
  }
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
  conversationKey?: string
  allowResponseState?: boolean
  resetResponseState?: boolean
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
    feature: input.feature,
    conversationKey: input.conversationKey,
    allowResponseState: input.allowResponseState,
    resetResponseState: input.resetResponseState
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

    if (!providerSupportsRequest(provider, chatRequest)) continue

    // Apply tier/model overrides, but keep image requests on vision-capable models.
    const effectiveProvider = resolveEffectiveProvider(provider, tier, chatRequest)

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

function providerSupportsRequest(provider: StoredAIProvider, request: RemoteChatRequest): boolean {
  if (!request.imageDataUrl) return true
  return PROVIDER_DEFINITIONS[provider.id].capabilities.supportsVision
}

function resolveEffectiveProvider(
  provider: StoredAIProvider,
  tier: AIFeatureTier,
  request: RemoteChatRequest
): StoredAIProvider {
  if (request.imageDataUrl && provider.id === 'openai') {
    const selectedModel = provider.selectedModel ?? PROVIDER_DEFINITIONS.openai.defaultModel
    if (!selectedModel || !isOpenAIVisionModel(selectedModel)) {
      return { ...provider, selectedModel: PROVIDER_DEFINITIONS.openai.defaultModel }
    }
  }

  if (tier === 'cheap' && CHEAP_MODELS[provider.id]) {
    return { ...provider, selectedModel: CHEAP_MODELS[provider.id]! }
  }

  return provider
}

function isOpenAIVisionModel(model: string): boolean {
  const normalized = model.toLowerCase()
  return normalized.startsWith('gpt-4.1') || normalized.startsWith('gpt-4o')
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
  const usingResponsesApi = shouldUseOpenAIResponsesAPI(model, request)
  if (request.resetResponseState && request.conversationKey) {
    resetOpenAIConversationResponseId(request.conversationKey)
  }
  const previousResponseId =
    usingResponsesApi && request.allowResponseState && request.conversationKey
      ? getOpenAIConversationResponseId(request.conversationKey)
      : null
  const inputEstimate = await resolveOpenAIInputTokenEstimate({
    baseUrl: provider.baseUrl,
    apiKey,
    model,
    request,
    previousResponseId,
    usingResponsesApi
  })
  const estimatedInputTokens = inputEstimate.estimatedInputTokens
  void recordOpenAIInputBudgetDiagnostic({
    feature: request.feature,
    model,
    estimatedInputTokens,
    maxInputTokens: budget.maxInputTokens,
    conversationKey: request.conversationKey,
    usingResponsesApi,
    usedPreviousResponseState: Boolean(previousResponseId),
    usedInputTokenCountEndpoint: inputEstimate.usedInputTokenCountEndpoint
  })

  if (usingResponsesApi) {
    return sendOpenAIResponses(provider, request, {
      apiKey,
      budget,
      model,
      estimatedInputTokens,
      usedInputTokenCountEndpoint: inputEstimate.usedInputTokenCountEndpoint,
      previousResponseId
    })
  }

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
    usage?: OpenAIUsage
  }
  const text = payload.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('OpenAI nao retornou texto.')
  const responseModel = payload.model ?? model
  const { inputTokens, outputTokens, cachedInputTokens } = resolveOpenAIUsageMetrics(payload.usage)
  void recordOpenAIInputEstimateAccuracy({
    model: responseModel,
    feature: request.feature,
    estimatedInputTokens,
    actualInputTokens: inputTokens,
    usedInputTokenCountEndpoint: inputEstimate.usedInputTokenCountEndpoint,
    usingResponsesApi: false
  })
  await recordAICost({
    providerId: 'openai',
    model: responseModel,
    operation: 'chat',
    feature: request.feature,
    costUsd: calculateOpenAITextCost(responseModel, inputTokens, outputTokens, cachedInputTokens),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    at: Date.now()
  })
  void recordAIUsageDiagnostic({
    providerId: 'openai',
    model: responseModel,
    feature: request.feature,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    appliedBudget: budget.maxOutputTokens,
    maxInputTokens: budget.maxInputTokens,
    estimatedInputTokens,
    promptCacheKey: promptCache.key,
    promptCacheRetention: promptCache.retention ?? 'in_memory',
    usingResponsesApi: false,
    usedPreviousResponseState: false,
    usedInputTokenCountEndpoint: inputEstimate.usedInputTokenCountEndpoint
  })

  return {
    providerId: 'openai',
    model: responseModel,
    text,
    estimatedInputTokens,
    actualInputTokens: inputTokens
  }
}

async function sendOpenAIResponses(
  provider: StoredAIProvider,
  request: RemoteChatRequest,
  context: {
    apiKey: string
    budget: FeatureBudget
    model: string
    estimatedInputTokens: number
    usedInputTokenCountEndpoint: boolean
    previousResponseId: string | null
  }
): Promise<ProviderExecutionResult> {
  const requestPayload = buildOpenAIResponsesPayload({
    model: context.model,
    request,
    budget: context.budget,
    previousResponseId: context.previousResponseId,
    stream: false
  })
  const promptCache = resolveOpenAIPromptCacheSettings(context.model, request)
  const response = await fetch(joinUrl(provider.baseUrl, '/responses'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${context.apiKey}`
    },
    body: JSON.stringify(requestPayload)
  })
  if (!response.ok) {
    throw new Error(`OpenAI responses respondeu ${response.status}.`)
  }

  const responsePayload = await response.json() as {
    id?: string
    model?: string
    output?: OpenAIResponsesOutputItem[]
    usage?: OpenAIUsage
  }
  const text = extractOpenAIResponseText(responsePayload.output)
  if (!text) throw new Error('OpenAI responses nao retornou texto.')

  const responseId = responsePayload.id ?? ''
  if (request.conversationKey && request.allowResponseState && responseId) {
    setOpenAIConversationResponseId(request.conversationKey, responseId)
  }

  const responseModel = responsePayload.model ?? context.model
  const { inputTokens, outputTokens, cachedInputTokens } = resolveOpenAIUsageMetrics(responsePayload.usage)
  void recordOpenAIInputEstimateAccuracy({
    model: responseModel,
    feature: request.feature,
    estimatedInputTokens: context.estimatedInputTokens,
    actualInputTokens: inputTokens,
    usedInputTokenCountEndpoint: context.usedInputTokenCountEndpoint,
    usingResponsesApi: true
  })
  await recordAICost({
    providerId: 'openai',
    model: responseModel,
    operation: 'chat',
    feature: request.feature,
    costUsd: calculateOpenAITextCost(responseModel, inputTokens, outputTokens, cachedInputTokens),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    at: Date.now()
  })
  void recordAIUsageDiagnostic({
    providerId: 'openai',
    model: responseModel,
    feature: request.feature,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    appliedBudget: context.budget.maxOutputTokens,
    maxInputTokens: context.budget.maxInputTokens,
    estimatedInputTokens: context.estimatedInputTokens,
    promptCacheKey: promptCache.key,
    promptCacheRetention: promptCache.retention ?? 'in_memory',
    usingResponsesApi: true,
    usedPreviousResponseState: Boolean(context.previousResponseId),
    usedInputTokenCountEndpoint: context.usedInputTokenCountEndpoint,
    responseId
  })

  return {
    providerId: 'openai',
    model: responseModel,
    text,
    responseId,
    estimatedInputTokens: context.estimatedInputTokens,
    actualInputTokens: inputTokens
  }
}

type OpenAIUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  input_tokens_details?: { cached_tokens?: number }
}

type OpenAIResponsesOutputItem = {
  type?: string
  role?: string
  content?: Array<{ type?: string; text?: string }>
}

function buildOpenAIResponsesPayload(input: {
  model: string
  request: RemoteChatRequest
  budget: FeatureBudget
  previousResponseId: string | null
  stream: boolean
}): Record<string, unknown> {
  const promptCache = resolveOpenAIPromptCacheSettings(input.model, input.request)
  const isGpt5Family = input.model.toLowerCase().startsWith('gpt-5')

  return {
    model: input.model,
    instructions: input.request.system,
    ...(isGpt5Family ? {} : { temperature: input.budget.temperature }),
    max_output_tokens: input.budget.maxOutputTokens,
    prompt_cache_key: promptCache.key,
    ...(promptCache.retention ? { prompt_cache_retention: promptCache.retention } : {}),
    ...(input.previousResponseId ? { previous_response_id: input.previousResponseId } : {}),
    input: buildOpenAIResponsesInput(input.request, Boolean(input.previousResponseId)),
    stream: input.stream,
    store: false
  }
}

function extractOpenAIResponseText(output?: OpenAIResponsesOutputItem[]): string {
  const parts: string[] = []

  for (const item of output ?? []) {
    if (item.type !== 'message') continue
    if (item.role !== 'assistant') continue
    for (const block of item.content ?? []) {
      if (typeof block.text !== 'string' || !block.text.trim()) continue
      parts.push(block.text)
    }
  }

  return parts.join('\n').trim()
}

function resolveOpenAIUsageMetrics(usage?: OpenAIUsage): {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
} {
  return {
    inputTokens: usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.total_tokens ?? 0,
    cachedInputTokens:
      usage?.prompt_tokens_details?.cached_tokens
      ?? usage?.input_tokens_details?.cached_tokens
      ?? 0,
    outputTokens: usage?.completion_tokens ?? usage?.output_tokens ?? 0
  }
}

async function recordOpenAIInputBudgetDiagnostic(input: {
  feature?: AIFeatureTask
  model: string
  estimatedInputTokens: number
  maxInputTokens: number
  conversationKey?: string
  usingResponsesApi: boolean
  usedPreviousResponseState: boolean
  usedInputTokenCountEndpoint?: boolean
}): Promise<void> {
  const overBudget = input.estimatedInputTokens > input.maxInputTokens
  await recordDiagnosticEvent({
    type: 'trace',
    source: 'main',
    action: overBudget ? 'input_budget_warning' : 'input_budget_estimated',
    details: {
      provider: 'openai',
      model: input.model,
      feature: input.feature ?? 'unknown',
      estimatedInputTokens: input.estimatedInputTokens,
      maxInputTokens: input.maxInputTokens,
      overBudget,
      usingResponsesApi: input.usingResponsesApi,
      usedPreviousResponseState: input.usedPreviousResponseState,
      usedInputTokenCountEndpoint: input.usedInputTokenCountEndpoint ?? false,
      hasConversationKey: Boolean(input.conversationKey)
    }
  })
}

async function recordOpenAIInputEstimateAccuracy(input: {
  model: string
  feature?: AIFeatureTask
  estimatedInputTokens: number
  actualInputTokens: number
  usedInputTokenCountEndpoint: boolean
  usingResponsesApi: boolean
}): Promise<void> {
  if (input.estimatedInputTokens <= 0 || input.actualInputTokens <= 0) return

  const absoluteError = Math.abs(input.actualInputTokens - input.estimatedInputTokens)
  const relativeError = Number((absoluteError / input.actualInputTokens).toFixed(4))

  await recordDiagnosticEvent({
    type: 'trace',
    source: 'main',
    action: 'input_estimate_accuracy',
    details: {
      provider: 'openai',
      model: input.model,
      feature: input.feature ?? 'unknown',
      estimatedInputTokens: input.estimatedInputTokens,
      actualInputTokens: input.actualInputTokens,
      absoluteError,
      relativeError,
      usedInputTokenCountEndpoint: input.usedInputTokenCountEndpoint,
      usingResponsesApi: input.usingResponsesApi
    }
  })
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
  let actualInputTokens: number | undefined
  if (payload.usage) {
    const inputTokens = payload.usage.input_tokens ?? 0
    const outputTokens = payload.usage.output_tokens ?? 0
    const cacheCreationTokens = payload.usage.cache_creation_input_tokens ?? 0
    const cacheReadTokens = payload.usage.cache_read_input_tokens ?? 0
    actualInputTokens = inputTokens || undefined
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
  return {
    providerId: 'anthropic',
    model,
    text,
    actualInputTokens
  }
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
  maxInputTokens?: number
  estimatedInputTokens?: number
  promptCacheKey?: string
  promptCacheRetention?: 'in_memory' | '24h'
  anthropicCacheTtl?: '5m' | '1h'
  usingResponsesApi?: boolean
  usedPreviousResponseState?: boolean
  usedInputTokenCountEndpoint?: boolean
  responseId?: string
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
      maxInputTokens: input.maxInputTokens ?? 0,
      estimatedInputTokens: input.estimatedInputTokens ?? 0,
      cacheHitRate,
      promptCacheKey: input.promptCacheKey ?? '',
      promptCacheRetention: input.promptCacheRetention ?? '',
      anthropicCacheTtl: input.anthropicCacheTtl ?? '',
      usingResponsesApi: input.usingResponsesApi ?? false,
      usedPreviousResponseState: input.usedPreviousResponseState ?? false,
      usedInputTokenCountEndpoint: input.usedInputTokenCountEndpoint ?? false,
      responseId: input.responseId ?? ''
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
