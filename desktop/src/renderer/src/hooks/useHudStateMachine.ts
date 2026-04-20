import { useCallback, useEffect, useRef, useState } from 'react'

export type HudState =
  | 'compact'
  | 'opening'
  | 'intermediate'
  | 'opening-full'
  | 'expanded'
  | 'soft-idle'
  | 'closing'
  | 'sidebar'
  | 'operator'

export type HudVisual = 'compact' | 'intermediate' | 'expanded' | 'sidebar' | 'operator'

const ANIM_TO_MID = 200
const ANIM_TO_FULL = 260
const ANIM_CLOSE = 200

const IDLE_MID = 30_000
const IDLE_FULL = 90_000
const SOFT_DELAY = 12_000

export interface HudStateMachineResult {
  state: HudState
  visual: HudVisual
  isStreaming: boolean
  sidebarSide: 'left' | 'right' | null
  expand: () => void
  expandFull: () => void
  showIntermediate: () => void
  showExpanded: () => void
  collapse: () => void
  ping: () => void
  setStreaming: (v: boolean) => void
  setInputFocused: (v: boolean) => void
  dockSidebar: (side: 'left' | 'right') => void
  undockSidebar: () => void
  enterOperator: () => void
  exitOperator: () => void
}

export function useHudStateMachine(): HudStateMachineResult {
  const [state, setState] = useState<HudState>('compact')
  const [isStreaming, setStreamingState] = useState(false)
  const [sidebarSide, setSidebarSide] = useState<'left' | 'right' | null>(null)

  const streamingRef = useRef(false)
  const inputFocusRef = useRef(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const softTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (softTimer.current) clearTimeout(softTimer.current)
    idleTimer.current = null
    softTimer.current = null
  }, [])

  const startIdleForIntermediate = useCallback(() => {
    clearIdle()
    idleTimer.current = setTimeout(() => {
      if (!streamingRef.current && !inputFocusRef.current) {
        setState(prev => (prev === 'intermediate' ? 'closing' : prev))
      }
    }, IDLE_MID)
  }, [clearIdle])

  const startIdleForExpanded = useCallback(() => {
    clearIdle()
    idleTimer.current = setTimeout(() => {
      if (!streamingRef.current && !inputFocusRef.current) {
        setState(prev => (prev === 'expanded' ? 'soft-idle' : prev))
      }
    }, IDLE_FULL)
  }, [clearIdle])

  useEffect(() => {
    if (animTimer.current) clearTimeout(animTimer.current)

    if (state === 'opening') {
      animTimer.current = setTimeout(() => {
        setState('intermediate')
        startIdleForIntermediate()
      }, ANIM_TO_MID)
    }

    if (state === 'opening-full') {
      animTimer.current = setTimeout(() => {
        setState('expanded')
        startIdleForExpanded()
      }, ANIM_TO_FULL)
    }

    if (state === 'closing') {
      animTimer.current = setTimeout(() => {
        setState('compact')
        clearIdle()
      }, ANIM_CLOSE)
    }

    if (state === 'soft-idle') {
      softTimer.current = setTimeout(() => {
        if (!streamingRef.current && !inputFocusRef.current) {
          setState('closing')
        } else {
          setState('expanded')
          startIdleForExpanded()
        }
      }, SOFT_DELAY)
    }

    return () => {
      if (animTimer.current) clearTimeout(animTimer.current)
    }
  }, [state, clearIdle, startIdleForExpanded, startIdleForIntermediate])

  const expand = useCallback(() => {
    setState(prev => {
      if (prev === 'compact' || prev === 'closing') return 'opening'
      return prev
    })
    clearIdle()
  }, [clearIdle])

  const expandFull = useCallback(() => {
    setState(prev => {
      if (prev === 'compact' || prev === 'closing') return 'opening-full'
      if (prev === 'intermediate' || prev === 'opening') return 'opening-full'
      if (prev === 'soft-idle') return 'expanded'
      return prev
    })
    clearIdle()
  }, [clearIdle])

  const showIntermediate = useCallback(() => {
    if (streamingRef.current) return

    setState(prev => {
      if (prev === 'compact' || prev === 'closing') return 'opening'
      if (prev === 'expanded' || prev === 'soft-idle' || prev === 'opening-full') return 'intermediate'
      return prev
    })

    startIdleForIntermediate()
  }, [startIdleForIntermediate])

  const showExpanded = useCallback(() => {
    setState(prev => {
      if (prev === 'expanded') return prev
      if (prev === 'soft-idle') return 'expanded'
      return 'opening-full'
    })

    clearIdle()
  }, [clearIdle])

  const collapse = useCallback(() => {
    if (streamingRef.current) return
    setState(prev => {
      if (prev === 'compact' || prev === 'closing') return prev
      return 'closing'
    })
    clearIdle()
  }, [clearIdle])

  const ping = useCallback(() => {
    setState(prev => (prev === 'soft-idle' ? 'expanded' : prev))
    setState(prev => {
      if (prev === 'intermediate') {
        startIdleForIntermediate()
        return prev
      }
      if (prev === 'expanded') {
        startIdleForExpanded()
        return prev
      }
      return prev
    })
  }, [startIdleForExpanded, startIdleForIntermediate])

  const setStreaming = useCallback((v: boolean) => {
    streamingRef.current = v
    setStreamingState(v)
    if (!v) {
      setState(prev => {
        if (prev === 'expanded') startIdleForExpanded()
        if (prev === 'intermediate') startIdleForIntermediate()
        return prev
      })
    } else {
      clearIdle()
    }
  }, [clearIdle, startIdleForExpanded, startIdleForIntermediate])

  const setInputFocused = useCallback((v: boolean) => {
    inputFocusRef.current = v
    if (v) {
      clearIdle()
    } else {
      setState(prev => {
        if (prev === 'expanded') startIdleForExpanded()
        if (prev === 'intermediate') startIdleForIntermediate()
        return prev
      })
    }
  }, [clearIdle, startIdleForExpanded, startIdleForIntermediate])

  const dockSidebar = useCallback((side: 'left' | 'right') => {
    clearIdle()
    setSidebarSide(side)
    setState('sidebar')
  }, [clearIdle])

  const undockSidebar = useCallback(() => {
    setSidebarSide(null)
    setState('compact')
  }, [])

  const enterOperator = useCallback(() => {
    clearIdle()
    setState('operator')
    window.hudAPI?.resize(1100, 680)
  }, [clearIdle])

  const exitOperator = useCallback(() => {
    setState('expanded')
    window.hudAPI?.resize(840, 560)
  }, [])

  const visual: HudVisual =
    state === 'sidebar'
      ? 'sidebar'
      : state === 'operator'
        ? 'operator'
        : state === 'compact' || state === 'closing'
          ? 'compact'
          : state === 'opening-full' || state === 'expanded'
            ? 'expanded'
            : 'intermediate'

  useEffect(() => {
    return () => {
      clearIdle()
      if (animTimer.current) clearTimeout(animTimer.current)
    }
  }, [clearIdle])

  return {
    state,
    visual,
    isStreaming,
    sidebarSide,
    expand,
    expandFull,
    showIntermediate,
    showExpanded,
    collapse,
    ping,
    setStreaming,
    setInputFocused,
    dockSidebar,
    undockSidebar,
    enterOperator,
    exitOperator
  }
}
