import { app, shell, BrowserWindow, globalShortcut, screen, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { spawn } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  analyzeOnce, startSession, stopSession,
  configurePerception,
  setPrivateMode, listSources, onCaptureStateChange, onSnapshotUpdate, shutdown,
  getContextSnapshot, updateUserProfile, clearSessionMemory, resumeAfterSensitiveBlock
} from './services/perception'
import { checkScreenPermission, requestScreenPermission } from './services/permission'
import { generateTutorResponse, generateTutorResponseStream } from './services/tutor'
import { getAppSettings, resetAppSettings, updateAppSettings } from './services/settings'
import {
  getAICosts,
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
import { loadConversation, saveConversation } from './services/conversation-store'
import {
  listChatMetas, getActiveChat, createChat, loadChat,
  saveChat, deleteChat, renameChat, setTitleIfEmpty, setActiveChat
} from './services/chat-store'
import { bridgeServer } from './services/bridge'
import { spotifyService } from './services/spotify'
import { tradingViewService } from './services/tradingview'
import { codexAuth, codexClient } from './auth/codex-singleton'
import { maybeHandleSpotifyTutorRequest } from './services/spotify-command-router'
import { maybeHandleTradingViewTutorRequest } from './services/tradingview-command-router'
import { executeVSCodeAction, maybeHandleVSCodeTutorRequest } from './services/vscode-command-router'
import { speakWithElevenLabs } from './services/elevenlabs'
import { tickerService } from './services/ticker-service'
import { newsService } from './services/news-service'
import { operatorAnalyst } from './services/operator-analyst'
import { calendarService } from './services/calendar-service'
import { analysisStore } from './services/analysis-store'
import type { DataDeletionSummary, TutorMessage } from '../shared/perception.types'

let hudWindow: BrowserWindow | null = null
let screenshotModeTimer: ReturnType<typeof setTimeout> | null = null

const HUD_COMPACT = { width: 488, height: 55 }
const SCREENSHOT_MODE_DURATION_MS = 30_000
const HUD_MARGIN = 24

function getInitialPosition(
  width: number,
  height: number,
  settings: Awaited<ReturnType<typeof getAppSettings>>
) {
  const display = screen.getPrimaryDisplay()
  const area = display.workArea
  const saved = settings.hudPosition

  if (saved) {
    const maxX = area.x + area.width - width - HUD_MARGIN
    const maxY = area.y + area.height - height - HUD_MARGIN
    return {
      x: Math.max(area.x + HUD_MARGIN, Math.min(saved.x, maxX)),
      y: Math.max(area.y + HUD_MARGIN, Math.min(saved.y, maxY))
    }
  }

  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + HUD_MARGIN }
}

async function createHudWindow(): Promise<void> {
  const settings = await getAppSettings()
  const pos = getInitialPosition(HUD_COMPACT.width, HUD_COMPACT.height, settings)

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
      contextIsolation: true,
      webviewTag: true
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
  const unsubscribeSnapshot = onSnapshotUpdate(snapshot => {
    hudWindow?.webContents.send('perception:snapshot-update', snapshot)
  })
  hudWindow.on('closed', unsubscribeSnapshot)

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

function persistHudPosition(): void {
  if (!hudWindow || sidebarDocked) return
  const { x, y } = hudWindow.getBounds()
  void updateAppSettings({ hudPosition: { x, y } })
}

// ─── Drag + sidebar snap ──────────────────────────────────────────────────────

const SNAP_THRESHOLD = 80   // px from edge to trigger sidebar snap
const SIDEBAR_WIDTH  = 320
const SIDEBAR_MIN_WIDTH = 44
const SIDEBAR_MAX_WIDTH = 640

let dragOffset    = { x: 0, y: 0 }
let sidebarDocked: 'left' | 'right' | null = null

ipcMain.on('window:drag-start', (_e, { screenX, screenY }: { screenX: number; screenY: number }) => {
  if (!hudWindow || sidebarDocked) return
  const { x, y } = hudWindow.getBounds()
  dragOffset = { x: screenX - x, y: screenY - y }
})

ipcMain.on('window:drag-move', (_e, { screenX, screenY }: { screenX: number; screenY: number }) => {
  if (!hudWindow || sidebarDocked) return
  hudWindow.setPosition(Math.round(screenX - dragOffset.x), Math.round(screenY - dragOffset.y))
})

// On drag release: check if window landed near a screen edge and snap to sidebar
ipcMain.on('window:drag-end', () => {
  if (!hudWindow || sidebarDocked) return
  const bounds  = hudWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const { x: wx, y: wy, width: sw, height: sh } = display.workArea

  const distLeft  = bounds.x - wx
  const distRight = (wx + sw) - (bounds.x + bounds.width)

  if (distLeft <= SNAP_THRESHOLD) {
    sidebarDocked = 'left'
    hudWindow.setBounds({ x: wx, y: wy, width: SIDEBAR_WIDTH, height: sh }, true)
    hudWindow.webContents.send('hud:sidebar-docked', 'left')
  } else if (distRight <= SNAP_THRESHOLD) {
    sidebarDocked = 'right'
    hudWindow.setBounds({ x: wx + sw - SIDEBAR_WIDTH, y: wy, width: SIDEBAR_WIDTH, height: sh }, true)
    hudWindow.webContents.send('hud:sidebar-docked', 'right')
  } else {
    persistHudPosition()
  }
})

// Undock: return to compact at screen center
ipcMain.handle('hud:undock-sidebar', () => {
  if (!hudWindow) return
  sidebarDocked = null
  const display = screen.getDisplayMatching(hudWindow.getBounds())
  const { x: wx, y: wy, width: sw } = display.workArea
  const x = wx + Math.round((sw - HUD_COMPACT.width) / 2)
  hudWindow.setBounds({ x, y: wy + 24, width: HUD_COMPACT.width, height: HUD_COMPACT.height }, true)
  persistHudPosition()
})

// ─── Sidebar width resize (user drag on free edge) ────────────────────────────

ipcMain.on('window:sidebar-resize', (_e, { width }: { width: number }) => {
  if (!hudWindow || !sidebarDocked) return
  const clampedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width))
  const bounds  = hudWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const { x: wx, width: sw } = display.workArea

  if (sidebarDocked === 'left') {
    hudWindow.setBounds({ x: wx, y: bounds.y, width: clampedWidth, height: bounds.height }, false)
  } else {
    hudWindow.setBounds({ x: wx + sw - clampedWidth, y: bounds.y, width: clampedWidth, height: bounds.height }, false)
  }
})

// ─── HUD resize ───────────────────────────────────────────────────────────────

ipcMain.handle('hud:operator-news-panel', (_e, { open, panelWidth }: { open: boolean; panelWidth: number }) => {
  if (!hudWindow) return
  const { x, y, width, height } = hudWindow.getBounds()
  const display = screen.getDisplayMatching(hudWindow.getBounds())
  const { x: wx } = display.workArea
  if (open) {
    const newX = Math.max(wx, x - panelWidth)
    hudWindow.setBounds({ x: newX, y, width: width + panelWidth, height }, false)
  } else {
    hudWindow.setBounds({ x: x + panelWidth, y, width: width - panelWidth, height }, false)
  }
})

ipcMain.on('hud:resize', (_e, { width, height }: { width: number; height: number }) => {
  if (!hudWindow || sidebarDocked) return   // sidebar manages its own bounds
  const display = screen.getDisplayMatching(hudWindow.getBounds())
  const { width: sw, height: sh } = display.workArea
  const { x: cx, y: cy } = hudWindow.getBounds()
  const margin = HUD_MARGIN
  const newX = Math.max(margin, Math.min(cx, sw - width - margin))
  const newY = Math.max(margin, Math.min(cy, sh - height - margin))
  hudWindow.setBounds({ x: newX, y: newY, width, height }, false)
  persistHudPosition()
})

// ─── Screenshot mode ─────────────────────────────────────────────────────────

function exitScreenshotMode(): void {
  if (!hudWindow) return
  hudWindow.setContentProtection(true)
  hudWindow.webContents.send('hud:screenshot-mode', false)
  if (screenshotModeTimer) {
    clearTimeout(screenshotModeTimer)
    screenshotModeTimer = null
  }
}

ipcMain.handle('hud:screenshot-mode', async (_e, enabled: boolean) => {
  if (!hudWindow) return false

  if (enabled) {
    // Pause perception while the HUD is visible in captures
    stopSession()
    hudWindow.setContentProtection(false)
    hudWindow.webContents.send('hud:screenshot-mode', true)

    // Auto-restore after timeout
    if (screenshotModeTimer) clearTimeout(screenshotModeTimer)
    screenshotModeTimer = setTimeout(() => {
      exitScreenshotMode()
      // Resume perception if it was running before
      startSession()
      screenshotModeTimer = null
    }, SCREENSHOT_MODE_DURATION_MS)
  } else {
    exitScreenshotMode()
    startSession()
  }

  void recordDiagnosticEvent({
    type: 'audit',
    source: 'settings',
    action: enabled ? 'screenshot_mode_on' : 'screenshot_mode_off',
    details: { autoRestoreMs: enabled ? SCREENSHOT_MODE_DURATION_MS : 0 }
  })

  return enabled
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
  const spotifyResponse = await maybeHandleSpotifyTutorRequest(request.prompt)
  if (spotifyResponse) return spotifyResponse
  const tradingViewResponse = await maybeHandleTradingViewTutorRequest(request.prompt)
  if (tradingViewResponse) return tradingViewResponse
  const vscodeResponse = await maybeHandleVSCodeTutorRequest(request.prompt)
  if (vscodeResponse) return vscodeResponse
  return generateTutorResponse(request)
})

ipcMain.handle('tutor:respond-stream', async (event, request) => {
  const wc = event.sender

  // Connector fast-paths don't need streaming (they're instant)
  const spotifyResponse = await maybeHandleSpotifyTutorRequest(request.prompt)
  if (spotifyResponse) {
    wc.send('tutor:chunk', spotifyResponse.content)
    return spotifyResponse
  }
  const tradingViewResponse = await maybeHandleTradingViewTutorRequest(request.prompt)
  if (tradingViewResponse) {
    wc.send('tutor:chunk', tradingViewResponse.content)
    return tradingViewResponse
  }
  const vscodeResponse = await maybeHandleVSCodeTutorRequest(request.prompt)
  if (vscodeResponse) {
    wc.send('tutor:chunk', vscodeResponse.content)
    return vscodeResponse
  }

  return generateTutorResponseStream(
    request,
    (step) => wc.send('tutor:step', step),
    (chunk) => wc.send('tutor:chunk', chunk)
  )
})

ipcMain.handle('ai:get-settings', async () => {
  return getAISettingsSnapshot()
})

ipcMain.handle('ai:get-costs', async () => {
  return getAICosts()
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
  await saveConversation([], null)
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

// ─── Conversation persistence ─────────────────────────────────────────────────

ipcMain.handle('conversation:load', async () => {
  return loadConversation()
})

ipcMain.handle('conversation:save', async (_e, data: { messages: unknown[]; summary: string | null }) => {
  await saveConversation(data.messages as Parameters<typeof saveConversation>[0], data.summary)
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
  if (hudWindow.isVisible()) {
    hudWindow.hide()
  } else {
    hudWindow.show()
    hudWindow.webContents.send('hud:toggle')
  }
}

// ─── Chat (multi-conversation) ───────────────────────────────────────────────

ipcMain.handle('chat:list-metas',    () => listChatMetas())
ipcMain.handle('chat:get-active',    () => getActiveChat())
ipcMain.handle('chat:create',        () => createChat())
ipcMain.handle('chat:load',          (_e, id: string) => loadChat(id))
ipcMain.handle('chat:save',          (_e, id: string, messages: unknown, summary: string | null) =>
  saveChat(id, messages as Parameters<typeof saveChat>[1], summary))
ipcMain.handle('chat:delete',        (_e, id: string) => deleteChat(id))
ipcMain.handle('chat:rename',        (_e, id: string, title: string) => { renameChat(id, title) })
ipcMain.handle('chat:set-active',    (_e, id: string) => { setActiveChat(id) })
ipcMain.handle('chat:generate-title', async (_e, id: string, messages: TutorMessage[]) => {
  const existingChat = loadChat(id)
  const existingTitle = existingChat?.title ?? null
  const prompt = buildChatTitlePrompt(messages)
  let rawTitle: string | null = null

  if (codexAuth.getStatus().authenticated) {
    try {
      rawTitle = await codexClient.chat({
        model: 'codex-mini-latest',
        messages: [
          {
            role: 'system',
            content: [
              'You write concise conversation titles for a chat sidebar.',
              'Reply with only the title.',
              'Requirements:',
              '- 2 to 5 words',
              '- natural, specific, and compact',
              '- no quotes',
              '- no emoji',
              '- no trailing punctuation',
              '- avoid generic titles like "Ajuda", "Conversa", "Novo chat", "Pergunta"'
            ].join('\n')
          },
          { role: 'user', content: prompt }
        ]
      })
    } catch {
      rawTitle = null
    }
  }

  if (!rawTitle) {
    const { generateRemoteText } = await import('./services/ai-provider')
    const result = await generateRemoteText({
      sensitive: false,
      system: [
        'You write concise conversation titles for a chat sidebar.',
        'Reply with only the title.',
        'Requirements:',
        '- 2 to 5 words',
        '- natural, specific, and compact',
        '- no quotes',
        '- no emoji',
        '- no trailing punctuation',
        '- avoid generic titles like "Ajuda", "Conversa", "Novo chat", "Pergunta"'
      ].join('\n'),
      prompt,
      messages: [],
      imageDataUrl: null,
      feature: 'title'
    })
    rawTitle = result?.text?.trim() ?? null
  }

  const title = sanitizeGeneratedChatTitle(rawTitle)
  if (title) {
    if (!existingTitle) {
      setTitleIfEmpty(id, title)
    } else if (shouldRefreshGeneratedTitle(existingTitle, messages)) {
      renameChat(id, title)
    }
  }
  return title
})

// ─── Codex OAuth ──────────────────────────────────────────────────────────────

ipcMain.handle('codex-auth:login',  () => codexAuth.login())
ipcMain.handle('codex-auth:logout', () => codexAuth.logout())
ipcMain.handle('codex-auth:status', () => codexAuth.getStatus())
ipcMain.handle('codex-auth:chat',   (_e, options) => codexClient.chat(options))

function buildChatTitlePrompt(messages: TutorMessage[]): string {
  const snippets = messages
    .slice(0, 6)
    .map((message, index) => {
      const speaker = message.role === 'user' ? 'User' : 'Assistant'
      const compact = message.content.replace(/\s+/g, ' ').trim().slice(0, 220)
      return `${index + 1}. ${speaker}: ${compact}`
    })
    .join('\n')

  return [
    'Create a short title for this conversation.',
    'Infer the actual user goal from the opening interaction, not just the first user message.',
    'If the second turn clarifies the task, prefer the clarified topic.',
    'The result should feel like a ChatGPT sidebar title: specific, natural, and immediately scannable.',
    'Conversation:',
    snippets
  ].join('\n')
}

function sanitizeGeneratedChatTitle(rawTitle: string | null): string | null {
  if (!rawTitle) return null

  const cleaned = rawTitle
    .replace(/^["'`]|["'`]+$/g, '')
    .replace(/[.?!,:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)

  if (!cleaned) return null

  const words = cleaned.split(' ').filter(Boolean)
  if (words.length < 2) return null

  return cleaned
}

function shouldRefreshGeneratedTitle(existingTitle: string, messages: TutorMessage[]): boolean {
  const assistantCount = messages.filter(message => message.role === 'assistant').length
  if (assistantCount < 2) return false

  return looksLikeWeakGeneratedTitle(existingTitle)
}

function looksLikeWeakGeneratedTitle(title: string): boolean {
  const normalized = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (!normalized) return true
  if (normalized.length <= 16) {
    const genericShort = [
      'ajuda',
      'conversa',
      'novo chat',
      'pergunta',
      'duvida',
      'duvida rapida',
      'ideia',
      'projeto',
      'codigo',
      'spotify'
    ]
    if (genericShort.includes(normalized)) return true
  }

  return /^(ajuda( com)?|conversa|novo chat|pergunta|duvida|duvida rapida|ideia|projeto|codigo|spotify)$/i.test(normalized)
}

// ─── ElevenLabs TTS ──────────────────────────────────────────────────────────

ipcMain.handle('elevenlabs:has-key', () => {
  return Boolean(process.env['ELEVENLABS_API_KEY']?.trim())
})

ipcMain.handle('elevenlabs:speak', async (_e, text: string): Promise<string> => {
  const apiKey = process.env['ELEVENLABS_API_KEY']?.trim()
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY não configurada no .env')
  try {
    const buffer = await speakWithElevenLabs(text, apiKey)
    console.log(`[ElevenLabs] TTS ok — ${buffer.length} bytes`)
    return buffer.toString('base64')
  } catch (err) {
    console.error('[ElevenLabs] speak error:', err instanceof Error ? err.message : err)
    throw err
  }
})


// ─── Bridge (Biblioteca connectors) ──────────────────────────────────────────

ipcMain.handle('bridge:get-statuses', () => {
  return bridgeServer.getStatuses()
})

ipcMain.handle('bridge:disconnect', (_e, id: string) => {
  bridgeServer.disconnect(id as import('../shared/perception.types').ConnectorID)
})

ipcMain.handle('vscode:execute-action', (_e, payload) => {
  return executeVSCodeAction(payload)
})

// ─── TradingView IPC ───────────────────────────────────────────────────────────

ipcMain.handle('tradingview:open', () => tradingViewService.open())
ipcMain.handle('tradingview:close', () => tradingViewService.close())
ipcMain.handle('tradingview:get-status', () => tradingViewService.getState())
ipcMain.handle('tradingview:set-symbol', (_e, symbol: string) => tradingViewService.setSymbol(symbol))
ipcMain.handle('tradingview:set-timeframe', (_e, timeframe: string) => tradingViewService.setTimeframe(timeframe))
ipcMain.handle('tradingview:execute-action', (_e, payload) => tradingViewService.executeAction(payload))

// ─── Ticker IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('ticker:get-quote', () => tickerService.getQuote())
ipcMain.handle('ticker:set-symbol', async (_e, sym: string) => {
  tickerService.setSymbol(sym)
  newsService.setSymbol(sym)
  await updateAppSettings({ tickerSymbol: sym.trim().toUpperCase() })
  return tickerService.getQuote()
})

// ─── News IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle('news:get-snapshot', () => newsService.getSnapshot())
ipcMain.handle('news:force-refresh', async () => {
  await newsService.forceRefresh()
  return newsService.getSnapshot()
})

// ─── Operator analyst IPC ─────────────────────────────────────────────────────

ipcMain.on('operator:start', () => operatorAnalyst.start(tradingViewService))
ipcMain.on('operator:stop',  () => operatorAnalyst.stop())
ipcMain.handle('operator:analyze-now', () => operatorAnalyst.analyzeNow())

// ─── Calendar IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('calendar:get-snapshot', () => calendarService.getSnapshot())

// ─── Analysis store IPC ───────────────────────────────────────────────────────

ipcMain.handle('analysis:list',  (_e, symbol?: string) => analysisStore.list(symbol))
ipcMain.handle('analysis:clear', () => analysisStore.clear())

// ─── Spotify IPC ──────────────────────────────────────────────────────────────

ipcMain.handle('spotify:start-auth', async () => {
  const settings = await getAppSettings()
  if (!settings.spotifyClientId?.trim()) throw new Error('Spotify Client ID não configurado nas preferências.')
  await spotifyService.startAuth(settings.spotifyClientId.trim())
})

ipcMain.handle('spotify:get-state', () => spotifyService.getState())

ipcMain.handle('spotify:toggle-play', () => spotifyService.togglePlayPause())
ipcMain.handle('spotify:next',        () => spotifyService.next())
ipcMain.handle('spotify:prev',        () => spotifyService.prev())
ipcMain.handle('spotify:set-volume',  (_e, v: number) => spotifyService.setVolume(v))
ipcMain.handle('spotify:set-shuffle', (_e, s: boolean) => spotifyService.setShuffle(s))
ipcMain.handle('spotify:set-repeat',  (_e, s: string)  => spotifyService.setRepeat(s as 'off' | 'track' | 'context'))
ipcMain.handle('spotify:execute-action', (_e, payload) => spotifyService.executeAction(payload))
ipcMain.handle('spotify:disconnect',  () => spotifyService.disconnect())

const EXTENSION_ID = 'john-ai.john-connector-vscode'

function isExtensionInstalled(): boolean {
  try {
    const dir = join(homedir(), '.vscode', 'extensions')
    return readdirSync(dir).some(entry =>
      entry.toLowerCase().startsWith(EXTENSION_ID + '-')
    )
  } catch {
    return false
  }
}

/** Returns the first code.cmd / code path that exists on disk, or null. */
function findVSCodeExecutable(): string | null {
  const candidates = [
    // Explicit .cmd (avoids shell resolution issues)
    join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
    join(process.env['ProgramFiles'] ?? '', 'Microsoft VS Code', 'bin', 'code.cmd'),
    join(process.env['ProgramW6432'] ?? '', 'Microsoft VS Code', 'bin', 'code.cmd'),
    // VS Code Insiders
    join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Microsoft VS Code Insiders', 'bin', 'code-insiders.cmd'),
  ]
  return candidates.find(p => p && existsSync(p)) ?? null
}

function spawnInstall(executable: string, vsixPath: string): Promise<{ ok: boolean; message: string }> {
  return new Promise(resolve => {
    // Use cmd.exe /c with args as array — handles spaces in paths correctly on Windows
    const proc = spawn('cmd.exe', ['/c', executable, '--install-extension', vsixPath], {
      stdio: 'pipe'
    })

    let stderr = ''
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

    const timer = setTimeout(() => {
      proc.kill()
      if (isExtensionInstalled()) {
        resolve({ ok: true, message: 'Instalado. Recarregue o VS Code: Ctrl+Shift+P → "Reload Window".' })
      } else {
        resolve({ ok: false, message: `Timeout após 30s. Erro: ${stderr.slice(0, 200) || 'nenhum'}` })
      }
    }, 30_000)

    proc.on('close', () => {
      clearTimeout(timer)
      if (isExtensionInstalled()) {
        resolve({ ok: true, message: 'Instalado. Recarregue o VS Code: Ctrl+Shift+P → "Reload Window".' })
      } else {
        resolve({ ok: false, message: `Falha. ${stderr.slice(0, 200) || 'Sem mensagem de erro.'}` })
      }
    })

    proc.on('error', err => {
      clearTimeout(timer)
      resolve({ ok: false, message: `Processo falhou: ${err.message}` })
    })
  })
}

ipcMain.handle('bridge:install-vscode-connector', async (): Promise<{ ok: boolean; message: string }> => {
  if (isExtensionInstalled()) {
    return { ok: true, message: 'Extensão já instalada. Recarregue o VS Code: Ctrl+Shift+P → "Reload Window".' }
  }

  const devPath  = join(__dirname, '../../../packages/connector-vscode/john-connector.vsix')
  const prodPath = join(process.resourcesPath ?? '', 'john-connector.vsix')
  const vsixPath = existsSync(devPath) ? devPath : existsSync(prodPath) ? prodPath : null

  if (!vsixPath) {
    return { ok: false, message: 'VSIX não encontrado. Execute npm run package na extensão primeiro.' }
  }

  // Prefer explicit path to avoid PATH resolution issues on Windows
  const explicit = findVSCodeExecutable()
  const executable = explicit ?? 'code'

  return spawnInstall(executable, vsixPath)
})

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.john.desktop')
  void installCrashHandlers()
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  void createHudWindow().then(() => applyWindowSettings())
  bridgeServer.start()
  bridgeServer.onStatusChange(status => {
    hudWindow?.webContents.send('bridge:status-update', status)
  })

  // Wire Spotify service into bridge and renderer
  spotifyService.onStateChange(state => {
    bridgeServer.injectContext('spotify', {
      app: 'spotify',
      priority: 'low',
      state: state
        ? `${state.isPlaying ? 'Tocando' : 'Pausado'}: ${state.trackName ?? 'unknown'}`
        : 'sem reprodução',
      data: state,
      timestamp: Date.now(),
      sessionId: ''
    })
    hudWindow?.webContents.send('spotify:state-update', state)
  })
  spotifyService.onAuthChange(connected => {
    bridgeServer.setInternalStatus('spotify', connected)
  })
  // Sync bridge with tokens already loaded from disk before onAuthChange was registered
  bridgeServer.setInternalStatus('spotify', spotifyService.isAuthenticated())

  tradingViewService.onStatusChange(state => {
    if (state.symbol) newsService.setSymbol(state.symbol)
    bridgeServer.injectContext('tradingview', {
      app: 'tradingview',
      priority: 'high',
      state: state.symbol
        ? `${state.symbol}${state.timeframe ? ` · ${state.timeframe}` : ''}${state.currentPrice ? ` · ${state.currentPrice}` : ''}`
        : state.title ?? 'tradingview aberto',
      data: state,
      timestamp: Date.now(),
      sessionId: ''
    })
    bridgeServer.setInternalStatus('tradingview', state.connected)
    hudWindow?.webContents.send('tradingview:status-update', state)
  })
  bridgeServer.setInternalStatus('tradingview', tradingViewService.getState().connected)

  // Start standalone ticker + news with saved symbol
  getAppSettings().then(s => {
    if (s.tickerSymbol?.trim()) {
      tickerService.setSymbol(s.tickerSymbol.trim())
      newsService.setSymbol(s.tickerSymbol.trim())
    }
  })
  tickerService.onQuoteUpdate(quote => {
    hudWindow?.webContents.send('ticker:update', quote)
  })
  newsService.onUpdate(snapshot => {
    hudWindow?.webContents.send('news:update', snapshot)
  })
  operatorAnalyst.onAlert(alert => {
    hudWindow?.webContents.send('operator:alert', alert)
  })

  calendarService.start()
  calendarService.onUpdate(snapshot => {
    hudWindow?.webContents.send('calendar:update', snapshot)
  })
  calendarService.onApproaching(event => {
    hudWindow?.webContents.send('calendar:approaching', event)
    // dispara briefing no operator analyst se modo operador ativo
    if (calendarService.needsBriefing(event)) {
      operatorAnalyst.briefMacroEvent(event, tradingViewService.getState())
    }
  })

  globalShortcut.register('CommandOrControl+Shift+Space', toggleHud)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createHudWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', async (event) => {
  event.preventDefault()
  globalShortcut.unregisterAll()
  bridgeServer.stop()
  tickerService.stop()
  newsService.stop()
  operatorAnalyst.stop()
  calendarService.stop()
  await shutdown()
  app.exit(0)
})
