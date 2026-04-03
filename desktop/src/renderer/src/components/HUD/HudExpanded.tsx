import {
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode
} from 'react'
import { motion } from 'framer-motion'
import { LogoMark } from './LogoMark'
import { ConfigIcon } from './ConfigIcon'
import { NotificationsIcon } from './NotificationsIcon'
import { DataIcon } from './DataIcon'
import { ProfileIcon } from './ProfileIcon'
import { MessageBody } from './MessageBody'
import { SendIcon } from './SendIcon'
import { useDragWindow } from '@renderer/hooks/useDragWindow'
import type {
  AIProviderId,
  AIProviderSnapshot,
  AIRoutingSettings,
  AISettingsSnapshot,
  SaveAIProviderInput,
  TestAIProviderResult
} from '@shared/ai-provider.types'
import type {
  AppSettings,
  CaptureSource,
  DataDeletionSummary,
  DiagnosticsSnapshot,
  PrivacySnapshot,
  SemanticState,
  SessionMemory,
  TypographyFontFamily,
  TypographyFontWeight,
  TutorResponse,
  UserProfile
} from '@shared/perception.types'
import type {
  MemoryCardSummary,
  MemoryEmbeddingStatus,
  MemoryImportMode,
  MemoryImportPreview
} from '@shared/memory.types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
}

interface HudExpandedProps {
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  onInputFocus: () => void
  onInputBlur: () => void
  onActivity: () => void
  onCollapse: () => void
  messages: Message[]
  isStreaming: boolean
  streamingContent: string
  latestResponseMeta: TutorResponse | null
  semanticState: SemanticState | null
  sessionMemory: SessionMemory | null
  userProfile: UserProfile | null
  settings: AppSettings | null
  diagnostics: DiagnosticsSnapshot | null
  privacy: PrivacySnapshot | null
  lastDeletion: DataDeletionSummary | null
  memorySummary: MemoryCardSummary | null
  memoryEmbeddingStatus: MemoryEmbeddingStatus | null
  memoryImportPreview: MemoryImportPreview | null
  memoryIncludeProfile: boolean
  memoryFeedback: string | null
  sources: CaptureSource[]
  isCapturing: boolean
  isPrivate: boolean
  onTogglePrivate: () => void
  onResumeSensitiveBlock: () => void
  onCycleLevel: () => void
  onCycleStyle: () => void
  onUpdateUserProfile: (patch: Partial<import('@shared/perception.types').UserProfile>) => void
  onClearContext: () => void
  onQuickPrompt: (value: string) => void
  onToggleTelemetry: () => void
  onToggleAlwaysVisible: () => void
  onToggleMinimalMode: () => void
  onTogglePassiveSuggestions: () => void
  onToggleAdvancedPerception: () => void
  onToggleCrashReporting: () => void
  onToggleVoiceMode: () => void
  onSelectCaptureSource: (source: CaptureSource | null) => void
  onDeleteLocalData: () => void
  onExportMemory: () => void
  onSyncEmbeddings: () => void
  onRebuildEmbeddings: () => void
  onSelectImportCard: () => void
  onApplyMemoryImport: (mode: MemoryImportMode) => void
  onToggleMemoryImportProfile: () => void
  onClearPersistedMemory: () => void
  aiSettings: AISettingsSnapshot | null
  onRefreshAISettings: () => Promise<void>
  onSaveProvider: (input: SaveAIProviderInput) => void
  onRemoveProvider: (providerId: AIProviderId) => void
  onTestProvider: (providerId: AIProviderId) => Promise<TestAIProviderResult>
  onUpdateAIRouting: (patch: Partial<AIRoutingSettings>) => void
  onUpdateTypography: (patch: Partial<AppSettings['typography']>) => void
  onShowStage1: () => void
  onShowStage2: () => void
  onShowStage3: () => void
  onSettingsOpenChange: (open: boolean) => void
}

type SettingsTab = 'general' | 'notifications' | 'data' | 'account' | 'api' | 'typography'

type ProviderDraftMap = Record<
  AIProviderId,
  {
    apiKey: string
    baseUrl: string
    selectedModel: string
  }
>

const INPUT_MIN_HEIGHT = 24
const INPUT_MAX_HEIGHT = 132

const TYPOGRAPHY_FAMILY_OPTIONS: Array<{ id: TypographyFontFamily; label: string; sample: string }> = [
  { id: 'system-sans', label: 'SF Pro / System Sans', sample: 'Apple-like, limpa e neutra' },
  { id: 'system-serif', label: 'New York / Serif', sample: 'Mais editorial e refinada' },
  { id: 'mono', label: 'SF Mono / Monospace', sample: 'Tecnica e utilitaria' }
]

const TYPOGRAPHY_SIZE_OPTIONS = [13, 14, 15, 16, 18]
const TYPOGRAPHY_WEIGHT_OPTIONS: Array<{ id: TypographyFontWeight; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'book', label: 'Book' },
  { id: 'regular', label: 'Regular' },
  { id: 'medium', label: 'Medium' },
  { id: 'bold', label: 'Bold' }
]

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      className="relative flex-shrink-0 transition-colors duration-200"
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: on ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.14)'
      }}
    >
      <div
        className="absolute top-0.5 transition-all duration-200"
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: on ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.52)',
          left: on ? 16 : 2
        }}
      />
    </div>
  )
}

function SettingsRow({
  label,
  value,
  muted = false,
  last = false,
  onClick,
  toggle
}: {
  label: string
  value: string
  muted?: boolean
  last?: boolean
  onClick?: () => void
  toggle?: boolean
}) {
  const Wrapper = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? {
        onMouseDown: (e: MouseEvent) => e.preventDefault(),
        onClick,
        className:
          'w-full flex items-center justify-between gap-4 transition-opacity duration-150 hover:opacity-80 active:opacity-60'
      }
    : { className: 'flex items-center justify-between gap-4' }

  return (
    <Wrapper
      {...(wrapperProps as HTMLAttributes<HTMLElement>)}
      style={{
        minHeight: 52,
        borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.06)'
      }}
    >
      <span
        className="py-4 text-[14px] text-left"
        style={{
          color: muted ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.88)',
          fontSize: 'var(--hud-font-size, 15px)'
        }}
      >
        {label}
      </span>
      {toggle !== undefined ? (
        <Toggle on={toggle} />
      ) : (
        <span
          className="inline-flex items-center gap-1.5 text-[14px] py-4"
          style={{ color: 'rgba(255,255,255,0.52)', fontSize: 'var(--hud-font-size, 15px)' }}
        >
          {value}
          {onClick && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path
                d="M2.25 4.25L6 8L9.75 4.25"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}
    </Wrapper>
  )
}

function SettingsNavItem({
  label,
  active,
  onClick,
  icon
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-left transition-colors duration-150"
      style={{
        color: active ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.44)',
        background: active ? 'rgba(255,255,255,0.06)' : 'transparent'
      }}
    >
      <span className="w-[22px] h-[22px] flex items-center justify-center flex-shrink-0 opacity-80">
        {icon}
      </span>
      <span className="text-[13px] leading-none" style={{ fontSize: 'var(--hud-font-size, 15px)' }}>{label}</span>
    </button>
  )
}

function ProviderPill({
  provider,
  active,
  onClick
}: {
  provider: AIProviderSnapshot
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[11px] transition-colors duration-150"
      style={{
        background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
        color: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.48)',
        border: `1px solid ${active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`
      }}
    >
      {provider.label}
    </button>
  )
}

function TypographyChoice({
  label,
  active,
  secondaryLabel,
  onClick
}: {
  label: string
  active: boolean
  secondaryLabel?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-2 rounded-2xl text-left transition-colors duration-150"
      style={{
        background: active ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
        color: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.6)',
        border: `1px solid ${active ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)'}`
      }}
    >
      <div className="text-[12px] leading-none">{label}</div>
      {secondaryLabel && (
        <div className="mt-1 text-[10px]" style={{ color: active ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.36)' }}>
          {secondaryLabel}
        </div>
      )}
    </button>
  )
}

function createEmptyProviderDrafts(): ProviderDraftMap {
  return {
    openai: { apiKey: '', baseUrl: '', selectedModel: '' },
    anthropic: { apiKey: '', baseUrl: '', selectedModel: '' },
    gemini: { apiKey: '', baseUrl: '', selectedModel: '' },
    ollama: { apiKey: '', baseUrl: '', selectedModel: '' }
  }
}

function labelSurface(surface: string): string {
  switch (surface) {
    case 'code':      return 'editor de código'
    case 'text':      return 'editor de texto'
    case 'document':  return 'documento'
    case 'dashboard': return 'dashboard'
    case 'graphic':   return 'ambiente gráfico'
    default:          return 'aplicativo'
  }
}

function labelEmbeddingState(state: MemoryEmbeddingStatus['state']): string {
  switch (state) {
    case 'ready':
      return 'ativo'
    case 'syncing':
      return 'sincronizando'
    case 'unavailable':
      return 'indisponivel'
    case 'error':
      return 'erro'
    default:
      return 'ocioso'
  }
}

export function HudExpanded({
  inputValue,
  onInputChange,
  onSubmit,
  onInputFocus,
  onInputBlur,
  onActivity,
  onCollapse: _onCollapse,
  messages,
  isStreaming,
  streamingContent,
  latestResponseMeta,
  semanticState,
  sessionMemory,
  userProfile,
  settings,
  diagnostics,
  privacy,
  lastDeletion,
  memorySummary,
  memoryEmbeddingStatus,
  memoryImportPreview,
  memoryIncludeProfile,
  memoryFeedback,
  sources,
  isCapturing: _isCapturing,
  isPrivate,
  onTogglePrivate,
  onResumeSensitiveBlock,
  onCycleLevel,
  onCycleStyle,
  onUpdateUserProfile,
  onClearContext,
  onQuickPrompt,
  onToggleTelemetry,
  onToggleAlwaysVisible,
  onToggleMinimalMode,
  onTogglePassiveSuggestions,
  onToggleAdvancedPerception,
  onToggleCrashReporting,
  onToggleVoiceMode,
  onSelectCaptureSource,
  onDeleteLocalData,
  onExportMemory,
  onSyncEmbeddings,
  onRebuildEmbeddings,
  onSelectImportCard,
  onApplyMemoryImport,
  onToggleMemoryImportProfile,
  onClearPersistedMemory,
  aiSettings,
  onRefreshAISettings,
  onSaveProvider,
  onRemoveProvider,
  onTestProvider,
  onUpdateAIRouting,
  onUpdateTypography,
  onShowStage1,
  onShowStage2,
  onShowStage3,
  onSettingsOpenChange
}: HudExpandedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { handleMouseDown } = useDragWindow()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general')
  const [activeProviderId, setActiveProviderId] = useState<AIProviderId>('openai')
  const [providerDrafts, setProviderDrafts] = useState<ProviderDraftMap>(createEmptyProviderDrafts())
  const [apiFeedback, setAPIFeedback] = useState<string | null>(null)
  const [isTestingProvider, setIsTestingProvider] = useState<AIProviderId | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streamingContent])

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    onSettingsOpenChange(settingsOpen)
  }, [settingsOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (settingsOpen && activeSettingsTab === 'api') {
      onRefreshAISettings()
    }
  }, [activeSettingsTab, onRefreshAISettings, settingsOpen])

  useEffect(() => {
    if (!aiSettings) return

    setProviderDrafts(current => {
      const next = { ...current }
      for (const provider of aiSettings.providers) {
        next[provider.id] = {
          // preserva apiKey que o usuário está digitando
          apiKey: current[provider.id]?.apiKey ?? '',
          baseUrl: provider.baseUrl,
          // só sobrescreve selectedModel se o draft ainda está vazio
          selectedModel:
            current[provider.id]?.selectedModel ||
            provider.selectedModel ||
            provider.modelOptions[0]?.id ||
            ''
        }
      }
      return next
    })
  }, [aiSettings])

  const quickActions = latestResponseMeta?.suggested_follow_ups?.length
    ? latestResponseMeta.suggested_follow_ups
    : ['Explica melhor', 'Resume isso', 'Mostra em passos']

  const hasConversation = messages.length > 0 || Boolean(streamingContent)
  const showGreeting = !hasConversation && !settingsOpen

  const displayName = userProfile?.display_name?.trim() || null
  const surface = semanticState?.surface_type ?? 'unknown'
  const topic = semanticState?.pedagogical_topics?.[0] ?? null
  const continuity = sessionMemory?.continuity_summary?.trim() ?? null

  const buildGreeting = (): { label: string; cta: string; subtitle: string | null } => {
    const hour = new Date().getHours()
    const name = displayName
    const returning = (sessionMemory?.frame_count ?? 0) > 0
    const lateNight = hour >= 23 || hour < 5

    const timeGreeting =
      hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : lateNight ? 'Ainda acordado?' : 'Boa noite'

    // subtitle: último contexto de sessão
    const subtitle = continuity
      ? continuity.length > 72 ? continuity.slice(0, 72) + '…' : continuity
      : topic
        ? `Detectei: ${topic}`
        : null

    if (!name) {
      return {
        label: surface !== 'unknown' ? `Vejo que você está num ${labelSurface(surface)}.` : 'John.',
        cta: 'Como posso ajudar?',
        subtitle
      }
    }

    if (returning) {
      const phrases = [
        `Você está de volta, ${name}.`,
        `De volta por aqui, ${name}?`,
        `Oi de novo, ${name}.`,
        `Pronto pra continuar, ${name}?`
      ]
      return {
        label: timeGreeting + '.',
        cta: phrases[new Date().getMinutes() % phrases.length],
        subtitle
      }
    }

    return {
      label: timeGreeting + '.',
      cta: `Olá, ${name}.`,
      subtitle
    }
  }

  const buildSuggestionPills = (): string[] => {
    const level = userProfile?.user_level ?? 'intermediate'

    const byLevel: Record<string, string[]> = {
      beginner:     ['Me explica do zero', 'Dá um exemplo prático', 'O que é isso?'],
      intermediate: ['Como isso funciona?', 'Quais são as opções?', 'Me resume isso'],
      advanced:     ['Quais os tradeoffs?', 'Quais os edge cases?', 'Mostra o código']
    }

    if (surface === 'code') {
      return level === 'advanced'
        ? ['Explica esse código', 'O que pode dar errado?', 'Como melhorar isso?']
        : ['O que esse código faz?', 'Tem algum bug aqui?', 'Explica linha a linha']
    }
    if (surface === 'document' || surface === 'text') {
      return ['Resume isso', 'Quais os pontos principais?', 'Explica em termos simples']
    }
    if (surface === 'dashboard') {
      return ['O que esses números dizem?', 'Aponta alguma anomalia', 'Faz um resumo disso']
    }
    if (continuity) {
      return ['Continuar de onde paramos', byLevel[level][0], byLevel[level][1]]
    }
    return byLevel[level] ?? byLevel.intermediate
  }

  const inputPlaceholder = (): string => {
    if (surface === 'code') return 'o que quer entender sobre esse código?'
    if (surface === 'document' || surface === 'text') return 'o que quer saber sobre esse texto?'
    if (surface === 'dashboard') return 'o que quer analisar aqui?'
    return 'o que está na sua tela agora?'
  }

  const greeting = buildGreeting()
  const suggestionPills = buildSuggestionPills()

  const syncInputHeight = () => {
    const input = inputRef.current
    if (!input) return
    input.style.height = `${INPUT_MIN_HEIGHT}px`
    input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT)}px`
  }

  useEffect(() => {
    syncInputHeight()
  }, [inputValue])

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onActivity()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !isStreaming) onSubmit()
    }
  }

  const selectedProvider = aiSettings?.providers.find(provider => provider.id === activeProviderId) ?? null
  const providerDraft = providerDrafts[activeProviderId]

  const updateProviderDraft = (patch: Partial<ProviderDraftMap[AIProviderId]>) => {
    setProviderDrafts(current => ({
      ...current,
      [activeProviderId]: {
        ...current[activeProviderId],
        ...patch
      }
    }))
  }

  const handleSaveActiveProvider = () => {
    if (!selectedProvider) return

    onSaveProvider({
      id: selectedProvider.id,
      enabled: true,
      apiKey: providerDraft.apiKey || undefined,
      baseUrl: providerDraft.baseUrl,
      selectedModel: providerDraft.selectedModel || null
    })

    updateProviderDraft({ apiKey: '' })
    setAPIFeedback(`${selectedProvider.label} salvo localmente.`)
  }

  const handleRemoveActiveProvider = () => {
    if (!selectedProvider) return
    onRemoveProvider(selectedProvider.id)
    updateProviderDraft({ apiKey: '' })
    setAPIFeedback(`${selectedProvider.label} removido deste dispositivo.`)
  }

  const handleTestActiveProvider = async () => {
    if (!selectedProvider) return
    setIsTestingProvider(selectedProvider.id)
    setAPIFeedback(null)
    try {
      const result = await onTestProvider(selectedProvider.id)
      setAPIFeedback(result.message)
    } finally {
      setIsTestingProvider(null)
    }
  }

  const renderAPISettings = () => {
    if (!settings) {
      return (
        <p className="mt-4 text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Configurações indisponíveis.
        </p>
      )
    }

    if (!aiSettings || !selectedProvider) {
      return (
        <p className="mt-4 text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Carregando provedores...
        </p>
      )
    }

    return (
      <>
        <p
          className="text-[18px] font-medium mb-1"
          style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.02em' }}
        >
          Minha API Key
        </p>

        <div className="mt-4 flex gap-2 flex-wrap">
          {aiSettings.providers.map(provider => (
            <ProviderPill
              key={provider.id}
              provider={provider}
              active={provider.id === activeProviderId}
              onClick={() => {
                setActiveProviderId(provider.id)
                setAPIFeedback(null)
              }}
            />
          ))}
        </div>

        <div
          className="mt-5 rounded-[22px] p-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)'
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px]" style={{ color: 'rgba(255,255,255,0.94)' }}>
                {selectedProvider.label}
              </p>
              <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.46)' }}>
                {selectedProvider.capabilities.localOnly
                  ? 'projeto local e fallback privado'
                  : 'sua chave fica salva apenas neste dispositivo'}
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-full text-[10px]"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color:
                  selectedProvider.status === 'valid'
                    ? 'rgba(255,255,255,0.88)'
                    : 'rgba(255,255,255,0.46)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}
            >
              {selectedProvider.status}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {!selectedProvider.capabilities.localOnly && (
              <label className="flex flex-col gap-2">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.44)' }}>
                  API key
                </span>
                <input
                  value={providerDraft.apiKey}
                  onChange={e => updateProviderDraft({ apiKey: e.target.value })}
                  placeholder={selectedProvider.hasKey ? '••••••••••••••••' : 'cole sua chave aqui'}
                  className="bg-transparent outline-none rounded-xl px-3 h-10"
                  style={{
                    color: 'rgba(255,255,255,0.92)',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}
                />
              </label>
            )}

            <label className="flex flex-col gap-2">
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.44)' }}>
                Base URL
              </span>
              <input
                value={providerDraft.baseUrl}
                onChange={e => updateProviderDraft({ baseUrl: e.target.value })}
                className="bg-transparent outline-none rounded-xl px-3 h-10"
                style={{
                  color: 'rgba(255,255,255,0.92)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.44)' }}>
                Modelo
              </span>
              <div className="flex gap-2 flex-wrap">
                {selectedProvider.modelOptions.map(model => (
                  <button
                    key={model.id}
                    onMouseDown={e => {
                      e.preventDefault()
                      updateProviderDraft({ selectedModel: model.id })
                      onSaveProvider({
                        id: selectedProvider.id,
                        selectedModel: model.id
                      })
                      setAPIFeedback(`Modelo ${model.label} selecionado.`)
                    }}
                    className="px-3 py-1.5 rounded-full text-[10px]"
                    style={{
                      background:
                        providerDraft.selectedModel === model.id
                          ? 'rgba(255,255,255,0.12)'
                          : 'rgba(255,255,255,0.04)',
                      color:
                        providerDraft.selectedModel === model.id
                          ? 'rgba(255,255,255,0.9)'
                          : 'rgba(255,255,255,0.48)',
                      border: `1px solid ${
                        providerDraft.selectedModel === model.id
                          ? 'rgba(255,255,255,0.18)'
                          : 'rgba(255,255,255,0.08)'
                      }`
                    }}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              onMouseDown={e => {
                e.preventDefault()
                handleSaveActiveProvider()
              }}
              className="px-3 py-1.5 rounded-full text-[10px]"
              style={{
                background: 'rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.88)',
                border: '1px solid rgba(255,255,255,0.14)'
              }}
            >
              salvar
            </button>
            <button
              onMouseDown={e => {
                e.preventDefault()
                void handleTestActiveProvider()
              }}
              className="px-3 py-1.5 rounded-full text-[10px]"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.72)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}
            >
              {isTestingProvider === selectedProvider.id ? 'testando...' : 'testar conexão'}
            </button>
            <button
              onMouseDown={e => {
                e.preventDefault()
                handleRemoveActiveProvider()
              }}
              className="px-3 py-1.5 rounded-full text-[10px]"
              style={{
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.48)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}
            >
              remover
            </button>
          </div>

          {apiFeedback && (
            <p className="mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.52)' }}>
              {apiFeedback}
            </p>
          )}
        </div>

        <div
          className="mt-4 rounded-[22px] p-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)'
          }}
        >
          <p className="text-[15px]" style={{ color: 'rgba(255,255,255,0.94)' }}>
            Roteamento
          </p>

          <div className="mt-4">
            <SettingsRow label="Primario de texto" value={aiSettings.routing.textPrimary || 'local'} />
            <SettingsRow label="Fallback" value={aiSettings.routing.textFallback || 'sem fallback'} />
            <SettingsRow
              label="Preferir local em conteúdo sensível"
              value={aiSettings.routing.preferLocalForSensitive ? 'Ativado' : 'Desativado'}
              toggle={aiSettings.routing.preferLocalForSensitive}
              onClick={() =>
                onUpdateAIRouting({
                  preferLocalForSensitive: !aiSettings.routing.preferLocalForSensitive
                })
              }
              last
            />
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {(['openai', 'anthropic', 'gemini', 'ollama'] as AIProviderId[]).map(providerId => (
              <button
                key={`primary-${providerId}`}
                onMouseDown={e => {
                  e.preventDefault()
                  onUpdateAIRouting({
                    textPrimary: aiSettings.routing.textPrimary === providerId ? null : providerId
                  })
                }}
                className="px-3 py-1.5 rounded-full text-[10px]"
                style={{
                  background:
                    aiSettings.routing.textPrimary === providerId
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(255,255,255,0.04)',
                  color:
                    aiSettings.routing.textPrimary === providerId
                      ? 'rgba(255,255,255,0.88)'
                      : 'rgba(255,255,255,0.48)',
                  border: `1px solid ${
                    aiSettings.routing.textPrimary === providerId
                      ? 'rgba(255,255,255,0.18)'
                      : 'rgba(255,255,255,0.08)'
                  }`
                }}
              >
                primario: {providerId}
              </button>
            ))}
          </div>

          <div className="mt-2 flex gap-2 flex-wrap">
            {(['openai', 'anthropic', 'gemini', 'ollama'] as AIProviderId[]).map(providerId => (
              <button
                key={`fallback-${providerId}`}
                onMouseDown={e => {
                  e.preventDefault()
                  onUpdateAIRouting({
                    textFallback: aiSettings.routing.textFallback === providerId ? null : providerId
                  })
                }}
                className="px-3 py-1.5 rounded-full text-[10px]"
                style={{
                  background:
                    aiSettings.routing.textFallback === providerId
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(255,255,255,0.04)',
                  color:
                    aiSettings.routing.textFallback === providerId
                      ? 'rgba(255,255,255,0.88)'
                      : 'rgba(255,255,255,0.48)',
                  border: `1px solid ${
                    aiSettings.routing.textFallback === providerId
                      ? 'rgba(255,255,255,0.18)'
                      : 'rgba(255,255,255,0.08)'
                  }`
                }}
              >
                fallback: {providerId}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <SettingsRow
            label="Crash reporting"
            value={settings.featureFlags.crashReporting ? 'Ativado' : 'Desativado'}
            toggle={settings.featureFlags.crashReporting}
            onClick={onToggleCrashReporting}
          />
          <SettingsRow
            label="Advanced perception"
            value={settings.featureFlags.advancedPerception ? 'Ativado' : 'Desativado'}
            toggle={settings.featureFlags.advancedPerception}
            onClick={onToggleAdvancedPerception}
            last
          />
        </div>

        {diagnostics && privacy && (
          <p className="mt-4 text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
            storage seguro: {aiSettings.secureStorageAvailable ? 'sim' : 'modo básico'} | traces:{' '}
            {diagnostics.performance.traceCount} | consentimentos: {privacy.consentTrail.length}
            {lastDeletion ? ' | limpeza registrada' : ''}
          </p>
        )}
      </>
    )
  }

  const renderSettingsContent = () => {
    if (!settings) {
      return (
        <div className="pt-2">
          <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.52)' }}>
            Configurações indisponíveis no momento.
          </p>
        </div>
      )
    }

    if (activeSettingsTab === 'general') {
      return (
        <>
          <p
            className="text-[18px] font-medium mb-1"
            style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.02em' }}
          >
            Geral
          </p>
          <div className="mt-4">
            <SettingsRow
              label="Modo minimalista"
              value={settings.minimalMode ? 'ativado' : 'desativado'}
              toggle={settings.minimalMode}
              onClick={onToggleMinimalMode}
            />
            <SettingsRow label="Cor de fundo" value="Preto" />
            <SettingsRow label="Idioma" value={userProfile?.response_language || 'Português'} last />
          </div>

          {sessionMemory?.continuity_summary && (
            <p className="mt-4 text-[11px]" style={{ color: 'rgba(255,255,255,0.48)' }}>
              {sessionMemory.continuity_summary}
            </p>
          )}
        </>
      )
    }

    if (activeSettingsTab === 'notifications') {
      return (
        <>
          <p
            className="text-[18px] font-medium mb-1"
            style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.02em' }}
          >
            Notificações
          </p>
          <div className="mt-4">
            <SettingsRow
              label="Sugestões passivas"
              value={settings.passiveSuggestions ? 'Ativado' : 'Desativado'}
              toggle={settings.passiveSuggestions}
              onClick={onTogglePassiveSuggestions}
            />
            <SettingsRow
              label="Sempre visível"
              value={settings.alwaysVisible ? 'Ativado' : 'Desativado'}
              toggle={settings.alwaysVisible}
              onClick={onToggleAlwaysVisible}
            />
            <SettingsRow
              label="Voice mode"
              value={settings.featureFlags.voiceMode ? 'Liberado' : 'Desligado'}
              toggle={settings.featureFlags.voiceMode}
              muted={!settings.featureFlags.voiceMode}
              onClick={onToggleVoiceMode}
              last
            />
          </div>
        </>
      )
    }

    if (activeSettingsTab === 'data') {
      return (
        <>
          <p
            className="text-[18px] font-medium mb-1"
            style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.02em' }}
          >
            Controle de dados
          </p>
          <div className="mt-4">
            <SettingsRow
              label="Telemetria"
              value={settings.telemetryOptIn ? 'Ativada' : 'Desativada'}
              toggle={settings.telemetryOptIn}
              onClick={onToggleTelemetry}
            />
            <SettingsRow
              label="Modo privado"
              value={isPrivate ? 'Ativado' : 'Desativado'}
              toggle={isPrivate}
              onClick={onTogglePrivate}
            />
            <SettingsRow
              label="Escopo de captura"
              value={
                settings.captureScope.mode === 'selected-source'
                  ? settings.captureScope.selectedSourceName || 'janela selecionada'
                  : 'qualquer janela'
              }
              muted={settings.captureScope.mode !== 'selected-source'}
            />
            <SettingsRow
              label="Apagar dados locais"
              value=""
              onClick={onDeleteLocalData}
              muted
              last
            />
          </div>

          <div
            className="mt-5 rounded-[22px] p-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)'
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[15px]" style={{ color: 'rgba(255,255,255,0.94)' }}>
                  Memory Card
                </p>
                <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.46)' }}>
                  Perfil + memória persistida, pronto para exportar ou reimportar.
                </p>
              </div>
              {memorySummary && (
                <span
                  className="px-2.5 py-1 rounded-full text-[10px]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.68)',
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  {memorySummary.item_count} memórias
                </span>
              )}
            </div>

            {memorySummary && (
              <div className="mt-4">
                <SettingsRow label="Dono" value={memorySummary.owner_name || 'sem nome'} />
                <SettingsRow label="Perfil" value={memorySummary.profile_summary} />
                <SettingsRow label="Impacto" value={memorySummary.impact_summary} last />
              </div>
            )}

            {memoryEmbeddingStatus && (
              <div
                className="mt-4 rounded-[18px] p-3.5"
                style={{
                  background: 'rgba(255,255,255,0.022)',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.86)' }}>
                      OpenAI embeddings
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.44)' }}>
                      {memoryEmbeddingStatus.embedding_model}
                    </p>
                  </div>
                  <span
                    className="px-2 py-1 rounded-full text-[10px]"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: 'rgba(255,255,255,0.66)',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    {labelEmbeddingState(memoryEmbeddingStatus.state)}
                  </span>
                </div>

                <div className="mt-3">
                  <SettingsRow
                    label="Itens indexados"
                    value={String(memoryEmbeddingStatus.indexed_count)}
                  />
                  <SettingsRow
                    label="Ultimo sync"
                    value={
                      memoryEmbeddingStatus.last_synced_at
                        ? new Date(memoryEmbeddingStatus.last_synced_at).toLocaleString('pt-BR')
                        : 'ainda nao sincronizado'
                    }
                    last={!memoryEmbeddingStatus.error}
                  />
                  {memoryEmbeddingStatus.error ? (
                    <p className="mt-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.45 }}>
                      {memoryEmbeddingStatus.error}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    onMouseDown={e => { e.preventDefault(); onSyncEmbeddings() }}
                    className="px-3 py-1.5 rounded-full text-[10px]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.72)',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    sincronizar
                  </button>
                  <button
                    onMouseDown={e => { e.preventDefault(); onRebuildEmbeddings() }}
                    className="px-3 py-1.5 rounded-full text-[10px]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.56)',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    reindexar memoria
                  </button>
                </div>
              </div>
            )}

            {memorySummary?.highlight_texts?.length ? (
              <div className="mt-4 flex flex-col gap-2">
                {memorySummary.highlight_texts.map(text => (
                  <p
                    key={text}
                    className="text-[11px]"
                    style={{ color: 'rgba(255,255,255,0.48)', lineHeight: 1.45 }}
                  >
                    {text}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex gap-2 flex-wrap">
              <button
                onMouseDown={e => { e.preventDefault(); onExportMemory() }}
                className="px-3 py-1.5 rounded-full text-[10px]"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.86)',
                  border: '1px solid rgba(255,255,255,0.12)'
                }}
              >
                exportar memória
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); onSelectImportCard() }}
                className="px-3 py-1.5 rounded-full text-[10px]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.72)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                importar memória
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); onClearPersistedMemory() }}
                className="px-3 py-1.5 rounded-full text-[10px]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.46)',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                limpar memória local
              </button>
            </div>

            {memoryImportPreview && (
              <div
                className="mt-4 rounded-[18px] p-4"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      {memoryImportPreview.file_name}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.46)' }}>
                      {memoryImportPreview.summary.profile_summary}
                    </p>
                  </div>
                  <span
                    className="px-2 py-1 rounded-full text-[10px]"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      color: 'rgba(255,255,255,0.66)',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    {memoryImportPreview.conflicts} conflitos
                  </span>
                </div>

                <p className="mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.52)', lineHeight: 1.45 }}>
                  {memoryImportPreview.summary.impact_summary}
                </p>

                <button
                  onMouseDown={e => { e.preventDefault(); onToggleMemoryImportProfile() }}
                  className="mt-3 w-full flex items-center justify-between gap-4"
                  style={{ minHeight: 40 }}
                >
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.82)' }}>
                    Aplicar perfil do cartão
                  </span>
                  <Toggle on={memoryIncludeProfile} />
                </button>

                <div className="mt-3 flex gap-2 flex-wrap">
                  <button
                    onMouseDown={e => { e.preventDefault(); onApplyMemoryImport('merge') }}
                    className="px-3 py-1.5 rounded-full text-[10px]"
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.86)',
                      border: '1px solid rgba(255,255,255,0.12)'
                    }}
                  >
                    mesclar
                  </button>
                  <button
                    onMouseDown={e => { e.preventDefault(); onApplyMemoryImport('replace') }}
                    className="px-3 py-1.5 rounded-full text-[10px]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.68)',
                      border: '1px solid rgba(255,255,255,0.08)'
                    }}
                  >
                    substituir
                  </button>
                </div>
              </div>
            )}

            {memoryFeedback && (
              <p className="mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.52)' }}>
                {memoryFeedback}
              </p>
            )}
          </div>

          {semanticState?.capture_policy === 'blocked-sensitive' && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.52)' }}>
                Captura pausada: {semanticState.sensitivity_reason || 'superficie sensivel'}
              </p>
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  onResumeSensitiveBlock()
                }}
                className="text-[11px] px-2.5 py-1 rounded-full"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.72)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                retomar
              </button>
            </div>
          )}

          {sources.length > 0 && (
            <>
              <p className="mt-5 mb-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                Janelas disponíveis
              </p>
              <div className="flex gap-2 flex-wrap">
                {sources.slice(0, 5).map(source => (
                  <button
                    key={source.id}
                    onMouseDown={e => {
                      e.preventDefault()
                      onSelectCaptureSource(source)
                    }}
                    disabled={source.blocked}
                    className="px-3 py-1.5 rounded-full text-[10px]"
                    style={{
                      background: source.selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                      color: source.blocked ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.62)',
                      border: `1px solid ${
                        source.selected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'
                      }`
                    }}
                  >
                    {source.name.slice(0, 22)}
                  </button>
                ))}
                {settings.captureScope.mode === 'selected-source' && (
                  <button
                    onMouseDown={e => {
                      e.preventDefault()
                      onSelectCaptureSource(null)
                    }}
                    className="px-3 py-1.5 rounded-full text-[10px]"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.44)',
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    liberar escopo
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )
    }

    if (activeSettingsTab === 'typography') {
      const typography = settings.typography

      return (
        <>
          <p
            className="text-[18px] font-medium mb-1"
            style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.02em' }}
          >
            Tipografia
          </p>

          <div className="mt-4">
            <SettingsRow
              label="Tamanho base"
              value={`${typography.fontSize}px`}
            />
            <SettingsRow
              label="Família ativa"
              value={TYPOGRAPHY_FAMILY_OPTIONS.find(option => option.id === typography.fontFamily)?.label || 'System Sans'}
            />
            <SettingsRow
              label="Peso ativo"
              value={TYPOGRAPHY_WEIGHT_OPTIONS.find(option => option.id === typography.fontWeight)?.label || 'Regular'}
              last
            />
          </div>

          <div className="mt-5">
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Família de fonte
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TYPOGRAPHY_FAMILY_OPTIONS.map(option => (
                <TypographyChoice
                  key={option.id}
                  label={option.label}
                  secondaryLabel={option.sample}
                  active={typography.fontFamily === option.id}
                  onClick={() => onUpdateTypography({ fontFamily: option.id })}
                />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Tamanho da fonte
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TYPOGRAPHY_SIZE_OPTIONS.map(size => (
                <TypographyChoice
                  key={size}
                  label={`${size}px`}
                  active={typography.fontSize === size}
                  onClick={() => onUpdateTypography({ fontSize: size })}
                />
              ))}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Peso
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TYPOGRAPHY_WEIGHT_OPTIONS.map(option => (
                <TypographyChoice
                  key={option.id}
                  label={option.label}
                  active={typography.fontWeight === option.id}
                  onClick={() => onUpdateTypography({ fontWeight: option.id })}
                />
              ))}
            </div>
          </div>
        </>
      )
    }

    if (activeSettingsTab === 'account') {
      const currentName = userProfile?.display_name?.trim() || ''

      const commitName = () => {
        const trimmed = nameDraft.trim()
        if (trimmed) {
          onUpdateUserProfile({ display_name: trimmed })
        }
        setEditingName(false)
      }

      return (
        <>
          <p
            className="text-[18px] font-medium mb-1"
            style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.02em' }}
          >
            Conta
          </p>
          <div className="mt-4">
            {/* nome editável inline */}
            <div
              className="flex items-center justify-between gap-4"
              style={{ minHeight: 52, borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.88)' }}>
                Nome exibido
              </span>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitName() }
                      if (e.key === 'Escape') { setEditingName(false) }
                    }}
                    placeholder={currentName || 'seu nome'}
                    className="bg-transparent outline-none text-[14px]"
                    style={{
                      color: 'rgba(255,255,255,0.88)',
                      borderBottom: '1px solid rgba(255,255,255,0.3)',
                      minWidth: 0,
                      width: 140,
                      direction: 'ltr'
                    }}
                    maxLength={40}
                  />
                  <button
                    onMouseDown={e => { e.preventDefault(); commitName() }}
                    className="text-[11px] px-2.5 py-1 rounded-full flex-shrink-0"
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.82)',
                      border: '1px solid rgba(255,255,255,0.14)'
                    }}
                  >
                    salvar
                  </button>
                </div>
              ) : (
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setNameDraft(''); setEditingName(true) }}
                  className="inline-flex items-center gap-1.5 text-[14px] transition-opacity hover:opacity-70"
                  style={{ color: currentName ? 'rgba(255,255,255,0.52)' : 'rgba(255,255,255,0.28)' }}
                >
                  {currentName || 'definir nome'}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M8.5 1.5L10.5 3.5L4 10H2V8L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </div>

            <SettingsRow label="Nivel" value={userProfile?.user_level || 'intermediate'} onClick={onCycleLevel} />
            <SettingsRow
              label="Estilo de explicação"
              value={userProfile?.preferred_explanation_style || 'direct'}
              onClick={onCycleStyle}
            />
            <SettingsRow
              label="Limpar contexto da sessão"
              value=""
              onClick={onClearContext}
              muted
              last
            />
          </div>
        </>
      )
    }

    return renderAPISettings()
  }

  return (
    <div
      className="flex flex-col h-full"
      onMouseMove={onActivity}
      onMouseDown={onActivity}
      onWheel={onActivity}
    >
      <div
        className="flex items-center gap-3 px-5 flex-shrink-0 cursor-grab active:cursor-grabbing"
        style={{ height: 48 }}
        onMouseDown={handleMouseDown}
      >
        <div className="w-9 h-6 flex-shrink-0 flex items-center justify-center">
          <LogoMark className="h-[26px] w-[10px] text-white" />
        </div>
        <div className="flex items-center gap-5">
          {[1, 2, 3].map(stage => {
            const onPress =
              stage === 1 ? onShowStage1 : stage === 2 ? onShowStage2 : onShowStage3

            return (
              <button
                key={stage}
                onMouseDown={e => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={e => {
                  e.stopPropagation()
                  onPress()
                }}
                className="text-[11px] transition-opacity duration-150"
                style={{ color: stage === 3 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.62)' }}
                aria-label={`Abrir estágio ${stage}`}
              >
                {stage}
              </button>
            )
          })}
        </div>
        <div className="flex-1" />

        {isStreaming && (
          <div className="flex gap-1 items-center">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-1 h-1 rounded-full"
                style={{ background: '#ffffff' }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </div>
        )}

        <button
          onMouseDown={e => {
            e.preventDefault()
            setSettingsOpen(prev => {
              if (!prev) setActiveSettingsTab('general')
              return !prev
            })
          }}
          className="w-7 h-7 flex items-center justify-center transition-opacity duration-150"
          style={{ color: settingsOpen ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.76)' }}
          aria-label="Configurações"
        >
          <ConfigIcon className="h-[18px] w-auto" />
        </button>
      </div>

      {showGreeting ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          <div className="text-center">
            <p
              className="text-[13px]"
              style={{
                color: 'rgba(255,255,255,0.28)',
                letterSpacing: '-0.01em',
                fontSize: 'calc(var(--hud-font-size, 15px) - 2px)'
              }}
            >
              {greeting.label}
            </p>
            <p
              className="text-[20px] font-medium mt-1"
              style={{
                color: 'rgba(255,255,255,0.94)',
                letterSpacing: '-0.02em',
                fontSize: 'calc(var(--hud-font-size, 15px) + 5px)'
              }}
            >
              {greeting.cta}
            </p>
            {greeting.subtitle && (
              <p
                className="text-[12px] mt-2"
                style={{
                  color: 'rgba(255,255,255,0.36)',
                  fontSize: 'calc(var(--hud-font-size, 15px) - 3px)'
                }}
              >
                {greeting.subtitle}
              </p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            {suggestionPills.map(pill => (
              <button
                key={pill}
                onMouseDown={e => { e.preventDefault(); onQuickPrompt(pill) }}
                className="px-3.5 py-2 rounded-full text-[12px] transition-opacity duration-150 hover:opacity-80"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.64)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                {pill}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none px-0 py-0">
          {settingsOpen ? (
            <div className="h-full flex">
              <aside
                className="w-[164px] flex-shrink-0 px-3.5 pt-5 pb-6"
                style={{ borderRight: '1px solid rgba(255,255,255,0.07)' }}
              >
                <button
                  onMouseDown={e => {
                    e.preventDefault()
                    setSettingsOpen(false)
                  }}
                  className="w-8 h-8 flex items-center justify-center mb-5 rounded-lg transition-colors duration-150"
                  style={{ color: 'rgba(255,255,255,0.82)' }}
                  aria-label="Voltar"
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M10 3.5L5.5 8L10 12.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <div className="flex flex-col gap-2">
                  <SettingsNavItem
                    label="Geral"
                    active={activeSettingsTab === 'general'}
                    onClick={() => setActiveSettingsTab('general')}
                    icon={<ConfigIcon className="h-[18px] w-auto" />}
                  />
                  <SettingsNavItem
                    label="Notificações"
                    active={activeSettingsTab === 'notifications'}
                    onClick={() => setActiveSettingsTab('notifications')}
                    icon={<NotificationsIcon className="h-[18px] w-auto" />}
                  />
                  <SettingsNavItem
                    label="Controle de dados"
                    active={activeSettingsTab === 'data'}
                    onClick={() => setActiveSettingsTab('data')}
                    icon={<DataIcon className="h-[18px] w-auto" />}
                  />
                  <SettingsNavItem
                    label="Conta"
                    active={activeSettingsTab === 'account'}
                    onClick={() => setActiveSettingsTab('account')}
                    icon={<ProfileIcon className="h-[18px] w-auto" />}
                  />
                  <SettingsNavItem
                    label="Minha API Key"
                    active={activeSettingsTab === 'api'}
                    onClick={() => setActiveSettingsTab('api')}
                    icon={<span className="text-[13px] font-medium leading-none">{'</>'}</span>}
                  />
                  <SettingsNavItem
                    label="Tipografia"
                    active={activeSettingsTab === 'typography'}
                    onClick={() => setActiveSettingsTab('typography')}
                    icon={<span className="text-[18px] leading-none">Aa</span>}
                  />
                </div>
              </aside>

              <section className="flex-1 px-6 pt-5 pb-6 overflow-y-auto scrollbar-none">
                {renderSettingsContent()}
              </section>
            </div>
          ) : (
            <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 30px 18px' }}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className="flex"
                  style={{
                    marginBottom: msg.role === 'user' ? 24 : 40,
                    width: '100%',
                    justifyContent: 'center'
                  }}
                >
                  {msg.role === 'user' ? (
                    <div style={{ width: '100%', maxWidth: 860, display: 'flex', justifyContent: 'flex-end' }}>
                      <span
                        className="inline-flex leading-relaxed px-4 py-2 selectable"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          color: 'rgba(255,255,255,0.94)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '14px',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.08) inset',
                          width: 'fit-content',
                          maxWidth: 'min(58ch, 100%)',
                          fontSize: 'calc(var(--hud-font-size, 15px) - 1px)',
                          lineHeight: 1.42,
                          letterSpacing: '0.001em'
                        }}
                      >
                        {msg.content}
                      </span>
                    </div>
                  ) : (
                    <div style={{ maxWidth: 860, width: '100%' }}>
                      <MessageBody content={msg.content} />
                    </div>
                  )}
                </div>
              ))}

              {isStreaming && streamingContent && (
                <div style={{ maxWidth: 860, width: '100%', margin: '0 auto' }}>
                  <MessageBody content={streamingContent} />
                  <motion.span
                    className="inline-block w-0.5 h-3.5 ml-0.5 align-middle"
                    style={{ background: '#ffffff' }}
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.55, repeat: Infinity }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex-shrink-0 px-3 pb-3 pt-2">
        <div style={{ width: '100%' }}>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.28)', paddingTop: 14, paddingLeft: 10, paddingRight: 6 }}>
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                className="flex-1 resize-none bg-transparent outline-none scrollbar-none overflow-y-auto selectable"
                style={{
                  color: 'rgba(255,255,255,0.72)',
                  fontSize: 'calc(var(--hud-font-size, 15px) - 1px)',
                  lineHeight: 1.35,
                  minHeight: INPUT_MIN_HEIGHT,
                  height: INPUT_MIN_HEIGHT,
                  maxHeight: INPUT_MAX_HEIGHT
                }}
                placeholder={inputPlaceholder()}
                rows={1}
                value={inputValue}
                disabled={isStreaming}
                onChange={e => {
                  onInputChange(e.target.value)
                  onActivity()
                  syncInputHeight()
                }}
                onKeyDown={handleKey}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              />

              <button
                onMouseDown={e => {
                  e.preventDefault()
                  onSubmit()
                }}
                disabled={isStreaming || !inputValue.trim()}
                className="w-8 h-8 flex items-center justify-center flex-shrink-0 transition-opacity duration-150"
                style={{
                  color:
                    inputValue.trim() && !isStreaming
                      ? 'rgba(255,255,255,0.72)'
                      : 'rgba(255,255,255,0.22)'
                }}
                aria-label="Enviar"
              >
                <SendIcon className="w-[20px] h-auto" />
              </button>
            </div>
          </div>

          {!settingsOpen && !showGreeting && (
            <div className="flex gap-3 mt-2.5 flex-wrap pl-[10px]">
              {quickActions.map(action => (
                <button
                  key={action}
                  onMouseDown={e => {
                    e.preventDefault()
                    onQuickPrompt(action)
                  }}
                  className="text-[11px] transition-colors duration-150"
                  style={{ color: 'rgba(255,255,255,0.22)' }}
                >
                  {action}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

