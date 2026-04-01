import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { UserProfile } from '../../shared/perception.types'

const PROFILE_PATH = join(app.getPath('userData'), 'user-profile.json')

const DEFAULT_PROFILE: UserProfile = {
  display_name: '',
  user_level: 'beginner',
  preferred_explanation_style: 'step_by_step',
  study_goals: [],
  response_language: 'pt-BR',
  response_tone: 'didactic',
  updated_at: Date.now()
}

let cachedProfile: UserProfile | null = null

export async function getUserProfile(): Promise<UserProfile> {
  if (cachedProfile) return cachedProfile

  try {
    const raw = await readFile(PROFILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<UserProfile>
    cachedProfile = normalizeProfile(parsed)
  } catch {
    cachedProfile = { ...DEFAULT_PROFILE }
    await persistProfile(cachedProfile)
  }

  return cachedProfile
}

export async function updateUserProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  const current = await getUserProfile()
  const next = normalizeProfile({
    ...current,
    ...patch,
    updated_at: Date.now()
  })

  cachedProfile = next
  await persistProfile(next)
  return next
}

function normalizeProfile(profile: Partial<UserProfile>): UserProfile {
  return {
    display_name:
      typeof profile.display_name === 'string'
        ? profile.display_name.trim().slice(0, 40)
        : DEFAULT_PROFILE.display_name,
    user_level: profile.user_level ?? DEFAULT_PROFILE.user_level,
    preferred_explanation_style:
      profile.preferred_explanation_style ?? DEFAULT_PROFILE.preferred_explanation_style,
    study_goals: Array.isArray(profile.study_goals)
      ? profile.study_goals
          .map(goal => String(goal).trim())
          .filter(Boolean)
          .slice(0, 8)
      : DEFAULT_PROFILE.study_goals,
    response_language:
      typeof profile.response_language === 'string' && profile.response_language.trim()
        ? profile.response_language.trim()
        : DEFAULT_PROFILE.response_language,
    response_tone: profile.response_tone ?? DEFAULT_PROFILE.response_tone,
    updated_at: typeof profile.updated_at === 'number' ? profile.updated_at : Date.now()
  }
}

async function persistProfile(profile: UserProfile): Promise<void> {
  await mkdir(dirname(PROFILE_PATH), { recursive: true })
  await writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf-8')
}

export async function resetUserProfile(): Promise<UserProfile> {
  cachedProfile = { ...DEFAULT_PROFILE, updated_at: Date.now() }
  await rm(PROFILE_PATH, { force: true })
  await persistProfile(cachedProfile)
  return cachedProfile
}
