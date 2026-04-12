import * as vscode from 'vscode'

export interface EditorContext {
  filename: string
  filepath: string
  language: string
  cursorLine: number
  selectedText: string | null
  visibleRange: { start: number; end: number }
  surroundingCode: string
}

export class EditorCollector {
  async collect(): Promise<EditorContext | null> {
    const editor = vscode.window.activeTextEditor
    if (!editor) return null

    return {
      filename: editor.document.fileName.split(/[\\/]/).pop() ?? '',
      filepath: editor.document.fileName,
      language: editor.document.languageId,
      cursorLine: editor.selection.active.line,
      selectedText: editor.document.getText(editor.selection) || null,
      visibleRange: {
        start: editor.visibleRanges[0]?.start.line ?? 0,
        end:   editor.visibleRanges[0]?.end.line   ?? 0,
      },
      surroundingCode: this.getSurroundingCode(editor, 20),
    }
  }

  private getSurroundingCode(editor: vscode.TextEditor, radius: number): string {
    const line  = editor.selection.active.line
    const start = Math.max(0, line - radius)
    const end   = Math.min(editor.document.lineCount - 1, line + radius)
    return editor.document.getText(new vscode.Range(start, 0, end, 9999))
  }
}
