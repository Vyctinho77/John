Plano Técnico — John Connector Library
Visão Geral
Uma biblioteca de conectores padronizada que expõe contexto de aplicativos externos pro John em tempo real. Cada conector é independente, o John consome tudo via uma interface única.

Arquitetura
┌─────────────────────────────────────────┐
│              John (Electron)             │
│                                         │
│  ┌─────────────┐    ┌─────────────────┐ │
│  │ Context     │    │  John AI Core   │ │
│  │ Manager     │───▶│  (processa +    │ │
│  │ (main proc) │    │   responde)     │ │
│  └──────┬──────┘    └─────────────────┘ │
│         │ IPC                           │
│  ┌──────▼──────┐                        │
│  │  Bridge     │                        │
│  │  Server     │                        │
│  │ (localhost) │                        │
└──┴──────┬──────┴────────────────────────┘
          │ WebSocket / HTTP
    ┌─────┴──────┬──────────────┐
    │            │              │
┌───▼───┐  ┌────▼────┐  ┌──────▼──────┐
│VSCode │  │Spotify  │  │TradingView  │
│Ext.   │  │Connector│  │Connector    │
└───────┘  └─────────┘  └─────────────┘

Contrato Comum — AppContext
Todo conector publica esse tipo. O John sempre recebe nesse formato independente do app:
typescript// packages/types/src/index.ts

export type AppID = 'vscode' | 'spotify' | 'tradingview' | 'browser'

export type ContextPriority = 'low' | 'medium' | 'high' | 'critical'

export interface AppContext<T = unknown> {
  app: AppID
  priority: ContextPriority
  state: string           // descrição legível do estado atual
  data: T                 // payload específico do app
  timestamp: number
  sessionId: string       // identifica a sessão contínua
}

export interface ConnectorCapabilities {
  canRead: boolean        // lê contexto passivamente
  canWrite: boolean       // executa ações no app
  supportsStreaming: boolean
}

// Cada conector exporta isso
export interface Connector {
  id: AppID
  capabilities: ConnectorCapabilities
  getContext(): Promise<AppContext>
  onContextChange(cb: (ctx: AppContext) => void): () => void // retorna unsubscribe
  executeAction?(action: ConnectorAction): Promise<void>
}

export interface ConnectorAction {
  type: string
  payload: unknown
}

Estrutura de Pastas
john-connectors/
├── packages/
│   ├── types/               # contratos compartilhados
│   │   └── src/index.ts
│   │
│   ├── bridge/              # servidor central no processo main do Electron
│   │   └── src/
│   │       ├── BridgeServer.ts
│   │       ├── ContextManager.ts
│   │       └── index.ts
│   │
│   ├── connector-vscode/    # extensão VSCode
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── VSCodeConnector.ts
│   │   │   └── collectors/
│   │   │       ├── EditorCollector.ts
│   │   │       ├── DiagnosticsCollector.ts
│   │   │       ├── GitCollector.ts
│   │   │       └── TerminalCollector.ts
│   │   └── package.json
│   │
│   ├── connector-spotify/
│   │   └── src/
│   │       ├── SpotifyConnector.ts
│   │       └── SpotifyClient.ts
│   │
│   └── connector-tradingview/
│       └── src/
│           └── TradingViewConnector.ts
│
├── package.json             # workspace root (pnpm)
└── tsconfig.base.json

Bridge Server — Processo Main do Electron
Roda dentro do Node.js do Electron. Recebe contexto dos conectores e repassa pro John via IPC:
typescript// packages/bridge/src/BridgeServer.ts
import { WebSocketServer, WebSocket } from 'ws'
import { ipcMain } from 'electron'
import type { AppContext, AppID } from '@john/types'

const BRIDGE_PORT = 42001 // porta local fixa

export class BridgeServer {
  private wss: WebSocketServer
  private contexts = new Map<AppID, AppContext>()
  private clients = new Map<AppID, WebSocket>()

  start() {
    this.wss = new WebSocketServer({ port: BRIDGE_PORT, host: '127.0.0.1' })

    this.wss.on('connection', (ws, req) => {
      const appId = this.parseAppId(req.url)
      if (!appId) return ws.close()

      this.clients.set(appId, ws)
      console.log(`[Bridge] ${appId} conectado`)

      ws.on('message', (raw) => {
        try {
          const ctx: AppContext = JSON.parse(raw.toString())
          this.onContextReceived(ctx)
        } catch {}
      })

      ws.on('close', () => this.clients.delete(appId))
    })

    // John pode pedir contexto via IPC
    ipcMain.handle('bridge:getContext', (_, appId?: AppID) => {
      if (appId) return this.contexts.get(appId) ?? null
      return Object.fromEntries(this.contexts)
    })

    ipcMain.handle('bridge:executeAction', async (_, appId: AppID, action) => {
      const ws = this.clients.get(appId)
      if (!ws) throw new Error(`${appId} não conectado`)
      ws.send(JSON.stringify({ type: 'action', payload: action }))
    })
  }

  private onContextReceived(ctx: AppContext) {
    this.contexts.set(ctx.app, ctx)
    // Notifica o renderer do Electron (John UI)
    // mainWindow.webContents.send('bridge:contextUpdated', ctx)
  }

  private parseAppId(url = ''): AppID | null {
    const match = url.match(/\/connect\/(\w+)/)
    return match ? match[1] as AppID : null
  }
}

Conector VSCode
1. Entry point da extensão
typescript// packages/connector-vscode/src/extension.ts
import * as vscode from 'vscode'
import { VSCodeConnector } from './VSCodeConnector'

let connector: VSCodeConnector

export function activate(ctx: vscode.ExtensionContext) {
  connector = new VSCodeConnector()
  connector.connect()
  ctx.subscriptions.push({ dispose: () => connector.disconnect() })
}

export function deactivate() {
  connector?.disconnect()
}
2. VSCodeConnector — coleta e envia contexto
typescript// packages/connector-vscode/src/VSCodeConnector.ts
import WebSocket from 'ws'
import * as vscode from 'vscode'
import { EditorCollector } from './collectors/EditorCollector'
import { DiagnosticsCollector } from './collectors/DiagnosticsCollector'
import { GitCollector } from './collectors/GitCollector'
import { TerminalCollector } from './collectors/TerminalCollector'
import type { AppContext } from '@john/types'

const BRIDGE_URL = 'ws://127.0.0.1:42001/connect/vscode'
const DEBOUNCE_MS = 300

export class VSCodeConnector {
  private ws: WebSocket | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private disposables: vscode.Disposable[] = []

  private editor   = new EditorCollector()
  private diag     = new DiagnosticsCollector()
  private git      = new GitCollector()
  private terminal = new TerminalCollector()

  connect() {
    this.ws = new WebSocket(BRIDGE_URL)
    this.ws.on('open', () => {
      console.log('[John] VSCode connector ativo')
      this.sendContext()
      this.registerListeners()
    })
    this.ws.on('message', (raw) => this.handleAction(raw.toString()))
    this.ws.on('close', () => setTimeout(() => this.connect(), 3000)) // reconecta
  }

  disconnect() {
    this.disposables.forEach(d => d.dispose())
    this.ws?.close()
  }

  private registerListeners() {
    // Qualquer mudança dispara um contexto novo (com debounce)
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleUpdate()),
      vscode.window.onDidChangeTextEditorSelection(() => this.scheduleUpdate()),
      vscode.languages.onDidChangeDiagnostics(() => this.scheduleUpdate()),
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleUpdate()),
    )
  }

  private scheduleUpdate() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.sendContext(), DEBOUNCE_MS)
  }

  private async sendContext() {
    if (this.ws?.readyState !== WebSocket.OPEN) return

    const [editorCtx, diagCtx, gitCtx, terminalCtx] = await Promise.all([
      this.editor.collect(),
      this.diag.collect(),
      this.git.collect(),
      this.terminal.collect(),
    ])

    const ctx: AppContext<VSCodeData> = {
      app: 'vscode',
      priority: diagCtx.hasErrors ? 'high' : 'medium',
      state: this.describeState(editorCtx, diagCtx),
      data: { editor: editorCtx, diagnostics: diagCtx, git: gitCtx, terminal: terminalCtx },
      timestamp: Date.now(),
      sessionId: vscode.env.sessionId,
    }

    this.ws.send(JSON.stringify(ctx))
  }

  private describeState(editor: any, diag: any): string {
    if (diag.hasErrors) return `editando ${editor.filename} com ${diag.errorCount} erro(s)`
    return `editando ${editor.filename} (${editor.language})`
  }

  private handleAction(raw: string) {
    // Futuramente: John pede pro VSCode abrir arquivo, navegar, etc
    try {
      const { type, payload } = JSON.parse(raw)
      if (type === 'openFile') vscode.workspace.openTextDocument(payload.path)
    } catch {}
  }
}
3. Collectors
typescript// EditorCollector.ts — arquivo atual, cursor, seleção
export class EditorCollector {
  async collect() {
    const editor = vscode.window.activeTextEditor
    if (!editor) return null
    return {
      filename: editor.document.fileName.split('/').pop(),
      filepath: editor.document.fileName,
      language: editor.document.languageId,
      cursorLine: editor.selection.active.line,
      selectedText: editor.document.getText(editor.selection) || null,
      visibleRange: {
        start: editor.visibleRanges[0]?.start.line,
        end: editor.visibleRanges[0]?.end.line,
      },
      // Contexto ao redor do cursor (±20 linhas) — o mais útil pro John
      surroundingCode: this.getSurroundingCode(editor, 20),
    }
  }

  private getSurroundingCode(editor: vscode.TextEditor, radius: number) {
    const line = editor.selection.active.line
    const start = Math.max(0, line - radius)
    const end = Math.min(editor.document.lineCount - 1, line + radius)
    return editor.document.getText(new vscode.Range(start, 0, end, 999))
  }
}

// DiagnosticsCollector.ts — erros e warnings do LSP
export class DiagnosticsCollector {
  async collect() {
    const editor = vscode.window.activeTextEditor
    if (!editor) return { hasErrors: false, errorCount: 0, items: [] }
    const diags = vscode.languages.getDiagnostics(editor.document.uri)
    const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error)
    return {
      hasErrors: errors.length > 0,
      errorCount: errors.length,
      items: diags.slice(0, 10).map(d => ({
        message: d.message,
        severity: d.severity,
        line: d.range.start.line,
        source: d.source,
      }))
    }
  }
}

// GitCollector.ts — branch, diff, status
export class GitCollector {
  async collect() {
    const ext = vscode.extensions.getExtension('vscode.git')?.exports
    const repo = ext?.getAPI(1)?.repositories[0]
    if (!repo) return null
    return {
      branch: repo.state.HEAD?.name,
      ahead: repo.state.HEAD?.ahead ?? 0,
      behind: repo.state.HEAD?.behind ?? 0,
      changedFiles: repo.state.workingTreeChanges.length,
      stagedFiles: repo.state.indexChanges.length,
    }
  }
}

// TerminalCollector.ts — último output do terminal
export class TerminalCollector {
  private lastOutput = ''

  async collect() {
    // VSCode não expõe output do terminal diretamente
    // Workaround: extensão registra um pseudoterminal próprio
    return { lastOutput: this.lastOutput }
  }

  registerOutput(output: string) {
    // Chamado pelo pseudoterminal
    this.lastOutput = output.slice(-2000) // últimos 2000 chars
  }
}

Como o John Consome
No renderer React, via IPC:
typescript// john-app/src/hooks/useConnectorContext.ts
import { ipcRenderer } from 'electron'
import { useEffect, useState } from 'react'
import type { AppContext, AppID } from '@john/types'

export function useConnectorContext(appId: AppID) {
  const [ctx, setCtx] = useState<AppContext | null>(null)

  useEffect(() => {
    // Pega contexto atual
    ipcRenderer.invoke('bridge:getContext', appId).then(setCtx)

    // Escuta atualizações
    const handler = (_: any, incoming: AppContext) => {
      if (incoming.app === appId) setCtx(incoming)
    }
    ipcRenderer.on('bridge:contextUpdated', handler)
    return () => { ipcRenderer.off('bridge:contextUpdated', handler) }
  }, [appId])

  return ctx
}

// Uso no componente do John:
const vscodeCtx = useConnectorContext('vscode')

// Injeta no prompt do agente automaticamente:
const systemPrompt = buildPrompt({ vscodeCtx, spotifyCtx, ... })

Roadmap de Conectores
ConectorComplexidadeImpactoPrioridadeVSCodeMédia🔥 Altíssimo1SpotifyBaixaAlto2Browser (extensão Chrome)MédiaAlto3TradingViewAltaAlto (pra você)4

Por Onde Começar

Cria o monorepo com pnpm workspaces
Define o pacote types — esse contrato não muda depois
Implementa o BridgeServer no main process do Electron
Desenvolve a extensão VSCode com EditorCollector + DiagnosticsCollector primeiro (já resolve 80% dos casos)
Testa injetando o contexto num prompt simples e vendo a diferença na qualidade da resposta