import { randomUUID } from 'crypto'
import { app } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type {
  AppSettings,
  CaptureScopeSettings,
  FeatureFlags,
  FeaturePolicySnapshot,
  TypographySettings
} from '../../shared/perception.types'
import {
  buildFeaturePolicySnapshot,
  resolveEffectiveFeatureFlags
} from './feature-policy'

const SETTINGS_PATH = join(app.getPath('userData'), 'app-settings.json')

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  passiveSuggestions: true,
  advancedPerception: false,
  voiceMode: false,
  crashReporting: false
}

const DEFAULT_CAPTURE_SCOPE: CaptureScopeSettings = {
  mode: 'any-visible',
  selectedSourceId: null,
  selectedSourceName: null,
  blockedSourceKeywords: ['1password', 'bitwarden', 'keepass', 'lastpass', 'authy', 'private', 'incognito']
}

const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontFamily: 'system-sans',
  fontSize: 15,
  fontWeight: 'regular'
}

const DEFAULT_SETTINGS: AppSettings = {
  telemetryOptIn: false,
  alwaysVisible: true,
  minimalMode: false,
  passiveSuggestions: true,
  featureFlags: DEFAULT_FEATURE_FLAGS,
  captureScope: DEFAULT_CAPTURE_SCOPE,
  typography: DEFAULT_TYPOGRAPHY,
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
  await rm(SETTINGS_PATH, { force: true })
  await persistSettings(cachedSettings)
  return toPublicSettings(cachedSettings)
}

async function getStoredSettings(): Promise<StoredSettings> {
  if (cachedSettings) return cachedSettings

  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8')
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
    captureScope: {
      mode: settings.captureScope?.mode ?? DEFAULT_CAPTURE_SCOPE.mode,
      selectedSourceId: settings.captureScope?.selectedSourceId ?? DEFAULT_CAPTURE_SCOPE.selectedSourceId,
      selectedSourceName: settings.captureScope?.selectedSourceName ?? DEFAULT_CAPTURE_SCOPE.selectedSourceName,
      blockedSourceKeywords:
        settings.captureScope?.blockedSourceKeywords?.filter(Boolean) ?? DEFAULT_CAPTURE_SCOPE.blockedSourceKeywords
    },
    typography: {
      fontFamily: settings.typography?.fontFamily ?? DEFAULT_TYPOGRAPHY.fontFamily,
      fontSize:
        typeof settings.typography?.fontSize === 'number' && settings.typography.fontSize >= 12
          ? settings.typography.fontSize
          : DEFAULT_TYPOGRAPHY.fontSize,
      fontWeight: settings.typography?.fontWeight ?? DEFAULT_TYPOGRAPHY.fontWeight
    },
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
    featureFlags: resolveEffectiveFeatureFlags(settings.installationId, settings.requestedFeatureFlags),
    captureScope: settings.captureScope,
    typography: settings.typography,
    updatedAt: settings.updatedAt
  }
}

async function persistSettings(settings: StoredSettings): Promise<void> {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true })
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}
