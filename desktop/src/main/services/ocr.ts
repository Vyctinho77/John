import { nativeImage } from 'electron'
import Tesseract, { Worker } from 'tesseract.js'
import type { PerceptionResult, TextRegion } from '../../shared/perception.types'

let worker: Worker | null = null
let initializing = false
let initPromise: Promise<void> | null = null

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
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
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
    .map(b => ({
      text: b.text.trim(),
      confidence: b.confidence,
      bbox: {
        x: b.bbox.x0,
        y: b.bbox.y0,
        width: b.bbox.x1 - b.bbox.x0,
        height: b.bbox.y1 - b.bbox.y0
      }
    }))

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
