import { useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────
export type AgentState = 'idle' | 'thinking' | 'responding' | 'done'

// ─── Constants ────────────────────────────────────────────────────
const CELL        = 8
const WAVE_WIDTH  = 0.18
const T_FLOOD_DUR = 3.0

// Max grid capacity — pre-allocated once, covers any realistic window size
// 100 cols × 8px = 800px wide, 200 rows × 8px = 1600px tall
const MAX_COLS  = 100
const MAX_ROWS  = 200
const MAX_TOTAL = MAX_COLS * MAX_ROWS   // 20 000 cells

// ─── Helpers ──────────────────────────────────────────────────────
function wave(col: number, row: number, t: number, COLS: number, ROWS: number, period: number): number {
  const d       = (col / COLS + row / ROWS) / 2
  const crest   = (t / period) % 1
  const dist    = Math.abs(d - crest)
  const wrapped = Math.min(dist, 1 - dist)
  if (wrapped > WAVE_WIDTH) return 0
  return Math.pow(Math.cos((wrapped / WAVE_WIDTH) * Math.PI * 0.5), 2)
}

function fisherYates(arr: number[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

// ─── Component ────────────────────────────────────────────────────
interface Props {
  agentState: AgentState
  // width/height kept for backward compat but ignored — ResizeObserver is the source of truth
  width?: number
  height?: number
}

export function GlasswingBackground({ agentState }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const stateRef     = useRef(agentState)
  stateRef.current   = agentState

  useEffect(() => {
    const container = containerRef.current
    const canvas    = canvasRef.current
    if (!container || !canvas) return

    const ctx = canvas.getContext('2d')!

    // ── Mutable live dimensions — updated by ResizeObserver without restarting RAF ──
    let W     = container.clientWidth  || 400
    let H     = container.clientHeight || 400
    let COLS  = Math.floor(W / CELL)
    let ROWS  = Math.floor(H / CELL)
    let TOTAL = COLS * ROWS

    canvas.width  = W
    canvas.height = H

    // ── Pre-allocated arrays (max capacity, never reallocated) ────────────────────
    const brightness  = new Float32Array(MAX_TOTAL)
    const flickTarget = new Float32Array(MAX_TOTAL)
    const flickSpeed  = new Float32Array(MAX_TOTAL)
    const filled      = new Uint8Array(MAX_TOTAL)

    for (let i = 0; i < MAX_TOTAL; i++) {
      brightness[i]  = 0.03 + Math.random() * 0.14
      flickTarget[i] = 0.03 + Math.random() * 0.14
      flickSpeed[i]  = 0.004 + Math.random() * 0.008
    }

    // ── Chess order — rebuilt on resize, uses current COLS/ROWS ──────────────────
    let chessOrder: number[] = []

    function buildChessOrder() {
      chessOrder = []
      for (let row = 0; row < ROWS; row++)
        for (let col = 0; col < COLS; col++)
          if ((col + row) % 2 === 0) chessOrder.push(row * COLS + col)
      fisherYates(chessOrder)
    }
    buildChessOrder()

    // ── Flood state ───────────────────────────────────────────────────────────────
    let floodFilledCount  = 0
    let thinkingStartTime: number | null = null
    let prevState = stateRef.current
    let startTime: number | null = null
    let rafId: number

    // ── ResizeObserver — hot-update dims, no RAF restart ─────────────────────────
    const ro = new ResizeObserver(entries => {
      const rect = entries[0].contentRect
      const newW = Math.round(rect.width)
      const newH = Math.round(rect.height)
      if (!newW || !newH || (newW === W && newH === H)) return

      W     = newW
      H     = newH
      COLS  = Math.min(Math.floor(W / CELL), MAX_COLS)
      ROWS  = Math.min(Math.floor(H / CELL), MAX_ROWS)
      TOTAL = COLS * ROWS

      canvas.width  = W
      canvas.height = H

      // Rebuild chess order for new layout
      buildChessOrder()

      // Reset flood so it re-fills the new area cleanly
      if (stateRef.current === 'thinking') {
        filled.fill(0)
        floodFilledCount  = 0
        thinkingStartTime = null
      }
    })
    ro.observe(container)

    // ── Flicker update ────────────────────────────────────────────────────────────
    function updateFlicker(state: AgentState) {
      const maxB      = state === 'thinking'  ? 0.52
                      : state === 'responding' ? 0.28
                      : state === 'done'       ? 0.10
                      :                          0.20
      const minB      = 0.02
      const speedMult = state === 'thinking'  ? 1.2
                      : state === 'done'       ? 0.35
                      :                          1.0

      for (let i = 0; i < TOTAL; i++) {
        brightness[i] += (flickTarget[i] - brightness[i]) * flickSpeed[i] * speedMult
        if (Math.abs(brightness[i] - flickTarget[i]) < 0.006) {
          flickTarget[i] = minB + Math.random() * (maxB - minB)
          flickSpeed[i]  = 0.003 + Math.random() * 0.009
        }
      }
    }

    // ── Draw grid ─────────────────────────────────────────────────────────────────
    function drawGrid(t: number, state: AgentState) {
      const isThinking = state === 'thinking'
      const period  = state === 'responding' ? 4 : state === 'done' ? 16 : 8
      const waveAmp = state === 'responding' ? 0.32
                    : state === 'done'       ? 0.05
                    : state === 'idle'       ? 0.12
                    :                          0

      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, W, H)

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if ((col + row) % 2 !== 0) continue
          const i = row * COLS + col

          if (isThinking && !filled[i]) continue

          const b = brightness[i]
          const w = isThinking ? 0 : wave(col, row, t, COLS, ROWS, period)
          const combined = Math.min(1, b + w * waveAmp)
          if (combined < 0.012) continue
          const v = Math.floor(combined * 68)
          ctx.fillStyle = `rgb(${v},${v},${v})`
          ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 1, CELL - 1)
        }
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.022)'
      ctx.lineWidth   = 0.5
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke()
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke()
      }
    }

    // ── Main loop ─────────────────────────────────────────────────────────────────
    function loop(ts: number) {
      if (!startTime) startTime = ts
      const elapsed = (ts - startTime) / 1000
      const state   = stateRef.current

      // State transitions
      if (state !== prevState) {
        if (state === 'thinking') {
          filled.fill(0)
          floodFilledCount  = 0
          thinkingStartTime = null
          buildChessOrder()  // fresh random order
        }
        prevState = state
      }

      // Flood during thinking
      if (state === 'thinking') {
        if (thinkingStartTime === null) thinkingStartTime = ts
        const progress = Math.min(1, (ts - thinkingStartTime) / 1000 / T_FLOOD_DUR)
        const target   = Math.floor(progress * chessOrder.length)
        for (let i = floodFilledCount; i < target; i++) {
          const ci = chessOrder[i]
          filled[ci]     = 1
          brightness[ci] = 0.20 + Math.random() * 0.55
        }
        floodFilledCount = target
      }

      updateFlicker(state)
      drawGrid(elapsed, state)

      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [])  // runs once — fully self-managing via ResizeObserver

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
    </div>
  )
}
