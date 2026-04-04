import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  TutorRequest,
  UserProfile
} from '../shared/perception.types'
import type {
  AICostSnapshot,
  AIRoutingSettings,
  AISettingsSnapshot,
  AIProviderId,
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

const hudAPI = {
  resize:    (width: number, height: number) => ipcRenderer.send('hud:resize', { width, height }),
  dragStart: (screenX: number, screenY: number) => ipcRenderer.send('window:drag-start', { screenX, screenY }),
  dragMove:  (screenX: number, screenY: number) => ipcRenderer.send('window:drag-move',  { screenX, screenY }),
  onToggle:  (cb: (visible: boolean) => void) => {
    ipcRenderer.on('hud:toggle', (_e, visible) => cb(visible))
    return () => ipcRenderer.removeAllListeners('hud:toggle')
  },
  setScreenshotMode: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('hud:screenshot-mode', enabled),
  onScreenshotModeChange: (cb: (active: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, active: boolean) => cb(active)
    ipcRenderer.on('hud:screenshot-mode', handler)
    return () => ipcRenderer.removeListener('hud:screenshot-mode', handler)
  }
}

const perceptionAPI = {
  checkPermission:   (): Promise<'granted' | 'denied' | 'not-determined'> =>
    ipcRenderer.invoke('perception:check-permission'),

  requestPermission: (): Promise<'granted' | 'denied' | 'not-determined'> =>
    ipcRenderer.invoke('perception:request-permission'),

  analyze:     () => ipcRenderer.invoke('perception:analyze'),
  getContext:  () => ipcRenderer.invoke('perception:get-context'),
  startSession: () => ipcRenderer.send('perception:start-session'),
  stopSession:  () => ipcRenderer.send('perception:stop-session'),

  setPrivateMode: (enabled: boolean) =>
    ipcRenderer.send('perception:set-private-mode', enabled),

  getSources: () => ipcRenderer.invoke('perception:get-sources'),

  updateUserProfile: (patch: Partial<UserProfile>) =>
    ipcRenderer.invoke('perception:update-user-profile', patch),

  clearSessionMemory: () =>
    ipcRenderer.invoke('perception:clear-session-memory'),

  resumeSensitiveBlock: () =>
    ipcRenderer.invoke('perception:resume-sensitive-block'),

  onCaptureStateChange: (cb: (isCapturing: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, v: boolean) => cb(v)
    ipcRenderer.on('perception:capture-state', handler)
    return () => ipcRenderer.removeListener('perception:capture-state', handler)
  },

  onSnapshotUpdate: (cb: (snapshot: import('../shared/perception.types').PerceptionContextSnapshot) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, snapshot: import('../shared/perception.types').PerceptionContextSnapshot) => cb(snapshot)
    ipcRenderer.on('perception:snapshot-update', handler)
    return () => ipcRenderer.removeListener('perception:snapshot-update', handler)
  }
}

const tutorAPI = {
  respond: (request: TutorRequest) => ipcRenderer.invoke('tutor:respond', request)
}

const settingsAPI = {
  get: () => ipcRenderer.invoke('settings:get'),
  update: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
  getDiagnostics: () => ipcRenderer.invoke('diagnostics:get'),
  getPrivacy: () => ipcRenderer.invoke('privacy:get'),
  deleteLocalData: () => ipcRenderer.invoke('privacy:delete-local-data')
}

const aiAPI = {
  getSettings: (): Promise<AISettingsSnapshot> => ipcRenderer.invoke('ai:get-settings'),
  getCosts: (): Promise<AICostSnapshot> => ipcRenderer.invoke('ai:get-costs'),
  saveProvider: (input: SaveAIProviderInput): Promise<AISettingsSnapshot> =>
    ipcRenderer.invoke('ai:save-provider', input),
  removeProvider: (providerId: AIProviderId): Promise<AISettingsSnapshot> =>
    ipcRenderer.invoke('ai:remove-provider', providerId),
  testProvider: (providerId: AIProviderId): Promise<TestAIProviderResult> =>
    ipcRenderer.invoke('ai:test-provider', providerId),
  updateRouting: (patch: Partial<AIRoutingSettings>): Promise<AISettingsSnapshot> =>
    ipcRenderer.invoke('ai:update-routing', patch)
}

const proactiveAPI = {
  getState: (): Promise<ProactiveState> => ipcRenderer.invoke('proactive:get-state'),
  markActivity: (type: ProactiveActivityType) => ipcRenderer.send('proactive:mark-activity', type),
  dismissHint: (outcome?: ProactiveOutcome) => ipcRenderer.send('proactive:dismiss-hint', outcome),
  setStreaming: (active: boolean) => ipcRenderer.send('proactive:set-streaming', active),
  onHint: (cb: (hint: ProactiveHint | null) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, hint: ProactiveHint | null) => cb(hint)
    ipcRenderer.on('proactive:hint', handler)
    return () => ipcRenderer.removeListener('proactive:hint', handler)
  }
}

const memoryAPI = {
  getSummary: (): Promise<MemoryCardSummary> => ipcRenderer.invoke('memory:get-summary'),
  getEmbeddingStatus: (): Promise<MemoryEmbeddingStatus> => ipcRenderer.invoke('memory:get-embedding-status'),
  exportCard: (): Promise<MemoryExportResult | null> => ipcRenderer.invoke('memory:export-card'),
  selectImportCard: (): Promise<string | null> => ipcRenderer.invoke('memory:select-import-card'),
  previewImport: (filePath: string): Promise<MemoryImportPreview> =>
    ipcRenderer.invoke('memory:preview-import', filePath),
  applyImport: (input: ApplyMemoryImportInput): Promise<MemoryCardSummary> =>
    ipcRenderer.invoke('memory:apply-import', input),
  clearPersisted: (): Promise<MemoryCardSummary> => ipcRenderer.invoke('memory:clear-persisted'),
  syncEmbeddings: (): Promise<MemoryEmbeddingStatus> => ipcRenderer.invoke('memory:sync-embeddings'),
  rebuildEmbeddings: (): Promise<MemoryEmbeddingStatus> => ipcRenderer.invoke('memory:rebuild-embeddings')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('hudAPI', hudAPI)
    contextBridge.exposeInMainWorld('perceptionAPI', perceptionAPI)
    contextBridge.exposeInMainWorld('tutorAPI', tutorAPI)
    contextBridge.exposeInMainWorld('settingsAPI', settingsAPI)
    contextBridge.exposeInMainWorld('aiAPI', aiAPI)
    contextBridge.exposeInMainWorld('proactiveAPI', proactiveAPI)
    contextBridge.exposeInMainWorld('memoryAPI', memoryAPI)
  } catch (e) {
    console.error(e)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.hudAPI = hudAPI
  // @ts-ignore
  window.perceptionAPI = perceptionAPI
  // @ts-ignore
  window.tutorAPI = tutorAPI
  // @ts-ignore
  window.settingsAPI = settingsAPI
  // @ts-ignore
  window.aiAPI = aiAPI
  // @ts-ignore
  window.proactiveAPI = proactiveAPI
  // @ts-ignore
  window.memoryAPI = memoryAPI
}
