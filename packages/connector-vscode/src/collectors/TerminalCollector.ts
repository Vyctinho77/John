import * as vscode from 'vscode'

export interface TerminalContext {
  lastOutput: string
  activeTerminalName: string | null
}

export class TerminalCollector {
  private buffer = ''
  private readonly MAX_CHARS = 3000

  register(): vscode.Disposable {
    return vscode.window.onDidWriteTerminalData(e => {
      // Strip ANSI escape codes (colors, cursor moves, etc.)
      const clean = e.data.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
      this.buffer = (this.buffer + clean).slice(-this.MAX_CHARS)
    })
  }

  collect(): TerminalContext {
    return {
      lastOutput: this.buffer.slice(-2000),
      activeTerminalName: vscode.window.activeTerminal?.name ?? null
    }
  }
}
