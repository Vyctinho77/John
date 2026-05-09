import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  KeyboardEvent
} from 'react'
import { motion } from 'framer-motion'
import {
  AlignLeft, AlertTriangle, BarChart2, BookOpen, Bug,
  Code2, FileText, HelpCircle, Lightbulb, ListChecks,
  MessageSquare, RotateCcw, Scale, Settings2, Zap,
  type LucideIcon
} from 'lucide-react'
import { LogoMark } from './LogoMark'
import { StageCompactIcon, StageIntermediateIcon, StageExpandedIcon } from './StageIcons'
import { ConfigIcon } from './ConfigIcon'
import { NotificationsIcon } from './NotificationsIcon'
import { DataIcon } from './DataIcon'
import { ProfileIcon } from './ProfileIcon'
import { MessageBody } from './MessageBody'
import { SendIcon } from './SendIcon'
import { ChatSidebar } from './ChatSidebar'
import { GlasswingThinkingIndicator } from './GlasswingThinkingIndicator'
import {
  SettingsNavItem
} from './HudSettingsPrimitives'
import {
  AccountSettingsPanel,
  APISettingsPanel,
  DataSettingsPanel,
  GeneralSettingsPanel,
  MarketAutonomySettingsPanel,
  NotificationsSettingsPanel,
  TypographySettingsPanel
} from './HudSettingsPanels'
import { useDragWindow } from '@renderer/hooks/useDragWindow'
import { useSpeechInput } from '@renderer/hooks/useSpeechInput'
import type {
  AICostSnapshot,
  AIFeatureTask,
  AIFeatureTier,
  AIProviderId,
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
  TradingViewConnectorState,
  TutorResponse,
  TutorAction,
  TutorStep,
  UserProfile
} from '@shared/perception.types'
import type {
  MemoryCardSummary,
  MemoryEmbeddingStatus,
  MemoryImportMode,
  MemoryImportPreview
} from '@shared/memory.types'
import type { MarketAutonomyViewSnapshot } from '@shared/market-autonomy-view.types'
import type { SpotifyPlaybackState, TickerQuote } from '../../../../preload/index.d'
import { TutorActionChips } from './TutorActionChips'
import { ResponseSourceBadge } from './ResponseSourceBadge'

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
  streamingSteps?: TutorStep[]
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
  onBringMarketProposalToChat: () => void
  onToggleTelemetry: () => void
  onToggleAlwaysVisible: () => void
  onToggleMinimalMode: () => void
  onTogglePassiveSuggestions: () => void
  onToggleAdvancedPerception: () => void
  onToggleCrashReporting: () => void
  onToggleVoiceMode: () => void
  onTestVoice: () => Promise<void>
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
  onEnterOperator?: () => void
}

type SettingsTab = 'general' | 'notifications' | 'data' | 'account' | 'api' | 'typography' | 'market'

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

const FEATURE_TASK_LABELS: Record<AIFeatureTask, string> = {
  tutor:  'tutor',
  vision: 'visão',
  stage2: 'estágio 2',
  title:  'títulos',
  router: 'roteador'
}

const FEATURE_TIER_LABELS: Record<AIFeatureTier, string> = {
  heuristic: 'local',
  cheap:     'barato',
  strong:    'forte'
}

function getCostAlertState(costs: AICostSnapshot | null): {
  level: 'none' | 'warning' | 'danger' | 'blocked'
  label: string
  message: string
} {
  if (!costs || costs.dailyLimitUsd === null || costs.dailyLimitUsd <= 0) {
    return { level: 'none', label: '', message: '' }
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
      level: 'warning',
      label: 'acima de 80%',
      message: 'O gasto diario esta entrando na faixa de atencao.'
    }
  }

  return { level: 'none', label: '', message: '' }
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none"
      aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <rect x="6" y="1" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 9a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="9" y1="15" x2="9" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
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
  streamingSteps: _streamingSteps = [],
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
  onBringMarketProposalToChat,
  onToggleTelemetry,
  onToggleAlwaysVisible,
  onToggleMinimalMode,
  onTogglePassiveSuggestions,
  onToggleAdvancedPerception,
  onToggleCrashReporting,
  onToggleVoiceMode,
  onTestVoice,
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
  onSettingsOpenChange,
  onEnterOperator
}: HudExpandedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const greetingPhraseIdx = useRef(Math.floor(Math.random() * 4))
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
  const [voiceTestState, setVoiceTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [voiceTestError, setVoiceTestError] = useState<string | null>(null)
  const [voiceKeyReady, setVoiceKeyReady] = useState<boolean | null>(null)
  const [installingVSCode, setInstallingVSCode] = useState(false)
  const [vscodePendingReload, setVscodePendingReload] = useState(false)
  const [vscodeInstallMsg, setVscodeInstallMsg] = useState<string | null>(null)
  const [spotifyAuthing, setSpotifyAuthing] = useState(false)
  const [spotifyState, setSpotifyState] = useState<SpotifyPlaybackState | null>(null)
  const [tradingViewState, setTradingViewState] = useState<TradingViewConnectorState | null>(null)
  const [spotifyClientIdCard, setSpotifyClientIdCard] = useState(false)
  const [spotifyClientIdDraft, setSpotifyClientIdDraft] = useState('')
  const [tickerQuote, setTickerQuote] = useState<TickerQuote | null>(null)
  const [tickerCard, setTickerCard] = useState(false)
  const [tickerDraft, setTickerDraft] = useState('')
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [marketAutonomyView, setMarketAutonomyView] = useState<MarketAutonomyViewSnapshot | null>(null)
  const [marketAutonomyLoading, setMarketAutonomyLoading] = useState(false)
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
      } else if (incoming.id === 'vscode' && incoming.message) {
        setVscodeInstallMsg(incoming.message)
      }
    })
  }, [])

  useEffect(() => {
    window.spotifyAPI.getState().then(setSpotifyState)
    return window.spotifyAPI.onStateUpdate(setSpotifyState)
  }, [])

  useEffect(() => {
    window.tradingViewAPI.getStatus().then(setTradingViewState)
    return window.tradingViewAPI.onStatusUpdate(setTradingViewState)
  }, [])

  useEffect(() => {
    window.tickerAPI.getQuote().then(setTickerQuote)
    return window.tickerAPI.onUpdate(setTickerQuote)
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
    if (activeSettingsTab === 'notifications') {
      window.elevenLabsAPI.hasKey().then(setVoiceKeyReady).catch(() => setVoiceKeyReady(false))
    }
  }, [activeSettingsTab])

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
    if (!settingsOpen || activeSettingsTab !== 'market') return
    setMarketAutonomyLoading(true)
    window.marketAutonomyAPI.getView()
      .then(setMarketAutonomyView)
      .finally(() => setMarketAutonomyLoading(false))
  }, [activeSettingsTab, settingsOpen, tradingViewState?.symbol, tradingViewState?.timeframe, tradingViewState?.lastObservedAt])

  useEffect(() => {
    if (!settingsOpen || activeSettingsTab !== 'market') return

    const intervalId = window.setInterval(() => {
      window.marketAutonomyAPI.getView().then(setMarketAutonomyView).catch(() => {})
    }, 12_000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [activeSettingsTab, settingsOpen])

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

  const greeting = useMemo((): { label: string; cta: string; subtitle: string | null } => {
    const hour = new Date().getHours()
    const name = displayName
    const returning = (sessionMemory?.frame_count ?? 0) > 0
    const lateNight = hour >= 23 || hour < 5

    const timeGreeting =
      hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : lateNight ? 'Ainda acordado?' : 'Boa noite'

    const subtitle = continuity
      ? continuity.length > 72 ? continuity.slice(0, 72) + '…' : continuity
      : topic
        ? `Detectei: ${topic}`
        : null

    if (!name) {
      return {
        label: surface !== 'unknown' ? `Vejo que você está num ${labelSurface(surface)}.` : 'Ares.',
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
        cta: phrases[greetingPhraseIdx.current % phrases.length],
        subtitle
      }
    }

    return {
      label: timeGreeting + '.',
      cta: `Olá, ${name}.`,
      subtitle
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, surface, topic, continuity, sessionMemory?.frame_count])

  const suggestionPills = useMemo((): { text: string; Icon: LucideIcon }[] => {
    const level = userProfile?.user_level ?? 'intermediate'

    const byLevel: Record<string, { text: string; Icon: LucideIcon }[]> = {
      beginner:     [
        { text: 'Me explica do zero',    Icon: BookOpen    },
        { text: 'Dá um exemplo prático', Icon: Lightbulb   },
        { text: 'O que é isso?',         Icon: HelpCircle  }
      ],
      intermediate: [
        { text: 'Como isso funciona?',   Icon: Settings2   },
        { text: 'Quais são as opções?',  Icon: ListChecks  },
        { text: 'Me resume isso',        Icon: FileText    }
      ],
      advanced:     [
        { text: 'Quais os tradeoffs?',   Icon: Scale       },
        { text: 'Quais os edge cases?',  Icon: AlertTriangle },
        { text: 'Mostra o código',       Icon: Code2       }
      ]
    }

    if (surface === 'code') {
      return level === 'advanced'
        ? [
            { text: 'Explica esse código',      Icon: Code2         },
            { text: 'O que pode dar errado?',   Icon: AlertTriangle },
            { text: 'Como melhorar isso?',      Icon: Zap           }
          ]
        : [
            { text: 'O que esse código faz?',   Icon: Code2         },
            { text: 'Tem algum bug aqui?',      Icon: Bug           },
            { text: 'Explica linha a linha',    Icon: AlignLeft     }
          ]
    }
    if (surface === 'document' || surface === 'text') {
      return [
        { text: 'Resume isso',               Icon: FileText      },
        { text: 'Quais os pontos principais?', Icon: ListChecks   },
        { text: 'Explica em termos simples', Icon: MessageSquare  }
      ]
    }
    if (surface === 'dashboard') {
      return [
        { text: 'O que esses números dizem?', Icon: BarChart2    },
        { text: 'Aponta alguma anomalia',     Icon: AlertTriangle },
        { text: 'Faz um resumo disso',        Icon: FileText      }
      ]
    }
    if (continuity) {
      const fallback = byLevel[level] ?? byLevel.intermediate
      return [
        { text: 'Continuar de onde paramos', Icon: RotateCcw },
        fallback[0],
        fallback[1]
      ]
    }
    return byLevel[level] ?? byLevel.intermediate
  }, [userProfile?.user_level, surface, continuity])

  const inputPlaceholder = (): string => {
    if (surface === 'code') return 'o que quer entender sobre esse código?'
    if (surface === 'document' || surface === 'text') return 'o que quer saber sobre esse texto?'
    if (surface === 'dashboard') return 'o que quer analisar aqui?'
    return 'o que está na sua tela agora?'
  }

  const syncInputHeight = () => {
    const input = inputRef.current
    if (!input) return
    input.style.height = `${INPUT_MIN_HEIGHT}px`
    input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT)}px`
  }

  useLayoutEffect(() => {
    syncInputHeight()
  }, [inputValue])

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onActivity()
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !isStreaming) onSubmit()
    }
  }

  const voiceEnabled = Boolean(settings?.featureFlags.voiceMode)
  const { isListening, isSupported, toggle: toggleMic } = useSpeechInput(transcript => {
    const next = inputValue.trim() ? `${inputValue} ${transcript}` : transcript
    onInputChange(next)
    onActivity()
  })

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
        <p className="mt-4 text-[13px]" style={{ color: 'var(--ares-text-secondary)' }}>
          Configurações indisponíveis.
        </p>
      )
    }

    return (
      <APISettingsPanel
        settings={settings}
        aiSettings={aiSettings}
        selectedProvider={selectedProvider}
        activeProviderId={activeProviderId}
        providerDraft={providerDraft}
        apiFeedback={apiFeedback}
        isTestingProvider={isTestingProvider}
        codexStatus={codexStatus}
        codexLoading={codexLoading}
        codexError={codexError}
        diagnostics={diagnostics}
        privacy={privacy}
        lastDeletion={lastDeletion}
        aiCosts={aiCosts}
        dailyCostDraft={dailyCostDraft}
        costAlert={costAlert}
        featureTaskLabels={FEATURE_TASK_LABELS}
        featureTierLabels={FEATURE_TIER_LABELS}
        onSelectProvider={providerId => {
          setActiveProviderId(providerId)
          setAPIFeedback(null)
        }}
        onUpdateProviderDraft={updateProviderDraft}
        onSelectProviderModel={(providerId, modelId, modelLabel) => {
          updateProviderDraft({ selectedModel: modelId })
          onSaveProvider({
            id: providerId,
            selectedModel: modelId
          })
          setAPIFeedback(`Modelo ${modelLabel} selecionado.`)
        }}
        onSaveProvider={handleSaveActiveProvider}
        onTestProvider={() => { void handleTestActiveProvider() }}
        onRemoveProvider={handleRemoveActiveProvider}
        onDailyCostDraftChange={setDailyCostDraft}
        onCommitDailyCostLimit={commitDailyCostLimit}
        onResetDailyCostLimit={() => {
          setDailyCostDraft('')
          onUpdateDailyCostLimit(null)
        }}
        onUpdateAIRouting={onUpdateAIRouting}
        onCodexLogin={() => { void handleCodexLogin() }}
        onCodexLogout={() => { void handleCodexLogout() }}
        onToggleCrashReporting={onToggleCrashReporting}
        onToggleAdvancedPerception={onToggleAdvancedPerception}
      />
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
        <GeneralSettingsPanel
          settings={settings}
          userProfile={userProfile}
          sessionMemory={sessionMemory}
          connectorStatuses={connectorStatuses}
          installingVSCode={installingVSCode}
          vscodePendingReload={vscodePendingReload}
          vscodeInstallMsg={vscodeInstallMsg}
          spotifyAuthing={spotifyAuthing}
          spotifyClientIdCard={spotifyClientIdCard}
          spotifyClientIdDraft={spotifyClientIdDraft}
          tickerCard={tickerCard}
          tickerDraft={tickerDraft}
          tickerQuote={tickerQuote}
          tradingViewState={tradingViewState}
          spotifyState={spotifyState}
          onToggleMinimalMode={onToggleMinimalMode}
          onVSCodeAction={() => {
            const connected = connectorStatuses.find(s => s.id === 'vscode')?.connected ?? false
            if (connected) { window.bridgeAPI.disconnect('vscode'); return }
            setVscodeInstallMsg(null)
            setInstallingVSCode(true)
            window.bridgeAPI.installVSCodeConnector().then(res => {
              setInstallingVSCode(false)
              if (res.ok) { setVscodePendingReload(true); setVscodeInstallMsg(res.message) }
              else { setVscodeInstallMsg(res.message); setTimeout(() => setVscodeInstallMsg(null), 6000) }
            })
          }}
          onSpotifyAction={() => {
            const connected = connectorStatuses.find(s => s.id === 'spotify')?.connected ?? false
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
          onTradingViewAction={() => {
            const connected = connectorStatuses.find(s => s.id === 'tradingview')?.connected ?? false
            if (connected) {
              void window.tradingViewAPI.close()
              return
            }
            void window.tradingViewAPI.open()
          }}
          onOpenSpotifyClientIdCard={() => setSpotifyClientIdCard(true)}
          onCloseSpotifyClientIdCard={() => setSpotifyClientIdCard(false)}
          onSpotifyClientIdDraftChange={setSpotifyClientIdDraft}
          onSubmitSpotifyClientId={() => {
            void window.settingsAPI.update({ spotifyClientId: spotifyClientIdDraft.trim() })
              .then(() => {
                setSpotifyClientIdCard(false)
                setSpotifyAuthing(true)
                return window.spotifyAPI.startAuth()
              })
              .catch(() => {})
              .finally(() => setSpotifyAuthing(false))
          }}
          onOpenTickerCard={() => {
            setTickerDraft(settings?.tickerSymbol?.trim() ?? '')
            setTickerCard(true)
          }}
          onCloseTickerCard={() => setTickerCard(false)}
          onTickerDraftChange={setTickerDraft}
          onSubmitTicker={() => {
            void window.tickerAPI.setSymbol(tickerDraft.trim())
              .then(q => { setTickerQuote(q); setTickerCard(false) })
          }}
          onTogglePlay={() => void window.spotifyAPI.togglePlay()}
          onNext={() => void window.spotifyAPI.next()}
          onPrev={() => void window.spotifyAPI.prev()}
          onShuffle={() => {
            if (!spotifyState) return
            void window.spotifyAPI.setShuffle(!spotifyState.shuffle)
          }}
          onRepeat={() => {
            if (!spotifyState) return
            const next = spotifyState.repeat === 'off' ? 'context' : spotifyState.repeat === 'context' ? 'track' : 'off'
            void window.spotifyAPI.setRepeat(next)
          }}
        />
      )
    }

    if (activeSettingsTab === 'notifications') {
      return (
        <NotificationsSettingsPanel
          settings={settings}
          voiceKeyReady={voiceKeyReady}
          voiceTestState={voiceTestState}
          voiceTestError={voiceTestError}
          onTogglePassiveSuggestions={onTogglePassiveSuggestions}
          onToggleAlwaysVisible={onToggleAlwaysVisible}
          onToggleVoiceMode={onToggleVoiceMode}
          onTestVoice={onTestVoice}
          setVoiceTestState={setVoiceTestState}
          setVoiceTestError={setVoiceTestError}
        />
      )
    }

    if (activeSettingsTab === 'data') {
      return (
        <DataSettingsPanel
          settings={settings}
          isPrivate={isPrivate}
          screenshotMode={screenshotMode}
          semanticState={semanticState}
          sources={sources}
          memorySummary={memorySummary}
          memoryEmbeddingStatus={memoryEmbeddingStatus}
          memoryImportPreview={memoryImportPreview}
          memoryIncludeProfile={memoryIncludeProfile}
          memoryFeedback={memoryFeedback}
          onToggleTelemetry={onToggleTelemetry}
          onTogglePrivate={onTogglePrivate}
          onDeleteLocalData={onDeleteLocalData}
          onToggleScreenshotMode={onToggleScreenshotMode}
          onSyncEmbeddings={onSyncEmbeddings}
          onRebuildEmbeddings={onRebuildEmbeddings}
          onExportMemory={onExportMemory}
          onSelectImportCard={onSelectImportCard}
          onClearPersistedMemory={onClearPersistedMemory}
          onToggleMemoryImportProfile={onToggleMemoryImportProfile}
          onApplyMemoryImport={onApplyMemoryImport}
          onResumeSensitiveBlock={onResumeSensitiveBlock}
          onSelectCaptureSource={onSelectCaptureSource}
          labelEmbeddingState={labelEmbeddingState}
        />
      )
    }

    if (activeSettingsTab === 'typography') {
      return (
        <TypographySettingsPanel
          settings={settings}
          onUpdateTypography={onUpdateTypography}
        />
      )
    }

    if (activeSettingsTab === 'market') {
      return (
        <MarketAutonomySettingsPanel
          view={marketAutonomyView}
          loading={marketAutonomyLoading}
          onRefresh={() => {
            setMarketAutonomyLoading(true)
            void window.marketAutonomyAPI.getView()
              .then(setMarketAutonomyView)
              .finally(() => setMarketAutonomyLoading(false))
          }}
          onBringToChat={onBringMarketProposalToChat}
        />
      )
    }

    if (activeSettingsTab === 'account') {
      return (
        <AccountSettingsPanel
          userProfile={userProfile}
          nameDraft={nameDraft}
          editingName={editingName}
          setNameDraft={setNameDraft}
          setEditingName={setEditingName}
          onUpdateUserProfile={onUpdateUserProfile}
          onCycleLevel={onCycleLevel}
          onCycleStyle={onCycleStyle}
          onClearContext={onClearContext}
        />
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
        style={{ height: 48, position: 'relative' }}
        onMouseDown={handleMouseDown}
      >
        <div className="w-9 h-6 flex-shrink-0 flex items-center justify-center">
          <LogoMark className="h-[26px] w-[10px] text-white" />
        </div>
        <div className="flex items-center gap-4">
          {([
            { stage: 1, Icon: StageCompactIcon,      label: 'Compacto',     active: false },
            { stage: 2, Icon: StageIntermediateIcon, label: 'Intermediário', active: false },
            { stage: 3, Icon: StageExpandedIcon,     label: 'Expandido',    active: true  },
          ] as const).map(({ stage, Icon, label, active }) => {
            const onPress = stage === 1 ? onShowStage1 : stage === 2 ? onShowStage2 : onShowStage3
            return (
              <button
                key={stage}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onPress() }}
                className="flex items-center justify-center transition-opacity duration-150 min-w-[28px] min-h-[28px]"
                style={{ color: active ? 'var(--ares-text-strong)' : 'var(--ares-text-muted)' }}
                aria-label={label}
              >
                <Icon className={
                  stage === 1 ? 'w-[var(--ares-icon-md)] h-auto' :
                  stage === 2 ? 'w-[var(--ares-icon-lg)] h-auto' :
                  'w-[var(--ares-icon-sm)] h-auto'
                } />
              </button>
            )
          })}
        </div>
        <div className="flex-1" />

        {/* ── Price ticker — centered absolute, never disrupts flex layout ── */}
        {tickerQuote && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: tickerQuote.positive ? 'var(--ares-success)' : 'var(--ares-danger)'
            }} />
            <span style={{
              fontSize: 11.5, fontWeight: 500,
              color: 'var(--ares-text-secondary)',
              letterSpacing: '0.03em'
            }}>
              {tickerQuote.symbol}
            </span>
            <span style={{
              fontSize: 11.5, fontWeight: 500,
              color: 'var(--ares-text-primary)',
              letterSpacing: '-0.01em'
            }}>
              {tickerQuote.price}
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 500,
              letterSpacing: '0.005em',
              color: tickerQuote.positive ? 'var(--ares-success)' : 'var(--ares-danger)'
            }}>
              {tickerQuote.change}
            </span>
          </div>
        )}

        {isStreaming && (
          <div className="flex items-center">
            <GlasswingThinkingIndicator size={34} emphasis="strong" />
          </div>
        )}

        {onEnterOperator && (
          <button
            onMouseDown={e => { e.preventDefault(); onEnterOperator() }}
            className="w-7 h-7 flex items-center justify-center transition-opacity duration-150 hover:opacity-80"
            style={{ color: 'var(--ares-text-secondary)' }}
            aria-label="Modo autônomo"
            title="Modo autônomo"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14 17.5h7M17.5 14v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
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
          style={{ color: settingsOpen ? 'var(--ares-text-strong)' : 'var(--ares-text-secondary)' }}
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
                color: 'var(--ares-text-muted)',
                letterSpacing: '-0.01em',
                fontSize: 'calc(var(--hud-font-size, 15px) - 2px)'
              }}
            >
              {greeting.label}
            </p>
            <p
              className="text-[20px] font-medium mt-1"
              style={{
                color: 'var(--ares-text-strong)',
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
                  color: 'var(--ares-text-tertiary)',
                  fontSize: 'calc(var(--hud-font-size, 15px) - 3px)'
                }}
              >
                {greeting.subtitle}
              </p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            {suggestionPills.map(({ text, Icon }) => (
              <button
                key={text}
                onMouseDown={e => { e.preventDefault(); onQuickPrompt(text) }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-full transition-all duration-150"
                style={{
                  background: 'color-mix(in srgb, var(--ares-surface-1) 76%, transparent)',
                  border: '1px solid var(--ares-border-strong)',
                  color: 'var(--ares-text-secondary)',
                  fontSize: 'calc(var(--hud-font-size, 15px) - 2px)',
                  letterSpacing: '0.003em'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--ares-surface-2) 82%, transparent)'
                  e.currentTarget.style.borderColor = 'var(--ares-border-strong)'
                  e.currentTarget.style.color = 'var(--ares-text-strong)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'color-mix(in srgb, var(--ares-surface-1) 76%, transparent)'
                  e.currentTarget.style.borderColor = 'var(--ares-border-strong)'
                  e.currentTarget.style.color = 'var(--ares-text-secondary)'
                }}
              >
                <Icon size={12} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden="true" />
                {text}
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
                        style={{ borderRight: '1px solid var(--ares-border-soft)' }}
              >
                <button
                  onMouseDown={e => {
                    e.preventDefault()
                    setSettingsOpen(false)
                  }}
                  className="w-8 h-8 flex items-center justify-center mb-5 rounded-lg transition-colors duration-150"
                  style={{ color: 'var(--ares-text-primary)' }}
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
                  <SettingsNavItem
                    label="Mercado"
                    active={activeSettingsTab === 'market'}
                    onClick={() => setActiveSettingsTab('market')}
                    icon={<BarChart2 size={16} strokeWidth={1.75} />}
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
                          background: 'color-mix(in srgb, var(--ares-surface-1) 68%, transparent)',
                          color: 'var(--ares-text-strong)',
                          border: '1px solid var(--ares-border-strong)',
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
                      {msg.meta?.debug?.dominantContextSource && (
                        <div style={{ marginBottom: 10 }}>
                          <ResponseSourceBadge meta={msg.meta} />
                        </div>
                      )}
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
                  <MessageBody content={streamingContent} streaming />
                  <motion.span
                    className="inline-block w-0.5 h-3.5 ml-0.5 align-middle"
                    style={{ background: 'var(--ares-text-primary)' }}
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
              style={{ color: chatSidebarOpen ? 'var(--ares-text-secondary)' : 'var(--ares-text-muted)' }}
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
          <div
            className={isStreaming ? 'ares-stream-pulse' : undefined}
            style={{ borderTop: '1px solid var(--ares-border-strong)', paddingTop: 14, paddingLeft: 10, paddingRight: 6, transition: 'border-color 0.3s ease' }}
          >
            <div className="flex items-end gap-3">
              <textarea
                ref={inputRef}
                className="flex-1 resize-none bg-transparent outline-none scrollbar-none overflow-y-auto selectable"
                style={{
                  color: 'var(--ares-text-secondary)',
                  fontSize: 'calc(var(--hud-font-size, 15px) - 1px)',
                  lineHeight: 'var(--hud-body-leading, 1.66)',
                  letterSpacing: 'var(--hud-input-tracking, -0.015em)',
                  minHeight: INPUT_MIN_HEIGHT,
                  maxHeight: INPUT_MAX_HEIGHT
                }}
                placeholder={inputPlaceholder()}
                rows={1}
                value={inputValue}
                disabled={isStreaming}
                onChange={e => {
                  onInputChange(e.target.value)
                  onActivity()
                }}
                onKeyDown={handleKey}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              />

              {voiceEnabled && isSupported && (
                <button
                  onMouseDown={e => { e.preventDefault(); toggleMic() }}
                  disabled={isStreaming}
                  className="w-8 h-8 flex items-center justify-center flex-shrink-0 transition-opacity duration-150 relative"
                  style={{ color: isListening ? 'var(--ares-danger)' : 'var(--ares-text-muted)' }}
                  aria-label={isListening ? 'Parar gravação' : 'Gravar voz'}
                >
                  {isListening && (
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: 'var(--ares-danger-soft)', animation: 'capture-pulse 1.2s ease-out infinite' }}
                    />
                  )}
                  <MicIcon className="w-[18px] h-auto relative" />
                </button>
              )}

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
                      ? 'var(--ares-text-secondary)'
                      : 'var(--ares-text-muted)'
                }}
                aria-label="Enviar"
              >
                <SendIcon className="w-[var(--ares-icon-lg)] h-auto" />
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
                  style={{ color: 'var(--ares-text-muted)' }}
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

