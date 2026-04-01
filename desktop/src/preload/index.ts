import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { TutorRequest, UserProfile } from '../shared/perception.types'

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

  onCaptureStateChange: (cb: (isCapturing: boolean) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, v: boolean) => cb(v)
    ipcRenderer.on('perception:capture-state', handler)
    return () => ipcRenderer.removeListener('perception:capture-state', handler)
  }
}

const tutorAPI = {
  respond: (request: TutorRequest) => ipcRenderer.invoke('tutor:respond', request)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('hudAPI', hudAPI)
    contextBridge.exposeInMainWorld('perceptionAPI', perceptionAPI)
    contextBridge.exposeInMainWorld('tutorAPI', tutorAPI)
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
}
