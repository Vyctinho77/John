import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  PerceptionContextSnapshot,
  UserProfile
} from '@shared/perception.types'

interface UsePerceptionOptions {
  sessionActive: boolean
  privateMode: boolean
}

interface UsePerceptionResult {
  contextSnapshot: PerceptionContextSnapshot | null
  isCapturing: boolean
  permissionStatus: 'granted' | 'denied' | 'not-determined' | 'unknown'
  analyze: () => Promise<void>
  togglePrivateMode: () => void
  updateUserProfile: (patch: Partial<UserProfile>) => Promise<void>
  clearSessionMemory: () => Promise<void>
}

export function usePerception({
  sessionActive,
  privateMode
}: UsePerceptionOptions): UsePerceptionResult {
  const [contextSnapshot, setContextSnapshot] = useState<PerceptionContextSnapshot | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [permissionStatus, setPermissionStatus] =
    useState<'granted' | 'denied' | 'not-determined' | 'unknown'>('unknown')
  const [_privateMode, setPrivateMode] = useState(privateMode)
  const analyzeRef = useRef(false)

  useEffect(() => {
    window.perceptionAPI?.checkPermission().then(status => setPermissionStatus(status))
    window.perceptionAPI?.getContext().then(snapshot => {
      if (snapshot) setContextSnapshot(snapshot)
    })
  }, [])

  useEffect(() => {
    const unsub = window.perceptionAPI?.onCaptureStateChange(value => setIsCapturing(value))
    return () => unsub?.()
  }, [])

  const analyze = useCallback(async () => {
    if (analyzeRef.current || _privateMode) return
    analyzeRef.current = true

    try {
      const snapshot = await window.perceptionAPI?.analyze()
      if (snapshot) setContextSnapshot(snapshot)
    } catch (error) {
      console.error('[perception] analyze error:', error)
    } finally {
      analyzeRef.current = false
    }
  }, [_privateMode])

  useEffect(() => {
    if (_privateMode) {
      window.perceptionAPI?.stopSession()
      window.perceptionAPI?.setPrivateMode(true)
      return
    }

    window.perceptionAPI?.setPrivateMode(false)
    if (sessionActive) {
      window.perceptionAPI?.startSession()
      analyze()
      return
    }

    window.perceptionAPI?.stopSession()
  }, [analyze, sessionActive, _privateMode])

  useEffect(() => {
    if (!sessionActive || _privateMode) return

    const interval = setInterval(async () => {
      if (analyzeRef.current) return
      try {
        const snapshot = await window.perceptionAPI?.analyze()
        if (snapshot) setContextSnapshot(snapshot)
      } catch {}
    }, 9_000)

    return () => clearInterval(interval)
  }, [sessionActive, _privateMode])

  const togglePrivateMode = useCallback(() => {
    setPrivateMode(prev => {
      const next = !prev
      window.perceptionAPI?.setPrivateMode(next)
      return next
    })
  }, [])

  const updateUserProfile = useCallback(async (patch: Partial<UserProfile>) => {
    const snapshot = await window.perceptionAPI?.updateUserProfile(patch)
    if (snapshot) setContextSnapshot(snapshot)
  }, [])

  const clearSessionMemory = useCallback(async () => {
    const memory = await window.perceptionAPI?.clearSessionMemory()
    if (!memory) return

    setContextSnapshot(prev =>
      prev
        ? {
            ...prev,
            sessionMemory: memory
          }
        : prev
    )
  }, [])

  return {
    contextSnapshot,
    isCapturing,
    permissionStatus,
    analyze,
    togglePrivateMode,
    updateUserProfile,
    clearSessionMemory
  }
}
