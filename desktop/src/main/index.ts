import { app, shell, BrowserWindow, globalShortcut, screen, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  analyzeOnce, startSession, stopSession,
  setPrivateMode, listSources, onCaptureStateChange, shutdown,
  getContextSnapshot, updateUserProfile, clearSessionMemory
} from './services/perception'
import { checkScreenPermission, requestScreenPermission } from './services/permission'
import { generateTutorResponse } from './services/tutor'

let hudWindow: BrowserWindow | null = null

const HUD_COMPACT = { width: 360, height: 64 }

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

  hudWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Forward capture state changes to the renderer
  const unsubscribe = onCaptureStateChange(isCapturing => {
    hudWindow?.webContents.send('perception:capture-state', isCapturing)
  })
  hudWindow.on('closed', unsubscribe)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hudWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    hudWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    hudWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
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
  hudWindow.setBounds({ x: newX, y: newY, width, height }, true)
})

// ─── Perception IPC ───────────────────────────────────────────────────────────

ipcMain.handle('perception:check-permission', async () => {
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

ipcMain.handle('tutor:respond', async (_e, request) => {
  return generateTutorResponse(request)
})

ipcMain.on('perception:start-session', () => startSession())
ipcMain.on('perception:stop-session',  () => stopSession())

ipcMain.on('perception:set-private-mode', (_e, enabled: boolean) => {
  setPrivateMode(enabled)
})

ipcMain.handle('perception:get-sources', async () => {
  return listSources()
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
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))
  createHudWindow()
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
