import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * States:
 *   compact       — pill at rest
 *   opening       — animating compact → intermediate
 *   intermediate  — peek panel (stable)
 *   opening-full  — animating intermediate → expanded
 *   expanded      — full conversation (stable)
 *   soft-idle     — expanded with inactivity warning
 *   closing       — animating anything → compact
 *
 * Visual mapping:
 *   compact  / closing      → 'compact'
 *   opening  / intermediate / soft-idle → 'intermediate'
 *   opening-full / expanded → 'expanded'
 */

export type HudState =
  | 'compact'
  | 'opening'
  | 'intermediate'
  | 'opening-full'
  | 'expanded'
  | 'soft-idle'
  | 'closing'

export type HudVisual = 'compact' | 'intermediate' | 'expanded'

const ANIM_TO_MID  = 200   // ms compact → intermediate
const ANIM_TO_FULL = 260   // ms intermediate → expanded
const ANIM_CLOSE   = 200   // ms → compact

const IDLE_MID     = 10_000  // ms idle in intermediate → close
const IDLE_FULL    = 8_000   // ms idle in expanded → soft-idle
const SOFT_DELAY   = 3_000   // ms in soft-idle → close

export interface HudStateMachineResult {
  state: HudState
  visual: HudVisual
  isStreaming: boolean
  expand: () => void       // compact → intermediate
  expandFull: () => void   // intermediate → expanded
  collapse: () => void     // any open state → compact
  ping: () => void         // reset idle timer on user activity
  setStreaming: (v: boolean) => void
  setInputFocused: (v: boolean) => void
}

export function useHudStateMachine(): HudStateMachineResult {
  const [state, setState] = useState<HudState>('compact')
  const [isStreaming, setStreamingState] = useState(false)

  const streamingRef   = useRef(false)
  const inputFocusRef  = useRef(false)
  const idleTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const softTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearIdle = useCallback(() => {
    if (idleTimer.current)  clearTimeout(idleTimer.current)
    if (softTimer.current)  clearTimeout(softTimer.current)
    idleTimer.current = null
    softTimer.current = null
  }, [])

  const startIdleForIntermediate = useCallback(() => {
    clearIdle()
    idleTimer.current = setTimeout(() => {
      if (!streamingRef.current && !inputFocusRef.current) {
        setState(prev => prev === 'intermediate' ? 'closing' : prev)
      }
    }, IDLE_MID)
  }, [clearIdle])

  const startIdleForExpanded = useCallback(() => {
    clearIdle()
    idleTimer.current = setTimeout(() => {
      if (!streamingRef.current && !inputFocusRef.current) {
        setState(prev => prev === 'expanded' ? 'soft-idle' : prev)
      }
    }, IDLE_FULL)
  }, [clearIdle])

  // Handle animation transitions and soft-idle
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
  }, [state, clearIdle, startIdleForIntermediate, startIdleForExpanded])

  // compact → intermediate
  const expand = useCallback(() => {
    setState(prev => {
      if (prev === 'compact') return 'opening'
      if (prev === 'closing') return 'opening'
      return prev
    })
    clearIdle()
  }, [clearIdle])

  // intermediate → expanded (called when user submits a message)
  const expandFull = useCallback(() => {
    setState(prev => {
      if (prev === 'intermediate' || prev === 'opening') return 'opening-full'
      if (prev === 'soft-idle') return 'expanded'
      return prev
    })
    clearIdle()
  }, [clearIdle])

  // any open state → compact
  const collapse = useCallback(() => {
    if (streamingRef.current) return   // never interrupt streaming
    setState(prev => {
      if (prev === 'compact' || prev === 'closing') return prev
      return 'closing'
    })
    clearIdle()
  }, [clearIdle])

  // reset idle timer on activity
  const ping = useCallback(() => {
    setState(prev => {
      if (prev === 'soft-idle') return 'expanded'
      return prev
    })
    setState(prev => {
      if (prev === 'intermediate') { startIdleForIntermediate(); return prev }
      if (prev === 'expanded')     { startIdleForExpanded();     return prev }
      return prev
    })
  }, [startIdleForIntermediate, startIdleForExpanded])

  const setStreaming = useCallback((v: boolean) => {
    streamingRef.current = v
    setStreamingState(v)
    if (!v) {
      setState(prev => {
        if (prev === 'expanded')    startIdleForExpanded()
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
        if (prev === 'expanded')    startIdleForExpanded()
        if (prev === 'intermediate') startIdleForIntermediate()
        return prev
      })
    }
  }, [clearIdle, startIdleForExpanded, startIdleForIntermediate])

  const visual: HudVisual =
    state === 'compact' || state === 'closing' ? 'compact'
    : state === 'opening-full' || state === 'expanded' ? 'expanded'
    : 'intermediate'

  // Cleanup
  useEffect(() => {
    return () => {
      clearIdle()
      if (animTimer.current) clearTimeout(animTimer.current)
    }
  }, [clearIdle])

  return {
    state, visual, isStreaming,
    expand, expandFull, collapse, ping,
    setStreaming, setInputFocused
  }
}
