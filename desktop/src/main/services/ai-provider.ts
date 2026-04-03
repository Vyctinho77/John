import { app, safeStorage } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  AIRoutingSettings,
  AIProviderId,
  AIProviderModelOption,
  AIProviderSnapshot,
  AISettingsSnapshot,
  SaveAIProviderInput,
  TestAIProviderResult
} from '../../shared/ai-provider.types'

const AI_SETTINGS_PATH = join(app.getPath('userData'), 'ai-providers.json')

const DEFAULT_ROUTING: AIRoutingSettings = {
  textPrimary: null,
  textFallback: null,
  preferLocalForSensitive: true
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

export async function generateRemoteText(input: {
  sensitive: boolean
  system: string
  prompt: string
  imageDataUrl?: string | null
}): Promise<ProviderExecutionResult | null> {
  const settings = await getStoredSettings()
  const providerOrder = buildProviderOrder(settings.routing)

  const chatRequest: RemoteChatRequest = {
    system: input.system,
    prompt: input.prompt,
    imageDataUrl: input.imageDataUrl
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

    try {
      return await sendProviderChat(provider, chatRequest)
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

export async function generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  const trimmedInputs = texts.map(text => text.trim()).filter(Boolean)
  if (trimmedInputs.length === 0) return []

  const settings = await getStoredSettings()
  const provider = settings.providers.openai
  if (!canUseProvider(provider)) {
    throw new Error('OpenAI embeddings indisponiveis.')
  }

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
  }

  const vectors = (payload.data ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(entry => entry.embedding ?? [])

  if (vectors.length !== trimmedInputs.length || vectors.some(vector => vector.length === 0)) {
    throw new Error('OpenAI embeddings nao retornou vetores validos.')
  }

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
      preferLocalForSensitive: settings.routing?.preferLocalForSensitive ?? DEFAULT_ROUTING.preferLocalForSensitive
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
  const apiKey = requireSecret(provider)
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
      model: provider.selectedModel ?? PROVIDER_DEFINITIONS.openai.defaultModel,
      temperature: 0.35,
      messages: [
        { role: 'system', content: request.system },
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
  }
  const text = payload.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('OpenAI nao retornou texto.')
  return {
    providerId: 'openai',
    model: payload.model ?? provider.selectedModel ?? 'openai',
    text
  }
}

async function sendAnthropicChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest
): Promise<ProviderExecutionResult> {
  const apiKey = requireSecret(provider)
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
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: provider.selectedModel ?? 'claude-sonnet-4-6',
      max_tokens: 900,
      system: request.system,
      messages: [{ role: 'user', content: userContent }]
    })
  })
  if (!response.ok) {
    throw new Error(`Anthropic respondeu ${response.status}.`)
  }
  const payload = await response.json() as {
    model?: string
    content?: Array<{ type: string; text?: string }>
  }
  const text = payload.content
    ?.filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('\n')
    .trim()
  if (!text) throw new Error('Anthropic nao retornou texto.')
  return {
    providerId: 'anthropic',
    model: payload.model ?? provider.selectedModel ?? 'anthropic',
    text
  }
}

async function sendGeminiChat(
  provider: StoredAIProvider,
  request: RemoteChatRequest
): Promise<ProviderExecutionResult> {
  const apiKey = requireSecret(provider)
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
        temperature: 0.35
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
      messages: [
        { role: 'system', content: request.system },
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
