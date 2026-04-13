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
  TutorAction,
  TutorMessage,
  TutorResponse
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
  'system-sans': '"SF Pro Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  'system-serif': '"New York", Georgia, "Times New Roman", serif',
  mono: '"SF Mono", "Cascadia Code", Consolas, monospace'
} as const

const FONT_WEIGHT_MAP = {
  light: 300,
  book: 350,
  regular: 400,
  medium: 500,
  bold: 700
} as const

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

function streamText(
  text: string,
  onChunk: (chunk: string) => void,
  onDone: () => void
): void {
  let i = 0
  const interval = setInterval(() => {
    if (i >= text.length) {
      clearInterval(interval)
      onChunk(text)
      onDone()
      return
    }

    // Advance by larger chunks at a slower rate to reduce re-renders
    i = Math.min(i + Math.floor(Math.random() * 8) + 3, text.length)
    onChunk(text.slice(0, i))
  }, 55)
}

export function HUD() {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationSummary, setConversationSummary] = useState<string | null>(null)
  const [streamingContent, setChunk] = useState('')
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
  const prevVisual = useRef<HudVisual>('compact')


  // ── Keep activeChatIdRef in sync ──
  useEffect(() => {
    activeChatIdRef.current = activeChatId
  }, [activeChatId])

  // ── Load active chat on mount ──
  useEffect(() => {
    window.chatAPI.getActive().then(({ chat, activeChatId: id }) => {
      setActiveChatId(id)
      activeChatIdRef.current = id
      if (chat.messages.length > 0) setMessages(chat.messages)
      setConversationSummary(chat.summary)
    }).catch(() => {})
    window.chatAPI.listMetas().then(setChatMetas).catch(() => {})
  }, [])

  const {
    visual, isStreaming, sidebarSide,
    expand, expandFull, showIntermediate, showExpanded, collapse, ping,
    setStreaming, setInputFocused, dockSidebar, undockSidebar
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
      const { chat, metas: newMetas } = await window.chatAPI.create()
      setActiveChatId(chat.id)
      setMessages([])
      setConversationSummary(null)
      setChatMetas(newMetas)
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

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() || isStreaming) return

    const userMsg = inputValue.trim()
    const isFirstMessage = messages.length === 0

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
    window.proactiveAPI.markActivity('submit')
    window.proactiveAPI.dismissHint('consumed')

    setMessages(prev => {
      if (prev.length === 0 && visual !== 'sidebar') expandFull()
      return [...prev, { role: 'user', content: userMsg }]
    })

    setStreaming(true)

    try {
      const tutorResponse = await window.tutorAPI.respond({
        prompt: userMsg,
        conversation,
        context: contextSnapshot
      })

      let accumulated = ''
      streamText(
        tutorResponse.content,
        chunk => {
          accumulated = chunk
          setChunk(chunk)
        },
        () => {
          setMessages(prev => {
            const next = [
              ...prev,
              { role: 'assistant' as const, content: accumulated, meta: tutorResponse }
            ]
            if (next.length > CONVO_SUMMARIZE_AT) {
              const toCompress = next.slice(0, next.length - CONVO_WINDOW)
              setConversationSummary(s => buildConversationSummary(s, toCompress))
              return next.slice(-CONVO_WINDOW)
            }
            return next
          })
          setChunk('')
          setStreaming(false)
          void refreshPrivacyState()
          if (isFirstMessage) {
            const chatId = activeChatIdRef.current
            if (chatId) {
              window.chatAPI.generateTitle(chatId, userMsg).then(title => {
                if (title) setChatMetas(prev => prev.map(m => m.id === chatId ? { ...m, title } : m))
              }).catch(() => {})
            }
          }
        }
      )
    } catch (error) {
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
            warning: null
          }
        }
      ])
      setChunk('')
      setStreaming(false)
    }
  }, [contextSnapshot, conversationSummary, expandFull, inputValue, isStreaming, messages, refreshPrivacyState, setStreaming, visual, setChatMetas])

  const handleExecuteAction = useCallback(async (action: TutorAction) => {
    if (action.kind !== 'spotify') return
    if (pendingActionIds.includes(action.id)) return

    setPendingActionIds(prev => [...prev, action.id])

    try {
      const result = await window.spotifyAPI.executeAction(action.payload)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: result.message,
          meta: buildSpotifyActionMeta(result)
        }
      ])
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

  const typography = settings?.typography
  const hudTypographyStyle = typography
    ? {
        ['--hud-font-size' as string]: `${typography.fontSize}px`,
        fontFamily: FONT_FAMILY_MAP[typography.fontFamily],
        fontWeight: FONT_WEIGHT_MAP[typography.fontWeight] as number
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
    warning: result.ok ? null : result.message
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
