import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { HudVisual } from '@renderer/hooks/useHudStateMachine'

const DIMS: Record<Exclude<HudVisual, 'sidebar'>, { width: number; height: number; radius: number }> = {
  compact: { width: 488, height: 55, radius: 22 },
  intermediate: { width: 640, height: 220, radius: 28 },
  expanded: { width: 840, height: 560, radius: 30 },
  operator: { width: 1574, height: 680, radius: 0 }
}

const STAGE_TRANSITION = {
  duration: 0.26,
  ease: [0.32, 0.72, 0, 1]
} as const

const DURATIONS: Record<string, number> = {
  'compact-intermediate': 0.22,
  'intermediate-expanded': 0.26,
  'expanded-intermediate': 0.22,
  'intermediate-compact': 0.2,
  'expanded-compact': 0.22,
  'expanded-operator': 0.26,
  'operator-expanded': 0.22
}

function getDuration(from: HudVisual, to: HudVisual) {
  if (from === 'sidebar' || to === 'sidebar') return 0
  return DURATIONS[`${from}-${to}`] ?? 0.22
}

interface HudShellProps {
  visual: HudVisual
  prevVisual: HudVisual
  sidebarSide?: 'left' | 'right' | null
  children: React.ReactNode
}

export function HudShell({ visual, prevVisual, sidebarSide = null, children }: HudShellProps) {
  const isSidebar = visual === 'sidebar'
  const isOperator = visual === 'operator'
  const targetDims = !isSidebar ? DIMS[visual as Exclude<HudVisual, 'sidebar'>] : null
  const previousDims = !isSidebar
    ? prevVisual === 'sidebar'
      ? DIMS.expanded
      : DIMS[prevVisual as Exclude<HudVisual, 'sidebar'>]
    : null

  useEffect(() => {
    if (isSidebar) return
    const { width, height } = DIMS[visual as Exclude<HudVisual, 'sidebar'>]
    window.hudAPI?.resize(width, height)
  }, [visual, isSidebar])

  if (isOperator) {
    const previous = previousDims ?? DIMS.expanded
    const { width, height } = DIMS.operator
    const duration = getDuration(prevVisual, visual)
    const enteringFromNormal = prevVisual !== 'operator'

    return (
      <motion.div
        className="relative pointer-events-none"
        style={{
          background: 'transparent',
          willChange: 'width, height, opacity'
        }}
        initial={{
          width: previous.width,
          height: previous.height,
          opacity: 0
        }}
        animate={{
          width,
          height,
          opacity: 1
        }}
        transition={STAGE_TRANSITION}
      >
        <motion.div
          className="absolute inset-0"
          style={{
            zIndex: 1,
            willChange: 'opacity, clip-path'
          }}
          initial={
            enteringFromNormal
              ? {
                  opacity: 0,
                  clipPath: `inset(0 round ${previous.radius}px)`
                }
              : false
          }
          animate={{
            opacity: 1,
            clipPath: 'inset(0 round 0px)'
          }}
          transition={{
            ...STAGE_TRANSITION,
            delay: enteringFromNormal ? Math.min(0.06, duration * 0.22) : 0
          }}
        >
          {children}
        </motion.div>
      </motion.div>
    )
  }

  if (isSidebar) {
    const attachedLeft = sidebarSide === 'left'
    const borderRadius = attachedLeft
      ? '0 var(--ares-radius-md) var(--ares-radius-md) 0'
      : 'var(--ares-radius-md) 0 0 var(--ares-radius-md)'

    return (
      <div
        className="relative overflow-hidden"
        style={{
          width: '100vw',
          height: '100vh',
          background: 'var(--ares-bg-canvas)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius,
          boxShadow: attachedLeft ? '4px 0 32px rgba(0,0,0,0.6)' : '-4px 0 32px rgba(0,0,0,0.6)'
        }}
      >
        <div className="absolute inset-0" style={{ zIndex: 1 }}>
          {children}
        </div>
      </div>
    )
  }

  const { width, height, radius } = targetDims ?? DIMS.compact

  return (
    <motion.div
      className="relative overflow-hidden"
      style={{
        background: 'transparent',
        boxShadow: 'var(--ares-shadow-panel)',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: radius,
        clipPath: `inset(0 round ${radius}px)`,
        transformOrigin: 'top center',
        willChange: 'width, height, border-radius'
      }}
      initial={{
        width: DIMS.compact.width,
        height: DIMS.compact.height,
        borderRadius: DIMS.compact.radius,
        opacity: 0
      }}
      animate={{ width, height, borderRadius: radius, opacity: 1 }}
      transition={STAGE_TRANSITION}
    >
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        {children}
      </div>
    </motion.div>
  )
}

export function HudContent({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div key={id} className="absolute inset-0 flex flex-col">
      {children}
    </div>
  )
}
