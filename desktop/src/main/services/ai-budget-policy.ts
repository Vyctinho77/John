import type { AIFeatureTask } from '../../shared/ai-provider.types'

export interface FeatureBudget {
  maxInputTokens: number
  maxOutputTokens: number
  temperature: number
}

const DEFAULT_FEATURE_BUDGET: FeatureBudget = {
  maxInputTokens: 6_000,
  maxOutputTokens: 700,
  temperature: 0.35
}

const FEATURE_BUDGETS: Record<AIFeatureTask, FeatureBudget> = {
  tutor: {
    maxInputTokens: 12_000,
    maxOutputTokens: 900,
    temperature: 0.35
  },
  vision: {
    maxInputTokens: 5_500,
    maxOutputTokens: 420,
    temperature: 0.1
  },
  router: {
    maxInputTokens: 2_200,
    maxOutputTokens: 140,
    temperature: 0
  },
  title: {
    maxInputTokens: 1_000,
    maxOutputTokens: 80,
    temperature: 0.2
  },
  stage2: {
    maxInputTokens: 4_000,
    maxOutputTokens: 320,
    temperature: 0.25
  }
}

export function resolveFeatureBudget(feature?: AIFeatureTask): FeatureBudget {
  const budget = feature ? FEATURE_BUDGETS[feature] : null
  return budget ?? DEFAULT_FEATURE_BUDGET
}
