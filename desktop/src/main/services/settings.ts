import { randomUUID } from 'crypto'
import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  AppSettings,
  CaptureScopeSettings,
  FeatureFlags,
  FeaturePolicySnapshot,
  HudPositionSettings,
  TypographySettings
} from '../../shared/perception.types'
import {
  buildFeaturePolicySnapshot,
  resolveEffectiveFeatureFlags
} from './feature-policy'

const settingsPath = () => join(app.getPath('userData'), 'app-settings.json')

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  passiveSuggestions: true,
  advancedPerception: false,
  voiceMode: true,
  crashReporting: false
}

const DEFAULT_CAPTURE_SCOPE: CaptureScopeSettings = {
  mode: 'any-visible',
  selectedSourceId: null,
  selectedSourceName: null,
  blockedSourceKeywords: ['1password', 'bitwarden', 'keepass', 'lastpass', 'authy', 'private', 'incognito']
}

const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontFamily: 'cinzel',
  fontFamilySecondary: 'spartan',
  fontSize: 14,
  fontWeight: 'regular'
}

const DEFAULT_SETTINGS: AppSettings = {
  telemetryOptIn: false,
  alwaysVisible: true,
  minimalMode: false,
  passiveSuggestions: true,
  dailyCostLimitUsd: null,
  featureFlags: DEFAULT_FEATURE_FLAGS,
  captureScope: DEFAULT_CAPTURE_SCOPE,
  typography: DEFAULT_TYPOGRAPHY,
  spotifyClientId: '',
  tickerSymbol: '',
  hudPosition: null,
  updatedAt: Date.now()
}

interface StoredSettings extends AppSettings {
  installationId: string
  requestedFeatureFlags: FeatureFlags
}

let cachedSettings: StoredSettings | null = null

export async function getAppSettings(): Promise<AppSettings> {
  const stored = await getStoredSettings()
  return toPublicSettings(stored)
}

export async function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getStoredSettings()
  const nextRequestedFlags: FeatureFlags = {
    ...current.requestedFeatureFlags,
    ...patch.featureFlags,
    passiveSuggestions:
      patch.featureFlags?.passiveSuggestions
      ?? patch.passiveSuggestions
      ?? current.requestedFeatureFlags.passiveSuggestions
  }

  const next = normalizeStoredSettings({
    ...current,
    ...patch,
    passiveSuggestions: patch.passiveSuggestions ?? current.passiveSuggestions,
    captureScope: {
      ...current.captureScope,
      ...patch.captureScope
    },
    typography: {
      ...current.typography,
      ...patch.typography
    },
    requestedFeatureFlags: nextRequestedFlags,
    updatedAt: Date.now()
  })

  cachedSettings = next
  await persistSettings(next)
  return toPublicSettings(next)
}

export async function getFeaturePolicySnapshot(): Promise<FeaturePolicySnapshot> {
  const stored = await getStoredSettings()
  return buildFeaturePolicySnapshot(stored.installationId, stored.requestedFeatureFlags)
}

export async function resetAppSettings(): Promise<AppSettings> {
  cachedSettings = createDefaultStoredSettings()
  await rm(settingsPath(), { force: true })
  await persistSettings(cachedSettings)
  return toPublicSettings(cachedSettings)
}

async function getStoredSettings(): Promise<StoredSettings> {
  if (cachedSettings) return cachedSettings

  try {
    const raw = await readFile(settingsPath(), 'utf-8')
    cachedSettings = normalizeStoredSettings(JSON.parse(raw) as Partial<StoredSettings>)
  } catch {
    cachedSettings = createDefaultStoredSettings()
    await persistSettings(cachedSettings)
  }

  return cachedSettings
}

function createDefaultStoredSettings(): StoredSettings {
  return normalizeStoredSettings({
    ...DEFAULT_SETTINGS,
    installationId: randomUUID(),
    requestedFeatureFlags: DEFAULT_FEATURE_FLAGS,
    updatedAt: Date.now()
  })
}

function normalizeStoredSettings(settings: Partial<StoredSettings>): StoredSettings {
  const installationId = settings.installationId ?? randomUUID()
  const requestedFeatureFlags: FeatureFlags = {
    passiveSuggestions:
      settings.requestedFeatureFlags?.passiveSuggestions
      ?? settings.featureFlags?.passiveSuggestions
      ?? settings.passiveSuggestions
      ?? DEFAULT_FEATURE_FLAGS.passiveSuggestions,
    advancedPerception:
      settings.requestedFeatureFlags?.advancedPerception
      ?? settings.featureFlags?.advancedPerception
      ?? DEFAULT_FEATURE_FLAGS.advancedPerception,
    voiceMode:
      settings.requestedFeatureFlags?.voiceMode
      ?? settings.featureFlags?.voiceMode
      ?? DEFAULT_FEATURE_FLAGS.voiceMode,
    crashReporting:
      settings.requestedFeatureFlags?.crashReporting
      ?? settings.featureFlags?.crashReporting
      ?? DEFAULT_FEATURE_FLAGS.crashReporting
  }

  return {
    telemetryOptIn: Boolean(settings.telemetryOptIn),
    alwaysVisible: settings.alwaysVisible ?? DEFAULT_SETTINGS.alwaysVisible,
    minimalMode: settings.minimalMode ?? DEFAULT_SETTINGS.minimalMode,
    passiveSuggestions: settings.passiveSuggestions ?? DEFAULT_SETTINGS.passiveSuggestions,
    dailyCostLimitUsd: normalizeDailyCostLimit(settings.dailyCostLimitUsd),
    captureScope: {
      mode: settings.captureScope?.mode ?? DEFAULT_CAPTURE_SCOPE.mode,
      selectedSourceId: settings.captureScope?.selectedSourceId ?? DEFAULT_CAPTURE_SCOPE.selectedSourceId,
      selectedSourceName: settings.captureScope?.selectedSourceName ?? DEFAULT_CAPTURE_SCOPE.selectedSourceName,
      blockedSourceKeywords:
        settings.captureScope?.blockedSourceKeywords?.filter(Boolean) ?? DEFAULT_CAPTURE_SCOPE.blockedSourceKeywords
    },
    typography: {
      fontFamily: settings.typography?.fontFamily ?? DEFAULT_TYPOGRAPHY.fontFamily,
      fontFamilySecondary: settings.typography?.fontFamilySecondary ?? DEFAULT_TYPOGRAPHY.fontFamilySecondary,
      fontSize:
        typeof settings.typography?.fontSize === 'number' && settings.typography.fontSize >= 12
          ? settings.typography.fontSize
          : DEFAULT_TYPOGRAPHY.fontSize,
      fontWeight: settings.typography?.fontWeight ?? DEFAULT_TYPOGRAPHY.fontWeight
    },
    spotifyClientId: typeof settings.spotifyClientId === 'string' ? settings.spotifyClientId : '',
    tickerSymbol: typeof settings.tickerSymbol === 'string' ? settings.tickerSymbol : '',
    hudPosition: normalizeHudPosition(settings.hudPosition),
    featureFlags: resolveEffectiveFeatureFlags(
      installationId,
      requestedFeatureFlags
    ),
    requestedFeatureFlags,
    installationId,
    updatedAt: typeof settings.updatedAt === 'number' ? settings.updatedAt : Date.now()
  }
}

function toPublicSettings(settings: StoredSettings): AppSettings {
  return {
    telemetryOptIn: settings.telemetryOptIn,
    alwaysVisible: settings.alwaysVisible,
    minimalMode: settings.minimalMode,
    passiveSuggestions: settings.passiveSuggestions,
    dailyCostLimitUsd: settings.dailyCostLimitUsd,
    featureFlags: resolveEffectiveFeatureFlags(settings.installationId, settings.requestedFeatureFlags),
    captureScope: settings.captureScope,
    typography: settings.typography,
    spotifyClientId: settings.spotifyClientId,
    tickerSymbol: settings.tickerSymbol,
    hudPosition: settings.hudPosition,
    updatedAt: settings.updatedAt
  }
}

function normalizeHudPosition(value: unknown): HudPositionSettings | null {
  if (!value || typeof value !== 'object') return null
  const maybe = value as { x?: unknown; y?: unknown }
  if (typeof maybe.x !== 'number' || typeof maybe.y !== 'number') return null
  if (!Number.isFinite(maybe.x) || !Number.isFinite(maybe.y)) return null
  return { x: Math.round(maybe.x), y: Math.round(maybe.y) }
}

function normalizeDailyCostLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) return null
  return Math.min(1_000, Math.max(0, Number(value.toFixed(2))))
}

async function persistSettings(settings: StoredSettings): Promise<void> {
  await mkdir(dirname(settingsPath()), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}
