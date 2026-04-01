import { desktopCapturer, screen } from 'electron'
import type { CaptureSource } from '../../shared/perception.types'

const THUMBNAIL_W = 1280
const THUMBNAIL_H = 720

// 1x1 transparent PNG — what Electron returns when capture is denied/empty
const EMPTY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export async function captureScreen(sourceId?: string): Promise<string | null> {
  try {
    const type = sourceId ? 'window' : 'screen'
    const sources = await desktopCapturer.getSources({
      types: [type],
      thumbnailSize: { width: THUMBNAIL_W, height: THUMBNAIL_H }
    })

    if (!sources.length) return null

    const source = sourceId
      ? sources.find(s => s.id === sourceId) ?? sources[0]
      : getPrimaryScreenSource(sources)

    const dataUrl = source.thumbnail.toDataURL()
    return dataUrl === EMPTY_PNG ? null : dataUrl
  } catch (err) {
    console.error('[capture] captureScreen error:', err)
    return null
  }
}

export async function getWindowSources(): Promise<CaptureSource[]> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 320, height: 180 }
    })
    return sources
      .filter(s => s.name && !s.name.toLowerCase().includes('john'))
      .map(s => ({
        id: s.id,
        name: s.name,
        thumbnailDataUrl: s.thumbnail.toDataURL()
      }))
  } catch {
    return []
  }
}

// Pick the source that corresponds to the primary display
function getPrimaryScreenSource(sources: Electron.DesktopCapturerSource[]) {
  const primary = screen.getPrimaryDisplay()
  // Electron names screen sources as "Screen N" or "Entire screen"
  // Try to match by display id if available, otherwise fallback to first
  const match = sources.find(s =>
    s.display_id === String(primary.id) || s.name.toLowerCase().includes('screen 1')
  )
  return match ?? sources[0]
}
