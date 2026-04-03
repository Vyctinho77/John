import { nativeImage } from 'electron'
import Tesseract, { Worker } from 'tesseract.js'
import type { PerceptionResult, TextRegion } from '../../shared/perception.types'

let worker: Worker | null = null
let initializing = false
let initPromise: Promise<void> | null = null

const OCR_DPI = '110'

async function getWorker(): Promise<Worker> {
  if (worker) return worker

  if (initializing && initPromise) {
    await initPromise
    return worker!
  }

  initializing = true
  initPromise = (async () => {
    console.log('[ocr] Initializing tesseract worker...')
    worker = await Tesseract.createWorker('eng', 1, {
      // Suppress tesseract verbose logs
      logger: () => {}
    })
    await worker.setParameters({
      // Screenshots behave more like sparse UI text than scanned documents.
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      user_defined_dpi: OCR_DPI
    })
    console.log('[ocr] Worker ready.')
  })()

  await initPromise
  initializing = false
  return worker!
}

export async function recognizeImage(dataUrl: string): Promise<PerceptionResult> {
  const image = nativeImage.createFromDataURL(dataUrl)
  const { width, height } = image.getSize()
  const startedAt = Date.now()

  if (image.isEmpty() || width < 32 || height < 32) {
    console.warn('[ocr] Skipping invalid capture before OCR.')
    return emptyResult(startedAt)
  }

  const normalizedDataUrl = image.toDataURL()
  const w = await getWorker()
  const { data } = await w.recognize(normalizedDataUrl)

  const regions: TextRegion[] = (data.blocks ?? [])
    .filter(b => b.text.trim().length > 0)
    .map(b => {
      const bbox = sanitizeBBox(
        {
          x0: b.bbox.x0,
          y0: b.bbox.y0,
          x1: b.bbox.x1,
          y1: b.bbox.y1
        },
        width,
        height
      )

      if (!bbox) return null

      return {
        text: b.text.trim(),
        confidence: b.confidence,
        bbox
      }
    })
    .filter((region): region is TextRegion => region !== null)

  const avgConfidence =
    regions.length > 0
      ? regions.reduce((s, r) => s + r.confidence, 0) / regions.length
      : 0

  console.log(`[ocr] Done in ${Date.now() - startedAt}ms, confidence: ${avgConfidence.toFixed(1)}`)

  return {
    rawText: data.text,
    confidence: avgConfidence,
    regions,
    capturedAt: startedAt
  }
}

function emptyResult(capturedAt: number): PerceptionResult {
  return {
    rawText: '',
    confidence: 0,
    regions: [],
    capturedAt
  }
}

export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate()
    worker = null
    console.log('[ocr] Worker terminated.')
  }
}

function sanitizeBBox(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  imageWidth: number,
  imageHeight: number
): TextRegion['bbox'] | null {
  const x0 = clamp(Math.min(bbox.x0, bbox.x1), 0, imageWidth)
  const y0 = clamp(Math.min(bbox.y0, bbox.y1), 0, imageHeight)
  const x1 = clamp(Math.max(bbox.x0, bbox.x1), 0, imageWidth)
  const y1 = clamp(Math.max(bbox.y0, bbox.y1), 0, imageHeight)
  const width = x1 - x0
  const height = y1 - y0

  if (width < 2 || height < 2) return null

  return { x: x0, y: y0, width, height }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
