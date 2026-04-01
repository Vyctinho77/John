import type {
  FeatureFlags,
  FeaturePolicySnapshot
} from '../../shared/perception.types'

export const FEATURE_POLICY: Record<keyof FeatureFlags, { rolloutPercentage: number; reason: string }> = {
  passiveSuggestions: {
    rolloutPercentage: 100,
    reason: 'stable feature'
  },
  advancedPerception: {
    rolloutPercentage: 35,
    reason: 'gradual beta rollout'
  },
  voiceMode: {
    rolloutPercentage: 0,
    reason: 'feature reserved for future release'
  },
  crashReporting: {
    rolloutPercentage: 15,
    reason: 'limited observability rollout'
  }
}

export function buildFeaturePolicySnapshot(
  installationId: string,
  requestedFeatureFlags: FeatureFlags
): FeaturePolicySnapshot {
  const effectiveFlags = resolveEffectiveFeatureFlags(installationId, requestedFeatureFlags)

  return {
    passiveSuggestions: {
      requested: requestedFeatureFlags.passiveSuggestions,
      effective: effectiveFlags.passiveSuggestions,
      rolloutPercentage: FEATURE_POLICY.passiveSuggestions.rolloutPercentage,
      reason: FEATURE_POLICY.passiveSuggestions.reason
    },
    advancedPerception: {
      requested: requestedFeatureFlags.advancedPerception,
      effective: effectiveFlags.advancedPerception,
      rolloutPercentage: FEATURE_POLICY.advancedPerception.rolloutPercentage,
      reason: FEATURE_POLICY.advancedPerception.reason
    },
    voiceMode: {
      requested: requestedFeatureFlags.voiceMode,
      effective: effectiveFlags.voiceMode,
      rolloutPercentage: FEATURE_POLICY.voiceMode.rolloutPercentage,
      reason: FEATURE_POLICY.voiceMode.reason
    },
    crashReporting: {
      requested: requestedFeatureFlags.crashReporting,
      effective: effectiveFlags.crashReporting,
      rolloutPercentage: FEATURE_POLICY.crashReporting.rolloutPercentage,
      reason: FEATURE_POLICY.crashReporting.reason
    }
  }
}

export function resolveEffectiveFeatureFlags(
  installationId: string,
  requestedFeatureFlags: FeatureFlags
): FeatureFlags {
  return {
    passiveSuggestions:
      requestedFeatureFlags.passiveSuggestions && isFeatureReleased(installationId, 'passiveSuggestions'),
    advancedPerception:
      requestedFeatureFlags.advancedPerception && isFeatureReleased(installationId, 'advancedPerception'),
    voiceMode:
      requestedFeatureFlags.voiceMode && isFeatureReleased(installationId, 'voiceMode'),
    crashReporting:
      requestedFeatureFlags.crashReporting && isFeatureReleased(installationId, 'crashReporting')
  }
}

export function isFeatureReleased(
  installationId: string,
  featureName: keyof FeatureFlags
): boolean {
  const bucket = stableBucket(`${installationId}:${featureName}`)
  return bucket < FEATURE_POLICY[featureName].rolloutPercentage
}

export function stableBucket(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }

  return hash % 100
}
