import { useCallback, useRef } from 'react'

const DRAG_THRESHOLD = 4 // px — below this it's a click, not a drag

interface UseDragWindowOptions {
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function useDragWindow({ onDragStart, onDragEnd }: UseDragWindowOptions = {}) {
  const dragging   = useRef(false)
  const moved      = useRef(false)
  const startPos   = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()

    dragging.current = true
    moved.current    = false
    startPos.current = { x: e.screenX, y: e.screenY }

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const dx = Math.abs(ev.screenX - startPos.current.x)
      const dy = Math.abs(ev.screenY - startPos.current.y)

      if (!moved.current && dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return

      if (!moved.current) {
        // First move past threshold: start drag
        moved.current = true
        window.hudAPI?.dragStart(startPos.current.x, startPos.current.y)
        onDragStart?.()
      }

      window.hudAPI?.dragMove(ev.screenX, ev.screenY)
    }

    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (moved.current) onDragEnd?.()
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [onDragStart, onDragEnd])

  return {
    handleMouseDown,
    /** True if the last mousedown resulted in a drag (use to suppress click) */
    wasDragged: () => moved.current
  }
}
