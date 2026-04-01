import type {
  CaptureScopeSettings,
  CaptureSource
} from '../../shared/perception.types'

export function evaluateCaptureSource(
  source: Pick<CaptureSource, 'id' | 'name'>,
  scope: CaptureScopeSettings
): { blocked: boolean; blockedReason: string | null; selected: boolean } {
  const normalizedName = source.name.toLowerCase()
  const matchedKeyword = scope.blockedSourceKeywords.find(keyword =>
    normalizedName.includes(keyword.trim().toLowerCase())
  )

  if (matchedKeyword) {
    return {
      blocked: true,
      blockedReason: `blocked by keyword: ${matchedKeyword}`,
      selected: scope.selectedSourceId === source.id
    }
  }

  if (scope.mode === 'selected-source') {
    const selected = scope.selectedSourceId === source.id
    return {
      blocked: !selected,
      blockedReason: selected ? null : 'outside the selected capture scope',
      selected
    }
  }

  return {
    blocked: false,
    blockedReason: null,
    selected: false
  }
}
