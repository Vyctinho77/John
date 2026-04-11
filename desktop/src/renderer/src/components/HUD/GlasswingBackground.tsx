import { useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────
export type AgentState = 'idle' | 'thinking' | 'responding' | 'done'

// ─── Constants ────────────────────────────────────────────────────
const CELL        = 8
const N_PTS       = 38
const WAVE_WIDTH  = 0.18
const T_WEAVE_DUR = 2.5   // seconds to complete the weave animation

// ─── Helpers ──────────────────────────────────────────────────────
interface Pt { x: number; y: number; vx: number; vy: number }
interface Seg { x1: number; y1: number; x2: number; y2: number }

function makePts(W: number, H: number): Pt[] {
  return Array.from({ length: N_PTS }, () => ({
    x:  Math.random() * W,
    y:  Math.random() * H,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
  }))
}

function updatePts(pts: Pt[], W: number, H: number) {
  for (const p of pts) {
    p.x += p.vx; p.y += p.vy
    if (p.x < 0) { p.x = 0; p.vx *= -1 }
    if (p.x > W) { p.x = W; p.vx *= -1 }
    if (p.y < 0) { p.y = 0; p.vy *= -1 }
    if (p.y > H) { p.y = H; p.vy *= -1 }
  }
}

// Diagonal wave — exactly as in v2
function wave(x: number, y: number, t: number, COLS: number, ROWS: number, period: number): number {
  const d       = (x / COLS + y / ROWS) / 2
  const crest   = (t / period) % 1
  const dist    = Math.abs(d - crest)
  const wrapped = Math.min(dist, 1 - dist)
  if (wrapped > WAVE_WIDTH) return 0
  return Math.pow(Math.cos((wrapped / WAVE_WIDTH) * Math.PI * 0.5), 2)
}

// Voronoi edge segments — same algorithm as v2
function computeEdgeSegments(pts: Pt[], W: number, H: number): Seg[] {
  const STEP   = 3
  const edgePx: Array<{ x: number; y: number; a: number; b: number }> = []

  for (let y = 0; y < H; y += STEP) {
    for (let x = 0; x < W; x += STEP) {
      let m1 = Infinity, m2 = Infinity, mi1 = -1, mi2 = -1
      for (let i = 0; i < pts.length; i++) {
        const dx = x - pts[i].x, dy = y - pts[i].y
        const dist = dx * dx + dy * dy
        if (dist < m1)      { m2 = m1; mi2 = mi1; m1 = dist; mi1 = i }
        else if (dist < m2) { m2 = dist; mi2 = i }
      }
      const edge = Math.sqrt(m2) - Math.sqrt(m1)
      if (edge < STEP * 1.5)
        edgePx.push({ x, y, a: Math.min(mi1, mi2), b: Math.max(mi1, mi2) })
    }
  }

  const edgeMap = new Map<string, typeof edgePx>()
  for (const p of edgePx) {
    const key = `${p.a}-${p.b}`
    if (!edgeMap.has(key)) edgeMap.set(key, [])
    edgeMap.get(key)!.push(p)
  }

  const segments: Seg[] = []
  for (const [, pixels] of edgeMap) {
    if (pixels.length < 2) continue
    pixels.sort((a, b) => (a.x + a.y) - (b.x + b.y))
    let run = [pixels[0]]
    for (let i = 1; i < pixels.length; i++) {
      if (Math.hypot(pixels[i].x - pixels[i - 1].x, pixels[i].y - pixels[i - 1].y) > STEP * 5) {
        if (run.length >= 2)
          segments.push({ x1: run[0].x, y1: run[0].y, x2: run[run.length - 1].x, y2: run[run.length - 1].y })
        run = []
      }
      run.push(pixels[i])
    }
    if (run.length >= 2)
      segments.push({ x1: run[0].x, y1: run[0].y, x2: run[run.length - 1].x, y2: run[run.length - 1].y })
  }

  // Shuffle — teia de aranha
  for (let i = segments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[segments[i], segments[j]] = [segments[j], segments[i]]
  }
  return segments
}

// Voronoi pixel render — same as v2 (after weave completes)
function computeVoronoiPixels(pts: Pt[], W: number, H: number, ctx: CanvasRenderingContext2D) {
  const img = ctx.createImageData(W, H)
  const d   = img.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let m1 = Infinity, m2 = Infinity
      for (const p of pts) {
        const dx = x - p.x, dy = y - p.y
        const dist = dx * dx + dy * dy
        if (dist < m1)      { m2 = m1; m1 = dist }
        else if (dist < m2) { m2 = dist }
      }
      const edge = Math.sqrt(m2) - Math.sqrt(m1)
      if (edge < 2.5) {
        const tt = Math.max(0, 1 - edge / 2.5)
        const v  = Math.floor(255 * tt)
        const i4 = (y * W + x) * 4
        d[i4] = v; d[i4 + 1] = v; d[i4 + 2] = v; d[i4 + 3] = Math.floor(230 * tt)
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

// Draw the weave — segments grow from midpoint outward, exactly like v2
function drawWeave(progress: number, segments: Seg[], ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H)
  const total      = segments.length
  const segsToShow = Math.floor(progress * total)

  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth   = 1.2
  ctx.lineCap     = 'round'

  for (let i = 0; i < segsToShow; i++) {
    const seg = segments[i]
    ctx.beginPath()
    ctx.moveTo(seg.x1, seg.y1)
    ctx.lineTo(seg.x2, seg.y2)
    ctx.stroke()
  }

  if (segsToShow < total) {
    const seg = segments[segsToShow]
    const sp  = (progress * total) - segsToShow
    const mx  = (seg.x1 + seg.x2) / 2, my = (seg.y1 + seg.y2) / 2
    ctx.globalAlpha = 0.6 + sp * 0.4
    ctx.beginPath()
    ctx.moveTo(mx + (seg.x1 - mx) * sp, my + (seg.y1 - my) * sp)
    ctx.lineTo(mx + (seg.x2 - mx) * sp, my + (seg.y2 - my) * sp)
    ctx.stroke()
    ctx.globalAlpha = 1
  }
}

// ─── Component ────────────────────────────────────────────────────
interface Props {
  width: number
  height: number
  agentState: AgentState
}

export function GlasswingBackground({ width, height, agentState }: Props) {
  const gridRef    = useRef<HTMLCanvasElement>(null)
  const voronoiRef = useRef<HTMLCanvasElement>(null)
  const stateRef   = useRef(agentState)
  stateRef.current = agentState

  useEffect(() => {
    const W = width, H = height
    const COLS  = Math.floor(W / CELL)
    const ROWS  = Math.floor(H / CELL)
    const TOTAL = COLS * ROWS

    const gridCanvas    = gridRef.current
    const voronoiCanvas = voronoiRef.current
    if (!gridCanvas || !voronoiCanvas) return

    gridCanvas.width  = W; gridCanvas.height  = H
    voronoiCanvas.width = W; voronoiCanvas.height = H

    const gx = gridCanvas.getContext('2d')!
    const vx = voronoiCanvas.getContext('2d')!

    // Offscreen buffer for the pixel-based voronoi
    const voronoiBuf    = document.createElement('canvas')
    voronoiBuf.width    = W
    voronoiBuf.height   = H
    const vb            = voronoiBuf.getContext('2d')!

    // ── Grid flicker state ──
    const brightness  = new Float32Array(TOTAL)
    const flickTarget = new Float32Array(TOTAL)
    const flickSpeed  = new Float32Array(TOTAL)
    for (let i = 0; i < TOTAL; i++) {
      brightness[i]  = 0.03 + Math.random() * 0.14
      flickTarget[i] = 0.03 + Math.random() * 0.14
      flickSpeed[i]  = 0.004 + Math.random() * 0.008
    }

    // ── Voronoi state ──
    const pts          = makePts(W, H)
    let edgeSegments:  Seg[]   = []
    let weaveProgress  = 0
    let weaveComplete  = false
    let lastVoronoiMs  = 0
    let voronoiOpacity = 0          // animated 0-1 applied as CSS opacity
    let prevState      = stateRef.current

    let startTime: number | null = null
    let weaveStartTime: number | null = null
    let rafId: number

    // ── Flicker ──
    function updateFlicker(state: AgentState) {
      const maxB      = state === 'thinking'  ? 0.36
                      : state === 'done'       ? 0.10
                      : state === 'responding' ? 0.28
                      :                          0.20
      const minB      = 0.02
      const speedMult = state === 'thinking'  ? 2.4
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

    // ── Draw grid ──
    function drawGrid(t: number, state: AgentState) {
      const period  = state === 'thinking'  ? 5
                    : state === 'responding' ? 4
                    : state === 'done'       ? 16
                    :                          8    // idle — same as v2
      const waveAmp = state === 'idle'      ? 0.12
                    : state === 'done'       ? 0.05
                    :                          0.22

      gx.fillStyle = '#050507'
      gx.fillRect(0, 0, W, H)

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          if ((col + row) % 2 !== 0) continue
          const idx = row * COLS + col
          const b   = brightness[idx]
          const w   = wave(col, row, t, COLS, ROWS, period)

          let edgeBoost = 0
          if (state === 'thinking') {
            const ex = Math.min(col, COLS - 1 - col) / (COLS * 0.12)
            const ey = Math.min(row, ROWS - 1 - row) / (ROWS * 0.12)
            edgeBoost = Math.max(0, 1 - Math.min(ex, ey)) * 0.18 * (Math.random() < 0.3 ? Math.random() : 0)
          }

          const combined = Math.min(1, b + w * waveAmp + edgeBoost)
          if (combined < 0.012) continue
          const v = Math.floor(combined * 68)
          gx.fillStyle = `rgb(${v},${v},${v})`
          gx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 1, CELL - 1)
        }
      }

      gx.strokeStyle = 'rgba(255,255,255,0.022)'
      gx.lineWidth   = 0.5
      for (let x = 0; x <= COLS; x++) {
        gx.beginPath(); gx.moveTo(x * CELL, 0); gx.lineTo(x * CELL, H); gx.stroke()
      }
      for (let y = 0; y <= ROWS; y++) {
        gx.beginPath(); gx.moveTo(0, y * CELL); gx.lineTo(W, y * CELL); gx.stroke()
      }
    }

    // ── Draw voronoi layer ──
    function drawVoronoi(ts: number) {
      if (!weaveComplete) {
        // Weave animation
        if (weaveStartTime === null) weaveStartTime = ts
        const elapsed  = (ts - weaveStartTime) / 1000
        weaveProgress  = Math.min(1, elapsed / T_WEAVE_DUR)
        drawWeave(weaveProgress, edgeSegments, vx, W, H)

        if (weaveProgress >= 1) {
          weaveComplete = true
          computeVoronoiPixels(pts, W, H, vb)
        }
      } else {
        // Pixel-based voronoi — update every 50ms as pts drift
        if (ts - lastVoronoiMs > 50) {
          updatePts(pts, W, H)
          computeVoronoiPixels(pts, W, H, vb)
          lastVoronoiMs = ts
        }
        vx.clearRect(0, 0, W, H)
        vx.drawImage(voronoiBuf, 0, 0)
      }
    }

    // ── Main loop ──
    function loop(ts: number) {
      if (!startTime) startTime = ts
      const elapsed = (ts - startTime) / 1000
      const state   = stateRef.current

      // Detect state entry/exit for voronoi
      if (state !== prevState) {
        if (state === 'thinking') {
          // Fresh weave when entering thinking
          edgeSegments  = computeEdgeSegments(pts, W, H)
          weaveProgress = 0
          weaveComplete = false
          weaveStartTime = null
        }
        prevState = state
      }

      updateFlicker(state)
      drawGrid(elapsed, state)

      // Voronoi opacity — fade in fast, fade out slow
      const targetOpacity = state === 'thinking' ? 1 : 0
      const lerpSpeed     = voronoiOpacity < targetOpacity ? 0.03 : 0.015
      voronoiOpacity     += (targetOpacity - voronoiOpacity) * lerpSpeed

      if (voronoiOpacity > 0.004) {
        if (voronoiCanvas) {
          voronoiCanvas.style.opacity = String(voronoiOpacity * 0.6)
        }
        drawVoronoi(ts)
      } else {
        if (voronoiCanvas) {
          voronoiCanvas.style.opacity = '0'
        }
        // Clear so stale frame isn't visible if it snaps back
        if (voronoiOpacity < 0.001) vx.clearRect(0, 0, W, H)
      }

      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [width, height])

  return (
    <div
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width,
        height,
        pointerEvents: 'none'
      }}
    >
      <canvas ref={gridRef}    style={{ position: 'absolute', top: 0, left: 0 }} />
      <canvas ref={voronoiRef} style={{ position: 'absolute', top: 0, left: 0, opacity: 0 }} />
    </div>
  )
}
