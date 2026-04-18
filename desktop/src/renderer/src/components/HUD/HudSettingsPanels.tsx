import type {
  AppSettings,
  CaptureSource,
  ConnectorStatus,
  SemanticState,
  SessionMemory,
  TradingViewConnectorState,
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
import type { SpotifyPlaybackState, TickerQuote } from '../../../../preload/index.d'
import {
  FloatingFormCard,
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
import { SpotifyBanner } from './SpotifyBanner'

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
            <p className="text-[12px] pb-2" style={{ color: 'var(--john-danger)' }}>
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
        <p className="text-[11px]" style={{ color: 'var(--john-text-tertiary)' }}>
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
        <p className="text-[11px]" style={{ color: 'var(--john-text-tertiary)' }}>
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
        <p className="text-[11px]" style={{ color: 'var(--john-text-tertiary)' }}>
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

        <SettingsRow label="Nivel" value={userProfile?.user_level || 'intermediate'} onClick={onCycleLevel} />
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
            ? 'color-mix(in srgb, var(--john-accent-soft) 36%, var(--john-surface-1))'
            : 'color-mix(in srgb, var(--john-surface-1) 68%, transparent)',
          border: `1px solid ${screenshotMode ? 'var(--john-accent)' : 'var(--john-border-soft)'}`,
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
              <rect x="3" y="5" width="18" height="14" rx="2.5" stroke={screenshotMode ? 'var(--john-accent)' : 'var(--john-text-secondary)'} strokeWidth="1.5" />
              <circle cx="12" cy="12" r="3" stroke={screenshotMode ? 'var(--john-accent)' : 'var(--john-text-secondary)'} strokeWidth="1.5" />
              <path d="M15 5V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v1" stroke={screenshotMode ? 'var(--john-accent)' : 'var(--john-text-secondary)'} strokeWidth="1.5" />
            </svg>
            <div>
              <span
                className="text-[13px] font-medium"
                style={{ color: screenshotMode ? 'var(--john-accent)' : 'var(--john-text-primary)' }}
              >
                Modo screenshot
              </span>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--john-text-tertiary)' }}>
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
          style={{ borderBottom: '1px solid var(--john-border-soft)' }}
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
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--john-text-tertiary)' }}>
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
                <p className="text-[12px] font-medium" style={{ color: 'var(--john-text-primary)' }}>
                  Embeddings
                </p>
                <p className="mt-0.5 text-[10px]" style={{ color: 'var(--john-text-tertiary)' }}>
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
                label="Ultimo sync"
                value={
                  memoryEmbeddingStatus.last_synced_at
                    ? new Date(memoryEmbeddingStatus.last_synced_at).toLocaleString('pt-BR')
                    : 'ainda nao sincronizado'
                }
                last={!memoryEmbeddingStatus.error}
              />
              {memoryEmbeddingStatus.error ? (
                <p className="mt-2 text-[11px]" style={{ color: 'var(--john-danger)', lineHeight: 1.45 }}>
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
                <p className="text-[13px] font-medium" style={{ color: 'var(--john-text-primary)' }}>
                  {memoryImportPreview.file_name}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: 'var(--john-text-tertiary)' }}>
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

            <p className="mt-3 text-[11px]" style={{ color: 'var(--john-text-secondary)', lineHeight: 1.5 }}>
              {memoryImportPreview.summary.impact_summary}
            </p>

            <button
              onMouseDown={e => { e.preventDefault(); onToggleMemoryImportProfile() }}
              className="mt-3 w-full flex items-center justify-between gap-4"
              style={{ minHeight: 40 }}
            >
              <span className="text-[12px]" style={{ color: 'var(--john-text-primary)' }}>
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
          <p className="mx-5 mb-4 text-[11px]" style={{ color: 'var(--john-text-secondary)' }}>
            {memoryFeedback}
          </p>
        )}
      </SettingsCard>

      {semanticState?.capture_policy === 'blocked-sensitive' && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px]" style={{ color: 'var(--john-text-secondary)' }}>
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
          <p className="mt-5 mb-2 text-[11px]" style={{ color: 'var(--john-text-tertiary)' }}>
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

export function GeneralSettingsPanel({
  settings,
  userProfile,
  sessionMemory,
  connectorStatuses,
  installingVSCode,
  vscodePendingReload,
  vscodeInstallMsg,
  spotifyAuthing,
  spotifyClientIdCard,
  spotifyClientIdDraft,
  tickerCard,
  tickerDraft,
  tickerQuote,
  tradingViewState,
  spotifyState,
  onToggleMinimalMode,
  onVSCodeAction,
  onSpotifyAction,
  onTradingViewAction,
  onOpenSpotifyClientIdCard,
  onCloseSpotifyClientIdCard,
  onSpotifyClientIdDraftChange,
  onSubmitSpotifyClientId,
  onOpenTickerCard,
  onCloseTickerCard,
  onTickerDraftChange,
  onSubmitTicker,
  onTogglePlay,
  onNext,
  onPrev,
  onShuffle,
  onRepeat
}: {
  settings: AppSettings
  userProfile: UserProfile | null
  sessionMemory: SessionMemory | null
  connectorStatuses: ConnectorStatus[]
  installingVSCode: boolean
  vscodePendingReload: boolean
  vscodeInstallMsg: string | null
  spotifyAuthing: boolean
  spotifyClientIdCard: boolean
  spotifyClientIdDraft: string
  tickerCard: boolean
  tickerDraft: string
  tickerQuote: TickerQuote | null
  tradingViewState: TradingViewConnectorState | null
  spotifyState: SpotifyPlaybackState | null
  onToggleMinimalMode: () => void
  onVSCodeAction: () => void
  onSpotifyAction: () => void
  onTradingViewAction: () => void
  onOpenSpotifyClientIdCard: () => void
  onCloseSpotifyClientIdCard: () => void
  onSpotifyClientIdDraftChange: (value: string) => void
  onSubmitSpotifyClientId: () => void
  onOpenTickerCard: () => void
  onCloseTickerCard: () => void
  onTickerDraftChange: (value: string) => void
  onSubmitTicker: () => void
  onTogglePlay: () => void
  onNext: () => void
  onPrev: () => void
  onShuffle: () => void
  onRepeat: () => void
}) {
  const vscodeStatus = connectorStatuses.find(s => s.id === 'vscode')
  const vscodeConnected = vscodeStatus?.connected ?? false
  const spotifyConnected = connectorStatuses.find(s => s.id === 'spotify')?.connected ?? false
  const tradingViewConnected = connectorStatuses.find(s => s.id === 'tradingview')?.connected ?? false
  const sym = settings.tickerSymbol?.trim()

  return (
    <>
      <SectionTitle className="mb-1 text-[18px]">Geral</SectionTitle>
      <div className="mt-4">
        <SettingsRow
          label="Modo minimalista"
          value={settings.minimalMode ? 'ativado' : 'desativado'}
          toggle={settings.minimalMode}
          onClick={onToggleMinimalMode}
        />
        <SettingsRow label="Cor de fundo" value="Preto" />
        <SettingsRow label="Idioma" value={userProfile?.response_language || 'Português'} last />
      </div>

      {sessionMemory?.continuity_summary && (
        <p className="mt-4 text-[11px]" style={{ color: 'var(--john-text-secondary)' }}>
          {sessionMemory.continuity_summary}
        </p>
      )}

      <SectionTitle className="mt-8 mb-1 text-[18px]">Biblioteca</SectionTitle>
      <div className="mt-4 flex gap-5">
        <div className="flex flex-col items-center gap-2" style={{ width: 72 }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.685 1.28739C22.4364 1.29611 22.1884 1.36091 21.9663 1.47739C22.5455 1.76411 22.9541 2.33039 23.0213 3.00239C23.0328 3.08303 23.04 3.15655 23.04 3.19239V28.7924C23.04 29.5514 22.5962 30.202 21.9575 30.5136C22.1905 30.641 22.4506 30.7124 22.72 30.7124C22.9587 30.7124 23.184 30.6571 23.3875 30.5636L23.3888 30.5661C24.4179 30.0337 29.5631 27.3693 29.7525 27.2611C30.3496 26.9187 30.72 26.2791 30.72 25.5924V6.39239C30.72 5.75367 30.4037 5.15951 29.8738 4.80239C29.669 4.66351 23.4125 1.43114 23.4125 1.43114L23.4113 1.43364C23.1834 1.32644 22.9337 1.27867 22.685 1.28739ZM21.12 2.55239C20.9563 2.55239 20.7923 2.61477 20.6675 2.73989C20.6675 2.73989 17.0038 6.85995 12.9475 11.4174L17.7438 15.3411L21.76 11.9586V3.19239C21.76 3.02855 21.6973 2.86469 21.5725 2.73989C21.4474 2.61477 21.2838 2.55239 21.12 2.55239ZM5.12003 7.03239C5.02019 7.03239 4.8345 7.03274 4.00378 7.41739C3.54618 7.62923 1.95253 8.46614 1.95253 8.46614C1.74133 8.5807 1.57096 8.76003 1.45128 8.96739C1.49992 8.9597 1.54822 8.95238 1.59878 8.95238H1.60003C2.02755 8.95238 2.28973 9.25075 2.38253 9.34739C2.38253 9.34739 20.4352 29.0126 20.6675 29.2449C20.7923 29.3697 20.9549 29.4324 21.1188 29.4324C21.2826 29.4324 21.4465 29.3697 21.5713 29.2449C21.6961 29.1201 21.76 28.9562 21.76 28.7924V20.2611C21.76 20.2611 6.10163 7.46345 5.98003 7.36488C5.74451 7.15112 5.43811 7.03239 5.12003 7.03239ZM1.40753 10.2324C1.33713 10.2324 1.28003 10.2901 1.28003 10.3611V22.2686C1.28003 22.3371 1.33591 22.3936 1.40503 22.3936C1.44087 22.3936 1.47263 22.3773 1.49503 22.3524L5.12003 18.3286V14.0849L1.49878 10.2699C1.47574 10.2468 1.44273 10.2324 1.40753 10.2324ZM7.84253 17.1536C7.84253 17.1536 2.3415 23.3297 2.27878 23.3924C2.10534 23.5658 1.86563 23.6724 1.60003 23.6724C1.55011 23.6724 1.50178 23.6663 1.45378 23.6586C1.58306 23.8833 1.77265 24.0685 2.00753 24.1824L2.00503 24.1861C2.56183 24.469 4.39936 25.4026 4.64128 25.5011C4.7936 25.5619 4.95427 25.5924 5.12003 25.5924C5.34211 25.5924 5.56166 25.535 5.75878 25.4224C5.7735 25.4141 11.2175 20.8336 11.2175 20.8336L7.84253 17.1536Z" fill="#0C75FF"/>
          </svg>
          <span className="text-[12px]" style={{ color: 'var(--john-text-secondary)', letterSpacing: 'var(--hud-muted-tracking, -0.01em)' }}>Vs Code</span>
          <button
            onMouseDown={e => e.preventDefault()}
            disabled={installingVSCode || vscodePendingReload}
            onClick={onVSCodeAction}
            className="transition-opacity duration-150 hover:opacity-80 active:opacity-50 disabled:opacity-50 disabled:cursor-default"
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: vscodeConnected ? 'color-mix(in srgb, var(--john-surface-2) 82%, transparent)' : 'var(--john-text-primary)', color: vscodeConnected ? 'var(--john-text-secondary)' : 'var(--john-surface-0)', letterSpacing: 'var(--hud-muted-tracking, -0.01em)', fontWeight: 500 }}
          >
            {installingVSCode ? 'Instalando…' : vscodePendingReload ? 'Aguardando…' : vscodeConnected ? 'Desconectar' : 'Conectar'}
          </button>
          {!vscodeConnected && vscodeStatus?.message && (
            <span className="text-center text-[9px]" style={{ color: 'var(--john-text-muted)', lineHeight: 1.3, maxWidth: 120 }}>
              bridge indisponível
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-2" style={{ width: 72 }}>
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 0C6.72911 0 0 6.7291 0 15C0 23.2709 6.72911 30 15 30C23.2709 30 30 23.2715 30 15C30 6.72845 23.2709 0 15 0ZM21.349 21.7421C21.1606 22.0251 20.8503 22.1776 20.5341 22.1776C20.3477 22.1776 20.1593 22.1248 19.9924 22.0133C18.3802 20.9383 15.6461 20.2212 13.3643 20.2219C10.9431 20.2232 9.12817 20.8177 9.10991 20.8236C8.59881 20.997 8.04403 20.718 7.87322 20.2056C7.70242 19.6932 7.97949 19.139 8.49189 18.9689C8.57795 18.9402 10.6295 18.2681 13.3643 18.2668C15.6461 18.2655 18.8196 18.8809 21.0778 20.3862C21.5277 20.686 21.6489 21.293 21.349 21.7421ZM23.2996 17.7394C23.0877 18.0797 22.722 18.2668 22.3484 18.2668C22.1463 18.2668 21.9416 18.2127 21.7578 18.0973C18.8346 16.2758 15.8305 15.8905 13.2424 15.9133C10.3205 15.9394 7.98405 16.4968 7.94428 16.5085C7.35299 16.6767 6.73106 16.3312 6.56221 15.7373C6.39337 15.1421 6.73954 14.5234 7.33409 14.3553C7.51467 14.3038 9.84658 13.7301 13.039 13.7033C15.9498 13.6792 19.5771 14.101 22.9423 16.1976C23.4658 16.5235 23.6268 17.2146 23.2996 17.7394ZM25.2456 13.0586C25.0024 13.4719 24.5669 13.702 24.1197 13.702C23.8954 13.702 23.6686 13.644 23.4606 13.5228C20.0537 11.5227 15.9114 11.0983 13.0364 11.0944C13.0227 11.0944 13.009 11.0944 12.9953 11.0944C9.51867 11.0944 6.84124 11.7059 6.81451 11.7124C6.11174 11.8734 5.41223 11.4392 5.24925 10.7378C5.08627 10.0369 5.5211 9.33678 6.22191 9.17315C6.34252 9.14512 9.20314 8.48668 12.9953 8.48668C13.0103 8.48668 13.0253 8.48668 13.0403 8.48668C16.238 8.49124 20.8705 8.97757 24.7814 11.2736C25.402 11.6387 25.61 12.438 25.2456 13.0586Z" fill="#2DFF42"/>
          </svg>
          <span className="text-[12px]" style={{ color: 'var(--john-text-secondary)', letterSpacing: 'var(--hud-muted-tracking, -0.01em)' }}>Spotify</span>
          <button
            onMouseDown={e => e.preventDefault()}
            disabled={spotifyAuthing}
            onClick={onSpotifyAction}
            className="transition-opacity duration-150 hover:opacity-80 active:opacity-50 disabled:opacity-50 disabled:cursor-default"
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: spotifyConnected ? 'color-mix(in srgb, var(--john-surface-2) 82%, transparent)' : 'var(--john-text-primary)', color: spotifyConnected ? 'var(--john-text-secondary)' : 'var(--john-surface-0)', letterSpacing: 'var(--hud-muted-tracking, -0.01em)', fontWeight: 500 }}
          >
            {spotifyAuthing ? 'Autenticando…' : spotifyConnected ? 'Desconectar' : 'Conectar'}
          </button>
        </div>

        <div className="flex flex-col items-center gap-2" style={{ width: 92 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--john-text-primary)' }}>
            <path d="M15.8654 8.2789c0 1.3541 -1.0978 2.4519 -2.452 2.4519 -1.354 0 -2.4519 -1.0978 -2.4519 -2.452 0 -1.354 1.0978 -2.4518 2.452 -2.4518 1.3541 0 2.4519 1.0977 2.4519 2.4519zM9.75 6H0v4.9038h4.8462v7.2692H9.75Zm8.5962 0H24l-5.1058 12.173h-5.6538z" fill="currentColor" />
          </svg>
          <span className="text-[12px]" style={{ color: 'var(--john-text-secondary)', letterSpacing: 'var(--hud-muted-tracking, -0.01em)' }}>TradingView</span>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={onTradingViewAction}
            className="transition-opacity duration-150 hover:opacity-80 active:opacity-50"
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: tradingViewConnected ? 'color-mix(in srgb, var(--john-surface-2) 82%, transparent)' : 'var(--john-text-primary)', color: tradingViewConnected ? 'var(--john-text-secondary)' : 'var(--john-surface-0)', letterSpacing: 'var(--hud-muted-tracking, -0.01em)', fontWeight: 500 }}
          >
            {tradingViewConnected ? 'Fechar' : 'Abrir'}
          </button>
          {tradingViewState?.symbol && (
            <div className="text-center leading-tight" style={{ maxWidth: 120 }}>
              <span className="block text-[10px]" style={{ color: 'var(--john-text-tertiary)' }}>
                {tradingViewState.symbol}
                {tradingViewState.timeframe ? ` · ${tradingViewState.timeframe}` : ''}
              </span>
              {tradingViewState.currentPrice && (
                <span className="block text-[10px]" style={{ color: 'var(--john-text-secondary)' }}>
                  {tradingViewState.currentPrice}
                  {tradingViewState.priceChange ? ` · ${tradingViewState.priceChange}` : ''}
                </span>
              )}
              {(tradingViewState.recentHigh || tradingViewState.recentLow) && (
                <span className="block text-[9px]" style={{ color: 'var(--john-text-muted)' }}>
                  H {tradingViewState.recentHigh ?? '?'} · L {tradingViewState.recentLow ?? '?'}
                </span>
              )}
              {tradingViewState.ohlc.close && (
                <span className="block text-[9px]" style={{ color: 'var(--john-text-muted)' }}>
                  {tradingViewState.crosshairActive ? 'vela sob o mouse' : 'última vela'}
                  {tradingViewState.hoveredCandleTime ? ` · ${tradingViewState.hoveredCandleTime}` : ''}
                </span>
              )}
              {tradingViewState.candleStructure && (
                <span className="block text-[9px]" style={{ color: 'var(--john-text-muted)' }}>
                  {tradingViewState.candleStructure}
                </span>
              )}
              {tradingViewState.rangeState !== 'unknown' && (
                <span className="block text-[9px]" style={{ color: 'var(--john-text-muted)' }}>
                  range {tradingViewState.rangeState}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2" style={{ width: 92 }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--john-text-primary)' }}>
            <polyline points="2 12 6 8 10 14 14 9 18 13 22 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span className="text-[12px]" style={{ color: 'var(--john-text-secondary)', letterSpacing: 'var(--hud-muted-tracking, -0.01em)' }}>Cotação</span>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={onOpenTickerCard}
            className="transition-opacity duration-150 hover:opacity-80 active:opacity-50"
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', background: sym ? 'color-mix(in srgb, var(--john-surface-2) 82%, transparent)' : 'var(--john-text-primary)', color: sym ? 'var(--john-text-secondary)' : 'var(--john-surface-0)', letterSpacing: 'var(--hud-muted-tracking, -0.01em)', fontWeight: 500 }}
          >
            {sym ? sym : 'Configurar'}
          </button>
          {tickerQuote && (
            <span className="text-[10px]" style={{ color: 'var(--john-text-tertiary)' }}>
              {tickerQuote.price} <span style={{ color: tickerQuote.positive ? 'var(--john-success)' : 'var(--john-danger)' }}>{tickerQuote.change}</span>
            </span>
          )}
        </div>
      </div>

      {spotifyClientIdCard && (
        <FloatingFormCard
          title="Spotify Client ID"
          description={
            <>
              developer.spotify.com → crie um app → Redirect URI:{' '}
              <span style={{ color: 'var(--john-text-secondary)' }}>http://127.0.0.1:42002/callback</span>
            </>
          }
        >
          <input
            autoFocus
            type="text"
            placeholder="Cole o Client ID aqui"
            value={spotifyClientIdDraft}
            onChange={e => onSpotifyClientIdDraftChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onCloseSpotifyClientIdCard()
              if (e.key === 'Enter' && spotifyClientIdDraft.trim()) {
                onSubmitSpotifyClientId()
              }
            }}
            className="w-full bg-transparent outline-none text-[11px] mb-3"
            style={{ color: 'var(--john-text-primary)', border: '1px solid var(--john-border-strong)', borderRadius: 6, padding: '5px 8px', caretColor: 'white' }}
          />
          <div className="flex gap-2">
            <PillButton
              onMouseDown={e => e.preventDefault()}
              disabled={!spotifyClientIdDraft.trim()}
              onClick={onSubmitSpotifyClientId}
              className="text-[11px] px-3 py-1.5"
              tone="strong"
            >
              Conectar
            </PillButton>
            <PillButton
              onMouseDown={e => e.preventDefault()}
              onClick={onCloseSpotifyClientIdCard}
              className="text-[11px] px-3 py-1.5"
            >
              Cancelar
            </PillButton>
          </div>
        </FloatingFormCard>
      )}

      {tickerCard && (
        <FloatingFormCard
          title="Símbolo do ativo"
          description={
            <>
              Ações: <span style={{ color: 'var(--john-text-secondary)' }}>AAPL · PETR4.SA</span>
              {' · '}Cripto: <span style={{ color: 'var(--john-text-secondary)' }}>BTC-USD · ETH-USD</span>
              {' · '}Commodities: <span style={{ color: 'var(--john-text-secondary)' }}>GC=F (ouro) · CL=F (petróleo) · SI=F (prata) · NG=F (gás)</span>
              {' · '}Índices: <span style={{ color: 'var(--john-text-secondary)' }}>^GSPC · ^BVSP</span>
            </>
          }
        >
          <input
            autoFocus
            type="text"
            placeholder="Cole o símbolo aqui"
            value={tickerDraft}
            onChange={e => onTickerDraftChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') onCloseTickerCard()
              if (e.key === 'Enter' && tickerDraft.trim()) {
                onSubmitTicker()
              }
            }}
            className="w-full bg-transparent outline-none text-[11px] mb-3"
            style={{ color: 'var(--john-text-primary)', border: '1px solid var(--john-border-strong)', borderRadius: 6, padding: '5px 8px', caretColor: 'white' }}
          />
          <div className="flex gap-2">
            <PillButton
              onMouseDown={e => e.preventDefault()}
              disabled={!tickerDraft.trim()}
              onClick={onSubmitTicker}
              className="text-[11px] px-3 py-1.5"
              tone="strong"
            >
              Salvar
            </PillButton>
            <PillButton
              onMouseDown={e => e.preventDefault()}
              onClick={onCloseTickerCard}
              className="text-[11px] px-3 py-1.5"
            >
              Cancelar
            </PillButton>
          </div>
        </FloatingFormCard>
      )}

      {spotifyState && (
        <SpotifyBanner
          state={spotifyState}
          onTogglePlay={onTogglePlay}
          onNext={onNext}
          onPrev={onPrev}
          onShuffle={onShuffle}
          onRepeat={onRepeat}
        />
      )}

      {vscodeInstallMsg && (
        <p className="mt-3 text-[11px]" style={{ color: 'var(--john-text-secondary)' }}>
          {vscodeInstallMsg}
        </p>
      )}
    </>
  )
}
