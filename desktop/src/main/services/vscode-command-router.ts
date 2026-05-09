import type {
  TutorAction,
  TutorResponse,
  VSCodeActionPayload,
  VSCodeCommandResult,
  VSCodeConnectorData
} from '../../shared/perception.types'
import { bridgeServer } from './bridge'

type VSCodeIntent =
  | { kind: 'report_state' }
  | { kind: 'read_code' }
  | { kind: 'explain_diagnostics' }
  | { kind: 'review_diff' }
  | { kind: 'summarize_terminal' }

export function getVSCodeConnectorData(): VSCodeConnectorData | null {
  const raw = bridgeServer.getContext('vscode')?.data
  if (!raw || typeof raw !== 'object') return null
  return raw as VSCodeConnectorData
}

export function buildVSCodeActionsFromContext(data: VSCodeConnectorData | null): TutorAction[] {
  if (!data) return [vscodeAction('Resumir VS Code', { action: 'report_state' })]

  const actions: TutorAction[] = [vscodeAction('Resumir VS Code', { action: 'report_state' })]

  if (data.editor) {
    actions.push(vscodeAction('Ler código atual', { action: 'read_code' }))
  }
  if (data.diagnostics?.hasErrors) {
    actions.push(vscodeAction('Explicar erro', { action: 'explain_diagnostics' }))
  }
  if ((data.git?.changedFiles ?? 0) > 0 || (data.git?.stagedFiles ?? 0) > 0) {
    actions.push(vscodeAction('Revisar diff', { action: 'review_diff' }))
  }
  if (data.terminal?.lastOutput?.trim()) {
    actions.push(vscodeAction('Ler terminal', { action: 'summarize_terminal' }))
  }

  return actions.slice(0, 4)
}

export async function maybeHandleVSCodeTutorRequest(prompt: string): Promise<TutorResponse | null> {
  const data = getVSCodeConnectorData()
  const intent = parseVSCodeIntent(prompt)
  if (!intent) return null

  const result = executeVSCodeIntent(intent, data)
  return createVSCodeResponse(result)
}

export async function executeVSCodeAction(payload: VSCodeActionPayload): Promise<VSCodeCommandResult> {
  const data = getVSCodeConnectorData()
  return executeVSCodeIntent({ kind: payload.action }, data)
}

function executeVSCodeIntent(
  intent: VSCodeIntent,
  data: VSCodeConnectorData | null
): VSCodeCommandResult {
  if (!data) {
    return {
      ok: false,
      message: 'O VS Code não está conectado ao Ares agora.',
      state: null,
      errorCode: 'not_connected'
    }
  }

  switch (intent.kind) {
    case 'report_state':
      return { ok: true, message: buildVSCodeStateSummary(data), state: data }
    case 'read_code':
      if (!data.editor) {
        return { ok: false, message: 'Não encontrei um editor ativo no VS Code.', state: data, errorCode: 'no_editor' }
      }
      return { ok: true, message: buildVSCodeCodeSummary(data), state: data }
    case 'explain_diagnostics':
      if (!data.diagnostics?.hasErrors) {
        return { ok: false, message: 'Não encontrei diagnósticos ativos no arquivo atual.', state: data, errorCode: 'no_diagnostics' }
      }
      return { ok: true, message: buildVSCodeDiagnosticsSummary(data), state: data }
    case 'review_diff':
      if (!data.git) {
        return { ok: false, message: 'Não consegui ler o estado atual do Git no VS Code.', state: data, errorCode: 'no_git' }
      }
      return { ok: true, message: buildVSCodeDiffSummary(data), state: data }
    case 'summarize_terminal':
      if (!data.terminal?.lastOutput?.trim()) {
        return { ok: false, message: 'O terminal do VS Code não tem saída recente para resumir.', state: data, errorCode: 'no_terminal' }
      }
      return { ok: true, message: buildVSCodeTerminalSummary(data), state: data }
    default:
      return { ok: false, message: 'Ação do VS Code não reconhecida.', state: data, errorCode: 'invalid_action' }
  }
}

function parseVSCodeIntent(rawPrompt: string): VSCodeIntent | null {
  const normalized = normalizePrompt(rawPrompt)
  if (!looksLikeVSCodePrompt(normalized)) return null

  if (/\b(erro|diagnostico|diagnóstico|problema|warning|warnings|lint|typecheck)\b/.test(normalized)) {
    return { kind: 'explain_diagnostics' }
  }

  if (/\b(diff|git|mudancas|mudanças|staged|branch|commit)\b/.test(normalized)) {
    return { kind: 'review_diff' }
  }

  if (/\b(terminal|console|saida|saída|log)\b/.test(normalized)) {
    return { kind: 'summarize_terminal' }
  }

  if (/\b(codigo|código|arquivo|editor|selecao|seleção|cursor|funcao|função|trecho)\b/.test(normalized)) {
    return { kind: 'read_code' }
  }

  if (/\b(vscode|vs code|workspace|projeto aberto|o que ta aberto|o que está aberto|onde eu to|onde eu estou)\b/.test(normalized)) {
    return { kind: 'report_state' }
  }

  return null
}

function looksLikeVSCodePrompt(normalizedPrompt: string): boolean {
  return /\b(vscode|vs code|arquivo|editor|codigo|código|erro|diagnostico|diagnóstico|terminal|git|diff|cursor|workspace|projeto)\b/.test(normalizedPrompt)
}

function normalizePrompt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[!?.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function createVSCodeResponse(result: VSCodeCommandResult): TutorResponse {
  return {
    domain: 'code',
    mode: 'direct',
    content: result.message,
    actions: buildVSCodeActionsFromContext(result.state),
    provider: 'vscode-local',
    model: 'vscode-local',
    uncertainty: result.ok ? 0.08 : 0.24,
    should_ask_confirmation: false,
    needs_visual_confirmation: false,
    suggested_follow_ups: buildVSCodeFollowUps(result.state),
    warning: result.ok ? null : result.message,
    debug: {
      provider: 'vscode-local',
      model: 'vscode-local',
      latencyMs: 0,
      screenshotIncluded: false,
      screenCapturedAt: null,
      screenAgeMs: null,
      changeSummary: null,
      connectorsUsed: ['vscode'],
      dominantContextSource: 'vscode',
      sourceConfidence: {
        bridge: 0.98,
        vision: 0,
        ocr: 0,
        memory: 0
      },
      staleContextGuarded: false
    }
  }
}

function buildVSCodeFollowUps(data: VSCodeConnectorData | null): string[] {
  const followUps = new Set<string>()
  followUps.add('Resume o VS Code')
  if (data?.editor) followUps.add('Lê o código atual')
  if (data?.diagnostics?.hasErrors) followUps.add('Explica esse erro')
  if ((data?.git?.changedFiles ?? 0) > 0 || (data?.git?.stagedFiles ?? 0) > 0) followUps.add('Revisa o diff')
  if (data?.terminal?.lastOutput?.trim()) followUps.add('Olha o terminal')
  return [...followUps].slice(0, 4)
}

function buildVSCodeStateSummary(data: VSCodeConnectorData): string {
  const parts: string[] = []
  if (data.editor) {
    const editorLabel = data.editor.filepath || data.editor.filename
    parts.push(`${editorLabel} (${data.editor.language}) na linha ${data.editor.cursorLine}`)
  }
  if (data.diagnostics?.hasErrors) {
    parts.push(`${data.diagnostics.errorCount} diagnóstico(s) ativo(s)`)
  }
  if (data.git) {
    parts.push(`branch ${data.git.branch ?? 'desconhecida'} com ${data.git.changedFiles} arquivo(s) alterado(s)`)
  }

  if (!parts.length) {
    return 'O VS Code está conectado, mas ainda não tenho contexto suficiente do editor ativo.'
  }

  return `No VS Code, estou vendo ${parts.join(' · ')}.`
}

function buildVSCodeCodeSummary(data: VSCodeConnectorData): string {
  const editor = data.editor
  if (!editor) return 'Não encontrei um editor ativo no VS Code.'

  const header = `Arquivo atual: ${editor.filepath || editor.filename} (${editor.language}), cursor na linha ${editor.cursorLine}.`
  if (editor.selectedText?.trim()) {
    return `${header} Seleção atual:\n\n\`\`\`${editor.language}\n${editor.selectedText.trim().slice(0, 1200)}\n\`\`\``
  }

  const code = editor.surroundingCode?.trim()
  if (!code) return header
  return `${header} Código visível ao redor do cursor:\n\n\`\`\`${editor.language}\n${code.slice(0, 1600)}\n\`\`\``
}

function buildVSCodeDiagnosticsSummary(data: VSCodeConnectorData): string {
  const diagnostics = data.diagnostics
  if (!diagnostics?.hasErrors) return 'Não encontrei diagnósticos ativos no arquivo atual.'

  const items = diagnostics.items
    .filter(item => item.severity === 0)
    .slice(0, 5)
    .map(item => `- linha ${item.line}: ${item.message}${item.source ? ` (${item.source})` : ''}`)

  const fileLabel = data.editor?.filename ? ` em ${data.editor.filename}` : ''
  return `Encontrei ${diagnostics.errorCount} diagnóstico(s)${fileLabel}:\n${items.join('\n')}`
}

function buildVSCodeDiffSummary(data: VSCodeConnectorData): string {
  const git = data.git
  if (!git) return 'Não consegui ler o estado atual do Git no VS Code.'

  const sync = git.ahead || git.behind ? ` · ↑${git.ahead} ↓${git.behind}` : ''
  return `Git no VS Code: branch ${git.branch ?? 'desconhecida'}${sync}, ${git.changedFiles} arquivo(s) alterado(s) e ${git.stagedFiles} staged.`
}

function buildVSCodeTerminalSummary(data: VSCodeConnectorData): string {
  const terminal = data.terminal
  if (!terminal?.lastOutput?.trim()) return 'O terminal do VS Code não tem saída recente para resumir.'

  const label = terminal.activeTerminalName ? `Terminal ${terminal.activeTerminalName}` : 'Terminal'
  return `${label}, últimas linhas:\n\n\`\`\`\n${terminal.lastOutput.trim().slice(-1500)}\n\`\`\``
}

function vscodeAction(label: string, payload: VSCodeActionPayload): TutorAction {
  return {
    id: `vscode:${payload.action}`,
    label,
    kind: 'vscode',
    payload
  }
}
