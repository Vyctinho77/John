/**
 * depth-calibrator.ts
 *
 * Implements auto-adjustment of explanation depth based on explicit user
 * feedback signals within and across sessions.
 *
 * Design:
 * - Reads signals from the RAW user prompt text (explicit requests)
 * - Reads from the behavior tracker (cross-session patterns)
 * - Produces a calibrated depth recommendation and may patch the user profile
 *   when the signal is strong and consistent enough
 * - Never patches the profile silently without a threshold — avoids noise
 *
 * Calibration targets:
 * - user_level: 'beginner' | 'intermediate' | 'advanced'
 * - preferred_explanation_style: 'step_by_step' | 'direct' | 'analogy' | 'summary'
 * - response_tone: 'didactic' | 'concise' | 'technical'
 */

import type {
  UserProfile,
  TutorMode,
  TutorDomain
} from '../../shared/perception.types'
import type { BehaviorPattern } from './behavior-tracker'

export interface DepthSignal {
  /** Raw user prompt text */
  prompt: string
  /** How many messages are in the conversation so far */
  conversationLength: number
  /** Current user profile */
  profile: UserProfile
  /** Behavior pattern from memory (cross-session) */
  behaviorPattern: BehaviorPattern | null
  /** Domain of the current response */
  domain: TutorDomain
  /** Mode that was used for the response */
  modeUsed: TutorMode
}

export interface DepthCalibration {
  /** Recommended user_level for the CURRENT response */
  effective_level: UserProfile['user_level']
  /** Recommended explanation style for the CURRENT response */
  effective_style: UserProfile['preferred_explanation_style']
  /** Recommended tone for the CURRENT response */
  effective_tone: UserProfile['response_tone']
  /** Whether the profile should be persistently updated (signal strong enough) */
  should_update_profile: boolean
  /** The patch to apply if should_update_profile is true */
  profile_patch: Partial<UserProfile>
  /** Human-readable reason for the calibration decision (for logging) */
  reason: string
}

// Thresholds for persisting a depth adjustment to the user profile
const SIMPLIFICATION_PERSIST_THRESHOLD = 3   // 3 cumulative simplification requests → lower level
const DEPTH_PERSIST_THRESHOLD = 3             // 3 cumulative depth requests → raise level
const STRONG_PROMPT_PERSIST_AFTER_SESSION = 2 // 2 sessions with same direction → persist style

/**
 * Detects simplification signals in user prompt text.
 */
export function detectSimplificationSignal(prompt: string): boolean {
  return /\b(simplifica|mais simples|não entendi|sem entender|tá confuso|explica de novo|clareza|o que é isso|o que significa|mais devagar|complicado|difícil de entender|explica melhor o começo|básico primeiro|começa do zero)\b/i.test(prompt)
}

/**
 * Detects depth/complexity signals in user prompt text.
 */
export function detectDepthSignal(prompt: string): boolean {
  return /\b(aprofunda|mais profundo|explica melhor|detalha|por que|mecanismo|como funciona por baixo|vai fundo|tecnico|avançado|nuances|tradeoffs|implicações|por baixo dos panos|complexidade|teoria|fundamentos)\b/i.test(prompt)
}

/**
 * Detects explicit style preference in prompt text.
 */
export function detectStyleSignal(prompt: string): {
  style: UserProfile['preferred_explanation_style'] | null
  tone: UserProfile['response_tone'] | null
} {
  let style: UserProfile['preferred_explanation_style'] | null = null
  let tone: UserProfile['response_tone'] | null = null

  if (/\b(passo|etapas|step|como fazer|guia|tutorial)\b/i.test(prompt)) style = 'step_by_step'
  else if (/\b(resumo|resume|resumindo|visão geral|overview)\b/i.test(prompt)) style = 'summary'
  else if (/\b(analogia|compara|como se fosse|metáfora|exemplo do mundo real)\b/i.test(prompt)) style = 'analogy'
  else if (/\b(direto|resposta direta|só o que importa|curto)\b/i.test(prompt)) style = 'direct'

  if (/\b(técnico|técnica|precisão|formal|rigoroso)\b/i.test(prompt)) tone = 'technical'
  else if (/\b(curto|conciso|breve|sem enrolação)\b/i.test(prompt)) tone = 'concise'

  return { style, tone }
}

/**
 * Produces a depth calibration for the current interaction.
 * This is the main entry point — call it before building the tutor prompt.
 */
export function calibrateDepth(signal: DepthSignal): DepthCalibration {
  const { prompt, profile, behaviorPattern } = signal

  const wantsSimplification = detectSimplificationSignal(prompt)
  const wantsDepth = detectDepthSignal(prompt)
  const styleSignal = detectStyleSignal(prompt)

  // Start from the current profile
  let effectiveLevel = profile.user_level
  let effectiveStyle = profile.preferred_explanation_style
  let effectiveTone = profile.response_tone
  let reason = 'profile default'

  // ─── Immediate adjustments (current response only) ─────────────────────────

  if (wantsSimplification) {
    effectiveLevel = lowerLevel(profile.user_level)
    effectiveStyle = 'step_by_step'
    reason = 'explicit simplification request'
  } else if (wantsDepth) {
    effectiveLevel = raiseLevel(profile.user_level)
    if (effectiveStyle === 'step_by_step') effectiveStyle = 'direct'
    reason = 'explicit depth request'
  }

  if (styleSignal.style) {
    effectiveStyle = styleSignal.style
    reason += ' + explicit style request'
  }

  if (styleSignal.tone) {
    effectiveTone = styleSignal.tone
    reason += ' + explicit tone request'
  }

  // ─── Cross-session calibration from behavior patterns ──────────────────────

  if (behaviorPattern && !wantsSimplification && !wantsDepth) {
    const { simplification_requests, depth_requests, preferred_mode_signal } = behaviorPattern

    if (simplification_requests >= SIMPLIFICATION_PERSIST_THRESHOLD) {
      effectiveLevel = 'beginner'
      effectiveStyle = 'step_by_step'
      reason = `cross-session: ${simplification_requests} simplification requests`
    } else if (depth_requests >= DEPTH_PERSIST_THRESHOLD) {
      // Only raise to intermediate if profile says beginner; raise to advanced
      // only if already intermediate.
      effectiveLevel = profile.user_level === 'beginner' ? 'intermediate' : 'advanced'
      if (effectiveStyle === 'step_by_step') effectiveStyle = 'direct'
      reason = `cross-session: ${depth_requests} depth requests`
    }

    if (preferred_mode_signal && !styleSignal.style) {
      effectiveStyle = modeToStyle(preferred_mode_signal) ?? effectiveStyle
      reason += ' + preferred_mode_signal from history'
    }
  }

  // ─── Determine if we should persist this to the profile ────────────────────

  const shouldPersist = shouldPersistAdjustment(signal, behaviorPattern, wantsSimplification, wantsDepth, styleSignal)
  const profilePatch = buildProfilePatch(effectiveLevel, effectiveStyle, effectiveTone, profile, shouldPersist)

  return {
    effective_level: effectiveLevel,
    effective_style: effectiveStyle,
    effective_tone: effectiveTone,
    should_update_profile: shouldPersist && Object.keys(profilePatch).length > 0,
    profile_patch: profilePatch,
    reason
  }
}

/**
 * Applies persistent depth calibration to the user profile if the signal
 * is strong enough. Call this after generating the response.
 */
export async function applyDepthCalibration(calibration: DepthCalibration): Promise<void> {
  if (!calibration.should_update_profile) return
  if (!Object.keys(calibration.profile_patch).length) return

  try {
    const { updateUserProfile } = await import('./user-profile')
    await updateUserProfile(calibration.profile_patch)
  } catch {
    // Profile update is non-critical for response quality
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function lowerLevel(level: UserProfile['user_level']): UserProfile['user_level'] {
  if (level === 'advanced') return 'intermediate'
  return 'beginner'
}

function raiseLevel(level: UserProfile['user_level']): UserProfile['user_level'] {
  if (level === 'beginner') return 'intermediate'
  return 'advanced'
}

function modeToStyle(mode: TutorMode): UserProfile['preferred_explanation_style'] | null {
  switch (mode) {
    case 'step_by_step': return 'step_by_step'
    case 'direct':       return 'direct'
    case 'analogy':      return 'analogy'
    case 'summary':      return 'summary'
    default:             return null
  }
}

function shouldPersistAdjustment(
  signal: DepthSignal,
  pattern: BehaviorPattern | null,
  wantsSimplification: boolean,
  wantsDepth: boolean,
  styleSignal: { style: UserProfile['preferred_explanation_style'] | null; tone: UserProfile['response_tone'] | null }
): boolean {
  if (!pattern) return false

  const { simplification_requests, depth_requests } = pattern

  // Persist if threshold is clearly reached
  if (wantsSimplification && simplification_requests >= SIMPLIFICATION_PERSIST_THRESHOLD) return true
  if (wantsDepth && depth_requests >= DEPTH_PERSIST_THRESHOLD) return true

  // Persist style preference if user has repeated it across sessions
  if (styleSignal.style && signal.conversationLength >= STRONG_PROMPT_PERSIST_AFTER_SESSION) return true

  return false
}

function buildProfilePatch(
  level: UserProfile['user_level'],
  style: UserProfile['preferred_explanation_style'],
  tone: UserProfile['response_tone'],
  current: UserProfile,
  shouldPersist: boolean
): Partial<UserProfile> {
  if (!shouldPersist) return {}

  const patch: Partial<UserProfile> = {}
  if (level !== current.user_level) patch.user_level = level
  if (style !== current.preferred_explanation_style) patch.preferred_explanation_style = style
  if (tone !== current.response_tone) patch.response_tone = tone
  return patch
}
