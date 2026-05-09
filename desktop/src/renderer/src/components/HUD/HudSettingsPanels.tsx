import type {
  AppSettings,
  CaptureSource,
  DataDeletionSummary,
  DiagnosticsSnapshot,
  PrivacySnapshot,
  SemanticState,
  UserProfile,
  TypographyFontFamily,
  TypographyFontWeight
} from '@shared/perception.types'
import type {
  MemoryCardSummary,
  MemoryEmbeddingStatus,
  MemoryImportMode,
  MemoryImportPreview
} from '@shared/memory.types'
import type {
  AICostSnapshot,
  AIFeatureTask,
  AIFeatureTier,
  AIProviderId,
  AIProviderSnapshot,
  AISettingsSnapshot
} from '@shared/ai-provider.types'
import type { AuthStatus } from '@shared/auth.types'
import type { MarketAutonomyViewSnapshot } from '@shared/market-autonomy-view.types'
import {
  InlineEditableRow,
  PillButton,
  SectionTitle,
  SettingsActionStrip,
  SettingsCard,
  SettingsRow,
  StatusBadge,
  Toggle,
  TypographyChoice
} from './HudSettingsPrimitives'
export { GeneralSettingsPanel } from './HudGeneralSettingsPanel'

const TYPOGRAPHY_FAMILY_OPTIONS: Array<{ id: TypographyFontFamily; label: string; sample: string }> = [
  { id: 'system-sans', label: 'SF Pro / System Sans', sample: 'Apple-like, limpa e neutra' },
  { id: 'system-serif', label: 'New York / Serif', sample: 'Mais editorial e refinada' },
  { id: 'mono', label: 'SF Mono / Monospace', sample: 'Tecnica e utilitaria' }
]

const TYPOGRAPHY_SIZE_OPTIONS = [13, 14, 15, 16, 18]
const TYPOGRAPHY_WEIGHT_OPTIONS: Array<{ id: TypographyFontWeight; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'book', label: 'Book' },
  { id: 'regular', label: 'Regular' },
  { id: 'medium', label: 'Medium' },
  { id: 'bold', label: 'Bold' }
]


export function NotificationsSettingsPanel({
  settings,
  voiceKeyReady,
  voiceTestState,
  voiceTestError,
  onTogglePassiveSuggestions,
  onToggleAlwaysVisible,
  onToggleVoiceMode,
  onTestVoice,
  setVoiceTestState,
  setVoiceTestError
}: {
  settings: AppSettings
  voiceKeyReady: boolean | null
  voiceTestState: 'idle' | 'testing' | 'ok' | 'error'
  voiceTestError: string | null
  onTogglePassiveSuggestions: () => void
  onToggleAlwaysVisible: () => void
  onToggleVoiceMode: () => void
  onTestVoice: () => Promise<void>
  setVoiceTestState: (state: 'idle' | 'testing' | 'ok' | 'error') => void
  setVoiceTestError: (message: string | null) => void
}) {
  return (
    <>
      <SectionTitle className="mb-1 text-[18px]">Notificações</SectionTitle>
      <div className="mt-4">
        <SettingsRow
          label="Sugestões passivas"
          value={settings.passiveSuggestions ? 'Ativado' : 'Desativado'}
          toggle={settings.passiveSuggestions}
          onClick={onTogglePassiveSuggestions}
        />
        <SettingsRow
          label="Sempre visível"
          value={settings.alwaysVisible ? 'Ativado' : 'Desativado'}
          toggle={settings.alwaysVisible}
          onClick={onToggleAlwaysVisible}
        />
        <SettingsRow
          label="Voice mode"
          value={settings.featureFlags.voiceMode ? 'Ativado' : 'Desligado'}
          toggle={settings.featureFlags.voiceMode}
          muted={!settings.featureFlags.voiceMode}
          onClick={onToggleVoiceMode}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <StatusBadge tone={voiceKeyReady === false ? 'danger' : voiceKeyReady ? 'success' : 'neutral'}>
              {voiceKeyReady === null
                ? 'Voz: verificando…'
                : voiceKeyReady
                  ? 'Voz: chave configurada'
                  : 'Voz: ELEVENLABS_API_KEY não encontrada no .env'}
            </StatusBadge>
            {settings.featureFlags.voiceMode && voiceKeyReady && (
              <PillButton
                onMouseDown={e => e.preventDefault()}
                onClick={async () => {
                  setVoiceTestState('testing')
                  setVoiceTestError(null)
                  try {
                    await onTestVoice()
                    setVoiceTestState('ok')
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    setVoiceTestError(msg)
                    setVoiceTestState('error')
                    console.error('[Voice test]', msg)
                  }
                  setTimeout(() => setVoiceTestState('idle'), 3000)
                }}
                disabled={voiceTestState === 'testing'}
                className="text-[13px] px-3 py-1 rounded whitespace-nowrap"
                tone={
                  voiceTestState === 'ok'
                    ? 'success'
                    : voiceTestState === 'error'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {voiceTestState === 'testing' ? '…'
                  : voiceTestState === 'ok' ? '✓ ok'
                  : voiceTestState === 'error' ? '✗ falhou'
                  : 'Testar'}
              </PillButton>
            )}
          </div>
          {voiceTestError && (
            <p className="text-[12px] pb-2" style={{ color: 'var(--ares-danger)' }}>
              {voiceTestError}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

export function TypographySettingsPanel({
  settings,
  onUpdateTypography
}: {
  settings: AppSettings
  onUpdateTypography: (patch: Partial<AppSettings['typography']>) => void
}) {
  const typography = settings.typography

  return (
    <>
      <SectionTitle className="mb-1 text-[18px]">Tipografia</SectionTitle>

      <div className="mt-4">
        <SettingsRow label="Tamanho base" value={`${typography.fontSize}px`} />
        <SettingsRow
          label="Família ativa"
          value={TYPOGRAPHY_FAMILY_OPTIONS.find(option => option.id === typography.fontFamily)?.label || 'System Sans'}
        />
        <SettingsRow
          label="Peso ativo"
          value={TYPOGRAPHY_WEIGHT_OPTIONS.find(option => option.id === typography.fontWeight)?.label || 'Regular'}
          last
        />
      </div>

      <div className="mt-5">
        <p className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
          Família de fonte
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPOGRAPHY_FAMILY_OPTIONS.map(option => (
            <TypographyChoice
              key={option.id}
              label={option.label}
              secondaryLabel={option.sample}
              active={typography.fontFamily === option.id}
              onClick={() => onUpdateTypography({ fontFamily: option.id })}
            />
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
          Tamanho da fonte
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPOGRAPHY_SIZE_OPTIONS.map(size => (
            <TypographyChoice
              key={size}
              label={`${size}px`}
              active={typography.fontSize === size}
              onClick={() => onUpdateTypography({ fontSize: size })}
            />
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
          Peso
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TYPOGRAPHY_WEIGHT_OPTIONS.map(option => (
            <TypographyChoice
              key={option.id}
              label={option.label}
              active={typography.fontWeight === option.id}
              onClick={() => onUpdateTypography({ fontWeight: option.id })}
            />
          ))}
        </div>
      </div>
    </>
  )
}

export function MarketAutonomySettingsPanel({
  view,
  loading,
  onRefresh,
  onBringToChat
}: {
  view: MarketAutonomyViewSnapshot | null
  loading: boolean
  onRefresh: () => void
  onBringToChat: () => void
}) {
  const snapshot = view?.snapshot ?? null
  const strategy = view?.strategy ?? null
  const proposal = view?.proposal ?? null
  const risk = view?.riskDecision ?? null
  const intent = view?.executionIntent ?? null
  const idea = strategy?.idea ?? null
  const guards = view?.marketGuards ?? {
    hasHotNews: false,
    macroBlocked: false,
    hotNewsCount: 0,
    upcomingMacroEventCount: 0,
    hotNewsItems: [],
    upcomingMacroEvents: []
  }
  const policy = view?.policy ?? null
  const killSwitch = view?.killSwitch ?? null

  const updatePolicy = (patch: Parameters<typeof window.marketAutonomyAPI.setPolicy>[0]) => {
    void window.marketAutonomyAPI.setPolicy(patch).then(() => onRefresh()).catch(() => {})
  }

  const toggleKillSwitch = (enabled: boolean) => {
    void window.marketAutonomyAPI.setKillSwitch({ enabled, reason: enabled ? 'manual' : null })
      .then(() => onRefresh())
      .catch(() => {})
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionTitle className="mb-1 text-[18px]">Mercado</SectionTitle>
          <p className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)', lineHeight: 1.5 }}>
            Snapshot, setup, risco e intenção de execução do pipeline local de autonomia.
          </p>
        </div>
        <PillButton
          onMouseDown={e => { e.preventDefault(); onRefresh() }}
          tone="accent"
          className="px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap"
        >
          {loading ? 'atualizando...' : 'atualizar'}
        </PillButton>
      </div>
      <div className="mt-3 flex gap-2">
        <PillButton
          onMouseDown={e => { e.preventDefault(); onBringToChat() }}
          tone="strong"
          className="px-3 py-1.5 rounded-full text-[11px]"
        >
          trazer pro chat
        </PillButton>
      </div>

      <SettingsCard className="mt-5 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Trava local</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Estado operacional para paper e automação local.
            </p>
          </div>
          <StatusBadge tone={killSwitch?.enabled ? 'danger' : 'success'}>
            {killSwitch?.enabled ? 'blocked' : 'enabled'}
          </StatusBadge>
        </div>
        <div className="mt-4">
          <SettingsRow label="Kill switch" value={killSwitch?.enabled ? 'ativo' : 'desligado'} />
          <SettingsRow label="Motivo" value={killSwitch?.reason || 'nenhum'} last />
        </div>
        <div className="mt-3 flex gap-2">
          <PillButton
            onMouseDown={e => { e.preventDefault(); toggleKillSwitch(!killSwitch?.enabled) }}
            tone={killSwitch?.enabled ? 'strong' : 'danger'}
            className="px-3 py-1.5 rounded-full text-[11px]"
          >
            {killSwitch?.enabled ? 'desativar trava' : 'ativar trava'}
          </PillButton>
        </div>
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Policy ativa</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Escopo configurável do copilot local.
            </p>
          </div>
          <StatusBadge tone={policy?.mode === 'copilot' ? 'success' : 'neutral'}>
            {policy?.mode || 'copilot'}
          </StatusBadge>
        </div>
        <div className="mt-4">
          <SettingsRow label="Modo" value={policy?.mode || 'copilot'} onClick={() => updatePolicy({ mode: policy?.mode === 'read_only' ? 'copilot' : 'read_only' })} />
          <SettingsRow label="Símbolo" value={policy?.allowedSymbols[0] || 'BTCUSDT'} onClick={() => {
            const next = window.prompt('Símbolo permitido', policy?.allowedSymbols[0] || 'BTCUSDT')
            if (next) updatePolicy({ allowedSymbols: [next] })
          }} />
          <SettingsRow label="Timeframe" value={policy?.allowedTimeframes[0] || '5m'} onClick={() => {
            const next = window.prompt('Timeframe permitido', policy?.allowedTimeframes[0] || '5m')
            if (next) updatePolicy({ allowedTimeframes: [next] })
          }} />
          <SettingsRow label="Risco por trade" value={`$${(policy?.maxRiskPerTradeUsd ?? 25).toFixed(2)}`} onClick={() => {
            const next = Number(window.prompt('Risco máximo por trade', String(policy?.maxRiskPerTradeUsd ?? 25)))
            if (Number.isFinite(next)) updatePolicy({ maxRiskPerTradeUsd: next })
          }} />
          <SettingsRow label="Perda diária" value={`$${(policy?.maxDailyLossUsd ?? 75).toFixed(2)}`} onClick={() => {
            const next = Number(window.prompt('Perda diária máxima', String(policy?.maxDailyLossUsd ?? 75)))
            if (Number.isFinite(next)) updatePolicy({ maxDailyLossUsd: next })
          }} />
          <SettingsRow label="Trades/sessão" value={String(policy?.maxTradesPerSession ?? 5)} onClick={() => {
            const next = Number(window.prompt('Trades por sessão', String(policy?.maxTradesPerSession ?? 5)))
            if (Number.isFinite(next)) updatePolicy({ maxTradesPerSession: next })
          }} />
          <SettingsRow label="Resetar default" value="" muted onClick={() => { void window.marketAutonomyAPI.resetPolicy().then(() => onRefresh()).catch(() => {}) }} last />
        </div>
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Snapshot</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Estado consolidado do mercado a partir do TradingView atual.
            </p>
          </div>
          <StatusBadge tone={snapshot ? 'success' : 'neutral'}>
            {snapshot ? 'ativo' : 'indisponível'}
          </StatusBadge>
        </div>

        <div className="mt-4">
          <SettingsRow label="Símbolo" value={snapshot?.symbol || 'indisponível'} />
          <SettingsRow label="Timeframe" value={snapshot?.timeframe || 'indisponível'} />
          <SettingsRow label="Regime" value={snapshot?.marketRegime || 'indisponível'} />
          <SettingsRow label="Sessão" value={snapshot?.session || 'indisponível'} />
          <SettingsRow
            label="Último preço"
            value={snapshot ? String(snapshot.lastPrice) : 'indisponível'}
            last={!view?.snapshotReasons.length}
          />
          {view?.snapshotReasons.length ? (
            <SettingsRow
              label="Avisos"
              value={view.snapshotReasons.join(', ')}
              muted
              last
            />
          ) : null}
        </div>
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Setup</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Resultado atual do strategy engine.
            </p>
          </div>
          <StatusBadge tone={strategy?.eligible ? 'success' : 'neutral'}>
            {strategy?.eligible ? 'candidato' : 'sem trade'}
          </StatusBadge>
        </div>

        <div className="mt-4">
          <SettingsRow label="Estratégia" value={strategy?.strategyId || 'indisponível'} />
          <SettingsRow label="Status" value={strategy?.reason || 'sem avaliação'} />
          <SettingsRow label="Lado" value={idea?.side || 'indisponível'} />
          <SettingsRow
            label="Confiança"
            value={idea ? `${Math.round(idea.confidence * 100)}%` : 'indisponível'}
          />
          <SettingsRow
            label="Entrada"
            value={idea ? `${idea.entryType}${idea.entryPrice != null ? ` @ ${idea.entryPrice}` : ''}` : 'indisponível'}
          />
          <SettingsRow
            label="Stop / alvo"
            value={idea ? `${idea.stopLossPrice ?? '-'} / ${idea.takeProfitPrice ?? '-'}` : 'indisponível'}
            last
          />
        </div>

        {idea?.thesis && (
          <p className="mt-4 text-[11px]" style={{ color: 'var(--ares-text-secondary)', lineHeight: 1.55 }}>
            {idea.thesis}
          </p>
        )}
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Proposta</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Leitura final pronta para aprovação humana.
            </p>
          </div>
          <StatusBadge
            tone={
              proposal?.status === 'candidate'
                ? 'success'
                : proposal?.status === 'blocked'
                  ? 'danger'
                  : 'neutral'
            }
          >
            {proposal?.status || 'no_trade'}
          </StatusBadge>
        </div>

        <div className="mt-4">
          <SettingsRow label="Estratégia" value={proposal?.strategyId || 'indisponível'} />
          <SettingsRow label="Lado" value={proposal?.side || 'indisponível'} />
          <SettingsRow
            label="Entrada / stop / alvo"
            value={
              proposal
                ? `${proposal.entryPrice ?? '-'} / ${proposal.stopLossPrice ?? '-'} / ${proposal.takeProfitPrice ?? '-'}`
                : 'indisponível'
            }
          />
          <SettingsRow
            label="Quantidade / risco"
            value={
              proposal
                ? `${proposal.quantity ?? '-'} / ${proposal.riskUsd != null ? `$${proposal.riskUsd.toFixed(2)}` : '-'}`
                : 'indisponível'
            }
          />
          <SettingsRow
            label="Notional"
            value={proposal?.notionalUsd != null ? `$${proposal.notionalUsd.toFixed(2)}` : 'indisponível'}
            last={!proposal?.blockedBy.length}
          />
          {proposal?.blockedBy.length ? (
            <SettingsRow
              label="Bloqueios"
              value={proposal.blockedBy.join(', ')}
              muted
              last
            />
          ) : null}
        </div>

        {proposal?.thesis && (
          <p className="mt-4 text-[11px]" style={{ color: 'var(--ares-text-secondary)', lineHeight: 1.55 }}>
            {proposal.thesis}
          </p>
        )}
        {proposal?.invalidation && (
          <p className="mt-2 text-[11px]" style={{ color: 'var(--ares-text-tertiary)', lineHeight: 1.55 }}>
            Invalidação: {proposal.invalidation}
          </p>
        )}
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Risco</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Decisão da policy e sizing sugerido.
            </p>
          </div>
          <StatusBadge tone={risk?.allowed ? 'success' : risk ? 'danger' : 'neutral'}>
            {risk ? (risk.allowed ? 'permitido' : 'bloqueado') : 'sem decisão'}
          </StatusBadge>
        </div>

        <div className="mt-4">
          <SettingsRow label="Motivo principal" value={risk?.reason || 'indisponível'} />
          <SettingsRow
            label="Violações"
            value={risk?.violations.length ? risk.violations.join(', ') : 'nenhuma'}
          />
          <SettingsRow
            label="Quantidade"
            value={risk?.positionSize ? String(risk.positionSize.quantity) : 'indisponível'}
          />
          <SettingsRow
            label="Risco USD"
            value={risk?.positionSize ? `$${risk.positionSize.riskUsd.toFixed(2)}` : 'indisponível'}
            last
          />
        </div>
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Guards de mercado</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Bloqueios e alertas contextuais por notícia quente e macro próximo.
            </p>
          </div>
          <StatusBadge tone={guards.macroBlocked || guards.hasHotNews ? 'danger' : 'success'}>
            {guards.macroBlocked || guards.hasHotNews ? 'atenção' : 'limpo'}
          </StatusBadge>
        </div>

        <div className="mt-4">
          <SettingsRow
            label="Hot news"
            value={guards.hasHotNews ? `${guards.hotNewsItems.length} alerta(s)` : 'nenhuma'}
          />
          <SettingsRow
            label="Macro próximo"
            value={guards.macroBlocked ? `${guards.upcomingMacroEvents.length} evento(s)` : 'nenhum'}
            last
          />
        </div>

        {guards.hotNewsItems.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {guards.hotNewsItems.map(item => (
              <div
                key={item.link}
                className="rounded-[14px] px-3 py-2"
                style={{
                  background: 'color-mix(in srgb, var(--ares-danger-soft) 26%, var(--ares-surface-1))',
                  border: '1px solid color-mix(in srgb, var(--ares-danger) 24%, transparent)'
                }}
              >
                <p className="text-[11px]" style={{ color: 'var(--ares-text-primary)', lineHeight: 1.45 }}>
                  {item.title}
                </p>
              </div>
            ))}
          </div>
        )}

        {guards.upcomingMacroEvents.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {guards.upcomingMacroEvents.map(event => (
              <div
                key={`${event.title}-${event.timestamp}`}
                className="rounded-[14px] px-3 py-2"
                style={{
                  background: 'color-mix(in srgb, var(--ares-accent-soft) 24%, var(--ares-surface-1))',
                  border: '1px solid color-mix(in srgb, var(--ares-accent) 22%, transparent)'
                }}
              >
                <p className="text-[11px]" style={{ color: 'var(--ares-text-primary)', lineHeight: 1.45 }}>
                  [{event.impact}] {event.country} {event.title}
                </p>
                <p className="mt-1 text-[10px]" style={{ color: 'var(--ares-text-tertiary)' }}>
                  {new Date(event.timestamp).toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Paper</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Conta, posições e ordens abertas no broker simulado.
            </p>
          </div>
          <StatusBadge tone={view?.openPositions.length ? 'success' : 'neutral'}>
            {view?.openPositions.length ? 'posição aberta' : 'flat'}
          </StatusBadge>
        </div>
        <div className="mt-4">
          <SettingsRow
            label="Equity / cash"
            value={view?.paperAccount ? `$${view.paperAccount.equityUsd.toFixed(2)} / $${view.paperAccount.cashUsd.toFixed(2)}` : 'indisponível'}
          />
          <SettingsRow
            label="Posições"
            value={view?.openPositions.length ? view.openPositions.map(position => `${position.symbol} ${position.quantity}`).join(', ') : 'nenhuma'}
          />
          <SettingsRow
            label="Ordens abertas"
            value={view?.openOrders.length ? view.openOrders.map(order => `${order.symbol} ${order.status}`).join(', ') : 'nenhuma'}
          />
          <SettingsRow
            label="Última simulação"
            value={
              view?.lastSimulation
                ? `${view.lastSimulation.executed ? 'executada' : 'bloqueada'} ${view.lastSimulation.orderEventTypes.join(', ') || view.lastSimulation.message || ''}`
                : 'nenhuma'
            }
            last
          />
        </div>
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <SectionTitle className="text-[15px]">Execução</SectionTitle>
        <div className="mt-4">
          <SettingsRow label="Broker" value={intent?.broker || 'paper'} />
          <SettingsRow label="Side" value={intent?.side || 'indisponível'} />
          <SettingsRow label="Quantidade" value={intent ? String(intent.quantity) : 'indisponível'} />
          <SettingsRow
            label="Ordens protetivas"
            value={intent ? String(intent.protectiveOrders.length) : '0'}
            last
          />
        </div>
      </SettingsCard>

      {(view?.invalidReason || view?.lastValidSnapshot) && (
        <SettingsCard className="mt-4 rounded-[22px] p-4">
          <SectionTitle className="text-[15px]">Fallback</SectionTitle>
          <div className="mt-4">
            <SettingsRow label="Motivo inválido" value={view?.invalidReason || 'nenhum'} />
            <SettingsRow
              label="Último válido"
              value={
                view?.lastValidSnapshot
                  ? `${view.lastValidSnapshot.symbol} ${view.lastValidSnapshot.timeframe} ${view.lastValidSnapshot.marketRegime}`
                  : 'nenhum'
              }
              last
            />
          </div>
        </SettingsCard>
      )}

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <SectionTitle className="text-[15px]">Auditoria recente</SectionTitle>
        {view?.recentAuditTrail.length ? (
          <div className="mt-3 flex flex-col gap-2">
            {view.recentAuditTrail.map(record => (
              <div
                key={record.id}
                className="rounded-[14px] px-3 py-2"
                style={{
                  background: 'color-mix(in srgb, var(--ares-surface-1) 72%, transparent)',
                  border: '1px solid var(--ares-border-soft)'
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px]" style={{ color: 'var(--ares-text-primary)' }}>
                    {record.phase}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--ares-text-tertiary)' }}>
                    {new Date(record.createdAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
                <p className="mt-1 text-[10px]" style={{ color: 'var(--ares-text-secondary)', lineHeight: 1.45 }}>
                  {Object.entries(record.payload)
                    .slice(0, 4)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(' | ')}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
            Nenhum evento registrado ainda.
          </p>
        )}
      </SettingsCard>
    </>
  )
}

export function AccountSettingsPanel({
  userProfile,
  nameDraft,
  editingName,
  setNameDraft,
  setEditingName,
  onUpdateUserProfile,
  onCycleLevel,
  onCycleStyle,
  onClearContext
}: {
  userProfile: UserProfile | null
  nameDraft: string
  editingName: boolean
  setNameDraft: (value: string) => void
  setEditingName: (value: boolean) => void
  onUpdateUserProfile: (patch: Partial<UserProfile>) => void
  onCycleLevel: () => void
  onCycleStyle: () => void
  onClearContext: () => void
}) {
  const currentName = userProfile?.display_name?.trim() || ''

  const commitName = () => {
    const trimmed = nameDraft.trim()
    if (trimmed) {
      onUpdateUserProfile({ display_name: trimmed })
    }
    setEditingName(false)
  }

  return (
    <>
      <SectionTitle className="mb-1 text-[18px]">Conta</SectionTitle>
      <div className="mt-4">
        <InlineEditableRow
          label="Nome exibido"
          editing={editingName}
          value={currentName}
          draft={nameDraft}
          placeholder={currentName || 'seu nome'}
          onStartEdit={() => { setNameDraft(''); setEditingName(true) }}
          onChangeDraft={setNameDraft}
          onCommit={commitName}
          onCancel={() => setEditingName(false)}
        />

        <SettingsRow label="Nível" value={userProfile?.user_level || 'intermediate'} onClick={onCycleLevel} />
        <SettingsRow
          label="Estilo de explicação"
          value={userProfile?.preferred_explanation_style || 'direct'}
          onClick={onCycleStyle}
        />
        <SettingsRow
          label="Limpar contexto da sessão"
          value=""
          onClick={onClearContext}
          muted
          last
        />
      </div>
    </>
  )
}

export function DataSettingsPanel({
  settings,
  isPrivate,
  screenshotMode,
  semanticState,
  sources,
  memorySummary,
  memoryEmbeddingStatus,
  memoryImportPreview,
  memoryIncludeProfile,
  memoryFeedback,
  onToggleTelemetry,
  onTogglePrivate,
  onDeleteLocalData,
  onToggleScreenshotMode,
  onSyncEmbeddings,
  onRebuildEmbeddings,
  onExportMemory,
  onSelectImportCard,
  onClearPersistedMemory,
  onToggleMemoryImportProfile,
  onApplyMemoryImport,
  onResumeSensitiveBlock,
  onSelectCaptureSource,
  labelEmbeddingState
}: {
  settings: AppSettings
  isPrivate: boolean
  screenshotMode: boolean
  semanticState: SemanticState | null
  sources: CaptureSource[]
  memorySummary: MemoryCardSummary | null
  memoryEmbeddingStatus: MemoryEmbeddingStatus | null
  memoryImportPreview: MemoryImportPreview | null
  memoryIncludeProfile: boolean
  memoryFeedback: string | null
  onToggleTelemetry: () => void
  onTogglePrivate: () => void
  onDeleteLocalData: () => void
  onToggleScreenshotMode: () => void
  onSyncEmbeddings: () => void
  onRebuildEmbeddings: () => void
  onExportMemory: () => void
  onSelectImportCard: () => void
  onClearPersistedMemory: () => void
  onToggleMemoryImportProfile: () => void
  onApplyMemoryImport: (mode: MemoryImportMode) => void
  onResumeSensitiveBlock: () => void
  onSelectCaptureSource: (source: CaptureSource | null) => void
  labelEmbeddingState: (state: MemoryEmbeddingStatus['state']) => string
}) {
  return (
    <>
      <SectionTitle className="mb-1 text-[18px]">Controle de dados</SectionTitle>
      <div className="mt-4">
        <SettingsRow
          label="Telemetria"
          value={settings.telemetryOptIn ? 'Ativada' : 'Desativada'}
          toggle={settings.telemetryOptIn}
          onClick={onToggleTelemetry}
        />
        <SettingsRow
          label="Modo privado"
          value={isPrivate ? 'Ativado' : 'Desativado'}
          toggle={isPrivate}
          onClick={onTogglePrivate}
        />
        <SettingsRow
          label="Escopo de captura"
          value={
            settings.captureScope.mode === 'selected-source'
              ? settings.captureScope.selectedSourceName || 'janela selecionada'
              : 'qualquer janela'
          }
          muted={settings.captureScope.mode !== 'selected-source'}
        />
        <SettingsRow
          label="Apagar dados locais"
          value=""
          onClick={onDeleteLocalData}
          muted
          last
        />
      </div>

      <div
        className="mt-4 rounded-[16px] overflow-hidden"
        style={{
          background: screenshotMode
            ? 'color-mix(in srgb, var(--ares-accent-soft) 36%, var(--ares-surface-1))'
            : 'color-mix(in srgb, var(--ares-surface-1) 68%, transparent)',
          border: `1px solid ${screenshotMode ? 'var(--ares-accent)' : 'var(--ares-border-soft)'}`,
          transition: 'background 0.3s, border-color 0.3s'
        }}
      >
        <button
          onMouseDown={e => { e.preventDefault(); onToggleScreenshotMode() }}
          className="w-full flex items-center justify-between gap-4 px-4 transition-opacity duration-150 hover:opacity-80 active:opacity-60"
          style={{ minHeight: 52 }}
        >
          <div className="flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2.5" stroke={screenshotMode ? 'var(--ares-accent)' : 'var(--ares-text-secondary)'} strokeWidth="1.5" />
              <circle cx="12" cy="12" r="3" stroke={screenshotMode ? 'var(--ares-accent)' : 'var(--ares-text-secondary)'} strokeWidth="1.5" />
              <path d="M15 5V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v1" stroke={screenshotMode ? 'var(--ares-accent)' : 'var(--ares-text-secondary)'} strokeWidth="1.5" />
            </svg>
            <div>
              <span
                className="text-[13px] font-medium"
                style={{ color: screenshotMode ? 'var(--ares-accent)' : 'var(--ares-text-primary)' }}
              >
                Modo screenshot
              </span>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ares-text-tertiary)' }}>
                {screenshotMode ? 'Captura pausada · restaura em 30s' : 'Torna o HUD visivel em prints'}
              </p>
            </div>
          </div>
          <Toggle on={screenshotMode} />
        </button>
      </div>

      <SettingsCard
        className="mt-5 rounded-[20px] overflow-hidden"
        elevated
        style={{
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)'
        }}
      >
        <div
          className="px-5 pt-5 pb-4"
          style={{ borderBottom: '1px solid var(--ares-border-soft)' }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center rounded-[12px]"
                style={{
                  width: 36,
                  height: 36,
                  background: 'linear-gradient(135deg, rgba(90,130,240,0.22), rgba(90,130,240,0.08))',
                  border: '1px solid rgba(90,130,240,0.18)'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="rgba(120,160,255,0.85)" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M12 22V12" stroke="rgba(120,160,255,0.6)" strokeWidth="1.5" />
                  <path d="M21 7l-9 5-9-5" stroke="rgba(120,160,255,0.6)" strokeWidth="1.5" />
                </svg>
              </div>
              <div>
                <SectionTitle className="text-[15px]">Memory Card</SectionTitle>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ares-text-tertiary)' }}>
                  Perfil + memória persistida
                </p>
              </div>
            </div>
            {memorySummary && (
              <StatusBadge tone="accent">
                {memorySummary.item_count} memórias
              </StatusBadge>
            )}
          </div>
        </div>

        {memorySummary && (
          <div className="px-5">
            <SettingsRow label="Dono" value={memorySummary.owner_name || 'sem nome'} />
            <SettingsRow label="Perfil" value={memorySummary.profile_summary} />
            <SettingsRow label="Impacto" value={memorySummary.impact_summary} last />
          </div>
        )}

        {memoryEmbeddingStatus && (
          <SettingsCard className="mx-4 mt-3 rounded-[14px] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium" style={{ color: 'var(--ares-text-primary)' }}>
                  Embeddings
                </p>
                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--ares-text-tertiary)' }}>
                  {memoryEmbeddingStatus.embedding_model}
                </p>
              </div>
              <StatusBadge
                className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                tone={memoryEmbeddingStatus.state === 'ready' ? 'success' : 'accent'}
              >
                {labelEmbeddingState(memoryEmbeddingStatus.state)}
              </StatusBadge>
            </div>

            <div className="mt-2.5">
              <SettingsRow
                label="Itens indexados"
                value={String(memoryEmbeddingStatus.indexed_count)}
              />
              <SettingsRow
                label="Último sync"
                value={
                  memoryEmbeddingStatus.last_synced_at
                    ? new Date(memoryEmbeddingStatus.last_synced_at).toLocaleString('pt-BR')
                    : 'ainda não sincronizado'
                }
                last={!memoryEmbeddingStatus.error}
              />
              {memoryEmbeddingStatus.error ? (
                <p className="mt-2 text-[11px]" style={{ color: 'var(--ares-danger)', lineHeight: 1.45 }}>
                  {memoryEmbeddingStatus.error}
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex gap-2">
              <PillButton
                onMouseDown={e => { e.preventDefault(); onSyncEmbeddings() }}
                tone="accent"
              >
                sincronizar
              </PillButton>
              <PillButton
                onMouseDown={e => { e.preventDefault(); onRebuildEmbeddings() }}
              >
                reindexar
              </PillButton>
            </div>
          </SettingsCard>
        )}

        {memorySummary?.highlight_texts?.length ? (
          <div className="mx-5 mt-4 flex flex-col gap-1.5">
            {memorySummary.highlight_texts.map(text => (
              <p
                key={text}
                className="text-[11px]"
                style={{ color: 'rgba(255,255,255,0.44)', lineHeight: 1.5 }}
              >
                {text}
              </p>
            ))}
          </div>
        ) : null}

        <SettingsActionStrip>
          <PillButton
            onMouseDown={e => { e.preventDefault(); onExportMemory() }}
            tone="accent"
          >
            Exportar
          </PillButton>
          <PillButton
            onMouseDown={e => { e.preventDefault(); onSelectImportCard() }}
          >
            Importar
          </PillButton>
          <PillButton
            onMouseDown={e => { e.preventDefault(); onClearPersistedMemory() }}
            tone="danger"
          >
            Limpar
          </PillButton>
        </SettingsActionStrip>

        {memoryImportPreview && (
          <SettingsCard className="mx-4 mb-4 rounded-[14px] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium" style={{ color: 'var(--ares-text-primary)' }}>
                  {memoryImportPreview.file_name}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
                  {memoryImportPreview.summary.profile_summary}
                </p>
              </div>
              <StatusBadge
                className="px-2 py-0.5 rounded-full text-[9px] font-medium"
                tone={memoryImportPreview.conflicts > 0 ? 'accent' : 'success'}
              >
                {memoryImportPreview.conflicts} conflitos
              </StatusBadge>
            </div>

            <p className="mt-3 text-[11px]" style={{ color: 'var(--ares-text-secondary)', lineHeight: 1.5 }}>
              {memoryImportPreview.summary.impact_summary}
            </p>

            <button
              onMouseDown={e => { e.preventDefault(); onToggleMemoryImportProfile() }}
              className="mt-3 w-full flex items-center justify-between gap-4"
              style={{ minHeight: 40 }}
            >
              <span className="text-[12px]" style={{ color: 'var(--ares-text-primary)' }}>
                Aplicar perfil do cartão
              </span>
              <Toggle on={memoryIncludeProfile} />
            </button>

            <div className="mt-3 flex gap-2.5">
              <PillButton
                onMouseDown={e => { e.preventDefault(); onApplyMemoryImport('merge') }}
                tone="success"
              >
                Mesclar
              </PillButton>
              <PillButton
                onMouseDown={e => { e.preventDefault(); onApplyMemoryImport('replace') }}
                tone="accent"
              >
                Substituir
              </PillButton>
            </div>
          </SettingsCard>
        )}

        {memoryFeedback && (
          <p className="mx-5 mb-4 text-[11px]" style={{ color: 'var(--ares-text-secondary)' }}>
            {memoryFeedback}
          </p>
        )}
      </SettingsCard>

      {semanticState?.capture_policy === 'blocked-sensitive' && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px]" style={{ color: 'var(--ares-text-secondary)' }}>
            Captura pausada: {semanticState.sensitivity_reason || 'superficie sensivel'}
          </p>
          <PillButton
            onMouseDown={e => {
              e.preventDefault()
              onResumeSensitiveBlock()
            }}
          >
            retomar
          </PillButton>
        </div>
      )}

      {sources.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
            Janelas disponíveis
          </p>
          <div className="flex gap-2 flex-wrap">
            {sources.slice(0, 5).map(source => (
              <PillButton
                key={source.id}
                onMouseDown={e => {
                  e.preventDefault()
                  onSelectCaptureSource(source)
                }}
                disabled={source.blocked}
                active={source.selected}
                tone={source.selected ? 'strong' : 'neutral'}
              >
                {source.name.slice(0, 22)}
              </PillButton>
            ))}
            {settings.captureScope.mode === 'selected-source' && (
              <PillButton
                onMouseDown={e => {
                  e.preventDefault()
                  onSelectCaptureSource(null)
                }}
              >
                liberar escopo
              </PillButton>
            )}
          </div>
        </>
      )}
    </>
  )
}

export function APISettingsPanel({
  settings,
  aiSettings,
  selectedProvider,
  activeProviderId,
  providerDraft,
  apiFeedback,
  isTestingProvider,
  codexStatus,
  codexLoading,
  codexError,
  diagnostics,
  privacy,
  lastDeletion,
  aiCosts,
  dailyCostDraft,
  costAlert,
  featureTaskLabels,
  featureTierLabels,
  onSelectProvider,
  onUpdateProviderDraft,
  onSelectProviderModel,
  onSaveProvider,
  onTestProvider,
  onRemoveProvider,
  onDailyCostDraftChange,
  onCommitDailyCostLimit,
  onResetDailyCostLimit,
  onUpdateAIRouting,
  onCodexLogin,
  onCodexLogout,
  onToggleCrashReporting,
  onToggleAdvancedPerception
}: {
  settings: AppSettings
  aiSettings: AISettingsSnapshot | null
  selectedProvider: AIProviderSnapshot | null
  activeProviderId: AIProviderId
  providerDraft: { apiKey: string; baseUrl: string; selectedModel: string }
  apiFeedback: string | null
  isTestingProvider: AIProviderId | null
  codexStatus: AuthStatus
  codexLoading: boolean
  codexError: string | null
  diagnostics: DiagnosticsSnapshot | null
  privacy: PrivacySnapshot | null
  lastDeletion: DataDeletionSummary | null
  aiCosts: AICostSnapshot | null
  dailyCostDraft: string
  costAlert: { level: 'none' | 'warning' | 'danger' | 'blocked'; label: string; message: string }
  featureTaskLabels: Record<AIFeatureTask, string>
  featureTierLabels: Record<AIFeatureTier, string>
  onSelectProvider: (providerId: AIProviderId) => void
  onUpdateProviderDraft: (patch: Partial<{ apiKey: string; baseUrl: string; selectedModel: string }>) => void
  onSelectProviderModel: (providerId: AIProviderId, modelId: string, modelLabel: string) => void
  onSaveProvider: () => void
  onTestProvider: () => void
  onRemoveProvider: () => void
  onDailyCostDraftChange: (value: string) => void
  onCommitDailyCostLimit: () => void
  onResetDailyCostLimit: () => void
  onUpdateAIRouting: (patch: Partial<AISettingsSnapshot['routing']>) => void
  onCodexLogin: () => void
  onCodexLogout: () => void
  onToggleCrashReporting: () => void
  onToggleAdvancedPerception: () => void
}) {
  if (!aiSettings || !selectedProvider) {
    return (
      <p className="mt-4 text-[13px]" style={{ color: 'var(--ares-text-secondary)' }}>
        Carregando provedores...
      </p>
    )
  }

  return (
    <>
      <SectionTitle>Minha API Key</SectionTitle>

      <div className="mt-4 flex gap-2 flex-wrap">
        {aiSettings.providers.map(provider => (
          <PillButton
            key={provider.id}
            onClick={() => onSelectProvider(provider.id)}
            active={provider.id === activeProviderId}
            className="px-3 py-1.5 rounded-full text-[11px]"
            tone={provider.id === activeProviderId ? 'strong' : 'neutral'}
          >
            {provider.label}
          </PillButton>
        ))}
      </div>

      <SettingsCard className="mt-5 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[15px]" style={{ color: 'var(--ares-text-strong)' }}>
              {selectedProvider.label}
            </p>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              {selectedProvider.capabilities.localOnly
                ? 'projeto local e fallback privado'
                : 'sua chave fica salva apenas neste dispositivo'}
            </p>
          </div>
          <StatusBadge tone={selectedProvider.status === 'valid' ? 'success' : 'neutral'}>
            {selectedProvider.status}
          </StatusBadge>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {!selectedProvider.capabilities.localOnly && (
            <label className="flex flex-col gap-2">
              <span className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
                API key
              </span>
              <input
                value={providerDraft.apiKey}
                onChange={e => onUpdateProviderDraft({ apiKey: e.target.value })}
                placeholder={selectedProvider.hasKey ? '••••••••••••••••' : 'cole sua chave aqui'}
                className="bg-transparent outline-none rounded-xl px-3 h-10"
                style={{
                  color: 'var(--ares-text-primary)',
                  border: '1px solid var(--ares-border-strong)'
                }}
              />
            </label>
          )}

          <label className="flex flex-col gap-2">
            <span className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Base URL
            </span>
            <input
              value={providerDraft.baseUrl}
              onChange={e => onUpdateProviderDraft({ baseUrl: e.target.value })}
              className="bg-transparent outline-none rounded-xl px-3 h-10"
              style={{
                color: 'var(--ares-text-primary)',
                border: '1px solid var(--ares-border-strong)'
              }}
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.44)' }}>
              Modelo
            </span>
            <div className="flex gap-2 flex-wrap">
              {selectedProvider.modelOptions.map(model => (
                <PillButton
                  key={model.id}
                  onMouseDown={e => {
                    e.preventDefault()
                    onSelectProviderModel(selectedProvider.id, model.id, model.label)
                  }}
                  active={providerDraft.selectedModel === model.id}
                >
                  {model.label}
                </PillButton>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          <PillButton onMouseDown={e => { e.preventDefault(); onSaveProvider() }} tone="strong">
            salvar
          </PillButton>
          <PillButton onMouseDown={e => { e.preventDefault(); onTestProvider() }}>
            {isTestingProvider === selectedProvider.id ? 'testando...' : 'testar conexão'}
          </PillButton>
          <PillButton onMouseDown={e => { e.preventDefault(); onRemoveProvider() }} tone="danger">
            remover
          </PillButton>
        </div>

        {apiFeedback && (
          <p className="mt-3 text-[11px]" style={{ color: 'var(--ares-text-secondary)' }}>
            {apiFeedback}
          </p>
        )}
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionTitle className="text-[15px]">Custo diário</SectionTitle>
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              Defina um teto diário em dólar para uso de API.
            </p>
          </div>
          <StatusBadge tone="neutral">
            {settings.dailyCostLimitUsd === null ? 'sem limite' : `$${settings.dailyCostLimitUsd.toFixed(2)}/dia`}
          </StatusBadge>
        </div>

        {costAlert.level !== 'none' && (
          <div
            className="mt-3 rounded-[16px] px-3 py-2.5"
            style={{
              background:
                costAlert.level === 'blocked'
                  ? 'color-mix(in srgb, var(--ares-danger-soft) 60%, var(--ares-surface-1))'
                  : costAlert.level === 'danger'
                    ? 'color-mix(in srgb, var(--ares-danger-soft) 40%, var(--ares-surface-1))'
                    : 'color-mix(in srgb, var(--ares-surface-1) 72%, transparent)',
              border:
                costAlert.level === 'blocked'
                  ? '1px solid var(--ares-danger)'
                  : costAlert.level === 'danger'
                    ? '1px solid color-mix(in srgb, var(--ares-danger) 60%, transparent)'
                    : '1px solid var(--ares-border-soft)'
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px]" style={{ color: 'var(--ares-text-primary)' }}>
                Atenção de custo
              </p>
              <StatusBadge className="px-2 py-1 rounded-full text-[10px]" tone="neutral">
                {costAlert.label}
              </StatusBadge>
            </div>
            <p className="mt-2 text-[11px]" style={{ color: 'var(--ares-text-secondary)', lineHeight: 1.45 }}>
              {costAlert.message}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <span className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
            Teto diário em USD
          </span>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center rounded-xl px-3 h-10 flex-1"
              style={{ border: '1px solid var(--ares-border-strong)' }}
            >
              <span className="text-[12px] mr-2" style={{ color: 'var(--ares-text-tertiary)' }}>$</span>
              <input
                value={dailyCostDraft}
                onChange={e => onDailyCostDraftChange(e.target.value)}
                onBlur={onCommitDailyCostLimit}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onCommitDailyCostLimit()
                  }
                  if (e.key === 'Escape') {
                    onDailyCostDraftChange(
                      settings.dailyCostLimitUsd === null ? '' : settings.dailyCostLimitUsd.toFixed(2)
                    )
                  }
                }}
                inputMode="decimal"
                placeholder="ex: 2.50"
                className="bg-transparent outline-none w-full text-[13px]"
                style={{ color: 'var(--ares-text-primary)' }}
              />
            </div>
            <PillButton onMouseDown={e => { e.preventDefault(); onResetDailyCostLimit() }} className="flex-shrink-0">
              sem limite
            </PillButton>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)', lineHeight: 1.45 }}>
            Esse valor fica salvo na configuração do app e pode ser usado como teto operacional para chamadas remotas.
          </p>
          {aiCosts && (
            <div className="mt-2">
              <SettingsRow label="Gasto hoje" value={`$${aiCosts.spentUsd.toFixed(4)}`} />
              <SettingsRow
                label="Restante"
                value={aiCosts.remainingUsd === null ? 'sem limite' : `$${aiCosts.remainingUsd.toFixed(4)}`}
              />
              {aiCosts.byFeature && (Object.entries(aiCosts.byFeature) as [AIFeatureTask, number][])
                .filter(([, cost]) => cost > 0)
                .map(([task, cost], idx, arr) => (
                  <SettingsRow
                    key={task}
                    label={featureTaskLabels[task]}
                    value={`$${cost.toFixed(5)}`}
                    last={idx === arr.length - 1}
                  />
                ))
              }
              {aiCosts.byFeature && (Object.values(aiCosts.byFeature) as number[]).every(c => c === 0) && (
                <SettingsRow label="por feature" value="sem dados hoje" last />
              )}
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <SectionTitle className="text-[15px]">ChatGPT (Codex OAuth)</SectionTitle>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--ares-text-tertiary)', lineHeight: 1.5 }}>
          Use sua assinatura ChatGPT Plus/Pro sem API key. Ares vai priorizar esse provider quando estiver conectado.
        </p>

        <div className="mt-4">
          {codexStatus.authenticated ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px]" style={{ color: 'var(--ares-text-primary)' }}>
                  {codexStatus.email}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
                  plano: {codexStatus.planType}
                </p>
              </div>
              <PillButton onMouseDown={e => { e.preventDefault(); onCodexLogout() }} className="flex-shrink-0">
                desconectar
              </PillButton>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <PillButton
                onMouseDown={e => { e.preventDefault(); onCodexLogin() }}
                disabled={codexLoading}
                className="self-start"
                tone="strong"
              >
                {codexLoading ? 'abrindo browser...' : 'conectar com ChatGPT'}
              </PillButton>
              {codexError && (
                <p className="text-[11px]" style={{ color: 'var(--ares-danger)' }}>
                  {codexError}
                </p>
              )}
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard className="mt-4 rounded-[22px] p-4">
        <SectionTitle className="text-[15px]">Roteamento</SectionTitle>

        <div className="mt-4">
          <SettingsRow label="Primario de texto" value={aiSettings.routing.textPrimary || 'local'} />
          <SettingsRow label="Fallback" value={aiSettings.routing.textFallback || 'sem fallback'} />
          <SettingsRow
            label="Preferir local em conteúdo sensível"
            value={aiSettings.routing.preferLocalForSensitive ? 'Ativado' : 'Desativado'}
            toggle={aiSettings.routing.preferLocalForSensitive}
            onClick={() =>
              onUpdateAIRouting({
                preferLocalForSensitive: !aiSettings.routing.preferLocalForSensitive
              })
            }
            last
          />
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          {(['openai', 'anthropic', 'gemini', 'ollama'] as AIProviderId[]).map(providerId => (
            <PillButton
              key={`primary-${providerId}`}
              onMouseDown={e => {
                e.preventDefault()
                onUpdateAIRouting({
                  textPrimary: aiSettings.routing.textPrimary === providerId ? null : providerId
                })
              }}
              active={aiSettings.routing.textPrimary === providerId}
              tone={aiSettings.routing.textPrimary === providerId ? 'strong' : 'neutral'}
            >
              primario: {providerId}
            </PillButton>
          ))}
        </div>

        <div className="mt-2 flex gap-2 flex-wrap">
          {(['openai', 'anthropic', 'gemini', 'ollama'] as AIProviderId[]).map(providerId => (
            <PillButton
              key={`fallback-${providerId}`}
              onMouseDown={e => {
                e.preventDefault()
                onUpdateAIRouting({
                  textFallback: aiSettings.routing.textFallback === providerId ? null : providerId
                })
              }}
              active={aiSettings.routing.textFallback === providerId}
              tone={aiSettings.routing.textFallback === providerId ? 'strong' : 'neutral'}
            >
              fallback: {providerId}
            </PillButton>
          ))}
        </div>

        <p className="mt-4 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
          Trilha por feature
        </p>
        <div className="mt-2">
          {(Object.entries(aiSettings.routing.featureRouting ?? {}) as [AIFeatureTask, AIFeatureTier][])
            .map(([task, tier], idx, arr) => (
              <SettingsRow
                key={task}
                label={featureTaskLabels[task]}
                value={featureTierLabels[tier]}
                last={idx === arr.length - 1}
              />
            ))
          }
        </div>
      </SettingsCard>

      <div className="mt-4">
        <SettingsRow
          label="Crash reporting"
          value={settings.featureFlags.crashReporting ? 'Ativado' : 'Desativado'}
          toggle={settings.featureFlags.crashReporting}
          onClick={onToggleCrashReporting}
        />
        <SettingsRow
          label="Advanced perception"
          value={settings.featureFlags.advancedPerception ? 'Ativado' : 'Desativado'}
          toggle={settings.featureFlags.advancedPerception}
          onClick={onToggleAdvancedPerception}
          last
        />
      </div>

      {diagnostics && privacy && (
        <p className="mt-4 text-[11px]" style={{ color: 'var(--ares-text-tertiary)' }}>
          storage seguro: {aiSettings.secureStorageAvailable ? 'sim' : 'modo básico'} | traces:{' '}
          {diagnostics.performance.traceCount} | consentimentos: {privacy.consentTrail.length}
          {lastDeletion ? ' | limpeza registrada' : ''}
        </p>
      )}

      {diagnostics?.latestTutorDebug && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ares-text-muted)' }}>
          ultima resposta: {diagnostics.latestTutorDebug.dominantContextSource} via {diagnostics.latestTutorDebug.model}
          {diagnostics.latestTutorDebug.latencyMs !== null ? ` | ${diagnostics.latestTutorDebug.latencyMs} ms` : ''}
          {diagnostics.latestTutorDebug.screenAgeMs !== null ? ` | frame ${diagnostics.latestTutorDebug.screenAgeMs} ms` : ''}
          {diagnostics.latestTutorDebug.staleContextGuarded ? ' | fresh-screen guard' : ''}
        </p>
      )}
    </>
  )
}
