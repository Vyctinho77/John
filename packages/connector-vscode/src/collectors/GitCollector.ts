import * as vscode from 'vscode'

export interface GitContext {
  branch: string | undefined
  ahead: number
  behind: number
  changedFiles: number
  stagedFiles: number
}

export class GitCollector {
  async collect(): Promise<GitContext | null> {
    try {
      const ext  = vscode.extensions.getExtension('vscode.git')
      const api  = ext?.isActive ? (ext.exports as { getAPI(v: number): unknown }).getAPI(1) : null
      const repo = (api as { repositories?: Array<{ state: { HEAD?: { name?: string; ahead?: number; behind?: number }; workingTreeChanges: unknown[]; indexChanges: unknown[] } }> })?.repositories?.[0]

      if (!repo) return null

      return {
        branch:       repo.state.HEAD?.name,
        ahead:        repo.state.HEAD?.ahead  ?? 0,
        behind:       repo.state.HEAD?.behind ?? 0,
        changedFiles: repo.state.workingTreeChanges.length,
        stagedFiles:  repo.state.indexChanges.length,
      }
    } catch {
      return null
    }
  }
}
