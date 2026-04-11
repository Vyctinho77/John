import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  CaptureSource,
  DataDeletionSummary,
  DiagnosticsSnapshot,
  PerceptionContextSnapshot,
  PrivacySnapshot,
  SessionMemory,
  TutorRequest,
  TutorResponse,
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

declare global {
  interface Window {
    electron: ElectronAPI
    hudAPI: {
      resize: (width: number, height: number) => void
      dragStart: (screenX: number, screenY: number) => void
      dragMove:  (screenX: number, screenY: number) => void
      dragEnd:   () => void
      onToggle: (cb: (visible: boolean) => void) => () => void
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
    conversationAPI: {
      load: () => Promise<{ messages: StoredMessage[]; summary: string | null } | null>
      save: (data: { messages: StoredMessage[]; summary: string | null }) => Promise<void>
    }
  }
}
