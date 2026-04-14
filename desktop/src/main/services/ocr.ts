import { createHash } from 'crypto'
import { nativeImage } from 'electron'
import Tesseract, { Worker } from 'tesseract.js'
import type { PerceptionResult, TextRegion } from '../../shared/perception.types'

let worker: Worker | null = null
let initializing = false
let initPromise: Promise<void> | null = null
let lastImageHash: string | null = null
let lastOcrResult: PerceptionResult | null = null

const OCR_LANG = 'eng+por'
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
    worker = await Tesseract.createWorker(OCR_LANG, 1, {
      // Suppress tesseract verbose logs
      logger: () => {}
    })
    await worker.setParameters({
      // PSM.AUTO handles mixed UI content (text, icons, charts) without triggering
      // the Leptonica bbox overflow errors that SPARSE_TEXT causes on graphical frames.
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      user_defined_dpi: OCR_DPI
    })
    console.log('[ocr] Worker ready.')
  })()

  await initPromise
  initializing = false
  return worker!
}

// OCR works best at 960x540 — downscale higher-res captures to avoid
// Tesseract bbox overflow errors and keep recognition speed reasonable.
const OCR_MAX_WIDTH = 960
const OCR_MAX_HEIGHT = 540
const OCR_SKIP_BPP_HARD = 0.09
const OCR_SKIP_BPP_SOFT = 0.15
const OCR_COMPLEXITY_SAMPLE = 160

export async function recognizeImage(dataUrl: string): Promise<PerceptionResult> {
  const image = nativeImage.createFromDataURL(dataUrl)
  const { width, height } = image.getSize()
  const startedAt = Date.now()

  if (image.isEmpty() || width < 32 || height < 32) {
    console.warn('[ocr] Skipping invalid capture before OCR.')
    return emptyResult(startedAt)
  }

  // Fast hash comparison — skip OCR if screenshot is identical
  const pngBuf = image.toPNG()
  const imageHash = createHash('md5').update(pngBuf).digest('hex')
  if (imageHash === lastImageHash && lastOcrResult) {
    console.log('[ocr] Frame unchanged, reusing cached result.')
    return { ...lastOcrResult, capturedAt: startedAt }
  }
  lastImageHash = imageHash

  // Skip OCR on truly low-entropy frames, but keep a softer middle range:
  // dark UIs with small text also compress well, so ambiguous frames go through
  // a second visual-complexity check before being discarded.
  const bytesPerPixel = pngBuf.length / (width * height)
  if (bytesPerPixel < OCR_SKIP_BPP_HARD) {
    console.log(`[ocr] Skipping low-entropy frame (bpp=${bytesPerPixel.toFixed(3)}).`)
    return emptyResult(startedAt)
  }

  if (bytesPerPixel < OCR_SKIP_BPP_SOFT) {
    const complexity = estimateVisualComplexity(image)
    const shouldSkip =
      complexity.lumaStdDev < 22
      && complexity.edgeDensity < 0.12
      && complexity.inkCoverage < 0.18

    if (shouldSkip) {
      console.log(
        `[ocr] Skipping low-complexity frame (bpp=${bytesPerPixel.toFixed(3)}, std=${complexity.lumaStdDev.toFixed(1)}, edges=${complexity.edgeDensity.toFixed(3)}).`
      )
      return emptyResult(startedAt)
    }
  }

  // Downscale to OCR-optimal resolution if needed, preserving aspect ratio.
  // Specifying both width+height in nativeImage.resize() forces a distorted stretch —
  // instead we compute the limiting dimension and let the other scale proportionally.
  const ocrImage = (() => {
    if (width <= OCR_MAX_WIDTH && height <= OCR_MAX_HEIGHT) return image
    const scale = Math.min(OCR_MAX_WIDTH / width, OCR_MAX_HEIGHT / height)
    return image.resize({
      width:   Math.round(width  * scale),
      height:  Math.round(height * scale),
      quality: 'good'
    })
  })()
  const ocrSize = ocrImage.getSize()

  const normalizedDataUrl = ocrImage.toDataURL()
  const w = await getWorker()
  const { data } = await suppressLeptonicaNoise(() => w.recognize(normalizedDataUrl))

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
        ocrSize.width,
        ocrSize.height
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

  const result: PerceptionResult = {
    rawText: data.text,
    confidence: avgConfidence,
    regions,
    capturedAt: startedAt
  }
  lastOcrResult = result
  return result
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

function estimateVisualComplexity(image: Electron.NativeImage): {
  lumaStdDev: number
  edgeDensity: number
  inkCoverage: number
} {
  const { width, height } = image.getSize()
  const scale = Math.min(1, OCR_COMPLEXITY_SAMPLE / Math.max(width, height))
  const sampled = scale < 1
    ? image.resize({
        width: Math.max(24, Math.round(width * scale)),
        height: Math.max(24, Math.round(height * scale)),
        quality: 'good'
      })
    : image

  const { width: sampleWidth, height: sampleHeight } = sampled.getSize()
  const bitmap = sampled.toBitmap()
  const pixelCount = sampleWidth * sampleHeight

  if (!pixelCount || bitmap.length < pixelCount * 4) {
    return { lumaStdDev: 0, edgeDensity: 0, inkCoverage: 0 }
  }

  let sum = 0
  let sumSquares = 0
  let edgeHits = 0
  let edgeChecks = 0
  let inkPixels = 0
  const lumas = new Float32Array(pixelCount)

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const pixelIndex = y * sampleWidth + x
      const offset = pixelIndex * 4
      const blue = bitmap[offset] ?? 0
      const green = bitmap[offset + 1] ?? 0
      const red = bitmap[offset + 2] ?? 0
      const alpha = (bitmap[offset + 3] ?? 255) / 255
      const luma = (0.2126 * red + 0.7152 * green + 0.0722 * blue) * alpha

      lumas[pixelIndex] = luma
      sum += luma
      sumSquares += luma * luma
      if (luma < 210) inkPixels += 1
    }
  }

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth - 1; x += 1) {
      const current = lumas[y * sampleWidth + x] ?? 0
      const next = lumas[y * sampleWidth + x + 1] ?? 0
      edgeChecks += 1
      if (Math.abs(current - next) > 24) edgeHits += 1
    }
  }

  const mean = sum / pixelCount
  const variance = Math.max(0, sumSquares / pixelCount - mean * mean)

  return {
    lumaStdDev: Math.sqrt(variance),
    edgeDensity: edgeChecks > 0 ? edgeHits / edgeChecks : 0,
    inkCoverage: inkPixels / pixelCount
  }
}

// Leptonica prints internal warnings directly to stderr, bypassing the Tesseract.js
// logger callback. Filter the known-harmless patterns so they don't pollute the console.
const LEPTONICA_NOISE = /pixScanForForeground|boxClipToRectangle/

function suppressLeptonicaNoise<T>(fn: () => Promise<T>): Promise<T> {
  const orig = process.stderr.write.bind(process.stderr)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(process.stderr as any).write = (chunk: any, ...args: any[]) => {
    if (LEPTONICA_NOISE.test(String(chunk))) return true
    return orig(chunk, ...args)
  }
  return fn().finally(() => {
    process.stderr.write = orig
  })
}
