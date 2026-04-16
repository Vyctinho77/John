import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  ConnectorStatus,
  SpotifyActionPayload,
  TradingViewConnectorState,
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
  dragEnd:   () => ipcRenderer.send('window:drag-end'),
  onToggle:  (cb: () => void) => {
    ipcRenderer.on('hud:toggle', () => cb())
    return () => ipcRenderer.removeAllListeners('hud:toggle')
  },
  setScreenshotMode: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('hud:screenshot-mode', enabled),
  onScreenshotModeChange: (cb: (active: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, active: boolean) => cb(active)
    ipcRenderer.on('hud:screenshot-mode', handler)
    return () => ipcRenderer.removeListener('hud:screenshot-mode', handler)
  },
  sidebarResize: (width: number) => ipcRenderer.send('window:sidebar-resize', { width }),
  undockSidebar: (): Promise<void> => ipcRenderer.invoke('hud:undock-sidebar'),
  onSidebarDocked: (cb: (side: 'left' | 'right') => void) => {
    const handler = (_e: Electron.IpcRendererEvent, side: 'left' | 'right') => cb(side)
    ipcRenderer.on('hud:sidebar-docked', handler)
    return () => ipcRenderer.removeListener('hud:sidebar-docked', handler)
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

import type { StoredMessage } from '../main/services/conversation-store'
import type { Chat, ChatMeta } from '../main/services/chat-store'

const chatAPI = {
  listMetas: (): Promise<ChatMeta[]> =>
    ipcRenderer.invoke('chat:list-metas'),
  getActive: (): Promise<{ chat: Chat; activeChatId: string }> =>
    ipcRenderer.invoke('chat:get-active'),
  create: (): Promise<{ chat: Chat; metas: ChatMeta[] }> =>
    ipcRenderer.invoke('chat:create'),
  load: (id: string): Promise<Chat | null> =>
    ipcRenderer.invoke('chat:load', id),
  save: (id: string, messages: StoredMessage[], summary: string | null): Promise<void> =>
    ipcRenderer.invoke('chat:save', id, messages, summary),
  delete: (id: string): Promise<ChatMeta[]> =>
    ipcRenderer.invoke('chat:delete', id),
  rename: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke('chat:rename', id, title),
  setActive: (id: string): Promise<void> =>
    ipcRenderer.invoke('chat:set-active', id),
  generateTitle: (id: string, messages: StoredMessage[]): Promise<string | null> =>
    ipcRenderer.invoke('chat:generate-title', id, messages)
}

const bridgeAPI = {
  getStatuses: (): Promise<ConnectorStatus[]> =>
    ipcRenderer.invoke('bridge:get-statuses'),

  installVSCodeConnector: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke('bridge:install-vscode-connector'),

  disconnect: (id: string): Promise<void> =>
    ipcRenderer.invoke('bridge:disconnect', id),

  onStatusUpdate: (cb: (status: ConnectorStatus) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, s: ConnectorStatus) => cb(s)
    ipcRenderer.on('bridge:status-update', handler)
    return () => ipcRenderer.removeListener('bridge:status-update', handler)
  }
}

const conversationAPI = {
  load: (): Promise<{ messages: StoredMessage[]; summary: string | null } | null> =>
    ipcRenderer.invoke('conversation:load'),
  save: (data: { messages: StoredMessage[]; summary: string | null }): Promise<void> =>
    ipcRenderer.invoke('conversation:save', data)
}

import type { AuthStatus } from '../shared/auth.types'

const codexAuthAPI = {
  login:     (): Promise<AuthStatus>    => ipcRenderer.invoke('codex-auth:login'),
  logout:    (): Promise<void>          => ipcRenderer.invoke('codex-auth:logout'),
  getStatus: (): Promise<AuthStatus>    => ipcRenderer.invoke('codex-auth:status'),
  chat:      (options: unknown): Promise<string> => ipcRenderer.invoke('codex-auth:chat', options),
}

const elevenLabsAPI = {
  hasKey: (): Promise<boolean>    => ipcRenderer.invoke('elevenlabs:has-key'),
  speak:  (text: string): Promise<string> => ipcRenderer.invoke('elevenlabs:speak', text)
}

import type { SpotifyPlaybackState } from '../main/services/spotify'

const spotifyAPI = {
  startAuth:  ():                    Promise<void>                        => ipcRenderer.invoke('spotify:start-auth'),
  getState:   ():                    Promise<SpotifyPlaybackState | null> => ipcRenderer.invoke('spotify:get-state'),
  togglePlay: ():                    Promise<void>                        => ipcRenderer.invoke('spotify:toggle-play'),
  next:       ():                    Promise<void>                        => ipcRenderer.invoke('spotify:next'),
  prev:       ():                    Promise<void>                        => ipcRenderer.invoke('spotify:prev'),
  setVolume:  (v: number):           Promise<void>                        => ipcRenderer.invoke('spotify:set-volume', v),
  setShuffle: (s: boolean):          Promise<void>                        => ipcRenderer.invoke('spotify:set-shuffle', s),
  setRepeat:  (s: string):           Promise<void>                        => ipcRenderer.invoke('spotify:set-repeat', s),
  executeAction: (payload: SpotifyActionPayload)                         => ipcRenderer.invoke('spotify:execute-action', payload),
  disconnect: ():                    Promise<void>                        => ipcRenderer.invoke('spotify:disconnect'),
  onStateUpdate: (cb: (state: SpotifyPlaybackState | null) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, s: SpotifyPlaybackState | null) => cb(s)
    ipcRenderer.on('spotify:state-update', handler)
    return () => ipcRenderer.removeListener('spotify:state-update', handler)
  }
}

const tickerAPI = {
  getQuote: (): Promise<import('./index.d').TickerQuote | null> =>
    ipcRenderer.invoke('ticker:get-quote'),
  setSymbol: (sym: string): Promise<import('./index.d').TickerQuote | null> =>
    ipcRenderer.invoke('ticker:set-symbol', sym),
  onUpdate: (cb: (quote: import('./index.d').TickerQuote | null) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, q: import('./index.d').TickerQuote | null) => cb(q)
    ipcRenderer.on('ticker:update', handler)
    return () => ipcRenderer.removeListener('ticker:update', handler)
  }
}

const tradingViewAPI = {
  open: (): Promise<TradingViewConnectorState> =>
    ipcRenderer.invoke('tradingview:open'),
  close: (): Promise<TradingViewConnectorState> =>
    ipcRenderer.invoke('tradingview:close'),
  getStatus: (): Promise<TradingViewConnectorState> =>
    ipcRenderer.invoke('tradingview:get-status'),
  setSymbol: (symbol: string): Promise<TradingViewConnectorState> =>
    ipcRenderer.invoke('tradingview:set-symbol', symbol),
  setTimeframe: (timeframe: string): Promise<TradingViewConnectorState> =>
    ipcRenderer.invoke('tradingview:set-timeframe', timeframe),
  onStatusUpdate: (cb: (state: TradingViewConnectorState) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, state: TradingViewConnectorState) => cb(state)
    ipcRenderer.on('tradingview:status-update', handler)
    return () => ipcRenderer.removeListener('tradingview:status-update', handler)
  }
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
    contextBridge.exposeInMainWorld('chatAPI', chatAPI)
    contextBridge.exposeInMainWorld('bridgeAPI', bridgeAPI)
    contextBridge.exposeInMainWorld('conversationAPI', conversationAPI)
    contextBridge.exposeInMainWorld('spotifyAPI', spotifyAPI)
    contextBridge.exposeInMainWorld('tradingViewAPI', tradingViewAPI)
    contextBridge.exposeInMainWorld('tickerAPI', tickerAPI)
    contextBridge.exposeInMainWorld('codexAuthAPI', codexAuthAPI)
    contextBridge.exposeInMainWorld('elevenLabsAPI', elevenLabsAPI)
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
  // @ts-ignore
  window.chatAPI = chatAPI
  // @ts-ignore
  window.bridgeAPI = bridgeAPI
  // @ts-ignore
  window.conversationAPI = conversationAPI
  // @ts-ignore
  window.spotifyAPI = spotifyAPI
  // @ts-ignore
  window.tradingViewAPI = tradingViewAPI
  // @ts-ignore
  window.tickerAPI = tickerAPI
  // @ts-ignore
  window.codexAuthAPI = codexAuthAPI
  // @ts-ignore
  window.elevenLabsAPI = elevenLabsAPI
}
