import type { ReactNode } from 'react'
import type {
  AppSettings,
  ConnectorStatus,
  SessionMemory,
  TradingViewConnectorState,
  UserProfile
} from '@shared/perception.types'
import type { SpotifyPlaybackState, TickerQuote } from '../../../../preload/index.d'
import { FloatingFormCard, PillButton, SectionTitle, SettingsRow } from './HudSettingsPrimitives'
import { SpotifyBanner } from './SpotifyBanner'

const LIBRARY_LABEL_STYLE = {
  color: 'var(--ares-text-secondary)',
  letterSpacing: 'var(--hud-muted-tracking, -0.01em)'
} as const

const LIBRARY_ACTION_BUTTON_STYLE = {
  fontSize: 11,
  padding: '3px 10px',
  borderRadius: 6,
  border: 'none',
  letterSpacing: 'var(--hud-muted-tracking, -0.01em)',
  fontWeight: 500
} as const

function LibraryTile({
  icon,
  label,
  actionLabel,
  active = false,
  disabled = false,
  width = 72,
  onAction,
  children
}: {
  icon: ReactNode
  label: string
  actionLabel: string
  active?: boolean
  disabled?: boolean
  width?: number
  onAction: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2" style={{ width }}>
      {icon}
      <span className="text-[12px]" style={LIBRARY_LABEL_STYLE}>
        {label}
      </span>
      <button
        onMouseDown={e => e.preventDefault()}
        disabled={disabled}
        onClick={onAction}
        className="transition-opacity duration-150 hover:opacity-80 active:opacity-50 disabled:opacity-50 disabled:cursor-default"
        style={{
          ...LIBRARY_ACTION_BUTTON_STYLE,
          background: active ? 'color-mix(in srgb, var(--ares-surface-2) 82%, transparent)' : 'var(--ares-text-primary)',
          color: active ? 'var(--ares-text-secondary)' : 'var(--ares-surface-0)'
        }}
      >
        {actionLabel}
      </button>
      {children}
    </div>
  )
}

function FloatingInputCard({
  title,
  description,
  value,
  placeholder,
  submitLabel,
  onChange,
  onSubmit,
  onClose
}: {
  title: string
  description: ReactNode
  value: string
  placeholder: string
  submitLabel: string
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <FloatingFormCard title={title} description={description}>
      <input
        autoFocus
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter' && value.trim()) onSubmit()
        }}
        className="w-full bg-transparent outline-none text-[11px] mb-3"
        style={{
          color: 'var(--ares-text-primary)',
          border: '1px solid var(--ares-border-strong)',
          borderRadius: 6,
          padding: '5px 8px',
          caretColor: 'white'
        }}
      />
      <div className="flex gap-2">
        <PillButton
          onMouseDown={e => e.preventDefault()}
          disabled={!value.trim()}
          onClick={onSubmit}
          className="text-[11px] px-3 py-1.5"
          tone="strong"
        >
          {submitLabel}
        </PillButton>
        <PillButton
          onMouseDown={e => e.preventDefault()}
          onClick={onClose}
          className="text-[11px] px-3 py-1.5"
        >
          Cancelar
        </PillButton>
      </div>
    </FloatingFormCard>
  )
}

export type GeneralSettingsPanelProps = {
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
  onOpenSpotifyClientIdCard: _onOpenSpotifyClientIdCard,
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
}: GeneralSettingsPanelProps) {
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
        <p className="mt-4 text-[11px]" style={{ color: 'var(--ares-text-secondary)' }}>
          {sessionMemory.continuity_summary}
        </p>
      )}

      <SectionTitle className="mt-8 mb-1 text-[18px]">Biblioteca</SectionTitle>
      <div className="mt-4 flex gap-5">
        <LibraryTile
          icon={
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.685 1.28739C22.4364 1.29611 22.1884 1.36091 21.9663 1.47739C22.5455 1.76411 22.9541 2.33039 23.0213 3.00239C23.0328 3.08303 23.04 3.15655 23.04 3.19239V28.7924C23.04 29.5514 22.5962 30.202 21.9575 30.5136C22.1905 30.641 22.4506 30.7124 22.72 30.7124C22.9587 30.7124 23.184 30.6571 23.3875 30.5636L23.3888 30.5661C24.4179 30.0337 29.5631 27.3693 29.7525 27.2611C30.3496 26.9187 30.72 26.2791 30.72 25.5924V6.39239C30.72 5.75367 30.4037 5.15951 29.8738 4.80239C29.669 4.66351 23.4125 1.43114 23.4125 1.43114L23.4113 1.43364C23.1834 1.32644 22.9337 1.27867 22.685 1.28739ZM21.12 2.55239C20.9563 2.55239 20.7923 2.61477 20.6675 2.73989C20.6675 2.73989 17.0038 6.85995 12.9475 11.4174L17.7438 15.3411L21.76 11.9586V3.19239C21.76 3.02855 21.6973 2.86469 21.5725 2.73989C21.4474 2.61477 21.2838 2.55239 21.12 2.55239ZM5.12003 7.03239C5.02019 7.03239 4.8345 7.03274 4.00378 7.41739C3.54618 7.62923 1.95253 8.46614 1.95253 8.46614C1.74133 8.5807 1.57096 8.76003 1.45128 8.96739C1.49992 8.9597 1.54822 8.95238 1.59878 8.95238H1.60003C2.02755 8.95238 2.28973 9.25075 2.38253 9.34739C2.38253 9.34739 20.4352 29.0126 20.6675 29.2449C20.7923 29.3697 20.9549 29.4324 21.1188 29.4324C21.2826 29.4324 21.4465 29.3697 21.5713 29.2449C21.6961 29.1201 21.76 28.9562 21.76 28.7924V20.2611C21.76 20.2611 6.10163 7.46345 5.98003 7.36488C5.74451 7.15112 5.43811 7.03239 5.12003 7.03239ZM1.40753 10.2324C1.33713 10.2324 1.28003 10.2901 1.28003 10.3611V22.2686C1.28003 22.3371 1.33591 22.3936 1.40503 22.3936C1.44087 22.3936 1.47263 22.3773 1.49503 22.3524L5.12003 18.3286V14.0849L1.49878 10.2699C1.47574 10.2468 1.44273 10.2324 1.40753 10.2324ZM7.84253 17.1536C7.84253 17.1536 2.3415 23.3297 2.27878 23.3924C2.10534 23.5658 1.86563 23.6724 1.60003 23.6724C1.55011 23.6724 1.50178 23.6663 1.45378 23.6586C1.58306 23.8833 1.77265 24.0685 2.00753 24.1824L2.00503 24.1861C2.56183 24.469 4.39936 25.4026 4.64128 25.5011C4.7936 25.5619 4.95427 25.5924 5.12003 25.5924C5.34211 25.5924 5.56166 25.535 5.75878 25.4224C5.7735 25.4141 11.2175 20.8336 11.2175 20.8336L7.84253 17.1536Z" fill="#0C75FF"/>
            </svg>
          }
          label="Vs Code"
          actionLabel={installingVSCode ? 'Instalando…' : vscodePendingReload ? 'Aguardando…' : vscodeConnected ? 'Desconectar' : 'Conectar'}
          active={vscodeConnected}
          disabled={installingVSCode || vscodePendingReload}
          onAction={onVSCodeAction}
        >
          {!vscodeConnected && vscodeStatus?.message && (
            <span className="text-center text-[9px]" style={{ color: 'var(--ares-text-muted)', lineHeight: 1.3, maxWidth: 120 }}>
              bridge indisponível
            </span>
          )}
        </LibraryTile>

        <LibraryTile
          icon={
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 0C6.72911 0 0 6.7291 0 15C0 23.2709 6.72911 30 15 30C23.2709 30 30 23.2715 30 15C30 6.72845 23.2709 0 15 0ZM21.349 21.7421C21.1606 22.0251 20.8503 22.1776 20.5341 22.1776C20.3477 22.1776 20.1593 22.1248 19.9924 22.0133C18.3802 20.9383 15.6461 20.2212 13.3643 20.2219C10.9431 20.2232 9.12817 20.8177 9.10991 20.8236C8.59881 20.997 8.04403 20.718 7.87322 20.2056C7.70242 19.6932 7.97949 19.139 8.49189 18.9689C8.57795 18.9402 10.6295 18.2681 13.3643 18.2668C15.6461 18.2655 18.8196 18.8809 21.0778 20.3862C21.5277 20.686 21.6489 21.293 21.349 21.7421ZM23.2996 17.7394C23.0877 18.0797 22.722 18.2668 22.3484 18.2668C22.1463 18.2668 21.9416 18.2127 21.7578 18.0973C18.8346 16.2758 15.8305 15.8905 13.2424 15.9133C10.3205 15.9394 7.98405 16.4968 7.94428 16.5085C7.35299 16.6767 6.73106 16.3312 6.56221 15.7373C6.39337 15.1421 6.73954 14.5234 7.33409 14.3553C7.51467 14.3038 9.84658 13.7301 13.039 13.7033C15.9498 13.6792 19.5771 14.101 22.9423 16.1976C23.4658 16.5235 23.6268 17.2146 23.2996 17.7394ZM25.2456 13.0586C25.0024 13.4719 24.5669 13.702 24.1197 13.702C23.8954 13.702 23.6686 13.644 23.4606 13.5228C20.0537 11.5227 15.9114 11.0983 13.0364 11.0944C13.0227 11.0944 13.009 11.0944 12.9953 11.0944C9.51867 11.0944 6.84124 11.7059 6.81451 11.7124C6.11174 11.8734 5.41223 11.4392 5.24925 10.7378C5.08627 10.0369 5.5211 9.33678 6.22191 9.17315C6.34252 9.14512 9.20314 8.48668 12.9953 8.48668C13.0103 8.48668 13.0253 8.48668 13.0403 8.48668C16.238 8.49124 20.8705 8.97757 24.7814 11.2736C25.402 11.6387 25.61 12.438 25.2456 13.0586Z" fill="#2DFF42"/>
            </svg>
          }
          label="Spotify"
          actionLabel={spotifyAuthing ? 'Autenticando…' : spotifyConnected ? 'Desconectar' : 'Conectar'}
          active={spotifyConnected}
          disabled={spotifyAuthing}
          onAction={onSpotifyAction}
        />

        <LibraryTile
          icon={
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--ares-text-primary)' }}>
              <path d="M15.8654 8.2789c0 1.3541 -1.0978 2.4519 -2.452 2.4519 -1.354 0 -2.4519 -1.0978 -2.4519 -2.452 0 -1.354 1.0978 -2.4518 2.452 -2.4518 1.3541 0 2.4519 1.0977 2.4519 2.4519zM9.75 6H0v4.9038h4.8462v7.2692H9.75Zm8.5962 0H24l-5.1058 12.173h-5.6538z" fill="currentColor" />
            </svg>
          }
          label="TradingView"
          actionLabel={tradingViewConnected ? 'Fechar' : 'Abrir'}
          active={tradingViewConnected}
          width={92}
          onAction={onTradingViewAction}
        >
          {tradingViewState?.symbol && (
            <div className="text-center leading-tight" style={{ maxWidth: 120 }}>
              <span className="block text-[10px]" style={{ color: 'var(--ares-text-tertiary)' }}>
                {tradingViewState.symbol}
                {tradingViewState.timeframe ? ` · ${tradingViewState.timeframe}` : ''}
              </span>
              {tradingViewState.currentPrice && (
                <span className="block text-[10px]" style={{ color: 'var(--ares-text-secondary)' }}>
                  {tradingViewState.currentPrice}
                  {tradingViewState.priceChange ? ` · ${tradingViewState.priceChange}` : ''}
                </span>
              )}
              {(tradingViewState.recentHigh || tradingViewState.recentLow) && (
                <span className="block text-[9px]" style={{ color: 'var(--ares-text-muted)' }}>
                  H {tradingViewState.recentHigh ?? '?'} · L {tradingViewState.recentLow ?? '?'}
                </span>
              )}
              {tradingViewState.ohlc.close && (
                <span className="block text-[9px]" style={{ color: 'var(--ares-text-muted)' }}>
                  {tradingViewState.crosshairActive ? 'vela sob o mouse' : 'última vela'}
                  {tradingViewState.hoveredCandleTime ? ` · ${tradingViewState.hoveredCandleTime}` : ''}
                </span>
              )}
              {tradingViewState.candleStructure && (
                <span className="block text-[9px]" style={{ color: 'var(--ares-text-muted)' }}>
                  {tradingViewState.candleStructure}
                </span>
              )}
              {tradingViewState.rangeState !== 'unknown' && (
                <span className="block text-[9px]" style={{ color: 'var(--ares-text-muted)' }}>
                  range {tradingViewState.rangeState}
                </span>
              )}
            </div>
          )}
        </LibraryTile>

        <LibraryTile
          icon={
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--ares-accent)' }}>
              <polyline points="2 12 6 8 10 14 14 9 18 13 22 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          }
          label="Cotação"
          actionLabel={sym ? sym : 'Configurar'}
          active={Boolean(sym)}
          width={92}
          onAction={onOpenTickerCard}
        >
          {tickerQuote && (
            <span className="text-[10px]" style={{ color: 'var(--ares-text-tertiary)' }}>
              {tickerQuote.price} <span style={{ color: tickerQuote.positive ? 'var(--ares-success)' : 'var(--ares-danger)' }}>{tickerQuote.change}</span>
            </span>
          )}
        </LibraryTile>
      </div>

      {spotifyClientIdCard && (
        <FloatingInputCard
          title="Spotify Client ID"
          description={
            <>
              developer.spotify.com → crie um app → Redirect URI:{' '}
              <span style={{ color: 'var(--ares-text-secondary)' }}>http://127.0.0.1:42002/callback</span>
            </>
          }
          value={spotifyClientIdDraft}
          placeholder="Cole o Client ID aqui"
          submitLabel="Conectar"
          onChange={onSpotifyClientIdDraftChange}
          onSubmit={onSubmitSpotifyClientId}
          onClose={onCloseSpotifyClientIdCard}
        />
      )}

      {tickerCard && (
        <FloatingInputCard
          title="Símbolo do ativo"
          description={
            <>
              Ações: <span style={{ color: 'var(--ares-text-secondary)' }}>AAPL · PETR4.SA</span>
              {' · '}Cripto: <span style={{ color: 'var(--ares-text-secondary)' }}>BTC-USD · ETH-USD</span>
              {' · '}Commodities: <span style={{ color: 'var(--ares-text-secondary)' }}>GC=F (ouro) · CL=F (petróleo) · SI=F (prata) · NG=F (gás)</span>
              {' · '}Índices: <span style={{ color: 'var(--ares-text-secondary)' }}>^GSPC · ^BVSP</span>
            </>
          }
          value={tickerDraft}
          placeholder="Cole o símbolo aqui"
          submitLabel="Salvar"
          onChange={onTickerDraftChange}
          onSubmit={onSubmitTicker}
          onClose={onCloseTickerCard}
        />
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
        <p className="mt-3 text-[11px]" style={{ color: 'var(--ares-text-secondary)' }}>
          {vscodeInstallMsg}
        </p>
      )}
    </>
  )
}
