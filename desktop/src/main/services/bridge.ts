import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'http'
import type { ConnectorID, ConnectorStatus } from '../../shared/perception.types'

const BRIDGE_PORT = 42001

type StatusListener = (status: ConnectorStatus) => void

export interface ConnectorContext {
  app: ConnectorID
  priority: string
  state: string
  data: unknown
  timestamp: number
  sessionId: string
}

export class BridgeServer {
  private wss: WebSocketServer | null = null
  private clients = new Map<ConnectorID, WebSocket>()
  private contexts = new Map<ConnectorID, ConnectorContext>()
  private internalStatus = new Map<ConnectorID, boolean>()
  private bridgeIssue: string | null = null
  private retryTimer: NodeJS.Timeout | null = null
  private retryAttempt = 0
  private listeners: StatusListener[] = []

  start(): void {
    if (this.wss || this.retryTimer) return
    this.openServer()
  }

  stop(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.wss?.close()
    this.wss = null
    this.clients.clear()
  }

  disconnect(id: ConnectorID): void {
    const ws = this.clients.get(id)
    if (ws) {
      ws.close()
      this.clients.delete(id)
      this.contexts.delete(id)
      this.emit({ id, connected: false, connectedAt: null, message: id === 'vscode' ? this.bridgeIssue : null })
    }
  }

  injectContext(id: ConnectorID, ctx: ConnectorContext): void {
    this.contexts.set(id, ctx)
  }

  setInternalStatus(id: ConnectorID, connected: boolean): void {
    const was = this.internalStatus.get(id) ?? false
    this.internalStatus.set(id, connected)
    if (was !== connected) {
      this.emit({ id, connected, connectedAt: connected ? Date.now() : null, message: null })
    }
  }

  getContext(id: ConnectorID): ConnectorContext | null {
    return this.contexts.get(id) ?? null
  }

  getStatuses(): ConnectorStatus[] {
    const ids: ConnectorID[] = ['vscode', 'spotify', 'tradingview']
    return ids.map(id => ({
      id,
      connected: this.clients.has(id) || (this.internalStatus.get(id) ?? false),
      connectedAt: (this.clients.has(id) || (this.internalStatus.get(id) ?? false)) ? Date.now() : null,
      message: id === 'vscode' ? this.bridgeIssue : null
    }))
  }

  onStatusChange(cb: StatusListener): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== cb)
    }
  }

  private openServer(): void {
    this.wss = new WebSocketServer({ port: BRIDGE_PORT, host: '127.0.0.1' })

    this.wss.on('listening', () => {
      this.retryAttempt = 0
      this.clearIssue()
      console.log(`[Bridge] Servidor iniciado em ws://127.0.0.1:${BRIDGE_PORT}`)
    })

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const id = this.parseConnectorId(req.url)
      if (!id) {
        ws.close()
        return
      }

      this.clients.set(id, ws)
      console.log(`[Bridge] ${id} conectado`)
      this.emit({ id, connected: true, connectedAt: Date.now(), message: id === 'vscode' ? this.bridgeIssue : null })

      ws.on('message', (raw: Buffer) => {
        try {
          const ctx = JSON.parse(raw.toString()) as ConnectorContext
          this.contexts.set(id, ctx)
        } catch {
          // ignore malformed payloads
        }
      })

      ws.on('close', () => {
        this.clients.delete(id)
        console.log(`[Bridge] ${id} desconectado`)
        this.emit({ id, connected: false, connectedAt: null, message: id === 'vscode' ? this.bridgeIssue : null })
      })
    })

    this.wss.on('error', (err: Error) => {
      const code = (err as NodeJS.ErrnoException).code

      if (code === 'EADDRINUSE') {
        this.setIssue('Bridge do VS Code indisponível agora. A porta 42001 está ocupada; vou tentar reconectar automaticamente.')
        this.wss?.close()
        this.wss = null
        this.scheduleRetry()
        return
      }

      console.error('[Bridge] Erro no servidor WebSocket:', err)
      this.setIssue(`Bridge com falha: ${err.message}`)
    })
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return

    const delayMs = Math.min(1500 * Math.max(1, 2 ** this.retryAttempt), 20000)
    this.retryAttempt += 1

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.wss) this.openServer()
    }, delayMs)
  }

  private setIssue(message: string): void {
    if (this.bridgeIssue === message) return
    this.bridgeIssue = message
    this.emit({
      id: 'vscode',
      connected: this.clients.has('vscode'),
      connectedAt: this.clients.has('vscode') ? Date.now() : null,
      message
    })
  }

  private clearIssue(): void {
    if (this.bridgeIssue === null) return
    this.bridgeIssue = null
    this.emit({
      id: 'vscode',
      connected: this.clients.has('vscode'),
      connectedAt: this.clients.has('vscode') ? Date.now() : null,
      message: null
    })
  }

  private emit(status: ConnectorStatus): void {
    for (const cb of this.listeners) cb(status)
  }

  private parseConnectorId(url = ''): ConnectorID | null {
    const match = url.match(/\/connect\/(\w+)/)
    if (!match) return null
    const id = match[1] as ConnectorID
    return id === 'vscode' || id === 'spotify' || id === 'tradingview' ? id : null
  }
}

export const bridgeServer = new BridgeServer()
