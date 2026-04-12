import * as vscode from 'vscode'
import { VSCodeConnector } from './VSCodeConnector'

let connector: VSCodeConnector | null = null

export function activate(ctx: vscode.ExtensionContext): void {
  connector = new VSCodeConnector(ctx)
  connector.connect()

  ctx.subscriptions.push(
    vscode.commands.registerCommand('john.connect', () => connector?.connect()),
    vscode.commands.registerCommand('john.disconnect', () => connector?.disconnect()),
    { dispose: () => connector?.disconnect() }
  )
}

export function deactivate(): void {
  connector?.disconnect()
}
