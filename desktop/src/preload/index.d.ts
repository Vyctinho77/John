import { ElectronAPI } from '@electron-toolkit/preload'
import type { AuthStatus } from '../shared/auth.types'
import type {
  AppSettings,
  CaptureSource,
  ConnectorStatus,
  DataDeletionSummary,
  DiagnosticsSnapshot,
  PerceptionContextSnapshot,
  PrivacySnapshot,
  SpotifyActionPayload,
  SpotifyCommandResult,
  VSCodeActionPayload,
  VSCodeCommandResult,
  TradingViewActionPayload,
  TradingViewCommandResult,
  TradingViewConnectorState,
  SessionMemory,
  TutorRequest,
  TutorResponse,
  TutorStep,
  UserProfile
} from '../shared/perception.types'
import type {
  AICostSnapshot,
  AIRoutingSettings,
  AIProviderId,
  AISettingsSnapshot,
  SaveAIProviderInput,
  TestAIProviderResult
} from '../shared/ai-provider.types'
import type {
  ProactiveActivityType,
  ProactiveHint,
  ProactiveOutcome,
  ProactiveState
} from '../shared/proactive.types'
import type {
  ApplyMemoryImportInput,
  MemoryEmbeddingStatus,
  MemoryCardSummary,
  MemoryExportResult,
  MemoryImportPreview
} from '../shared/memory.types'
import type { StoredMessage } from '../main/services/conversation-store'
import type { Chat, ChatMeta } from '../main/services/chat-store'

declare global {
  interface Window {
    electron: ElectronAPI
    hudAPI: {
      resize: (width: number, height: number) => void
      dragStart: (screenX: number, screenY: number) => void
      dragMove:  (screenX: number, screenY: number) => void
      dragEnd:   () => void
      onToggle: (cb: () => void) => () => void
      setScreenshotMode: (enabled: boolean) => Promise<boolean>
      onScreenshotModeChange: (cb: (active: boolean) => void) => () => void
      sidebarResize:   (width: number) => void
      undockSidebar:   () => Promise<void>
      onSidebarDocked: (cb: (side: 'left' | 'right') => void) => () => void
    }
    perceptionAPI: {
      checkPermission:   () => Promise<'granted' | 'denied' | 'not-determined'>
      requestPermission: () => Promise<'granted' | 'denied' | 'not-determined'>
      analyze:           () => Promise<PerceptionContextSnapshot>
      getContext:        () => Promise<PerceptionContextSnapshot>
      startSession:      () => void
      stopSession:       () => void
      setPrivateMode:    (enabled: boolean) => void
      getSources:        () => Promise<CaptureSource[]>
      updateUserProfile: (patch: Partial<UserProfile>) => Promise<PerceptionContextSnapshot>
      clearSessionMemory: () => Promise<SessionMemory>
      resumeSensitiveBlock: () => Promise<PerceptionContextSnapshot>
      onCaptureStateChange: (cb: (isCapturing: boolean) => void) => () => void
      onSnapshotUpdate: (cb: (snapshot: PerceptionContextSnapshot) => void) => () => void
    }
    tutorAPI: {
      respond: (request: TutorRequest) => Promise<TutorResponse>
      respondStream: (request: TutorRequest) => Promise<TutorResponse>
      onStep: (cb: (step: TutorStep) => void) => () => void
      onChunk: (cb: (chunk: string) => void) => () => void
    }
    settingsAPI: {
      get: () => Promise<AppSettings>
      update: (patch: Partial<AppSettings>) => Promise<AppSettings>
      getDiagnostics: () => Promise<DiagnosticsSnapshot>
      getPrivacy: () => Promise<PrivacySnapshot>
      deleteLocalData: () => Promise<DataDeletionSummary>
    }
    aiAPI: {
      getSettings: () => Promise<AISettingsSnapshot>
      getCosts: () => Promise<AICostSnapshot>
      saveProvider: (input: SaveAIProviderInput) => Promise<AISettingsSnapshot>
      removeProvider: (providerId: AIProviderId) => Promise<AISettingsSnapshot>
      testProvider: (providerId: AIProviderId) => Promise<TestAIProviderResult>
      updateRouting: (patch: Partial<AIRoutingSettings>) => Promise<AISettingsSnapshot>
    }
    proactiveAPI: {
      getState: () => Promise<ProactiveState>
      markActivity: (type: ProactiveActivityType) => void
      dismissHint: (outcome?: ProactiveOutcome) => void
      setStreaming: (active: boolean) => void
      onHint: (cb: (hint: ProactiveHint | null) => void) => () => void
    }
    memoryAPI: {
      getSummary: () => Promise<MemoryCardSummary>
      getEmbeddingStatus: () => Promise<MemoryEmbeddingStatus>
      exportCard: () => Promise<MemoryExportResult | null>
      selectImportCard: () => Promise<string | null>
      previewImport: (filePath: string) => Promise<MemoryImportPreview>
      applyImport: (input: ApplyMemoryImportInput) => Promise<MemoryCardSummary>
      clearPersisted: () => Promise<MemoryCardSummary>
      syncEmbeddings: () => Promise<MemoryEmbeddingStatus>
      rebuildEmbeddings: () => Promise<MemoryEmbeddingStatus>
    }
    chatAPI: {
      listMetas: () => Promise<ChatMeta[]>
      getActive: () => Promise<{ chat: Chat; activeChatId: string }>
      create: () => Promise<{ chat: Chat; metas: ChatMeta[] }>
      load: (id: string) => Promise<Chat | null>
      save: (id: string, messages: StoredMessage[], summary: string | null) => Promise<void>
      delete: (id: string) => Promise<ChatMeta[]>
      rename: (id: string, title: string) => Promise<void>
      setActive: (id: string) => Promise<void>
      generateTitle: (id: string, messages: StoredMessage[]) => Promise<string | null>
    }
    bridgeAPI: {
      getStatuses: () => Promise<ConnectorStatus[]>
      installVSCodeConnector: () => Promise<{ ok: boolean; message: string }>
      disconnect: (id: string) => Promise<void>
      onStatusUpdate: (cb: (status: ConnectorStatus) => void) => () => void
    }
    vscodeAPI: {
      executeAction: (payload: VSCodeActionPayload) => Promise<VSCodeCommandResult>
    }
    conversationAPI: {
      load: () => Promise<{ messages: StoredMessage[]; summary: string | null } | null>
      save: (data: { messages: StoredMessage[]; summary: string | null }) => Promise<void>
    }
    codexAuthAPI: {
      login:     () => Promise<AuthStatus>
      logout:    () => Promise<void>
      getStatus: () => Promise<AuthStatus>
      chat:      (options: unknown) => Promise<string>
    }
    spotifyAPI: {
      startAuth:     () => Promise<void>
      getState:      () => Promise<SpotifyPlaybackState | null>
      togglePlay:    () => Promise<void>
      next:          () => Promise<void>
      prev:          () => Promise<void>
      setVolume:     (v: number) => Promise<void>
      setShuffle:    (s: boolean) => Promise<void>
      setRepeat:     (s: string) => Promise<void>
      executeAction: (payload: SpotifyActionPayload) => Promise<SpotifyCommandResult>
      disconnect:    () => Promise<void>
      onStateUpdate: (cb: (state: SpotifyPlaybackState | null) => void) => () => void
    }
    tradingViewAPI: {
      open: () => Promise<TradingViewConnectorState>
      close: () => Promise<TradingViewConnectorState>
      getStatus: () => Promise<TradingViewConnectorState>
      setSymbol: (symbol: string) => Promise<TradingViewConnectorState>
      setTimeframe: (timeframe: string) => Promise<TradingViewConnectorState>
      executeAction: (payload: TradingViewActionPayload) => Promise<TradingViewCommandResult>
      onStatusUpdate: (cb: (state: TradingViewConnectorState) => void) => () => void
    }
    tickerAPI: {
      getQuote: () => Promise<TickerQuote | null>
      setSymbol: (symbol: string) => Promise<TickerQuote | null>
      onUpdate: (cb: (quote: TickerQuote | null) => void) => () => void
    }
    elevenLabsAPI: {
      hasKey: () => Promise<boolean>
      speak:  (text: string) => Promise<string>
    }
  }
}

export interface TickerQuote {
  symbol: string
  price: string
  change: string
  positive: boolean
}

export interface SpotifyPlaybackState {
  isPlaying: boolean
  trackName: string | null
  artistName: string | null
  albumName: string | null
  albumArtUrl: string | null
  progressMs: number
  durationMs: number
  shuffle: boolean
  repeat: 'off' | 'track' | 'context'
  deviceName: string | null
  volumePercent: number | null
}
