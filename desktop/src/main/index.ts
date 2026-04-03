import { app, shell, BrowserWindow, globalShortcut, screen, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  analyzeOnce, startSession, stopSession,
  configurePerception,
  setPrivateMode, listSources, onCaptureStateChange, shutdown,
  getContextSnapshot, updateUserProfile, clearSessionMemory, resumeAfterSensitiveBlock
} from './services/perception'
import { checkScreenPermission, requestScreenPermission } from './services/permission'
import { generateTutorResponse } from './services/tutor'
import { getAppSettings, resetAppSettings, updateAppSettings } from './services/settings'
import {
  getAISettingsSnapshot,
  removeAIProvider,
  resetAISettings,
  saveAIProvider,
  testAIProvider,
  updateAIRouting
} from './services/ai-provider'
import {
  clearConsentTrail,
  clearDiagnostics,
  getDiagnosticsSnapshot,
  getPrivacySnapshot,
  installCrashHandlers,
  markDataDeletion,
  recordConsentChange,
  recordDiagnosticEvent,
  recordPerformanceTrace
} from './services/observability'
import {
  dismissCurrentHint,
  getProactiveState,
  markProactiveUserActivity,
  markProactiveStreaming,
  onProactiveHint
} from './services/proactive-engine'
import { resetUserProfile } from './services/user-profile'
import {
  applyImportCard,
  clearPersistedMemory,
  exportMemoryCard,
  getMemorySummary,
  MEMORY_CARD_EXTENSION,
  previewImportCard
} from './services/memory-card'
import {
  getMemoryEmbeddingStatus,
  rebuildMemoryEmbeddings,
  syncMemoryEmbeddings
} from './services/memory-embeddings'
import type { DataDeletionSummary } from '../shared/perception.types'

let hudWindow: BrowserWindow | null = null

const HUD_COMPACT = { width: 488, height: 55 }

function getInitialPosition(width: number) {
  const display = screen.getPrimaryDisplay()
  const { width: sw } = display.workAreaSize
  return { x: Math.round((sw - width) / 2), y: 24 }
}

function createHudWindow(): void {
  const pos = getInitialPosition(HUD_COMPACT.width)

  hudWindow = new BrowserWindow({
    width: HUD_COMPACT.width,
    height: HUD_COMPACT.height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    roundedCorners: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  hudWindow.setAlwaysOnTop(true, 'screen-saver')
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  // Keep the HUD out of screen capture frames to avoid self-perception loops.
  hudWindow.setContentProtection(true)

  hudWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Forward capture state changes to the renderer
  const unsubscribe = onCaptureStateChange(isCapturing => {
    hudWindow?.webContents.send('perception:capture-state', isCapturing)
  })
  hudWindow.on('closed', unsubscribe)
  const unsubscribeProactive = onProactiveHint(hint => {
    hudWindow?.webContents.send('proactive:hint', hint)
  })
  hudWindow.on('closed', unsubscribeProactive)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hudWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    hudWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function applyWindowSettings(): Promise<void> {
  if (!hudWindow) return
  const settings = await getAppSettings()
  configurePerception({
    targetSourceId:
      settings.captureScope.mode === 'selected-source'
        ? settings.captureScope.selectedSourceId
        : null
  })
  hudWindow.setAlwaysOnTop(settings.alwaysVisible, 'screen-saver')
  hudWindow.setVisibleOnAllWorkspaces(settings.alwaysVisible, { visibleOnFullScreen: false })
}

// ─── Drag ─────────────────────────────────────────────────────────────────────

let dragOffset = { x: 0, y: 0 }

ipcMain.on('window:drag-start', (_e, { screenX, screenY }: { screenX: number; screenY: number }) => {
  if (!hudWindow) return
  const { x, y } = hudWindow.getBounds()
  dragOffset = { x: screenX - x, y: screenY - y }
})

ipcMain.on('window:drag-move', (_e, { screenX, screenY }: { screenX: number; screenY: number }) => {
  if (!hudWindow) return
  hudWindow.setPosition(Math.round(screenX - dragOffset.x), Math.round(screenY - dragOffset.y))
})

// ─── HUD resize ───────────────────────────────────────────────────────────────

ipcMain.on('hud:resize', (_e, { width, height }: { width: number; height: number }) => {
  if (!hudWindow) return
  const display = screen.getDisplayMatching(hudWindow.getBounds())
  const { width: sw, height: sh } = display.workArea
  const { x: cx, y: cy } = hudWindow.getBounds()
  const margin = 24
  const newX = Math.max(margin, Math.min(cx, sw - width - margin))
  const newY = Math.max(margin, Math.min(cy, sh - height - margin))
  hudWindow.setBounds({ x: newX, y: newY, width, height }, false)
})

// ─── Perception IPC ───────────────────────────────────────────────────────────

ipcMain.handle('perception:check-permission', async () => {
  void recordDiagnosticEvent({
    type: 'trace',
    source: 'perception',
    action: 'check_permission',
    details: {}
  })
  return checkScreenPermission()
})

ipcMain.handle('perception:request-permission', async () => {
  return requestScreenPermission()
})

ipcMain.handle('perception:analyze', async () => {
  return analyzeOnce()
})

ipcMain.handle('perception:get-context', async () => {
  return getContextSnapshot()
})

ipcMain.handle('perception:update-user-profile', async (_e, patch) => {
  return updateUserProfile(patch)
})

ipcMain.handle('perception:clear-session-memory', async () => {
  return clearSessionMemory()
})

ipcMain.handle('perception:resume-sensitive-block', async () => {
  return resumeAfterSensitiveBlock()
})

ipcMain.handle('tutor:respond', async (_e, request) => {
  return generateTutorResponse(request)
})

ipcMain.handle('ai:get-settings', async () => {
  return getAISettingsSnapshot()
})

ipcMain.handle('ai:save-provider', async (_e, input) => {
  return saveAIProvider(input)
})

ipcMain.handle('ai:remove-provider', async (_e, providerId) => {
  return removeAIProvider(providerId)
})

ipcMain.handle('ai:test-provider', async (_e, providerId) => {
  return testAIProvider(providerId)
})

ipcMain.handle('ai:update-routing', async (_e, patch) => {
  return updateAIRouting(patch)
})

ipcMain.handle('settings:get', async () => {
  return getAppSettings()
})

ipcMain.handle('settings:update', async (_e, patch) => {
  const startedAt = Date.now()
  const settings = await updateAppSettings(patch)
  await applyWindowSettings()
  if (typeof patch.telemetryOptIn === 'boolean') {
    await recordConsentChange({ action: 'telemetry_opt_in', enabled: patch.telemetryOptIn })
  }
  if (typeof patch.alwaysVisible === 'boolean') {
    await recordConsentChange({ action: 'always_visible', enabled: patch.alwaysVisible })
  }
  if (typeof patch.passiveSuggestions === 'boolean') {
    await recordConsentChange({ action: 'passive_suggestions', enabled: patch.passiveSuggestions })
  }
  if (typeof patch.featureFlags?.crashReporting === 'boolean') {
    await recordConsentChange({ action: 'crash_reporting', enabled: patch.featureFlags.crashReporting })
  }
  if (typeof patch.featureFlags?.advancedPerception === 'boolean') {
    await recordConsentChange({ action: 'advanced_perception', enabled: patch.featureFlags.advancedPerception })
  }
  if (typeof patch.featureFlags?.voiceMode === 'boolean') {
    await recordConsentChange({ action: 'voice_mode', enabled: patch.featureFlags.voiceMode })
  }
  if (patch.captureScope) {
    await recordConsentChange({
      action: patch.captureScope.mode === 'selected-source' ? 'capture_scope_selected' : 'capture_scope_open',
      enabled: patch.captureScope.mode === 'selected-source'
    })
  }
  void recordDiagnosticEvent({
    type: 'audit',
    source: 'settings',
    action: 'settings_updated',
    details: {
      telemetryOptIn: settings.telemetryOptIn,
      alwaysVisible: settings.alwaysVisible,
      minimalMode: settings.minimalMode,
      passiveSuggestions: settings.passiveSuggestions,
      selectedScope: settings.captureScope.mode === 'selected-source'
    }
  })
  void recordPerformanceTrace({
    operation: 'settings.update',
    durationMs: Date.now() - startedAt,
    status: 'ok'
  })
  return settings
})

ipcMain.handle('diagnostics:get', async () => {
  return getDiagnosticsSnapshot()
})

ipcMain.handle('privacy:get', async () => {
  return getPrivacySnapshot()
})

ipcMain.handle('privacy:delete-local-data', async () => {
  clearSessionMemory()
  await clearPersistedMemory()
  await clearDiagnostics()
  await clearConsentTrail()
  await resetUserProfile()
  await resetAppSettings()
  await resetAISettings()
  await applyWindowSettings()
  markDataDeletion()

  const summary: DataDeletionSummary = {
    sessionCleared: true,
    diagnosticsCleared: true,
    userProfileReset: true,
    settingsReset: true,
    at: Date.now()
  }

  return summary
})

ipcMain.handle('memory:get-summary', async () => {
  return getMemorySummary()
})

ipcMain.handle('memory:get-embedding-status', async () => {
  return getMemoryEmbeddingStatus()
})

ipcMain.handle('memory:select-import-card', async () => {
  const options = {
    title: 'Importar memory card',
    properties: ['openFile'] as Array<'openFile'>,
    filters: [
      { name: 'John Memory Card', extensions: [MEMORY_CARD_EXTENSION.replace('.', '')] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  }
  const result = hudWindow
    ? await dialog.showOpenDialog(hudWindow, options)
    : await dialog.showOpenDialog(options)

  return result.canceled ? null : result.filePaths[0] ?? null
})

ipcMain.handle('memory:export-card', async () => {
  const summary = await getMemorySummary()
  const options = {
    title: 'Exportar memory card',
    defaultPath: `${summary.owner_name || 'john-memory'}-${new Date(summary.updated_at).toISOString().slice(0, 10)}${MEMORY_CARD_EXTENSION}`,
    filters: [{ name: 'John Memory Card', extensions: [MEMORY_CARD_EXTENSION.replace('.', '')] }]
  }
  const result = hudWindow
    ? await dialog.showSaveDialog(hudWindow, options)
    : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) return null
  return exportMemoryCard(result.filePath)
})

ipcMain.handle('memory:preview-import', async (_e, filePath: string) => {
  return previewImportCard(filePath)
})

ipcMain.handle('memory:apply-import', async (_e, input) => {
  return applyImportCard(input)
})

ipcMain.handle('memory:clear-persisted', async () => {
  return clearPersistedMemory()
})

ipcMain.handle('memory:sync-embeddings', async () => {
  return syncMemoryEmbeddings()
})

ipcMain.handle('memory:rebuild-embeddings', async () => {
  return rebuildMemoryEmbeddings()
})

ipcMain.on('perception:start-session', () => startSession())
ipcMain.on('perception:stop-session',  () => stopSession())

ipcMain.on('perception:set-private-mode', (_e, enabled: boolean) => {
  setPrivateMode(enabled)
  void recordConsentChange({ action: 'private_mode', enabled })
})

ipcMain.handle('perception:get-sources', async () => {
  return listSources()
})

ipcMain.handle('proactive:get-state', async () => {
  return getProactiveState()
})

ipcMain.on('proactive:mark-activity', (_e, type) => {
  markProactiveUserActivity(type)
})

ipcMain.on('proactive:dismiss-hint', (_e, outcome) => {
  dismissCurrentHint(outcome)
})

ipcMain.on('proactive:set-streaming', (_e, active: boolean) => {
  markProactiveStreaming(active)
})

// ─── HUD toggle ───────────────────────────────────────────────────────────────

function toggleHud(): void {
  if (!hudWindow) return
  hudWindow.webContents.send('hud:toggle', !hudWindow.isVisible())
  if (!hudWindow.isVisible()) hudWindow.show()
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.john.desktop')
  void installCrashHandlers()
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  createHudWindow()
  void applyWindowSettings()
  globalShortcut.register('CommandOrControl+Shift+Space', toggleHud)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createHudWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', async (event) => {
  event.preventDefault()
  globalShortcut.unregisterAll()
  await shutdown()
  app.exit(0)
})
