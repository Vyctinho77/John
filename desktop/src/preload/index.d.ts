import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  CaptureSource,
  PerceptionContextSnapshot,
  SessionMemory,
  TutorRequest,
  TutorResponse,
  UserProfile
} from '../shared/perception.types'

declare global {
  interface Window {
    electron: ElectronAPI
    hudAPI: {
      resize: (width: number, height: number) => void
      dragStart: (screenX: number, screenY: number) => void
      dragMove:  (screenX: number, screenY: number) => void
      onToggle: (cb: (visible: boolean) => void) => () => void
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
      onCaptureStateChange: (cb: (isCapturing: boolean) => void) => () => void
    }
    tutorAPI: {
      respond: (request: TutorRequest) => Promise<TutorResponse>
    }
  }
}
