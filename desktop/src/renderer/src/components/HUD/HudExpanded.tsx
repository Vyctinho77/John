import {
  memo,
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
import { ChatSidebar } from './ChatSidebar'
import { useDragWindow } from '@renderer/hooks/useDragWindow'
import type {
  AICostSnapshot,
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
  ConnectorStatus,
  DataDeletionSummary,
  DiagnosticsSnapshot,
  PrivacySnapshot,
  SemanticState,
  SessionMemory,
  TypographyFontFamily,
  TypographyFontWeight,
  TutorResponse,
  TutorAction,
  UserProfile
} from '@shared/perception.types'
import type {
  MemoryCardSummary,
  MemoryEmbeddingStatus,
  MemoryImportMode,
  MemoryImportPreview
} from '@shared/memory.types'
import type { SpotifyPlaybackState } from '../../../../preload/index.d'
import { TutorActionChips } from './TutorActionChips'

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
}

interface ChatMeta {
  id: string
  title: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

interface HudExpandedProps {
  activeChatId: string | null
  chatMetas: ChatMeta[]
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
  onRenameChat: (id: string, title: string) => void
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
  onExecuteAction: (action: TutorAction) => void
  pendingActionIds: string[]
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
  screenshotMode: boolean
  onToggleScreenshotMode: () => void
  aiSettings: AISettingsSnapshot | null
  aiCosts: AICostSnapshot | null
  onRefreshAISettings: () => Promise<void>
  onSaveProvider: (input: SaveAIProviderInput) => void
  onRemoveProvider: (providerId: AIProviderId) => void
  onTestProvider: (providerId: AIProviderId) => Promise<TestAIProviderResult>
  onUpdateAIRouting: (patch: Partial<AIRoutingSettings>) => void
  onUpdateTypography: (patch: Partial<AppSettings['typography']>) => void
  onUpdateDailyCostLimit: (value: number | null) => void
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
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-150"
      style={{
        color: active ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.44)',
        background: active ? 'rgba(255,255,255,0.06)' : 'transparent'
      }}
    >
      <span className="w-[20px] h-[20px] flex items-center justify-center flex-shrink-0 opacity-80">
        {icon}
      </span>
      <span className="text-[12px] leading-none whitespace-nowrap">{label}</span>
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

function getCostAlertState(costs: AICostSnapshot | null): {
  level: 'none' | 'watch' | 'danger' | 'blocked'
  label: string | null
  message: string | null
} {
  if (!costs || costs.dailyLimitUsd === null || costs.dailyLimitUsd <= 0) {
    return { level: 'none', label: null, message: null }
  }

  const ratio = costs.spentUsd / costs.dailyLimitUsd

  if (costs.blocked || ratio >= 1) {
    return {
      level: 'blocked',
      label: 'limite atingido',
      message: 'Novas chamadas OpenAI ficam bloqueadas ate a virada do dia ou ajuste do teto.'
    }
  }

  if (ratio >= 0.95) {
    return {
      level: 'danger',
      label: 'acima de 95%',
      message: 'Voce esta muito perto do teto diario. A proxima chamada pode encostar no limite.'
    }
  }

  if (ratio >= 0.8) {
    return {
      level: 'watch',
      label: 'acima de 80%',
      message: 'O gasto diario esta entrando na faixa de atencao.'
    }
  }

  return { level: 'none', label: null, message: null }
}

export const HudExpanded = memo(function HudExpanded({
  activeChatId,
  chatMetas,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
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
  onExecuteAction,
  pendingActionIds,
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
  screenshotMode,
  onToggleScreenshotMode,
  aiSettings,
  aiCosts,
  onRefreshAISettings,
  onSaveProvider,
  onRemoveProvider,
  onTestProvider,
  onUpdateAIRouting,
  onUpdateTypography,
  onUpdateDailyCostLimit,
  onShowStage1,
  onShowStage2,
  onShowStage3,
  onSettingsOpenChange
}: HudExpandedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { handleMouseDown } = useDragWindow()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSpinTurns, setSettingsSpinTurns] = useState(0)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('general')
  const [activeProviderId, setActiveProviderId] = useState<AIProviderId>('openai')
  const [providerDrafts, setProviderDrafts] = useState<ProviderDraftMap>(createEmptyProviderDrafts())
  const [apiFeedback, setAPIFeedback] = useState<string | null>(null)
  const [isTestingProvider, setIsTestingProvider] = useState<AIProviderId | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [dailyCostDraft, setDailyCostDraft] = useState('')
  const [connectorStatuses, setConnectorStatuses] = useState<ConnectorStatus[]>([])
  const [installingVSCode, setInstallingVSCode] = useState(false)
  const [vscodePendingReload, setVscodePendingReload] = useState(false)
  const [vscodeInstallMsg, setVscodeInstallMsg] = useState<string | null>(null)
  const [spotifyAuthing, setSpotifyAuthing] = useState(false)
  const [spotifyState, setSpotifyState] = useState<SpotifyPlaybackState | null>(null)
  const [spotifyClientIdCard, setSpotifyClientIdCard] = useState(false)
  const [spotifyClientIdDraft, setSpotifyClientIdDraft] = useState('')
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [codexStatus, setCodexStatus] = useState<import('@shared/auth.types').AuthStatus>({ authenticated: false })
  const [codexLoading, setCodexLoading] = useState(false)
  const [codexError, setCodexError] = useState<string | null>(null)

  useEffect(() => {
    window.bridgeAPI.getStatuses().then(setConnectorStatuses)
    return window.bridgeAPI.onStatusUpdate(incoming => {
      setConnectorStatuses(prev =>
        prev.map(s => s.id === incoming.id ? incoming : s)
      )
      if (incoming.id === 'vscode' && incoming.connected) {
        setVscodePendingReload(false)
        setVscodeInstallMsg(null)
      }
    })
  }, [])

  useEffect(() => {
    window.spotifyAPI.getState().then(setSpotifyState)
    return window.spotifyAPI.onStateUpdate(setSpotifyState)
  }, [])

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
      window.codexAuthAPI.getStatus().then(setCodexStatus)
    }
  }, [settingsOpen, activeSettingsTab])

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

  useEffect(() => {
    setDailyCostDraft(
      settings?.dailyCostLimitUsd === null || settings?.dailyCostLimitUsd === undefined
        ? ''
        : settings.dailyCostLimitUsd.toFixed(2)
    )
  }, [settings?.dailyCostLimitUsd])

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
  const costAlert = getCostAlertState(aiCosts)

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

  const commitDailyCostLimit = () => {
    if (!settings) return

    const trimmed = dailyCostDraft.trim().replace(',', '.')
    if (!trimmed) {
      onUpdateDailyCostLimit(null)
      return
    }

    const value = Number(trimmed)
    if (!Number.isFinite(value) || value < 0) {
      setDailyCostDraft(
        settings.dailyCostLimitUsd === null
          ? ''
          : settings.dailyCostLimitUsd.toFixed(2)
      )
      return
    }

    onUpdateDailyCostLimit(Number(value.toFixed(2)))
  }

  const handleCodexLogin = async () => {
    setCodexLoading(true)
    setCodexError(null)
    try {
      const status = await window.codexAuthAPI.login()
      setCodexStatus(status)
    } catch (e: unknown) {
      setCodexError(e instanceof Error ? e.message : 'Erro ao conectar')
    } finally {
      setCodexLoading(false)
    }
  }

  const handleCodexLogout = async () => {
    await window.codexAuthAPI.logout()
    setCodexStatus({ authenticated: false })
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[15px]" style={{ color: 'rgba(255,255,255,0.94)' }}>
                Custo diário
              </p>
              <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.46)' }}>
                Defina um teto diário em dólar para uso de API.
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-full text-[10px]"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.66)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}
            >
              {settings.dailyCostLimitUsd === null ? 'sem limite' : `$${settings.dailyCostLimitUsd.toFixed(2)}/dia`}
            </span>
          </div>

          {costAlert.level !== 'none' && (
            <div
              className="mt-3 rounded-[16px] px-3 py-2.5"
              style={{
                background:
                  costAlert.level === 'blocked'
                    ? 'rgba(255,255,255,0.08)'
                    : costAlert.level === 'danger'
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(255,255,255,0.04)',
                border:
                  costAlert.level === 'blocked'
                    ? '1px solid rgba(255,255,255,0.16)'
                    : costAlert.level === 'danger'
                      ? '1px solid rgba(255,255,255,0.12)'
                      : '1px solid rgba(255,255,255,0.08)'
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.86)' }}>
                  Atenção de custo
                </p>
                <span
                  className="px-2 py-1 rounded-full text-[10px]"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.72)',
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  {costAlert.label}
                </span>
              </div>
              <p className="mt-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
                {costAlert.message}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.44)' }}>
              Teto diário em USD
            </span>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center rounded-xl px-3 h-10 flex-1"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <span className="text-[12px] mr-2" style={{ color: 'rgba(255,255,255,0.46)' }}>
                  $
                </span>
                <input
                  value={dailyCostDraft}
                  onChange={e => setDailyCostDraft(e.target.value)}
                  onBlur={commitDailyCostLimit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitDailyCostLimit()
                    }
                    if (e.key === 'Escape') {
                      setDailyCostDraft(
                        settings.dailyCostLimitUsd === null
                          ? ''
                          : settings.dailyCostLimitUsd.toFixed(2)
                      )
                    }
                  }}
                  inputMode="decimal"
                  placeholder="ex: 2.50"
                  className="bg-transparent outline-none w-full text-[13px]"
                  style={{ color: 'rgba(255,255,255,0.92)' }}
                />
              </div>
              <button
                onMouseDown={e => {
                  e.preventDefault()
                  setDailyCostDraft('')
                  onUpdateDailyCostLimit(null)
                }}
                className="px-3 py-1.5 rounded-full text-[10px] flex-shrink-0"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                sem limite
              </button>
            </div>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.45 }}>
              Esse valor fica salvo na configuração do app e pode ser usado como teto operacional para chamadas remotas.
            </p>
            {aiCosts && (
              <div className="mt-2">
                <SettingsRow
                  label="Gasto hoje"
                  value={`$${aiCosts.spentUsd.toFixed(4)}`}
                />
                <SettingsRow
                  label="Restante"
                  value={aiCosts.remainingUsd === null ? 'sem limite' : `$${aiCosts.remainingUsd.toFixed(4)}`}
                  last
                />
              </div>
            )}
          </div>
        </div>

        <div
          className="mt-4 rounded-[22px] p-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)'
          }}
        >
          <p className="text-[15px]" style={{ color: 'rgba(255,255,255,0.94)' }}>
            ChatGPT (Codex OAuth)
          </p>
          <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
            Use sua assinatura ChatGPT Plus/Pro sem API key. John vai priorizar esse provider quando estiver conectado.
          </p>

          <div className="mt-4">
            {codexStatus.authenticated ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.82)' }}>
                    {codexStatus.email}
                  </p>
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                    plano: {codexStatus.planType}
                  </p>
                </div>
                <button
                  onMouseDown={e => { e.preventDefault(); void handleCodexLogout() }}
                  className="px-3 py-1.5 rounded-full text-[10px] flex-shrink-0"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  desconectar
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onMouseDown={e => { e.preventDefault(); void handleCodexLogin() }}
                  disabled={codexLoading}
                  className="self-start px-3 py-1.5 rounded-full text-[10px]"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: codexLoading ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.88)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    cursor: codexLoading ? 'default' : 'pointer'
                  }}
                >
                  {codexLoading ? 'abrindo browser...' : 'conectar com ChatGPT'}
                </button>
                {codexError && (
                  <p className="text-[11px]" style={{ color: 'rgba(255,100,100,0.8)' }}>
                    {codexError}
                  </p>
                )}
              </div>
            )}
          </div>
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

          {/* ── Biblioteca ── */}
          <p
            className="text-[18px] font-medium mt-8 mb-1"
            style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.02em' }}
          >
            Biblioteca
          </p>
          <div className="mt-4 flex gap-5">
            {/* VS Code connector */}
            {(() => {
              const connected = connectorStatuses.find(s => s.id === 'vscode')?.connected ?? false
              return (
                <div className="flex flex-col items-center gap-2" style={{ width: 72 }}>
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.685 1.28739C22.4364 1.29611 22.1884 1.36091 21.9663 1.47739C22.5455 1.76411 22.9541 2.33039 23.0213 3.00239C23.0328 3.08303 23.04 3.15655 23.04 3.19239V28.7924C23.04 29.5514 22.5962 30.202 21.9575 30.5136C22.1905 30.641 22.4506 30.7124 22.72 30.7124C22.9587 30.7124 23.184 30.6571 23.3875 30.5636L23.3888 30.5661C24.4179 30.0337 29.5631 27.3693 29.7525 27.2611C30.3496 26.9187 30.72 26.2791 30.72 25.5924V6.39239C30.72 5.75367 30.4037 5.15951 29.8738 4.80239C29.669 4.66351 23.4125 1.43114 23.4125 1.43114L23.4113 1.43364C23.1834 1.32644 22.9337 1.27867 22.685 1.28739ZM21.12 2.55239C20.9563 2.55239 20.7923 2.61477 20.6675 2.73989C20.6675 2.73989 17.0038 6.85995 12.9475 11.4174L17.7438 15.3411L21.76 11.9586V3.19239C21.76 3.02855 21.6973 2.86469 21.5725 2.73989C21.4474 2.61477 21.2838 2.55239 21.12 2.55239ZM5.12003 7.03239C5.02019 7.03239 4.8345 7.03274 4.00378 7.41739C3.54618 7.62923 1.95253 8.46614 1.95253 8.46614C1.74133 8.5807 1.57096 8.76003 1.45128 8.96739C1.49992 8.9597 1.54822 8.95238 1.59878 8.95238H1.60003C2.02755 8.95238 2.28973 9.25075 2.38253 9.34739C2.38253 9.34739 20.4352 29.0126 20.6675 29.2449C20.7923 29.3697 20.9549 29.4324 21.1188 29.4324C21.2826 29.4324 21.4465 29.3697 21.5713 29.2449C21.6961 29.1201 21.76 28.9562 21.76 28.7924V20.2611C21.76 20.2611 6.10163 7.46345 5.98003 7.36488C5.74451 7.15112 5.43811 7.03239 5.12003 7.03239ZM1.40753 10.2324C1.33713 10.2324 1.28003 10.2901 1.28003 10.3611V22.2686C1.28003 22.3371 1.33591 22.3936 1.40503 22.3936C1.44087 22.3936 1.47263 22.3773 1.49503 22.3524L5.12003 18.3286V14.0849L1.49878 10.2699C1.47574 10.2468 1.44273 10.2324 1.40753 10.2324ZM7.84253 17.1536C7.84253 17.1536 2.3415 23.3297 2.27878 23.3924C2.10534 23.5658 1.86563 23.6724 1.60003 23.6724C1.55011 23.6724 1.50178 23.6663 1.45378 23.6586C1.58306 23.8833 1.77265 24.0685 2.00753 24.1824L2.00503 24.1861C2.56183 24.469 4.39936 25.4026 4.64128 25.5011C4.7936 25.5619 4.95427 25.5924 5.12003 25.5924C5.34211 25.5924 5.56166 25.535 5.75878 25.4224C5.7735 25.4141 11.2175 20.8336 11.2175 20.8336L7.84253 17.1536Z" fill="#0C75FF"/>
                  </svg>
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.01em' }}>Vs Code</span>
                  <button
                    onMouseDown={e => e.preventDefault()}
                    disabled={installingVSCode || vscodePendingReload}
                    onClick={() => {
                      if (connected) { window.bridgeAPI.disconnect('vscode'); return }
                      setVscodeInstallMsg(null)
                      setInstallingVSCode(true)
                      window.bridgeAPI.installVSCodeConnector().then(res => {
                        setInstallingVSCode(false)
                        if (res.ok) { setVscodePendingReload(true); setVscodeInstallMsg(res.message) }
                        else { setVscodeInstallMsg(res.message); setTimeout(() => setVscodeInstallMsg(null), 6000) }
                      })
                    }}
                    className="transition-opacity duration-150 hover:opacity-80 active:opacity-50 disabled:opacity-50 disabled:cursor-default"
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: connected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.92)', color: connected ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.85)', letterSpacing: '-0.01em', fontWeight: 500 }}
                  >
                    {installingVSCode ? 'Instalando…' : vscodePendingReload ? 'Aguardando…' : connected ? 'Desconectar' : 'Conectar'}
                  </button>
                </div>
              )
            })()}

            {/* Spotify connector */}
            {(() => {
              const connected = connectorStatuses.find(s => s.id === 'spotify')?.connected ?? false
              return (
                <div className="flex flex-col items-center gap-2" style={{ width: 72 }}>
                  <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 0C6.72911 0 0 6.7291 0 15C0 23.2709 6.72911 30 15 30C23.2709 30 30 23.2715 30 15C30 6.72845 23.2709 0 15 0ZM21.349 21.7421C21.1606 22.0251 20.8503 22.1776 20.5341 22.1776C20.3477 22.1776 20.1593 22.1248 19.9924 22.0133C18.3802 20.9383 15.6461 20.2212 13.3643 20.2219C10.9431 20.2232 9.12817 20.8177 9.10991 20.8236C8.59881 20.997 8.04403 20.718 7.87322 20.2056C7.70242 19.6932 7.97949 19.139 8.49189 18.9689C8.57795 18.9402 10.6295 18.2681 13.3643 18.2668C15.6461 18.2655 18.8196 18.8809 21.0778 20.3862C21.5277 20.686 21.6489 21.293 21.349 21.7421ZM23.2996 17.7394C23.0877 18.0797 22.722 18.2668 22.3484 18.2668C22.1463 18.2668 21.9416 18.2127 21.7578 18.0973C18.8346 16.2758 15.8305 15.8905 13.2424 15.9133C10.3205 15.9394 7.98405 16.4968 7.94428 16.5085C7.35299 16.6767 6.73106 16.3312 6.56221 15.7373C6.39337 15.1421 6.73954 14.5234 7.33409 14.3553C7.51467 14.3038 9.84658 13.7301 13.039 13.7033C15.9498 13.6792 19.5771 14.101 22.9423 16.1976C23.4658 16.5235 23.6268 17.2146 23.2996 17.7394ZM25.2456 13.0586C25.0024 13.4719 24.5669 13.702 24.1197 13.702C23.8954 13.702 23.6686 13.644 23.4606 13.5228C20.0537 11.5227 15.9114 11.0983 13.0364 11.0944C13.0227 11.0944 13.009 11.0944 12.9953 11.0944C9.51867 11.0944 6.84124 11.7059 6.81451 11.7124C6.11174 11.8734 5.41223 11.4392 5.24925 10.7378C5.08627 10.0369 5.5211 9.33678 6.22191 9.17315C6.34252 9.14512 9.20314 8.48668 12.9953 8.48668C13.0103 8.48668 13.0253 8.48668 13.0403 8.48668C16.238 8.49124 20.8705 8.97757 24.7814 11.2736C25.402 11.6387 25.61 12.438 25.2456 13.0586Z" fill="#2DFF42"/>
                  </svg>
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '-0.01em' }}>Spotify</span>
                  <button
                    onMouseDown={e => e.preventDefault()}
                    disabled={spotifyAuthing}
                    onClick={() => {
                      if (connected) { void window.spotifyAPI.disconnect(); return }
                      if (!settings?.spotifyClientId?.trim()) {
                        setSpotifyClientIdDraft(settings?.spotifyClientId ?? '')
                        setSpotifyClientIdCard(true)
                        return
                      }
                      setSpotifyAuthing(true)
                      window.spotifyAPI.startAuth()
                        .catch(() => {})
                        .finally(() => setSpotifyAuthing(false))
                    }}
                    className="transition-opacity duration-150 hover:opacity-80 active:opacity-50 disabled:opacity-50 disabled:cursor-default"
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: connected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.92)', color: connected ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.85)', letterSpacing: '-0.01em', fontWeight: 500 }}
                  >
                    {spotifyAuthing ? 'Autenticando…' : connected ? 'Desconectar' : 'Conectar'}
                  </button>
                </div>
              )
            })()}
          </div>

          {/* Spotify Client ID floating card */}
          {spotifyClientIdCard && (
            <div
              className="mt-3 rounded-[10px] p-4"
              style={{ background: 'rgba(30,30,30,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-[12px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.88)' }}>
                Spotify Client ID
              </p>
              <p className="text-[10px] mb-3" style={{ color: 'rgba(255,255,255,0.36)', lineHeight: 1.5 }}>
                developer.spotify.com → crie um app → Redirect URI: <span style={{ color: 'rgba(255,255,255,0.54)' }}>http://127.0.0.1:42002/callback</span>
              </p>
              <input
                autoFocus
                type="text"
                placeholder="Cole o Client ID aqui"
                value={spotifyClientIdDraft}
                onChange={e => setSpotifyClientIdDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setSpotifyClientIdCard(false)
                  if (e.key === 'Enter' && spotifyClientIdDraft.trim()) {
                    void window.settingsAPI.update({ spotifyClientId: spotifyClientIdDraft.trim() })
                      .then(() => {
                        setSpotifyClientIdCard(false)
                        setSpotifyAuthing(true)
                        return window.spotifyAPI.startAuth()
                      })
                      .catch(() => {})
                      .finally(() => setSpotifyAuthing(false))
                  }
                }}
                className="w-full bg-transparent outline-none text-[11px] mb-3"
                style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '5px 8px', caretColor: 'white' }}
              />
              <div className="flex gap-2">
                <button
                  onMouseDown={e => e.preventDefault()}
                  disabled={!spotifyClientIdDraft.trim()}
                  onClick={() => {
                    void window.settingsAPI.update({ spotifyClientId: spotifyClientIdDraft.trim() })
                      .then(() => {
                        setSpotifyClientIdCard(false)
                        setSpotifyAuthing(true)
                        return window.spotifyAPI.startAuth()
                      })
                      .catch(() => {})
                      .finally(() => setSpotifyAuthing(false))
                  }}
                  className="transition-opacity hover:opacity-80 active:opacity-50 disabled:opacity-40 disabled:cursor-default"
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.92)', color: 'rgba(0,0,0,0.85)', fontWeight: 500 }}
                >
                  Conectar
                </button>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setSpotifyClientIdCard(false)}
                  className="transition-opacity hover:opacity-80 active:opacity-50"
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.44)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Spotify mini-player */}
          {spotifyState && (
            <div className="mt-4 px-1" style={{ maxWidth: 220 }}>
              <p className="text-[12px] truncate font-medium" style={{ color: 'rgba(255,255,255,0.88)' }}>
                {spotifyState.trackName ?? '—'}
              </p>
              <p className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.44)' }}>
                {spotifyState.artistName ?? ''}
              </p>
              <div className="flex items-center gap-3 mt-2">
                {/* Prev */}
                <button onMouseDown={e => e.preventDefault()} onClick={() => void window.spotifyAPI.prev()}
                  className="transition-opacity hover:opacity-80 active:opacity-50" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2v10M12 2L5 7l7 5V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {/* Play/Pause */}
                <button onMouseDown={e => e.preventDefault()} onClick={() => void window.spotifyAPI.togglePlay()}
                  className="transition-opacity hover:opacity-80 active:opacity-50" style={{ color: 'rgba(255,255,255,0.88)' }}>
                  {spotifyState.isPlaying ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M5 3h1.5v10H5V3ZM9.5 3H11v10H9.5V3Z" fill="currentColor"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 2.5l10 5.5-10 5.5V2.5Z" fill="currentColor"/>
                    </svg>
                  )}
                </button>
                {/* Next */}
                <button onMouseDown={e => e.preventDefault()} onClick={() => void window.spotifyAPI.next()}
                  className="transition-opacity hover:opacity-80 active:opacity-50" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M12 2v10M2 2l7 5-7 5V2Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {/* Shuffle */}
                <button onMouseDown={e => e.preventDefault()} onClick={() => void window.spotifyAPI.setShuffle(!spotifyState.shuffle)}
                  className="transition-opacity hover:opacity-80 active:opacity-50"
                  style={{ color: spotifyState.shuffle ? 'rgba(45,255,66,0.9)' : 'rgba(255,255,255,0.3)' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M1 4h2.5a3 3 0 0 1 2.5 1.5M1 9h2.5a3 3 0 0 0 2.5-1.5M8 3.5l1.5-1.5L11 3.5M8 9.5l1.5 1.5L11 9.5M9.5 2v2.5a3 3 0 0 1-.5 1.5 3 3 0 0 1 .5 1.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {/* Repeat */}
                <button onMouseDown={e => e.preventDefault()} onClick={() => {
                  const next = spotifyState.repeat === 'off' ? 'context' : spotifyState.repeat === 'context' ? 'track' : 'off'
                  void window.spotifyAPI.setRepeat(next)
                }}
                  className="transition-opacity hover:opacity-80 active:opacity-50"
                  style={{ color: spotifyState.repeat !== 'off' ? 'rgba(45,255,66,0.9)' : 'rgba(255,255,255,0.3)', position: 'relative' }}>
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 4h9M2 9h9M9.5 2l2 2-2 2M3.5 7l-2 2 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {spotifyState.repeat === 'track' && (
                    <span style={{ position: 'absolute', top: -4, right: -4, fontSize: 7, color: 'rgba(45,255,66,0.9)', fontWeight: 700, lineHeight: 1 }}>1</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {vscodeInstallMsg && (
            <p className="mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.52)' }}>
              {vscodeInstallMsg}
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

          {/* Screenshot mode */}
          <div
            className="mt-4 rounded-[16px] overflow-hidden"
            style={{
              background: screenshotMode
                ? 'rgba(255,159,10,0.06)'
                : 'rgba(255,255,255,0.025)',
              border: `1px solid ${screenshotMode
                ? 'rgba(255,159,10,0.15)'
                : 'rgba(255,255,255,0.06)'}`,
              transition: 'background 0.3s, border-color 0.3s'
            }}
          >
            <button
              onMouseDown={e => { e.preventDefault(); onToggleScreenshotMode() }}
              className="w-full flex items-center justify-between gap-4 px-4 transition-opacity duration-150 hover:opacity-80 active:opacity-60"
              style={{ minHeight: 52 }}
            >
              <div className="flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" stroke={screenshotMode ? 'rgba(255,179,64,0.85)' : 'rgba(255,255,255,0.5)'} strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="3" stroke={screenshotMode ? 'rgba(255,179,64,0.85)' : 'rgba(255,255,255,0.5)'} strokeWidth="1.5" />
                  <path d="M15 5V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v1" stroke={screenshotMode ? 'rgba(255,179,64,0.85)' : 'rgba(255,255,255,0.5)'} strokeWidth="1.5" />
                </svg>
                <div>
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: screenshotMode ? 'rgba(255,179,64,0.95)' : 'rgba(255,255,255,0.82)' }}
                  >
                    Modo screenshot
                  </span>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
                    {screenshotMode ? 'Captura pausada · restaura em 30s' : 'Torna o HUD visivel em prints'}
                  </p>
                </div>
              </div>
              <Toggle on={screenshotMode} />
            </button>
          </div>

          <div
            className="mt-5 rounded-[20px] overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255,255,255,0.08)'
            }}
          >
            {/* Header */}
            <div
              className="px-5 pt-5 pb-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center rounded-[12px]"
                    style={{
                      width: 36,
                      height: 36,
                      background: 'linear-gradient(135deg, rgba(90,130,240,0.22), rgba(90,130,240,0.08))',
                      border: '1px solid rgba(90,130,240,0.18)'
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="rgba(120,160,255,0.85)" strokeWidth="1.5" strokeLinejoin="round" />
                      <path d="M12 22V12" stroke="rgba(120,160,255,0.6)" strokeWidth="1.5" />
                      <path d="M21 7l-9 5-9-5" stroke="rgba(120,160,255,0.6)" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[15px] font-medium" style={{ color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.01em' }}>
                      Memory Card
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.42)' }}>
                      Perfil + memória persistida
                    </p>
                  </div>
                </div>
                {memorySummary && (
                  <span
                    className="px-2.5 py-1 rounded-full text-[10px] font-medium"
                    style={{
                      background: 'rgba(90,130,240,0.12)',
                      color: 'rgba(130,170,255,0.9)',
                      border: '1px solid rgba(90,130,240,0.15)'
                    }}
                  >
                    {memorySummary.item_count} memórias
                  </span>
                )}
              </div>
            </div>

            {/* Summary rows */}
            {memorySummary && (
              <div className="px-5">
                <SettingsRow label="Dono" value={memorySummary.owner_name || 'sem nome'} />
                <SettingsRow label="Perfil" value={memorySummary.profile_summary} />
                <SettingsRow label="Impacto" value={memorySummary.impact_summary} last />
              </div>
            )}

            {/* Embeddings sub-card */}
            {memoryEmbeddingStatus && (
              <div
                className="mx-4 mt-3 rounded-[14px] p-4"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.88)' }}>
                      Embeddings
                    </p>
                    <p className="mt-0.5 text-[10px]" style={{ color: 'rgba(255,255,255,0.40)' }}>
                      {memoryEmbeddingStatus.embedding_model}
                    </p>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                    style={{
                      background: memoryEmbeddingStatus.state === 'ready'
                        ? 'rgba(52,199,89,0.12)'
                        : 'rgba(255,204,0,0.12)',
                      color: memoryEmbeddingStatus.state === 'ready'
                        ? 'rgba(52,199,89,0.9)'
                        : 'rgba(255,214,51,0.9)',
                      border: `1px solid ${memoryEmbeddingStatus.state === 'ready'
                        ? 'rgba(52,199,89,0.18)'
                        : 'rgba(255,204,0,0.18)'}`
                    }}
                  >
                    {labelEmbeddingState(memoryEmbeddingStatus.state)}
                  </span>
                </div>

                <div className="mt-2.5">
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
                    <p className="mt-2 text-[11px]" style={{ color: 'rgba(255,100,100,0.7)', lineHeight: 1.45 }}>
                      {memoryEmbeddingStatus.error}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onMouseDown={e => { e.preventDefault(); onSyncEmbeddings() }}
                    className="px-3.5 py-1.5 rounded-full text-[10px] font-medium transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                    style={{
                      background: 'rgba(90,130,240,0.14)',
                      color: 'rgba(130,170,255,0.92)',
                      border: '1px solid rgba(90,130,240,0.2)'
                    }}
                  >
                    sincronizar
                  </button>
                  <button
                    onMouseDown={e => { e.preventDefault(); onRebuildEmbeddings() }}
                    className="px-3.5 py-1.5 rounded-full text-[10px] font-medium transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.52)',
                      border: '1px solid rgba(255,255,255,0.07)'
                    }}
                  >
                    reindexar
                  </button>
                </div>
              </div>
            )}

            {/* Highlights */}
            {memorySummary?.highlight_texts?.length ? (
              <div className="mx-5 mt-4 flex flex-col gap-1.5">
                {memorySummary.highlight_texts.map(text => (
                  <p
                    key={text}
                    className="text-[11px]"
                    style={{ color: 'rgba(255,255,255,0.44)', lineHeight: 1.5 }}
                  >
                    {text}
                  </p>
                ))}
              </div>
            ) : null}

            {/* Action buttons */}
            <div
              className="px-5 py-4 mt-3 flex gap-2.5 flex-wrap"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <button
                onMouseDown={e => { e.preventDefault(); onExportMemory() }}
                className="px-4 py-2 rounded-full text-[11px] font-medium transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                style={{
                  background: 'linear-gradient(135deg, rgba(90,130,240,0.2), rgba(90,130,240,0.1))',
                  color: 'rgba(140,175,255,0.95)',
                  border: '1px solid rgba(90,130,240,0.22)'
                }}
              >
                Exportar
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); onSelectImportCard() }}
                className="px-4 py-2 rounded-full text-[11px] font-medium transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.72)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                Importar
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); onClearPersistedMemory() }}
                className="px-4 py-2 rounded-full text-[11px] font-medium transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                style={{
                  background: 'rgba(255,69,58,0.08)',
                  color: 'rgba(255,105,97,0.82)',
                  border: '1px solid rgba(255,69,58,0.14)'
                }}
              >
                Limpar
              </button>
            </div>

            {/* Import preview */}
            {memoryImportPreview && (
              <div
                className="mx-4 mb-4 rounded-[14px] p-4"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>
                      {memoryImportPreview.file_name}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.44)' }}>
                      {memoryImportPreview.summary.profile_summary}
                    </p>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                    style={{
                      background: memoryImportPreview.conflicts > 0
                        ? 'rgba(255,159,10,0.12)'
                        : 'rgba(52,199,89,0.12)',
                      color: memoryImportPreview.conflicts > 0
                        ? 'rgba(255,179,64,0.9)'
                        : 'rgba(52,199,89,0.9)',
                      border: `1px solid ${memoryImportPreview.conflicts > 0
                        ? 'rgba(255,159,10,0.18)'
                        : 'rgba(52,199,89,0.18)'}`
                    }}
                  >
                    {memoryImportPreview.conflicts} conflitos
                  </span>
                </div>

                <p className="mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.48)', lineHeight: 1.5 }}>
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

                <div className="mt-3 flex gap-2.5">
                  <button
                    onMouseDown={e => { e.preventDefault(); onApplyMemoryImport('merge') }}
                    className="px-4 py-2 rounded-full text-[11px] font-medium transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                    style={{
                      background: 'linear-gradient(135deg, rgba(52,199,89,0.18), rgba(52,199,89,0.08))',
                      color: 'rgba(80,220,110,0.92)',
                      border: '1px solid rgba(52,199,89,0.2)'
                    }}
                  >
                    Mesclar
                  </button>
                  <button
                    onMouseDown={e => { e.preventDefault(); onApplyMemoryImport('replace') }}
                    className="px-4 py-2 rounded-full text-[11px] font-medium transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                    style={{
                      background: 'rgba(255,159,10,0.1)',
                      color: 'rgba(255,179,64,0.88)',
                      border: '1px solid rgba(255,159,10,0.16)'
                    }}
                  >
                    Substituir
                  </button>
                </div>
              </div>
            )}

            {/* Feedback */}
            {memoryFeedback && (
              <p className="mx-5 mb-4 text-[11px]" style={{ color: 'rgba(255,255,255,0.48)' }}>
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
      className="relative flex flex-col h-full"
      onMouseMove={onActivity}
      onMouseDown={onActivity}
      onWheel={onActivity}
    >
      <ChatSidebar
        open={chatSidebarOpen}
        metas={chatMetas}
        activeChatId={activeChatId}
        onToggle={() => setChatSidebarOpen(prev => !prev)}
        onSelect={onSelectChat}
        onNew={onNewChat}
        onDelete={onDeleteChat}
        onRename={onRenameChat}
      />

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
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onPress() }}
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
            setSettingsSpinTurns(prev => prev + 1)
            setSettingsOpen(prev => {
              if (!prev) setActiveSettingsTab('general')
              return !prev
            })
          }}
          className="w-7 h-7 flex items-center justify-center transition-opacity duration-150"
          style={{ color: settingsOpen ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.76)' }}
          aria-label="Configurações"
        >
          <motion.span
            className="inline-flex"
            animate={{ rotate: settingsSpinTurns * 360 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <ConfigIcon className="h-[18px] w-auto" />
          </motion.span>
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
                className="w-[200px] flex-shrink-0 px-3 pt-5 pb-6"
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
                      {msg.meta?.actions?.length ? (
                        <TutorActionChips
                          actions={msg.meta.actions}
                          pendingActionIds={pendingActionIds}
                          onExecuteAction={onExecuteAction}
                        />
                      ) : null}
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
          <div className="flex items-center mb-1" style={{ paddingLeft: 6 }}>
            <button
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setChatSidebarOpen(prev => !prev) }}
              className="flex items-center justify-center w-6 h-6 transition-opacity duration-150 hover:opacity-100"
              style={{ color: chatSidebarOpen ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.32)' }}
              aria-label="Histórico de chats"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                {chatSidebarOpen
                  ? <path d="M8 2L3.5 6.5L8 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  : <path d="M5 2L9.5 6.5L5 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                }
              </svg>
            </button>
          </div>
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
})

