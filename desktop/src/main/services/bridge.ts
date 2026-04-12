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
  private listeners: StatusListener[] = []

  start(): void {
    if (this.wss) return

    this.wss = new WebSocketServer({ port: BRIDGE_PORT, host: '127.0.0.1' })

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const id = this.parseConnectorId(req.url)
      if (!id) {
        ws.close()
        return
      }

      this.clients.set(id, ws)
      console.log(`[Bridge] ${id} conectado`)
      this.emit({ id, connected: true, connectedAt: Date.now() })

      ws.on('message', (raw: Buffer) => {
        try {
          const ctx = JSON.parse(raw.toString()) as ConnectorContext
          this.contexts.set(id, ctx)
        } catch {
          // malformed payload — ignore
        }
      })

      ws.on('close', () => {
        this.clients.delete(id)
        console.log(`[Bridge] ${id} desconectado`)
        this.emit({ id, connected: false, connectedAt: null })
      })
    })

    this.wss.on('error', (err: Error) => {
      // Port already in use — likely a previous session; ignore gracefully
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        console.error('[Bridge] Erro no servidor WebSocket:', err)
      }
    })

    console.log(`[Bridge] Servidor iniciado em ws://127.0.0.1:${BRIDGE_PORT}`)
  }

  stop(): void {
    this.wss?.close()
    this.wss = null
    this.clients.clear()
  }

  getContext(id: ConnectorID): ConnectorContext | null {
    return this.contexts.get(id) ?? null
  }

  getStatuses(): ConnectorStatus[] {
    const ids: ConnectorID[] = ['vscode', 'spotify']
    return ids.map(id => ({
      id,
      connected: this.clients.has(id),
      connectedAt: this.clients.has(id) ? Date.now() : null
    }))
  }

  onStatusChange(cb: StatusListener): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb)
    }
  }

  private emit(status: ConnectorStatus): void {
    for (const cb of this.listeners) cb(status)
  }

  private parseConnectorId(url = ''): ConnectorID | null {
    const match = url.match(/\/connect\/(\w+)/)
    if (!match) return null
    const id = match[1] as ConnectorID
    return id === 'vscode' || id === 'spotify' ? id : null
  }
}

// Singleton for the main process
export const bridgeServer = new BridgeServer()
