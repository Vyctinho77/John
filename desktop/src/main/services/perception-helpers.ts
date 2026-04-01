import type { PerceptionResult } from '../../shared/perception.types'

export function extractPrimaryContentText(perception: PerceptionResult): string {
  if (!perception.regions.length) return perception.rawText.trim()

  const contentRegions = selectPrimaryContentRegions(perception.regions)
  const selected = contentRegions.length >= 2 ? contentRegions : perception.regions

  const sorted = [...selected].sort((a, b) => {
    const deltaY = a.bbox.y - b.bbox.y
    if (Math.abs(deltaY) > 26) return deltaY
    return a.bbox.x - b.bbox.x
  })

  return sorted
    .map(region => sanitizeRegionText(region.text))
    .filter(Boolean)
    .join('\n')
    .trim()
}

export function effectiveObservationText(perception: PerceptionResult): string {
  return extractPrimaryContentText(perception) || perception.rawText.trim()
}

export function estimateUncertainty(perception: PerceptionResult, primaryText: string, fallbackText: string): number {
  const baseUncertainty = Math.max(0, Math.min(1, 1 - perception.confidence / 100))

  if (!primaryText && fallbackText) return Math.min(1, baseUncertainty + 0.28)
  if (looksLikeBrowserChromeOnly(primaryText || fallbackText)) return Math.min(1, baseUncertainty + 0.22)
  if ((primaryText || fallbackText).length < 50) return Math.min(1, baseUncertainty + 0.12)

  return baseUncertainty
}

export function looksLikeBrowserChromeOnly(text: string): boolean {
  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) return false

  const shortLines = lines.filter(line => line.length < 24 && !/\s{2,}/.test(line))
  const tabLikeLines = lines.filter(line => !/[.?!:]/.test(line) && line.split(/\s+/).length <= 4)

  return lines.length >= 3 && shortLines.length / lines.length > 0.65 && tabLikeLines.length / lines.length > 0.7
}

function selectPrimaryContentRegions(regions: PerceptionResult['regions']): PerceptionResult['regions'] {
  const scored = regions
    .map(region => ({
      region,
      score: scoreRegionForPrimaryContent(region)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, 8).map(item => item.region)
}

function scoreRegionForPrimaryContent(region: PerceptionResult['regions'][number]): number {
  const text = sanitizeRegionText(region.text)
  if (!text) return 0

  const { x, y, width, height } = region.bbox
  const centerX = x + width / 2
  const centerY = y + height / 2
  const textLength = text.length
  const area = Math.max(1, width * height)
  const topChromePenalty =
    centerY < 110 && textLength < 48
      ? 0.18
      : centerY < 145 && textLength < 32
        ? 0.35
        : 1
  const sidePenalty =
    centerX < 90 || centerX > 1190
      ? 0.55
      : centerX < 180 || centerX > 1100
        ? 0.78
        : 1
  const readingBonus =
    centerY > 120 && centerY < 650
      ? 1.25
      : 1
  const paragraphBonus =
    /\s/.test(text) || textLength > 22
      ? 1.22
      : 0.8
  const confidenceWeight = Math.max(0.25, region.confidence / 100)
  const densityWeight = Math.min(2.4, textLength / 18)
  const areaWeight = Math.min(1.4, area / 12000)

  return confidenceWeight * densityWeight * areaWeight * topChromePenalty * sidePenalty * readingBonus * paragraphBonus
}

function sanitizeRegionText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[|]{2,}/g, '|')
    .trim()
}
