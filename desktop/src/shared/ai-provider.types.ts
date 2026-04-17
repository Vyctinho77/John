export type AIProviderId = 'openai' | 'anthropic' | 'gemini' | 'ollama'

export type AIFeatureTask = 'tutor' | 'vision' | 'stage2' | 'title' | 'router'

export type AIFeatureTier = 'heuristic' | 'cheap' | 'strong'

export interface AIProviderModelOption {
  id: string
  label: string
}

export interface AIProviderCapabilities {
  supportsStreaming: boolean
  supportsVision: boolean
  localOnly: boolean
}

export type AIProviderConnectionState =
  | 'unknown'
  | 'configured'
  | 'valid'
  | 'invalid'
  | 'error'

export interface AIProviderSnapshot {
  id: AIProviderId
  label: string
  enabled: boolean
  hasKey: boolean
  baseUrl: string
  selectedModel: string | null
  modelOptions: AIProviderModelOption[]
  capabilities: AIProviderCapabilities
  status: AIProviderConnectionState
  lastTestedAt: number | null
  lastError: string | null
}

export interface AIRoutingSettings {
  textPrimary: AIProviderId | null
  textFallback: AIProviderId | null
  preferLocalForSensitive: boolean
  featureRouting: Record<AIFeatureTask, AIFeatureTier>
}

export interface AISettingsSnapshot {
  providers: AIProviderSnapshot[]
  routing: AIRoutingSettings
  secureStorageAvailable: boolean
}

export interface SaveAIProviderInput {
  id: AIProviderId
  enabled?: boolean
  apiKey?: string
  baseUrl?: string
  selectedModel?: string | null
}

export interface TestAIProviderResult {
  providerId: AIProviderId
  ok: boolean
  message: string
  snapshot: AIProviderSnapshot
}

export interface AICostSnapshot {
  date: string
  dailyLimitUsd: number | null
  spentUsd: number
  remainingUsd: number | null
  openaiSpentUsd: number
  lastUpdatedAt: number | null
  blocked: boolean
  byFeature: Record<AIFeatureTask, number>
}
