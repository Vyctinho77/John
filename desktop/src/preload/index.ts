import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  TutorRequest,
  UserProfile
} from '../shared/perception.types'
import type {
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

const hudAPI = {
  resize:    (width: number, height: number) => ipcRenderer.send('hud:resize', { width, height }),
  dragStart: (screenX: number, screenY: number) => ipcRenderer.send('window:drag-start', { screenX, screenY }),
  dragMove:  (screenX: number, screenY: number) => ipcRenderer.send('window:drag-move',  { screenX, screenY }),
  onToggle:  (cb: (visible: boolean) => void) => {
    ipcRenderer.on('hud:toggle', (_e, visible) => cb(visible))
    return () => ipcRenderer.removeAllListeners('hud:toggle')
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

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('hudAPI', hudAPI)
    contextBridge.exposeInMainWorld('perceptionAPI', perceptionAPI)
    contextBridge.exposeInMainWorld('tutorAPI', tutorAPI)
    contextBridge.exposeInMainWorld('settingsAPI', settingsAPI)
    contextBridge.exposeInMainWorld('aiAPI', aiAPI)
    contextBridge.exposeInMainWorld('proactiveAPI', proactiveAPI)
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
}
