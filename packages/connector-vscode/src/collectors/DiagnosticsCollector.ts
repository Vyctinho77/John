import * as vscode from 'vscode'

export interface DiagnosticsContext {
  hasErrors: boolean
  errorCount: number
  items: Array<{
    message: string
    severity: number
    line: number
    source: string | undefined
  }>
}

export class DiagnosticsCollector {
  async collect(): Promise<DiagnosticsContext> {
    const editor = vscode.window.activeTextEditor
    if (!editor) return { hasErrors: false, errorCount: 0, items: [] }

    const diags  = vscode.languages.getDiagnostics(editor.document.uri)
    const errors = diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error)

    return {
      hasErrors: errors.length > 0,
      errorCount: errors.length,
      items: diags.slice(0, 10).map(d => ({
        message:  d.message,
        severity: d.severity,
        line:     d.range.start.line,
        source:   d.source,
      })),
    }
  }
}
