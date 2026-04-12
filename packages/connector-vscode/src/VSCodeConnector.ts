import * as vscode from 'vscode'
import WebSocket from 'ws'
import { EditorCollector } from './collectors/EditorCollector'
import { DiagnosticsCollector } from './collectors/DiagnosticsCollector'
import { GitCollector } from './collectors/GitCollector'
import { TerminalCollector } from './collectors/TerminalCollector'

const BRIDGE_URL = 'ws://127.0.0.1:42001/connect/vscode'
const DEBOUNCE_MS = 300
const RECONNECT_MS = 3000

export interface AppContext {
  app: 'vscode'
  priority: 'low' | 'medium' | 'high'
  state: string
  data: unknown
  timestamp: number
  sessionId: string
}

export class VSCodeConnector {
  private ws: WebSocket | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private disposables: vscode.Disposable[] = []
  private active = false

  private editor    = new EditorCollector()
  private diag      = new DiagnosticsCollector()
  private git       = new GitCollector()
  private terminal  = new TerminalCollector()

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  connect(): void {
    this.active = true
    this.openSocket()
  }

  disconnect(): void {
    this.active = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.debounceTimer)  clearTimeout(this.debounceTimer)
    this.disposables.forEach(d => d.dispose())
    this.disposables = []
    this.ws?.close()
    this.ws = null
  }

  private openSocket(): void {
    if (!this.active) return

    this.ws = new WebSocket(BRIDGE_URL)

    this.ws.on('open', () => {
      void this.sendContext()
      this.registerListeners()
    })

    this.ws.on('message', raw => this.handleAction(raw.toString()))

    this.ws.on('close', () => {
      this.disposables.forEach(d => d.dispose())
      this.disposables = []
      if (this.active) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), RECONNECT_MS)
      }
    })

    this.ws.on('error', () => {
      // socket will emit 'close' after error — reconnect handled there
    })
  }

  private registerListeners(): void {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleUpdate()),
      vscode.window.onDidChangeTextEditorSelection(() => this.scheduleUpdate()),
      vscode.languages.onDidChangeDiagnostics(() => this.scheduleUpdate()),
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleUpdate()),
      this.terminal.register(),
    )
  }

  private scheduleUpdate(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => void this.sendContext(), DEBOUNCE_MS)
  }

  private async sendContext(): Promise<void> {
    if (this.ws?.readyState !== WebSocket.OPEN) return

    const [editorCtx, diagCtx, gitCtx] = await Promise.all([
      this.editor.collect(),
      this.diag.collect(),
      this.git.collect(),
    ])
    const terminalCtx = this.terminal.collect()

    const ctx: AppContext = {
      app: 'vscode',
      priority: diagCtx?.hasErrors ? 'high' : 'medium',
      state: this.describeState(editorCtx, diagCtx),
      data: { editor: editorCtx, diagnostics: diagCtx, git: gitCtx, terminal: terminalCtx },
      timestamp: Date.now(),
      sessionId: vscode.env.sessionId,
    }

    this.ws.send(JSON.stringify(ctx))
  }

  private describeState(editor: Awaited<ReturnType<EditorCollector['collect']>>, diag: Awaited<ReturnType<DiagnosticsCollector['collect']>>): string {
    if (!editor) return 'sem arquivo aberto'
    if (diag?.hasErrors) return `editando ${editor.filename} com ${diag.errorCount} erro(s)`
    return `editando ${editor.filename} (${editor.language})`
  }

  private handleAction(raw: string): void {
    try {
      const { type, payload } = JSON.parse(raw) as { type: string; payload: unknown }
      if (type === 'openFile' && typeof payload === 'object' && payload && 'path' in payload) {
        void vscode.workspace.openTextDocument((payload as { path: string }).path)
          .then(doc => vscode.window.showTextDocument(doc))
      }
    } catch {
      // malformed action — ignore
    }
  }
}
