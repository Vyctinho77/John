import { useEffect, useRef } from 'react'

interface GlasswingThinkingIndicatorProps {
  size?: number
  emphasis?: 'normal' | 'strong'
}

export function GlasswingThinkingIndicator({
  size = 32,
  emphasis = 'normal'
}: GlasswingThinkingIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const S = size
    const CELL = Math.max(2, Math.floor(S / 10))
    const COLS = Math.ceil(S / CELL)
    const ROWS = Math.ceil(S / CELL)
    const context = canvas.getContext('2d')
    if (!context) return
    const ctx = context

    const brightness = new Float32Array(COLS * ROWS)
    const flickTarget = new Float32Array(COLS * ROWS)
    const flickSpeed = new Float32Array(COLS * ROWS)

    for (let i = 0; i < COLS * ROWS; i += 1) {
      brightness[i] = 0.1 + Math.random() * 0.5
      flickTarget[i] = 0.1 + Math.random() * 0.6
      flickSpeed[i] = 0.01 + Math.random() * 0.025
    }

    const N = Math.max(4, Math.floor(S / 14))
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * S,
      y: Math.random() * S,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4
    }))

    const WAVE_PERIOD = emphasis === 'strong' ? 2.8 : 3.5
    const WAVE_WIDTH = emphasis === 'strong' ? 0.26 : 0.22
    const EDGE_THR = S / 8
    let startTime: number | null = null
    let rafId = 0

    function wave(x: number, y: number, t: number): number {
      const d = (x / COLS + y / ROWS) / 2
      const crest = (t / WAVE_PERIOD) % 1
      const dist = Math.abs(d - crest)
      const wrapped = Math.min(dist, 1 - dist)
      if (wrapped > WAVE_WIDTH) return 0
      return Math.pow(Math.cos((wrapped / WAVE_WIDTH) * Math.PI * 0.5), 2)
    }

    function updateFlicker() {
      for (let i = 0; i < COLS * ROWS; i += 1) {
        brightness[i] += (flickTarget[i] - brightness[i]) * flickSpeed[i]
        if (Math.abs(brightness[i] - flickTarget[i]) < 0.015) {
          flickTarget[i] = Math.random() < 0.2
            ? 0.02 + Math.random() * 0.06
            : 0.12 + Math.random() * 0.55
          flickSpeed[i] = 0.008 + Math.random() * 0.02
        }
      }
    }

    function updatePoints() {
      pts.forEach(point => {
        point.x += point.vx
        point.y += point.vy
        if (point.x < 0) {
          point.x = 0
          point.vx *= -1
        }
        if (point.x > S) {
          point.x = S
          point.vx *= -1
        }
        if (point.y < 0) {
          point.y = 0
          point.vy *= -1
        }
        if (point.y > S) {
          point.y = S
          point.vy *= -1
        }
      })
    }

    function draw(ts: number) {
      if (startTime === null) startTime = ts
      const t = (ts - startTime) / 1000

      updateFlicker()
      updatePoints()

      ctx.clearRect(0, 0, S, S)
      ctx.fillStyle = emphasis === 'strong' ? '#0b0b0d' : '#080808'
      ctx.fillRect(0, 0, S, S)

      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) {
          if ((x + y) % 2 !== 0) continue
          const b = brightness[y * COLS + x] ?? 0
          const w = wave(x, y, t)
          const combined = Math.min(1, b + w * (emphasis === 'strong' ? 0.42 : 0.28))
          if (combined < 0.01) continue
          const v = Math.floor(combined * (emphasis === 'strong' ? 112 : 85))
          ctx.fillStyle = `rgb(${v},${v},${v})`
          ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 1, CELL - 1)
        }
      }

      ctx.strokeStyle = emphasis === 'strong' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)'
      ctx.lineWidth = emphasis === 'strong' ? 0.45 : 0.4
      for (let x = 0; x <= COLS; x += 1) {
        ctx.beginPath()
        ctx.moveTo(x * CELL, 0)
        ctx.lineTo(x * CELL, S)
        ctx.stroke()
      }
      for (let y = 0; y <= ROWS; y += 1) {
        ctx.beginPath()
        ctx.moveTo(0, y * CELL)
        ctx.lineTo(S, y * CELL)
        ctx.stroke()
      }

      ctx.strokeStyle = emphasis === 'strong' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.72)'
      ctx.lineWidth = emphasis === 'strong' ? 0.9 : 0.7
      ctx.lineCap = 'round'
      ctx.shadowColor = emphasis === 'strong' ? 'rgba(255,255,255,0.2)' : 'transparent'
      ctx.shadowBlur = emphasis === 'strong' ? Math.max(3, size * 0.08) : 0

      for (let i = 0; i < pts.length; i += 1) {
        for (let j = i + 1; j < pts.length; j += 1) {
          const dx = pts[i]!.x - pts[j]!.x
          const dy = pts[i]!.y - pts[j]!.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < EDGE_THR) {
            const alpha = Math.pow(1 - dist / EDGE_THR, 1.8) * 0.85
            ctx.globalAlpha = alpha
            ctx.beginPath()
            ctx.moveTo(pts[i]!.x, pts[i]!.y)
            ctx.lineTo(pts[j]!.x, pts[j]!.y)
            ctx.stroke()
          }
        }
      }

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'block',
        borderRadius: 0,
        background: 'transparent',
        boxShadow: 'none',
        padding: 0,
        boxSizing: 'border-box'
      }}
    />
  )
}
