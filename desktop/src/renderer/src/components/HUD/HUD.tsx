import { useCallback, useEffect, useRef, useState } from 'react'
import { useHudStateMachine, HudVisual } from '@renderer/hooks/useHudStateMachine'
import { usePerception } from '@renderer/hooks/usePerception'
import type {
  AppSettings,
  CaptureSource,
  DataDeletionSummary,
  DiagnosticsSnapshot,
  PrivacySnapshot,
  SpotifyCommandResult,
  TradingViewCommandResult,
  VSCodeCommandResult,
  TutorAction,
  TutorMessage,
  TutorResponse,
  TutorStep
} from '@shared/perception.types'
import type { AIProviderId, AISettingsSnapshot, SaveAIProviderInput } from '@shared/ai-provider.types'
import type { AICostSnapshot } from '@shared/ai-provider.types'
import type { ProactiveHint } from '@shared/proactive.types'
import type {
  MemoryCardSummary,
  MemoryEmbeddingStatus,
  MemoryImportPreview,
  MemoryImportMode
} from '@shared/memory.types'
import { HudShell, HudContent } from './HudShell'
import { HudCompact } from './HudCompact'
import { HudIntermediate } from './HudIntermediate'
import { HudExpanded } from './HudExpanded'
import { HudSidebar } from './HudSidebar'
import { HudOperator } from './HudOperator'

// ─── Conversation context window ─────────────────────────────────
const CONVO_WINDOW       = 10   // active messages kept in memory
const CONVO_SUMMARIZE_AT = 18   // trigger compression when messages exceed this

/** Compresses older messages into a rolling text block (no AI call needed). */
function buildConversationSummary(existing: string | null, toCompress: Message[]): string {
  const lines = toCompress.map(m => {
    const speaker = m.role === 'user' ? 'Victor' : 'John'
    const text    = m.content.length > 180 ? m.content.slice(0, 180) + '…' : m.content
    return `${speaker}: ${text}`
  })
  const block  = lines.join('\n')
  const prefix = existing ? `${existing}\n` : ''
  const full   = `${prefix}${block}`
  // Tail-truncate to 900 chars so the summary doesn't grow unbounded
  return full.length > 900 ? full.slice(full.length - 900) : full
}

const FONT_FAMILY_MAP = {
  'system-sans': '"Segoe UI Variable Text", "SF Pro Text", "SF Pro Display", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
  'system-serif': '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", "Georgia Pro", Georgia, "Times New Roman", serif',
  mono: '"SF Mono", "Cascadia Code", "Cascadia Mono", Consolas, monospace'
} as const

const FONT_WEIGHT_MAP = {
  light: 300,
  book: 350,
  regular: 400,
  medium: 500,
  bold: 700
} as const

const FONT_PROFILE_MAP = {
  'system-sans': {
    bodyLeading: 1.66,
    bodyTracking: '-0.014em',
    headingTracking: '-0.03em',
    labelTracking: '0.075em',
    mutedTracking: '-0.01em',
    inputTracking: '-0.016em'
  },
  'system-serif': {
    bodyLeading: 1.72,
    bodyTracking: '-0.008em',
    headingTracking: '-0.024em',
    labelTracking: '0.09em',
    mutedTracking: '-0.004em',
    inputTracking: '-0.012em'
  },
  mono: {
    bodyLeading: 1.62,
    bodyTracking: '-0.006em',
    headingTracking: '-0.012em',
    labelTracking: '0.06em',
    mutedTracking: '-0.002em',
    inputTracking: '-0.008em'
  }
} as const

interface Message {
  role: 'user' | 'assistant'
  content: string
  meta?: TutorResponse
  proactive?: boolean
}

interface ChatMeta {
  id: string
  title: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

export function HUD() {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationSummary, setConversationSummary] = useState<string | null>(null)
  const [streamingContent, setChunk] = useState('')
  const [streamingSteps, setStreamingSteps] = useState<TutorStep[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatMetas, setChatMetas] = useState<ChatMeta[]>([])
  const activeChatIdRef = useRef<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot | null>(null)
  const [privacy, setPrivacy] = useState<PrivacySnapshot | null>(null)
  const [lastDeletion, setLastDeletion] = useState<DataDeletionSummary | null>(null)
  const [aiSettings, setAISettings] = useState<AISettingsSnapshot | null>(null)
  const [aiCosts, setAICosts] = useState<AICostSnapshot | null>(null)
  const [proactiveHint, setProactiveHint] = useState<ProactiveHint | null>(null)
  const [memorySummary, setMemorySummary] = useState<MemoryCardSummary | null>(null)
  const [memoryEmbeddingStatus, setMemoryEmbeddingStatus] = useState<MemoryEmbeddingStatus | null>(null)
  const [memoryImportPreview, setMemoryImportPreview] = useState<MemoryImportPreview | null>(null)
  const [memoryIncludeProfile, setMemoryIncludeProfile] = useState(true)
  const [memoryFeedback, setMemoryFeedback] = useState<string | null>(null)
  const [screenshotMode, setScreenshotMode] = useState(false)
  const [pendingActionIds, setPendingActionIds] = useState<string[]>([])
  const [spotifyState, setSpotifyState] = useState<import('../../../../preload/index.d').SpotifyPlaybackState | null>(null)
  const [tickerQuote, setTickerQuote] = useState<import('../../../../preload/index.d').TickerQuote | null>(null)
  const [tradingViewState, setTradingViewState] = useState<import('@shared/perception.types').TradingViewConnectorState | null>(null)
  const [newsSnapshot, setNewsSnapshot] = useState<import('@shared/perception.types').MarketNewsSnapshot | null>(null)
  const [approachingEvent, setApproachingEvent] = useState<import('@shared/perception.types').MacroEvent | null>(null)
  const prevVisual = useRef<HudVisual>('compact')
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)


  // ── Keep activeChatIdRef in sync ──
  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  // ── Load active chat on mount ──
  useEffect(() => {
    window.chatAPI.listMetas().then(async metas => {
      setChatMetas(metas)
      if (metas.length === 0) {
        setActiveChatId(null)
        activeChatIdRef.current = null
        setMessages([])
        setConversationSummary(null)
        return
      }

      const { chat, activeChatId: id } = await window.chatAPI.getActive()
      setActiveChatId(id)
      activeChatIdRef.current = id
      if (chat.messages.length > 0) setMessages(chat.messages)
      setConversationSummary(chat.summary)
    }).catch(() => {})
  }, [])

  const {
    visual, isStreaming, sidebarSide,
    expand, expandFull, showIntermediate, showExpanded, collapse, ping,
    setStreaming, setInputFocused, dockSidebar, undockSidebar,
    enterOperator, exitOperator
  } = useHudStateMachine()

  const sessionActive = visual !== 'compact'
  const [privateMode, setPrivateModeState] = useState(false)

  const {
    contextSnapshot,
    isCapturing,
    togglePrivateMode: _togglePrivate,
    resumeSensitiveBlock,
    updateUserProfile,
    clearSessionMemory,
    refreshContext
  } = usePerception({ sessionActive, privateMode })

  const semanticState = contextSnapshot?.semanticState ?? null
  const sessionMemory = contextSnapshot?.sessionMemory ?? null
  const userProfile = contextSnapshot?.userProfile ?? null

  const refreshPrivacyState = useCallback(async () => {
    const [
      nextSettings,
      nextSources,
      nextDiagnostics,
      nextPrivacy,
      nextAISettings,
      nextAICosts,
      nextMemorySummary,
      nextEmbeddingStatus
    ] = await Promise.all([
      window.settingsAPI.get(),
      window.perceptionAPI.getSources(),
      window.settingsAPI.getDiagnostics(),
      window.settingsAPI.getPrivacy(),
      window.aiAPI.getSettings(),
      window.aiAPI.getCosts(),
      window.memoryAPI.getSummary(),
      window.memoryAPI.getEmbeddingStatus()
    ])

    setSettings(nextSettings)
    setSources(nextSources)
    setDiagnostics(nextDiagnostics)
    setPrivacy(nextPrivacy)
    setAISettings(nextAISettings)
    setAICosts(nextAICosts)
    setMemorySummary(nextMemorySummary)
    setMemoryEmbeddingStatus(nextEmbeddingStatus)
  }, [])

  useEffect(() => {
    void refreshPrivacyState()
  }, [refreshPrivacyState])

  useEffect(() => {
    window.memoryAPI.getSummary().then(setMemorySummary).catch(() => {})
    window.memoryAPI.getEmbeddingStatus().then(setMemoryEmbeddingStatus).catch(() => {})
  }, [userProfile?.updated_at, sessionMemory?.updated_at])

  useEffect(() => {
    const unsub = window.hudAPI.onScreenshotModeChange(active => setScreenshotMode(active))
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = window.hudAPI.onToggle(() => collapse())
    return () => unsub()
  }, [collapse])

  const handleToggleScreenshotMode = useCallback(async () => {
    const next = !screenshotMode
    await window.hudAPI.setScreenshotMode(next)
    setScreenshotMode(next)
  }, [screenshotMode])

  useEffect(() => {
    window.proactiveAPI.getState().then(state => setProactiveHint(state.currentHint))
    const unsub = window.proactiveAPI.onHint(hint => setProactiveHint(hint))
    return () => unsub()
  }, [])

  useEffect(() => {
    window.spotifyAPI.getState().then(setSpotifyState).catch(() => {})
    return window.spotifyAPI.onStateUpdate(setSpotifyState)
  }, [])

  useEffect(() => {
    window.tickerAPI.getQuote().then(setTickerQuote).catch(() => {})
    return window.tickerAPI.onUpdate(setTickerQuote)
  }, [])

  useEffect(() => {
    window.tradingViewAPI.getStatus().then(setTradingViewState).catch(() => {})
    return window.tradingViewAPI.onStatusUpdate(setTradingViewState)
  }, [])

  useEffect(() => {
    window.newsAPI.getSnapshot().then(s => { if (s?.items?.length) setNewsSnapshot(s) }).catch(() => {})
    return window.newsAPI.onUpdate(setNewsSnapshot)
  }, [])

  useEffect(() => {
    window.calendarAPI.getSnapshot().then(s => {
      const now = Date.now()
      const next = s.events.find(e => e.timestamp > now && e.timestamp - now < 30 * 60 * 1000)
      if (next) setApproachingEvent(next)
    }).catch(() => {})
    return window.calendarAPI.onApproaching(e => setApproachingEvent(e))
  }, [])

  useEffect(() => {
    if (visual !== 'operator') {
      window.operatorAPI.stop()
      return
    }
    window.operatorAPI.start()
    const unsub = window.operatorAPI.onAlert(alert => {
      setMessages(prev => [
        ...prev,
        { role: 'assistant' as const, content: alert.content, proactive: true }
      ])
      if (settings?.featureFlags.voiceMode) {
        window.elevenLabsAPI.speak(alert.content).then(b64 => {
          if (!b64) return
          currentAudioRef.current?.pause()
          const audio = new Audio(`data:audio/mpeg;base64,${b64}`)
          currentAudioRef.current = audio
          audio.play().catch(() => {})
        }).catch(() => {})
      }
    })
    return () => {
      unsub()
      window.operatorAPI.stop()
    }
  }, [visual])

  useEffect(() => {
    window.proactiveAPI.setStreaming(isStreaming)
  }, [isStreaming])

  // ── Auto-save active chat (debounced 500ms) ──
  useEffect(() => {
    if (!activeChatId) return
    const t = setTimeout(() => {
      window.chatAPI.save(activeChatId, messages, conversationSummary).catch(() => {})
    }, 500)
    return () => clearTimeout(t)
  }, [messages, conversationSummary, activeChatId])

  // Listen for sidebar dock events from main process
  useEffect(() => {
    const unsub = window.hudAPI.onSidebarDocked(side => dockSidebar(side))
    return () => unsub()
  }, [dockSidebar])

  const handleUnsnap = useCallback(() => {
    undockSidebar()
    void window.hudAPI.undockSidebar()
  }, [undockSidebar])

  const handleNewChat = useCallback(async () => {
    const id = activeChatIdRef.current
    if (id) await window.chatAPI.save(id, messages, conversationSummary).catch(() => {})
    const { chat, metas } = await window.chatAPI.create()
    setActiveChatId(chat.id)
    setMessages([])
    setConversationSummary(null)
    setChatMetas(metas)
    setInputValue('')
    setChunk('')
    setStreamingSteps([])
  }, [conversationSummary, messages])

  const handleSelectChat = useCallback(async (id: string) => {
    if (id === activeChatIdRef.current) return
    const cur = activeChatIdRef.current
    if (cur) await window.chatAPI.save(cur, messages, conversationSummary).catch(() => {})
    await window.chatAPI.setActive(id)
    const chat = await window.chatAPI.load(id)
    if (!chat) return
    setActiveChatId(id)
    setMessages(chat.messages)
    setConversationSummary(chat.summary)
    setInputValue('')
    setChunk('')
    setStreamingSteps([])
  }, [conversationSummary, messages])

  const handleDeleteChat = useCallback(async (id: string) => {
    const metas = await window.chatAPI.delete(id)
    setChatMetas(metas)
    if (id !== activeChatIdRef.current) return
    if (metas.length > 0) {
      const next = await window.chatAPI.load(metas[0].id)
      if (next) {
        setActiveChatId(next.id)
        setMessages(next.messages)
        setConversationSummary(next.summary)
      }
    } else {
      setActiveChatId(null)
      activeChatIdRef.current = null
      setMessages([])
      setConversationSummary(null)
    }
    setInputValue('')
    setChunk('')
  }, [])

  const handleRenameChat = useCallback(async (id: string, title: string) => {
    await window.chatAPI.rename(id, title)
    setChatMetas(prev => prev.map(m => m.id === id ? { ...m, title } : m))
  }, [])

  const handleActivity = useCallback((type: 'mouse-move' | 'scroll' | 'typing' | 'submit' | 'expand' | 'collapse' | 'engage' = 'engage') => {
    ping()
    window.proactiveAPI.markActivity(type)
  }, [ping])

  // Stable callback refs to avoid breaking memo on children
  const handleActivityExpand = useCallback(() => handleActivity('expand'), [handleActivity])
  const handleActivityEngage = useCallback(() => handleActivity('engage'), [handleActivity])
  const handleActivityTyping = useCallback((value: string) => { setInputValue(value); handleActivity('typing') }, [handleActivity])
  const handleInputFocus = useCallback(() => setInputFocused(true), [setInputFocused])
  const handleInputBlur = useCallback(() => setInputFocused(false), [setInputFocused])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await window.settingsAPI.update(patch)
    setSettings(next)
    const [nextDiagnostics, nextPrivacy] = await Promise.all([
      window.settingsAPI.getDiagnostics(),
      window.settingsAPI.getPrivacy()
    ])
    setDiagnostics(nextDiagnostics)
    setPrivacy(nextPrivacy)
  }, [])

  const handleDeleteLocalData = useCallback(async () => {
    const summary = await window.settingsAPI.deleteLocalData()
    setLastDeletion(summary)
    setMessages([])
    setInputValue('')
    setChunk('')
    setStreamingSteps([])
    setPrivateModeState(false)
    setMemoryImportPreview(null)
    setMemoryFeedback(null)
    await refreshPrivacyState()
  }, [refreshPrivacyState])

  const handleExportMemory = useCallback(async () => {
    const result = await window.memoryAPI.exportCard()
    if (!result) return
    setMemorySummary(result.summary)
    setMemoryFeedback(`Memória exportada para ${result.path}`)
  }, [])

  const handleSelectImportCard = useCallback(async () => {
    const filePath = await window.memoryAPI.selectImportCard()
    if (!filePath) return
    const preview = await window.memoryAPI.previewImport(filePath)
    setMemoryImportPreview(preview)
    setMemoryIncludeProfile(preview.include_profile_default)
    setMemoryFeedback(null)
  }, [])

  const handleApplyMemoryImport = useCallback(async (mode: MemoryImportMode) => {
    if (!memoryImportPreview) return
    const summary = await window.memoryAPI.applyImport({
      filePath: memoryImportPreview.file_path,
      mode,
      includeProfile: memoryIncludeProfile
    })
    setMemorySummary(summary)
    setMemoryImportPreview(null)
    setMemoryFeedback(mode === 'replace' ? 'Memory card restaurado.' : 'Memory card mesclado.')
    await refreshContext()
    setMemoryEmbeddingStatus(await window.memoryAPI.getEmbeddingStatus())
  }, [memoryImportPreview, memoryIncludeProfile, refreshContext])

  const handleClearPersistedMemory = useCallback(async () => {
    const summary = await window.memoryAPI.clearPersisted()
    setMemorySummary(summary)
    setMemoryImportPreview(null)
    setMemoryFeedback('Memória persistida local limpa.')
    await refreshContext()
    setMemoryEmbeddingStatus(await window.memoryAPI.getEmbeddingStatus())
  }, [refreshContext])

  const handleSyncEmbeddings = useCallback(async (force = false) => {
    const status = force
      ? await window.memoryAPI.rebuildEmbeddings()
      : await window.memoryAPI.syncEmbeddings()
    setMemoryEmbeddingStatus(status)
    setAICosts(await window.aiAPI.getCosts())
    setMemoryFeedback(force ? 'Indice semantico reindexado.' : 'Embeddings sincronizados.')
  }, [])

  const refreshAISettings = useCallback(async () => {
    const snapshot = await window.aiAPI.getSettings()
    setAISettings(snapshot)
  }, [])

  const handleSaveProvider = useCallback(async (input: SaveAIProviderInput) => {
    const snapshot = await window.aiAPI.saveProvider(input)
    setAISettings(snapshot)
  }, [])

  const handleRemoveProvider = useCallback(async (providerId: AIProviderId) => {
    const snapshot = await window.aiAPI.removeProvider(providerId)
    setAISettings(snapshot)
  }, [])

  const handleTestProvider = useCallback(async (providerId: AIProviderId) => {
    const result = await window.aiAPI.testProvider(providerId)
    setAISettings(current => {
      if (!current) return current
      return {
        ...current,
        providers: current.providers.map(provider =>
          provider.id === providerId ? result.snapshot : provider
        )
      }
    })
    const fresh = await window.aiAPI.getSettings()
    setAISettings(fresh)
    return result
  }, [])

  const handleUpdateAIRouting = useCallback(async (patch: Partial<AISettingsSnapshot['routing']>) => {
    const snapshot = await window.aiAPI.updateRouting(patch)
    setAISettings(snapshot)
  }, [])

  const handleTogglePrivate = useCallback(() => {
    setPrivateModeState(prev => !prev)
    _togglePrivate()
    setTimeout(() => { void refreshPrivacyState() }, 0)
  }, [_togglePrivate, refreshPrivacyState])

  const handleResumeSensitiveBlock = useCallback(async () => {
    await resumeSensitiveBlock()
    await refreshPrivacyState()
  }, [refreshPrivacyState, resumeSensitiveBlock])

  const handleCycleLevel = useCallback(() => {
    if (!userProfile) return

    const nextLevel =
      userProfile.user_level === 'beginner'
        ? 'intermediate'
        : userProfile.user_level === 'intermediate'
          ? 'advanced'
          : 'beginner'

    updateUserProfile({ user_level: nextLevel })
  }, [updateUserProfile, userProfile])

  const handleCycleStyle = useCallback(() => {
    if (!userProfile) return

    const nextStyle =
      userProfile.preferred_explanation_style === 'step_by_step'
        ? 'direct'
        : userProfile.preferred_explanation_style === 'direct'
          ? 'analogy'
          : userProfile.preferred_explanation_style === 'analogy'
            ? 'summary'
            : 'step_by_step'

    updateUserProfile({ preferred_explanation_style: nextStyle })
  }, [updateUserProfile, userProfile])

  if (prevVisual.current !== visual) prevVisual.current = visual

  const maybeGenerateChatTitle = useCallback((conversationMessages: Message[]) => {
    const chatId = activeChatIdRef.current
    if (!chatId) return

    const titleSeed = conversationMessages
      .filter(message => message.content.trim())
      .slice(0, 6)
      .map(message => ({ role: message.role, content: message.content }))

    if (titleSeed.length < 2) return

    const assistantCount = titleSeed.filter(message => message.role === 'assistant').length
    if (assistantCount === 0 || assistantCount > 2) return

    window.chatAPI.generateTitle(chatId, titleSeed).then(title => {
      if (title) {
        setChatMetas(prev => prev.map(meta => meta.id === chatId ? { ...meta, title } : meta))
      }
    }).catch(() => {})
  }, [setChatMetas])

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() || isStreaming) return

    const userMsg = inputValue.trim()

    if (!activeChatIdRef.current) {
      const { chat, metas } = await window.chatAPI.create()
      setActiveChatId(chat.id)
      activeChatIdRef.current = chat.id
      setChatMetas(metas)
    }

    // Build the conversation with sliding window + optional summary block
    const activeMessages = messages.slice(-CONVO_WINDOW)
    const conversation: TutorMessage[] = [
      ...(conversationSummary ? [
        { role: 'user'      as const, content: `[Resumo da nossa conversa até aqui:\n${conversationSummary}]` },
        { role: 'assistant' as const, content: 'Certo, continuo a partir daí.' }
      ] : []),
      ...activeMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMsg }
    ]

    setInputValue('')
    setChunk('')
    setStreamingSteps([])
    window.proactiveAPI.markActivity('submit')
    window.proactiveAPI.dismissHint('consumed')

    setMessages(prev => {
      if (prev.length === 0 && visual !== 'sidebar') expandFull()
      return [...prev, { role: 'user', content: userMsg }]
    })

    setStreaming(true)

    // Wire up streaming event listeners before invoking so no events are missed
    let accumulated = ''
    const unsubStep  = window.tutorAPI.onStep(step => {
      setStreamingSteps(prev => {
        const idx = prev.findIndex(s => s.id === step.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = step
          return next
        }
        return [...prev, step]
      })
    })
    const unsubChunk = window.tutorAPI.onChunk(chunk => {
      accumulated += chunk
      setChunk(accumulated)
    })

    try {
      const tutorResponse = await window.tutorAPI.respondStream({
        prompt: userMsg,
        conversation,
        context: contextSnapshot
      })

      unsubStep()
      unsubChunk()

      // Kick off TTS in parallel — audio buffers while we finalize UI
      const voiceEnabled = settings?.featureFlags.voiceMode
      const audioPromise: Promise<string | null> = voiceEnabled
        ? window.elevenLabsAPI.speak(tutorResponse.content).catch(err => {
            console.warn('[TTS] speak failed:', err instanceof Error ? err.message : err)
            return null
          })
        : Promise.resolve(null)

      const finalContent = accumulated || tutorResponse.content
      setMessages(prev => {
        const next = [
          ...prev,
          { role: 'assistant' as const, content: finalContent, meta: tutorResponse }
        ]
        if (next.length > CONVO_SUMMARIZE_AT) {
          const toCompress = next.slice(0, next.length - CONVO_WINDOW)
          setConversationSummary(s => buildConversationSummary(s, toCompress))
          const trimmed = next.slice(-CONVO_WINDOW)
          maybeGenerateChatTitle(trimmed)
          return trimmed
        }
        maybeGenerateChatTitle(next)
        return next
      })
      setChunk('')
      setStreamingSteps([])
      setStreaming(false)
      void refreshPrivacyState()

      void audioPromise.then(base64 => {
        if (!base64) return
        currentAudioRef.current?.pause()
        const audio = new Audio(`data:audio/mpeg;base64,${base64}`)
        currentAudioRef.current = audio
        void audio.play().catch(err => console.warn('[TTS] play failed:', err))
      })
    } catch (error) {
      unsubStep()
      unsubChunk()
      console.error('[tutor] respond error:', error)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Não consegui gerar uma explicação contextual agora. Tente novamente com a sessão ativa.',
          meta: {
            domain: 'general',
            mode: 'direct',
            content: '',
            uncertainty: 1,
            should_ask_confirmation: true,
            needs_visual_confirmation: true,
            suggested_follow_ups: ['Tentar novamente'],
            warning: null,
            debug: {
              provider: 'spotify-local',
              model: 'spotify-local',
              latencyMs: 0,
              screenshotIncluded: false,
              screenCapturedAt: null,
              screenAgeMs: null,
              changeSummary: null,
              connectorsUsed: ['spotify'],
              dominantContextSource: 'spotify',
              sourceConfidence: {
                bridge: 0.98,
                vision: 0,
                ocr: 0,
                memory: 0
              },
              staleContextGuarded: false
            }
          }
        }
      ])
      setChunk('')
      setStreamingSteps([])
      setStreaming(false)
    }
  }, [contextSnapshot, conversationSummary, expandFull, inputValue, isStreaming, maybeGenerateChatTitle, messages, refreshPrivacyState, setStreaming, visual])

  const handleExecuteAction = useCallback(async (action: TutorAction) => {
    if (pendingActionIds.includes(action.id)) return

    setPendingActionIds(prev => [...prev, action.id])

    try {
      if (action.kind === 'spotify') {
        const result = await window.spotifyAPI.executeAction(action.payload)
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: result.message,
            meta: buildSpotifyActionMeta(result)
          }
        ])
      } else if (action.kind === 'tradingview') {
        const result = await window.tradingViewAPI.executeAction(action.payload)
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: result.message,
            meta: buildTradingViewActionMeta(result)
          }
        ])
      } else if (action.kind === 'market_autonomy') {
        const result = await window.marketAutonomyAPI.executeAction(action.payload.action)
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: result.content,
            meta: result
          }
        ])
      } else {
        const result = await window.vscodeAPI.executeAction(action.payload)
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: result.message,
            meta: buildVSCodeActionMeta(result)
          }
        ])
      }
      void refreshPrivacyState()
    } catch (error) {
      const content = error instanceof Error
        ? error.message
        : 'Não consegui executar essa ação no Spotify.'

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content,
          meta: {
            domain: 'general',
            mode: 'direct',
            content,
            uncertainty: 0,
            should_ask_confirmation: false,
            needs_visual_confirmation: false,
            suggested_follow_ups: ['O que tá tocando?', 'Tenta de novo'],
            warning: null
          }
        }
      ])
    } finally {
      setPendingActionIds(prev => prev.filter(id => id !== action.id))
    }
  }, [pendingActionIds, refreshPrivacyState])

  const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant')
  const latestResponse = latestAssistant?.content ?? ''
  const latestResponseMeta = latestAssistant?.meta ?? null
  const passiveSuggestion =
    settings?.passiveSuggestions && settings.featureFlags.passiveSuggestions
      ? proactiveHint?.text
        ?? latestResponseMeta?.suggested_follow_ups?.[0]
        ?? semanticState?.pedagogical_topics?.[0]
        ?? null
      : null

  const compactFallbackLabel =
    spotifyState?.isPlaying && spotifyState.trackName
      ? `${spotifyState.trackName}${spotifyState.artistName ? ` — ${spotifyState.artistName}` : ''}`
      : tickerQuote
        ? `${tickerQuote.symbol} · ${tickerQuote.price} · ${tickerQuote.change}`
        : null

  const typography = settings?.typography
  const typographyProfile = typography ? FONT_PROFILE_MAP[typography.fontFamily] : null
  const hudTypographyStyle = typography
    ? {
        ['--hud-font-family' as string]: FONT_FAMILY_MAP[typography.fontFamily],
        ['--hud-font-size' as string]: `${typography.fontSize}px`,
        ['--hud-font-weight' as string]: FONT_WEIGHT_MAP[typography.fontWeight],
        ['--hud-body-leading' as string]: typographyProfile?.bodyLeading,
        ['--hud-body-tracking' as string]: typographyProfile?.bodyTracking,
        ['--hud-heading-tracking' as string]: typographyProfile?.headingTracking,
        ['--hud-label-tracking' as string]: typographyProfile?.labelTracking,
        ['--hud-muted-tracking' as string]: typographyProfile?.mutedTracking,
        ['--hud-input-tracking' as string]: typographyProfile?.inputTracking,
        fontFamily: `var(--hud-font-family)`,
        fontWeight: `var(--hud-font-weight)` as unknown as number
      }
    : undefined

  return (
    <div className="w-screen h-screen flex items-start justify-center hud-typography" style={hudTypographyStyle}>
      <HudShell visual={visual} prevVisual={prevVisual.current} sidebarSide={sidebarSide}>
        <HudContent id={visual}>
          {visual === 'compact' && (
            <HudCompact
              onExpand={expand}
              onExpandFull={expandFull}
              onActivity={handleActivityExpand}
              isCapturing={isCapturing}
              minimalMode={settings?.minimalMode ?? false}
              passiveSuggestion={passiveSuggestion}
              fallbackLabel={compactFallbackLabel}
              hasProactiveHint={Boolean(proactiveHint)}
            />
          )}

          {visual === 'intermediate' && (
            <HudIntermediate
              inputValue={inputValue}
              onInputChange={handleActivityTyping}
              onSubmit={handleSubmit}
              onInputFocus={handleInputFocus}
              onInputBlur={handleInputBlur}
              onActivity={handleActivityEngage}
              onCollapse={collapse}
              response={latestResponse}
              responseMeta={latestResponseMeta}
              isStreaming={isStreaming}
              semanticState={semanticState}
              sessionMemory={sessionMemory}
              intermediateThought={contextSnapshot?.intermediateThought ?? null}
              isCapturing={isCapturing}
              isPrivate={privateMode}
              onTogglePrivate={handleTogglePrivate}
              voiceEnabled={settings?.featureFlags.voiceMode ?? false}
              onShowStage1={collapse}
              onShowStage2={showIntermediate}
              onShowStage3={showExpanded}
            />
          )}

          {visual === 'sidebar' && (
            <HudSidebar
              side={sidebarSide ?? 'right'}
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              streamingSteps={streamingSteps}
              inputValue={inputValue}
              onInputChange={handleActivityTyping}
              onSubmit={handleSubmit}
              onInputFocus={handleInputFocus}
              onInputBlur={handleInputBlur}
              onActivity={handleActivityEngage}
              onUnsnap={handleUnsnap}
              onExecuteAction={handleExecuteAction}
              pendingActionIds={pendingActionIds}
            />
          )}

          {visual === 'operator' && (
            <HudOperator
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              streamingSteps={streamingSteps}
              inputValue={inputValue}
              onInputChange={handleActivityTyping}
              onSubmit={handleSubmit}
              onInputFocus={handleInputFocus}
              onInputBlur={handleInputBlur}
              onActivity={handleActivityEngage}
              onExitOperator={exitOperator}
              onAnalyzeNow={() => { void window.operatorAPI.analyzeNow() }}
              tradingViewState={tradingViewState}
              newsSnapshot={newsSnapshot}
              approachingEvent={approachingEvent}
              voiceEnabled={settings?.featureFlags.voiceMode ?? false}
            />
          )}

          {visual === 'expanded' && (
            <HudExpanded
              activeChatId={activeChatId}
              chatMetas={chatMetas}
              onNewChat={() => { void handleNewChat() }}
              onSelectChat={id => { void handleSelectChat(id) }}
              onDeleteChat={id => { void handleDeleteChat(id) }}
              onRenameChat={(id, title) => { void handleRenameChat(id, title) }}
              inputValue={inputValue}
              onInputChange={handleActivityTyping}
              onSubmit={handleSubmit}
              onInputFocus={handleInputFocus}
              onInputBlur={handleInputBlur}
              onActivity={handleActivityEngage}
              onCollapse={collapse}
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              streamingSteps={streamingSteps}
              latestResponseMeta={latestResponseMeta}
              semanticState={semanticState}
              sessionMemory={sessionMemory}
              userProfile={userProfile}
              settings={settings}
              diagnostics={diagnostics}
              privacy={privacy}
              lastDeletion={lastDeletion}
              memorySummary={memorySummary}
              memoryEmbeddingStatus={memoryEmbeddingStatus}
              memoryImportPreview={memoryImportPreview}
              memoryIncludeProfile={memoryIncludeProfile}
              memoryFeedback={memoryFeedback}
              sources={sources}
              isCapturing={isCapturing}
              isPrivate={privateMode}
              onTogglePrivate={handleTogglePrivate}
              onResumeSensitiveBlock={handleResumeSensitiveBlock}
              onCycleLevel={handleCycleLevel}
              onCycleStyle={handleCycleStyle}
              onUpdateUserProfile={updateUserProfile}
              onClearContext={clearSessionMemory}
              onQuickPrompt={value => setInputValue(value)}
              onExecuteAction={handleExecuteAction}
              pendingActionIds={pendingActionIds}
              onBringMarketProposalToChat={() => {
                void window.marketAutonomyAPI.getChatPrompt().then(response => {
                  setMessages(prev => [
                    ...prev,
                    {
                      role: 'assistant',
                      content: response.content,
                      meta: response
                    }
                  ])
                })
              }}
              onToggleTelemetry={() => {
                if (!settings) return
                void updateSettings({ telemetryOptIn: !settings.telemetryOptIn })
              }}
              onToggleAlwaysVisible={() => {
                if (!settings) return
                void updateSettings({ alwaysVisible: !settings.alwaysVisible })
              }}
              onToggleMinimalMode={() => {
                if (!settings) return
                void updateSettings({ minimalMode: !settings.minimalMode })
              }}
              onTogglePassiveSuggestions={() => {
                if (!settings) return
                void updateSettings({
                  passiveSuggestions: !settings.passiveSuggestions,
                  featureFlags: {
                    ...settings.featureFlags,
                    passiveSuggestions: !settings.passiveSuggestions
                  }
                })
              }}
              onToggleAdvancedPerception={() => {
                if (!settings) return
                void updateSettings({
                  featureFlags: {
                    ...settings.featureFlags,
                    advancedPerception: !settings.featureFlags.advancedPerception
                  }
                })
              }}
              onToggleCrashReporting={() => {
                if (!settings) return
                void updateSettings({
                  featureFlags: {
                    ...settings.featureFlags,
                    crashReporting: !settings.featureFlags.crashReporting
                  }
                })
              }}
              onToggleVoiceMode={() => {
                if (!settings) return
                void updateSettings({
                  featureFlags: {
                    ...settings.featureFlags,
                    voiceMode: !settings.featureFlags.voiceMode
                  }
                })
              }}
              onTestVoice={async () => {
                const base64 = await window.elevenLabsAPI.speak('Olá, sou o John. Tudo certo por aqui.')
                currentAudioRef.current?.pause()
                const audio = new Audio(`data:audio/mpeg;base64,${base64}`)
                currentAudioRef.current = audio
                await audio.play()
              }}
              onSelectCaptureSource={source => {
                if (!settings) return
                void updateSettings({
                  captureScope: source
                    ? {
                        ...settings.captureScope,
                        mode: 'selected-source',
                        selectedSourceId: source.id,
                        selectedSourceName: source.name
                      }
                    : {
                        ...settings.captureScope,
                        mode: 'any-visible',
                        selectedSourceId: null,
                        selectedSourceName: null
                      }
                })
              }}
              onDeleteLocalData={() => { void handleDeleteLocalData() }}
              onExportMemory={() => { void handleExportMemory() }}
              onSyncEmbeddings={() => { void handleSyncEmbeddings(false) }}
              onRebuildEmbeddings={() => { void handleSyncEmbeddings(true) }}
              onSelectImportCard={() => { void handleSelectImportCard() }}
              onApplyMemoryImport={mode => { void handleApplyMemoryImport(mode) }}
              onToggleMemoryImportProfile={() => setMemoryIncludeProfile(prev => !prev)}
              onClearPersistedMemory={() => { void handleClearPersistedMemory() }}
              screenshotMode={screenshotMode}
              onToggleScreenshotMode={handleToggleScreenshotMode}
              aiSettings={aiSettings}
              aiCosts={aiCosts}
              onRefreshAISettings={refreshAISettings}
              onSaveProvider={input => { void handleSaveProvider(input) }}
              onRemoveProvider={providerId => { void handleRemoveProvider(providerId) }}
              onTestProvider={providerId => handleTestProvider(providerId)}
              onUpdateAIRouting={patch => { void handleUpdateAIRouting(patch) }}
              onUpdateTypography={patch => {
                if (!settings) return
                void updateSettings({
                  typography: {
                    ...settings.typography,
                    ...patch
                  }
                })
              }}
              onUpdateDailyCostLimit={value => {
                void updateSettings({ dailyCostLimitUsd: value })
              }}
              onShowStage1={collapse}
              onShowStage2={showIntermediate}
              onShowStage3={showExpanded}
              onSettingsOpenChange={open => setInputFocused(open)}
              onEnterOperator={enterOperator}
            />
          )}
        </HudContent>
      </HudShell>
    </div>
  )
}

function buildSpotifyActionMeta(result: SpotifyCommandResult): TutorResponse {
  const suggested = buildSpotifyActionFollowUps(result.state)

  return {
    domain: 'general',
    mode: 'direct',
    content: result.message,
    provider: 'spotify-local',
    model: 'spotify-local',
    uncertainty: 0,
    should_ask_confirmation: false,
    needs_visual_confirmation: false,
    suggested_follow_ups: suggested,
    warning: result.ok ? null : result.message,
    debug: {
      provider: 'spotify-local',
      model: 'spotify-local',
      latencyMs: 0,
      screenshotIncluded: false,
      screenCapturedAt: null,
      screenAgeMs: null,
      changeSummary: null,
      connectorsUsed: ['spotify'],
      dominantContextSource: 'spotify',
      sourceConfidence: {
        bridge: 0.98,
        vision: 0,
        ocr: 0,
        memory: 0
      },
      staleContextGuarded: false
    }
  }
}

function buildSpotifyActionFollowUps(state: SpotifyCommandResult['state']): string[] {
  if (!state?.trackName) {
    return ['Toca alguma coisa', 'O que tá tocando?']
  }

  const followUps = new Set<string>()
  followUps.add(state.isPlaying ? 'Pausar' : 'Continuar')
  followUps.add('Próxima')
  if (state.albumName) followUps.add(`Toca o álbum ${state.albumName}`)
  followUps.add('O que tá tocando?')
  return [...followUps].slice(0, 4)
}

function buildTradingViewActionMeta(result: TradingViewCommandResult): TutorResponse {
  const state = result.state
  const suggested = buildTradingViewActionFollowUps(state)

  return {
    domain: 'market',
    mode: 'direct',
    content: result.message,
    provider: 'tradingview-local',
    model: 'tradingview-local',
    uncertainty: state.lowConfidence ? 0.22 : 0.08,
    should_ask_confirmation: false,
    needs_visual_confirmation: false,
    suggested_follow_ups: suggested,
    warning: result.ok ? null : result.message,
    debug: {
      provider: 'tradingview-local',
      model: 'tradingview-local',
      latencyMs: 0,
      screenshotIncluded: false,
      screenCapturedAt: state.lastObservedAt,
      screenAgeMs: state.lastObservedAt ? Math.max(0, Date.now() - state.lastObservedAt) : null,
      changeSummary: null,
      connectorsUsed: ['tradingview'],
      dominantContextSource: 'tradingview',
      sourceConfidence: {
        bridge: 0.98,
        vision: 0,
        ocr: 0,
        memory: 0
      },
      staleContextGuarded: false
    }
  }
}

function buildTradingViewActionFollowUps(
  state: TradingViewCommandResult['state']
): string[] {
  const followUps = new Set<string>()
  if (state.symbol) followUps.add('Resume o gráfico')
  if (state.crosshairActive) followUps.add('Lê essa vela')
  if (state.timeframe !== '15') followUps.add('Muda para 15m')
  if (state.timeframe !== '60') followUps.add('Muda para 1h')
  if (state.symbol !== 'BTCUSDT') followUps.add('Abre BTCUSDT')
  return [...followUps].slice(0, 4)
}

function buildVSCodeActionMeta(result: VSCodeCommandResult): TutorResponse {
  const suggested = buildVSCodeActionFollowUps(result.state)

  return {
    domain: 'code',
    mode: 'direct',
    content: result.message,
    provider: 'vscode-local',
    model: 'vscode-local',
    uncertainty: result.ok ? 0.08 : 0.24,
    should_ask_confirmation: false,
    needs_visual_confirmation: false,
    suggested_follow_ups: suggested,
    warning: result.ok ? null : result.message,
    debug: {
      provider: 'vscode-local',
      model: 'vscode-local',
      latencyMs: 0,
      screenshotIncluded: false,
      screenCapturedAt: null,
      screenAgeMs: null,
      changeSummary: null,
      connectorsUsed: ['vscode'],
      dominantContextSource: 'vscode',
      sourceConfidence: {
        bridge: 0.98,
        vision: 0,
        ocr: 0,
        memory: 0
      },
      staleContextGuarded: false
    }
  }
}

function buildVSCodeActionFollowUps(state: VSCodeCommandResult['state']): string[] {
  const followUps = new Set<string>()
  followUps.add('Resume o VS Code')
  if (state?.editor) followUps.add('Lê o código atual')
  if (state?.diagnostics?.hasErrors) followUps.add('Explica esse erro')
  if ((state?.git?.changedFiles ?? 0) > 0 || (state?.git?.stagedFiles ?? 0) > 0) followUps.add('Revisa o diff')
  if (state?.terminal?.lastOutput?.trim()) followUps.add('Olha o terminal')
  return [...followUps].slice(0, 4)
}
