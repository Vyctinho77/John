import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { HudVisual } from '@renderer/hooks/useHudStateMachine'

const DIMS: Record<HudVisual, { width: number; height: number; radius: number }> = {
  compact:      { width: 360,  height: 56,  radius: 22 },
  intermediate: { width: 640,  height: 220, radius: 28 },
  expanded:     { width: 840,  height: 560, radius: 30 }
}

// Ease curve matching ui-ux.md: smooth, not bouncy
const EASE = [0.32, 0.72, 0, 1] as const

const DURATIONS: Record<string, number> = {
  'compact-intermediate': 0.22,
  'intermediate-expanded': 0.26,
  'expanded-intermediate': 0.22,
  'intermediate-compact': 0.2,
  'expanded-compact': 0.22,
}

function getDuration(from: HudVisual, to: HudVisual) {
  return DURATIONS[`${from}-${to}`] ?? 0.22
}

interface HudShellProps {
  visual: HudVisual
  prevVisual: HudVisual
  children: React.ReactNode
}

export function HudShell({ visual, prevVisual, children }: HudShellProps) {
  const { width, height, radius } = DIMS[visual]
  const duration = getDuration(prevVisual, visual)

  useEffect(() => {
    window.hudAPI?.resize(width, height)
  }, [visual, width, height])

  return (
    <motion.div
      className="relative overflow-hidden"
      style={{
        background: 'rgba(18, 20, 26, 0.92)',
        backdropFilter: 'blur(28px) saturate(200%)',
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        willChange: 'width, height, border-radius'
      }}
      initial={{ width: DIMS.compact.width, height: DIMS.compact.height, borderRadius: DIMS.compact.radius, opacity: 0, scale: 0.96 }}
      animate={{ width, height, borderRadius: radius, opacity: 1, scale: 1 }}
      transition={{ duration, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

export function HudContent({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={id}
        className="absolute inset-0 flex flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
