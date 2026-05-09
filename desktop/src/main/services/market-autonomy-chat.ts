import type { TutorAction, TutorResponse } from '@shared/perception.types'
import type { TradeCopilotProposal } from './trade-copilot'

export function buildMarketAutonomyChatResponse(proposal: TradeCopilotProposal): TutorResponse {
  const content = buildProposalPrompt(proposal)

  return {
    domain: 'market',
    mode: 'direct',
    content,
    actions: buildMarketAutonomyActions(proposal),
    provider: 'market-autonomy-local',
    model: 'market-autonomy-local',
    uncertainty: proposal.confidence != null ? Number((1 - proposal.confidence).toFixed(2)) : 0.24,
    should_ask_confirmation: proposal.status === 'candidate',
    needs_visual_confirmation: false,
    suggested_follow_ups: buildFollowUps(proposal),
    warning: proposal.status === 'blocked' ? 'trade bloqueado pela policy atual' : null,
    debug: {
      provider: 'market-autonomy-local',
      model: 'market-autonomy-local',
      latencyMs: 0,
      screenshotIncluded: false,
      screenCapturedAt: null,
      screenAgeMs: null,
      changeSummary: null,
      connectorsUsed: ['tradingview'],
      dominantContextSource: 'tradingview',
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

function buildProposalPrompt(proposal: TradeCopilotProposal): string {
  if (proposal.status === 'no_trade') {
    return `Leitura atual em ${proposal.symbol} ${proposal.timeframe}: sem trade claro. Posso atualizar a proposta se quiser.`
  }

  if (proposal.status === 'blocked') {
    return [
      `Proposta em ${proposal.symbol} ${proposal.timeframe}: ${proposal.strategyId ?? 'setup'} ${proposal.side ?? 'sem lado'} bloqueada.`,
      proposal.blockedBy.length ? `Bloqueios: ${proposal.blockedBy.join(', ')}.` : null,
      proposal.thesis ? `Tese: ${proposal.thesis}` : null,
      'Quer que eu atualize a leitura ou registrar a rejeição?'
    ].filter(Boolean).join(' ')
  }

  return [
    `Proposta pronta em ${proposal.symbol} ${proposal.timeframe}: ${proposal.strategyId ?? 'setup'} ${proposal.side ?? 'sem lado'}.`,
    proposal.entryPrice != null || proposal.stopLossPrice != null || proposal.takeProfitPrice != null
      ? `Entrada ${proposal.entryPrice ?? '-'}, stop ${proposal.stopLossPrice ?? '-'}, alvo ${proposal.takeProfitPrice ?? '-'}.`
      : null,
    proposal.quantity != null || proposal.riskUsd != null
      ? `Tamanho ${proposal.quantity ?? '-'} com risco estimado de ${proposal.riskUsd != null ? `$${proposal.riskUsd.toFixed(2)}` : '-'}.`
      : null,
    'Deseja aprovar no paper ou rejeitar?'
  ].filter(Boolean).join(' ')
}

function buildMarketAutonomyActions(proposal: TradeCopilotProposal): TutorAction[] {
  if (proposal.status === 'candidate') {
    return [
      marketAction('Atualizar leitura', 'refresh_proposal'),
      marketAction('Aprovar no paper', 'approve_paper_trade'),
      marketAction('Rejeitar', 'reject_trade')
    ]
  }

  if (proposal.status === 'blocked') {
    return [
      marketAction('Atualizar leitura', 'refresh_proposal'),
      marketAction('Rejeitar', 'reject_trade')
    ]
  }

  return [marketAction('Atualizar leitura', 'refresh_proposal')]
}

function buildFollowUps(proposal: TradeCopilotProposal): string[] {
  if (proposal.status === 'candidate') {
    return ['Aprovar no paper', 'Rejeitar', 'Atualizar leitura']
  }
  if (proposal.status === 'blocked') {
    return ['Atualizar leitura', 'Por que bloqueou?']
  }
  return ['Atualizar leitura', 'Muda o timeframe']
}

function marketAction(
  label: string,
  action: 'refresh_proposal' | 'approve_paper_trade' | 'reject_trade'
): TutorAction {
  return {
    id: `market-autonomy:${action}`,
    label,
    kind: 'market_autonomy',
    payload: { action }
  }
}
