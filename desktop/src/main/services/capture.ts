import { createHash } from 'crypto'
import { desktopCapturer, nativeImage, screen } from 'electron'
import type { CaptureSource } from '../../shared/perception.types'
import { getActiveWindowTitle, normalizeWindowTitle } from './active-window'
import { evaluateCaptureSource } from './capture-scope'
import { getAppSettings } from './settings'

// 1280x720 balances Vision LLM accuracy (price axes, small text) with encode cost
const THUMBNAIL_W = 1280
const THUMBNAIL_H = 720

const EMPTY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export async function captureScreen(sourceId?: string): Promise<string | null> {
  try {
    const settings = await getAppSettings()
    const scopedSourceId =
      sourceId ??
      (settings.captureScope.mode === 'selected-source'
        ? settings.captureScope.selectedSourceId ?? undefined
        : undefined)

    if (scopedSourceId) {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: THUMBNAIL_W, height: THUMBNAIL_H }
      })
      const source = sources.find(item => item.id === scopedSourceId) ?? null
      if (!source) return null

      const scopeState = evaluateCaptureSource(
        { id: source.id, name: source.name },
        settings.captureScope
      )
      if (scopeState.blocked) return null

      return normalizeCaptureImage(source.thumbnail)
    }

    // Single enumeration pass for both window and screen sources
    const allSources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: THUMBNAIL_W, height: THUMBNAIL_H }
    })

    const windowSources = allSources.filter(s => s.id.startsWith('window:'))
    const activeWindowTitle = await getActiveWindowTitle()
    const candidate = pickBestWindowSource(windowSources, activeWindowTitle)
    if (candidate) {
      const result = normalizeCaptureImage(candidate.thumbnail)
      if (result) return result
    }

    const screenSources = allSources.filter(s => s.id.startsWith('screen:'))
    const screenSource = getPrimaryScreenSource(screenSources)
    if (!screenSource) return null
    return normalizeCaptureImage(screenSource.thumbnail)
  } catch (err) {
    console.error('[capture] captureScreen error:', err)
    return null
  }
}

export interface CaptureFrame {
  dataUrl: string
  hash: string
  windowTitle: string | null
}

/**
 * Lightweight capture that returns the screenshot + its hash + the active
 * window title.  No OCR, no Vision LLM — designed for fast polling.
 */
export async function captureFrame(sourceId?: string): Promise<CaptureFrame | null> {
  const dataUrl = await captureScreen(sourceId)
  if (!dataUrl) return null

  const image = nativeImage.createFromDataURL(dataUrl)
  if (image.isEmpty()) return null

  const hash = createHash('md5').update(image.toPNG()).digest('hex')
  const windowTitle = await getActiveWindowTitle()

  return { dataUrl, hash, windowTitle }
}

function pickBestWindowSource(
  sources: Electron.DesktopCapturerSource[],
  activeWindowTitle: string | null
): Electron.DesktopCapturerSource | null {
  const validSources = sources.filter(isUsefulWindowSource)
  if (!validSources.length) return null

  if (activeWindowTitle) {
    const normalizedActiveTitle = normalizeWindowTitle(activeWindowTitle)

    const exactMatch = validSources.find(source => normalizeWindowTitle(source.name) === normalizedActiveTitle)
    if (exactMatch) return exactMatch

    const partialMatch = validSources.find(source => {
      const normalizedSourceName = normalizeWindowTitle(source.name)
      return (
        normalizedSourceName.includes(normalizedActiveTitle) ||
        normalizedActiveTitle.includes(normalizedSourceName)
      )
    })
    if (partialMatch) return partialMatch
  }

  return validSources[0] ?? null
}

function isUsefulWindowSource(source: Electron.DesktopCapturerSource): boolean {
  if (!source.name) return false

  const name = source.name.toLowerCase()
  if (name.includes('john')) return false
  if (name === 'task switcher' || name === 'alt-tab' || name === 'program manager') return false

  const image = source.thumbnail
  if (image.isEmpty()) return false

  const { width, height } = image.getSize()
  if (width < 200 || height < 100) return false

  return true
}

function normalizeCaptureImage(image: Electron.NativeImage): string | null {
  if (image.isEmpty()) return null

  const { width, height } = image.getSize()
  if (width < 32 || height < 32) return null

  const dataUrl = image.toDataURL()
  return dataUrl === EMPTY_PNG ? null : dataUrl
}

export async function getWindowSources(): Promise<CaptureSource[]> {
  try {
    const settings = await getAppSettings()
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 320, height: 180 }
    })

    return sources
      .filter(source => source.name && !source.name.toLowerCase().includes('john'))
      .map(source => {
        const scopeState = evaluateCaptureSource(
          { id: source.id, name: source.name },
          settings.captureScope
        )

        return {
          id: source.id,
          name: source.name,
          thumbnailDataUrl: source.thumbnail.toDataURL(),
          blocked: scopeState.blocked,
          blockedReason: scopeState.blockedReason,
          selected: scopeState.selected
        }
      })
  } catch {
    return []
  }
}

function getPrimaryScreenSource(sources: Electron.DesktopCapturerSource[]) {
  const primary = screen.getPrimaryDisplay()
  const match = sources.find(source =>
    source.display_id === String(primary.id) || source.name.toLowerCase().includes('screen 1')
  )
  return match ?? sources[0]
}
