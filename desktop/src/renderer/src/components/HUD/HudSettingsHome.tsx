import {
  BellDot,
  BotMessageSquare,
  BrainCircuit,
  ChartNoAxesCombined,
  Info,
  KeyRound,
  PanelTop,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareUserRound,
  WandSparkles,
  type LucideIcon
} from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  AppSettings,
  ConnectorStatus,
  PrivacySnapshot,
  TradingViewConnectorState,
  UserProfile
} from '@shared/perception.types'
import type { AISettingsSnapshot } from '@shared/ai-provider.types'
import type { MemoryCardSummary } from '@shared/memory.types'

export type SettingsHomeTab =
  | 'general'
  | 'notifications'
  | 'data'
  | 'account'
  | 'api'
  | 'typography'
  | 'market'
  | 'about'

type SettingsHomeItem = {
  tab: SettingsHomeTab
  title: string
  description: string
  Icon: LucideIcon
  keywords: string[]
}

const PINNED_ITEMS: SettingsHomeItem[] = [
  {
    tab: 'general',
    title: 'Geral',
    description: 'HUD, conectores e atalhos',
    Icon: SlidersHorizontal,
    keywords: ['hud', 'minimalista', 'spotify', 'vscode', 'ticker', 'tradingview']
  },
  {
    tab: 'api',
    title: 'IA e API',
    description: 'Modelos, provedores e custo',
    Icon: BotMessageSquare,
    keywords: ['ia', 'api', 'openai', 'codex', 'modelo', 'custo', 'roteamento']
  },
  {
    tab: 'data',
    title: 'Dados',
    description: 'Privacidade, memória e captura',
    Icon: ShieldCheck,
    keywords: ['dados', 'privacidade', 'memoria', 'memória', 'captura', 'telemetria']
  },
  {
    tab: 'account',
    title: 'Conta',
    description: 'Perfil e preferências',
    Icon: SquareUserRound,
    keywords: ['conta', 'perfil', 'nome', 'nivel', 'nível']
  },
  {
    tab: 'notifications',
    title: 'Alertas',
    description: 'Sugestões, voz e presença',
    Icon: BellDot,
    keywords: ['notificacoes', 'notificações', 'voz', 'sugestoes', 'sugestões']
  },
  {
    tab: 'typography',
    title: 'Aparência',
    description: 'Fonte, escala e leitura',
    Icon: WandSparkles,
    keywords: ['aparencia', 'aparência', 'tipografia', 'fonte', 'texto']
  },
  {
    tab: 'market',
    title: 'Mercado',
    description: 'Operador, risco e autonomia',
    Icon: ChartNoAxesCombined,
    keywords: ['mercado', 'trading', 'operador', 'autonomia', 'risco']
  },
  {
    tab: 'about',
    title: 'Sobre',
    description: 'Versão e recursos',
    Icon: Info,
    keywords: ['sobre', 'versao', 'versão', 'recursos']
  }
]

const CATEGORY_ITEMS: Array<{
  title: string
  description: string
  Icon: LucideIcon
  tabs: SettingsHomeTab[]
}> = [
  {
    title: 'Produtividade',
    description: 'VS Code, Spotify, ticker e contexto ativo',
    Icon: PanelTop,
    tabs: ['general', 'account']
  },
  {
    title: 'Sistema e dados',
    description: 'Captura, privacidade, memória e diagnósticos',
    Icon: ShieldCheck,
    tabs: ['data', 'notifications']
  },
  {
    title: 'Inteligência',
    description: 'Provedores, modelos, custos e roteamento',
    Icon: BrainCircuit,
    tabs: ['api']
  },
  {
    title: 'Interface',
    description: 'Tipografia, HUD e comportamento visual',
    Icon: Sparkles,
    tabs: ['typography', 'general']
  }
]

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function connectorLabel(statuses: ConnectorStatus[], id: string) {
  const status = statuses.find(item => item.id === id)
  if (!status) return 'indisponível'
  return status.connected ? 'conectado' : 'desconectado'
}

function providerLabel(aiSettings: AISettingsSnapshot | null) {
  if (!aiSettings) return 'não carregado'
  const primary = aiSettings.routing.textPrimary
  if (!primary) return 'local'
  return aiSettings.providers.find(provider => provider.id === primary)?.label ?? primary
}

export function SettingsHomePanel({
  settings,
  connectorStatuses,
  aiSettings,
  privacy,
  memorySummary,
  tradingViewState,
  userProfile,
  query,
  onQueryChange,
  onOpenTab,
  installingVSCode,
  vscodePendingReload,
  spotifyAuthing,
  onVSCodeAction,
  onSpotifyAction,
  onTradingViewAction,
  onTickerAction,
  spotifyClientIdCard,
  spotifyClientIdDraft,
  tickerCard,
  tickerDraft,
  onCloseSpotifyClientIdCard,
  onSpotifyClientIdDraftChange,
  onSubmitSpotifyClientId,
  onCloseTickerCard,
  onTickerDraftChange,
  onSubmitTicker
}: {
  settings: AppSettings | null
  connectorStatuses: ConnectorStatus[]
  aiSettings: AISettingsSnapshot | null
  privacy: PrivacySnapshot | null
  memorySummary: MemoryCardSummary | null
  tradingViewState: TradingViewConnectorState | null
  userProfile: UserProfile | null
  query: string
  onQueryChange: (value: string) => void
  onOpenTab: (tab: SettingsHomeTab) => void
  installingVSCode: boolean
  vscodePendingReload: boolean
  spotifyAuthing: boolean
  onVSCodeAction: () => void
  onSpotifyAction: () => void
  onTradingViewAction: () => void
  onTickerAction: () => void
  spotifyClientIdCard: boolean
  spotifyClientIdDraft: string
  tickerCard: boolean
  tickerDraft: string
  onCloseSpotifyClientIdCard: () => void
  onSpotifyClientIdDraftChange: (value: string) => void
  onSubmitSpotifyClientId: () => void
  onCloseTickerCard: () => void
  onTickerDraftChange: (value: string) => void
  onSubmitTicker: () => void
}) {
  const normalizedQuery = normalize(query.trim())
  const visiblePinned = normalizedQuery
    ? PINNED_ITEMS.filter(item =>
        normalize(`${item.title} ${item.description} ${item.keywords.join(' ')}`).includes(normalizedQuery)
      )
    : PINNED_ITEMS

  const recommendations = [
    {
      title: 'Modo minimalista',
      value: settings?.minimalMode ? 'ativado' : 'desativado',
      tab: 'general' as const,
      Icon: SlidersHorizontal
    },
    {
      title: 'Captura',
      value: settings?.captureScope.mode === 'selected-source'
        ? settings.captureScope.selectedSourceName || 'fonte selecionada'
        : 'qualquer janela visível',
      tab: 'data' as const,
      Icon: ShieldCheck
    },
    {
      title: 'IA principal',
      value: providerLabel(aiSettings),
      tab: 'api' as const,
      Icon: BotMessageSquare
    },
    {
      title: 'Memória',
      value: memorySummary ? memorySummary.owner_name || 'perfil local' : 'sem cartão ativo',
      tab: 'data' as const,
      Icon: KeyRound
    },
    {
      title: 'TradingView',
      value: tradingViewState?.symbol || connectorLabel(connectorStatuses, 'tradingview'),
      tab: 'market' as const,
      Icon: ChartNoAxesCombined
    },
    {
      title: 'Perfil',
      value: userProfile?.user_level || 'intermediate',
      tab: 'account' as const,
      Icon: SquareUserRound
    }
  ]

  const visibleRecommendations = normalizedQuery
    ? recommendations.filter(item => normalize(`${item.title} ${item.value}`).includes(normalizedQuery))
    : recommendations

  const libraryApps = [
    {
      title: 'VS Code',
      value: installingVSCode ? 'instalando' : vscodePendingReload ? 'aguardando reload' : connectorLabel(connectorStatuses, 'vscode'),
      icon: <VSCodeLibraryIcon />,
      disabled: installingVSCode || vscodePendingReload,
      onAction: onVSCodeAction
    },
    {
      title: 'Spotify',
      value: spotifyAuthing ? 'autenticando' : connectorLabel(connectorStatuses, 'spotify'),
      icon: <SpotifyLibraryIcon />,
      disabled: spotifyAuthing,
      onAction: onSpotifyAction
    },
    {
      title: 'TradingView',
      value: tradingViewState?.symbol || connectorLabel(connectorStatuses, 'tradingview'),
      icon: <TradingViewLibraryIcon />,
      disabled: false,
      onAction: onTradingViewAction
    },
    {
      title: 'Cotacao',
      value: settings?.tickerSymbol?.trim() || 'configurar',
      icon: <TickerLibraryIcon />,
      disabled: false,
      onAction: onTickerAction
    }
  ]

  const visibleLibraryApps = normalizedQuery
    ? libraryApps.filter(item => normalize(`${item.title} ${item.value}`).includes(normalizedQuery))
    : libraryApps

  return (
    <div className="h-full overflow-y-auto scrollbar-none px-7 pb-7 pt-5">
      <div
        className="mr-12 flex h-10 items-center gap-3 rounded-[12px] px-4"
        style={{
          background: 'color-mix(in srgb, var(--ares-surface-1) 74%, transparent)',
          border: '1px solid var(--ares-border-soft)'
        }}
      >
        <Search size={16} strokeWidth={1.65} style={{ color: 'rgba(255,255,255,0.82)', flexShrink: 0 }} />
        <input
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          style={{ color: 'var(--ares-text-primary)' }}
          placeholder="Pesquisar configurações, conectores e privacidade"
        />
      </div>

      <SettingsHomeSection title="Fixado" action={query ? `${visiblePinned.length} resultado(s)` : undefined}>
        <div className="grid grid-cols-4 gap-x-4 gap-y-5">
          {visiblePinned.map(item => (
            <button
              key={item.tab}
              onClick={() => onOpenTab(item.tab)}
              className="group flex min-h-[92px] flex-col items-center justify-center rounded-[8px] px-2 text-center transition-colors duration-150"
              style={{ color: 'var(--ares-text-primary)' }}
              onMouseEnter={event => {
                event.currentTarget.style.background = 'color-mix(in srgb, var(--ares-surface-1) 58%, transparent)'
              }}
              onMouseLeave={event => {
                event.currentTarget.style.background = 'transparent'
              }}
            >
              <span
                className="mb-2 flex h-10 w-10 items-center justify-center rounded-[8px]"
                style={{
                  background: 'color-mix(in srgb, var(--ares-surface-2) 76%, transparent)',
                  border: '1px solid var(--ares-border-soft)',
                  color: 'var(--ares-text-primary)'
                }}
              >
                <item.Icon size={21} strokeWidth={1.65} />
              </span>
              <span className="text-[12px] leading-tight">{item.title}</span>
              <span
                className="mt-1 overflow-hidden text-[10px] leading-tight"
                style={{
                  color: 'rgba(255,255,255,0.64)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}
              >
                {item.description}
              </span>
            </button>
          ))}
        </div>
      </SettingsHomeSection>

      <SettingsHomeSection title="Recomendado">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {visibleRecommendations.map(item => (
            <button
              key={item.title}
              onClick={() => onOpenTab(item.tab)}
              className="flex min-h-[48px] items-center gap-3 rounded-[8px] px-2 text-left transition-colors duration-150"
              onMouseEnter={event => {
                event.currentTarget.style.background = 'color-mix(in srgb, var(--ares-surface-1) 48%, transparent)'
              }}
              onMouseLeave={event => {
                event.currentTarget.style.background = 'transparent'
              }}
            >
              <span
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[7px]"
                style={{ color: 'rgba(255,255,255,0.86)', background: 'var(--ares-surface-1)' }}
              >
                <item.Icon size={17} strokeWidth={1.65} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px]" style={{ color: 'var(--ares-text-primary)' }}>
                  {item.title}
                </span>
                <span className="block truncate text-[11px]" style={{ color: 'rgba(255,255,255,0.64)' }}>
                  {item.value}
                </span>
              </span>
            </button>
          ))}
        </div>
      </SettingsHomeSection>

      <SettingsHomeSection title="Biblioteca">
        <div className="grid grid-cols-4 gap-5">
          {visibleLibraryApps.map(item => (
            <div
              key={item.title}
              className="flex min-h-[112px] flex-col items-center justify-start text-center"
              style={{
                opacity: item.disabled ? 0.5 : 1,
                pointerEvents: item.disabled ? 'none' : 'auto'
              }}
            >
              <span
                className="flex h-10 items-center justify-center"
                style={{ color: 'var(--ares-text-primary)' }}
              >
                {item.icon}
              </span>
              <span
                className="mt-1.5 block w-full truncate text-[13px] font-semibold"
                style={{ color: 'rgba(255,255,255,0.42)', letterSpacing: 0 }}
              >
                {item.title}
              </span>
              <button
                onMouseDown={event => event.preventDefault()}
                onClick={item.onAction}
                className="mt-3 h-8 w-full rounded-[6px] text-[12px] font-semibold transition-opacity duration-150 hover:opacity-90 active:opacity-75"
                style={{
                  background: 'rgba(255,255,255,0.84)',
                  color: 'var(--ares-surface-0)',
                  border: '0',
                  letterSpacing: 0
                }}
              >
                {item.value === 'conectado' || item.value === 'desconectado' || item.value === 'configurar'
                  ? item.value === 'conectado'
                    ? 'Desconectar'
                    : item.value === 'configurar'
                      ? 'Configurar'
                      : 'Conectar'
                  : item.value}
              </button>
            </div>
          ))}
        </div>
      </SettingsHomeSection>

      {spotifyClientIdCard && (
        <HomeFloatingInputCard
          title="Spotify Client ID"
          description="Redirect URI: http://127.0.0.1:42002/callback"
          value={spotifyClientIdDraft}
          placeholder="Cole o Client ID aqui"
          submitLabel="Conectar"
          onChange={onSpotifyClientIdDraftChange}
          onSubmit={onSubmitSpotifyClientId}
          onClose={onCloseSpotifyClientIdCard}
        />
      )}

      {tickerCard && (
        <HomeFloatingInputCard
          title="Símbolo do ativo"
          description="Ex: AAPL, PETR4.SA, BTC-USD, GC=F, ^BVSP"
          value={tickerDraft}
          placeholder="Cole o símbolo aqui"
          submitLabel="Salvar"
          onChange={onTickerDraftChange}
          onSubmit={onSubmitTicker}
          onClose={onCloseTickerCard}
        />
      )}

      <SettingsHomeSection title="Todos" action="Exibição: Categoria">
        <div className="grid grid-cols-2 gap-4">
          {CATEGORY_ITEMS.map(category => (
            <button
              key={category.title}
              onClick={() => onOpenTab(category.tabs[0])}
              className="min-h-[112px] rounded-[8px] p-4 text-left transition-colors duration-150"
              style={{
                background: 'color-mix(in srgb, var(--ares-surface-1) 58%, transparent)',
                border: '1px solid var(--ares-border-soft)'
              }}
            >
              <div className="mb-4 flex items-center gap-2">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-[8px]"
                  style={{ color: 'var(--ares-text-primary)', background: 'var(--ares-surface-2)' }}
                >
                  <category.Icon size={19} strokeWidth={1.65} />
                </span>
                <span className="text-[13px]" style={{ color: 'var(--ares-text-primary)' }}>
                  {category.title}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.64)' }}>
                {category.description}
              </p>
            </button>
          ))}
        </div>
      </SettingsHomeSection>

      <div
        className="mt-5 flex items-center justify-between rounded-[8px] px-4 py-3"
        style={{
          background: 'color-mix(in srgb, var(--ares-surface-1) 48%, transparent)',
          border: '1px solid var(--ares-border-soft)',
          color: 'rgba(255,255,255,0.82)'
        }}
      >
        <span className="text-[11px]">
          Privacidade: {privacy?.lastDataDeletionAt ? 'dados limpos recentemente' : 'modo padrão'}
        </span>
        <span className="text-[11px]">
          VS Code: {connectorLabel(connectorStatuses, 'vscode')}
        </span>
      </div>
    </div>
  )
}

function SettingsHomeSection({
  title,
  action,
  children
}: {
  title: string
  action?: string
  children: ReactNode
}) {
  return (
    <section className="mt-7">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold" style={{ color: 'var(--ares-text-strong)' }}>
          {title}
        </h2>
        {action ? (
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.82)' }}>
            {action}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function HomeFloatingInputCard({
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
  description: string
  value: string
  placeholder: string
  submitLabel: string
  onChange: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <div
      className="mt-4 rounded-[10px] p-4"
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.10)'
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[13px]" style={{ color: 'var(--ares-text-primary)' }}>
            {title}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: 'rgba(255,255,255,0.56)' }}>
            {description}
          </p>
        </div>
        <button
          onMouseDown={event => event.preventDefault()}
          onClick={onClose}
          className="text-[11px]"
          style={{ color: 'rgba(255,255,255,0.56)', background: 'transparent', border: 0 }}
        >
          fechar
        </button>
      </div>
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'Enter' && value.trim()) onSubmit()
        }}
        className="mt-3 h-9 w-full rounded-[6px] bg-transparent px-3 text-[12px] outline-none"
        style={{
          color: 'var(--ares-text-primary)',
          border: '1px solid rgba(255,255,255,0.14)'
        }}
      />
      <button
        onMouseDown={event => event.preventDefault()}
        onClick={onSubmit}
        disabled={!value.trim()}
        className="mt-3 h-8 rounded-[6px] px-4 text-[12px] font-semibold disabled:opacity-45"
        style={{
          background: 'rgba(255,255,255,0.84)',
          color: 'var(--ares-surface-0)',
          border: 0
        }}
      >
        {submitLabel}
      </button>
    </div>
  )
}

function VSCodeLibraryIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.685 1.28739C22.4364 1.29611 22.1884 1.36091 21.9663 1.47739C22.5455 1.76411 22.9541 2.33039 23.0213 3.00239C23.0328 3.08303 23.04 3.15655 23.04 3.19239V28.7924C23.04 29.5514 22.5962 30.202 21.9575 30.5136C22.1905 30.641 22.4506 30.7124 22.72 30.7124C22.9587 30.7124 23.184 30.6571 23.3875 30.5636L23.3888 30.5661C24.4179 30.0337 29.5631 27.3693 29.7525 27.2611C30.3496 26.9187 30.72 26.2791 30.72 25.5924V6.39239C30.72 5.75367 30.4037 5.15951 29.8738 4.80239C29.669 4.66351 23.4125 1.43114 23.4125 1.43114L23.4113 1.43364C23.1834 1.32644 22.9337 1.27867 22.685 1.28739ZM21.12 2.55239C20.9563 2.55239 20.7923 2.61477 20.6675 2.73989C20.6675 2.73989 17.0038 6.85995 12.9475 11.4174L17.7438 15.3411L21.76 11.9586V3.19239C21.76 3.02855 21.6973 2.86469 21.5725 2.73989C21.4474 2.61477 21.2838 2.55239 21.12 2.55239ZM5.12003 7.03239C5.02019 7.03239 4.8345 7.03274 4.00378 7.41739C3.54618 7.62923 1.95253 8.46614 1.95253 8.46614C1.74133 8.5807 1.57096 8.76003 1.45128 8.96739C1.49992 8.9597 1.54822 8.95238 1.59878 8.95238H1.60003C2.02755 8.95238 2.28973 9.25075 2.38253 9.34739C2.38253 9.34739 20.4352 29.0126 20.6675 29.2449C20.7923 29.3697 20.9549 29.4324 21.1188 29.4324C21.2826 29.4324 21.4465 29.3697 21.5713 29.2449C21.6961 29.1201 21.76 28.9562 21.76 28.7924V20.2611C21.76 20.2611 6.10163 7.46345 5.98003 7.36488C5.74451 7.15112 5.43811 7.03239 5.12003 7.03239ZM1.40753 10.2324C1.33713 10.2324 1.28003 10.2901 1.28003 10.3611V22.2686C1.28003 22.3371 1.33591 22.3936 1.40503 22.3936C1.44087 22.3936 1.47263 22.3773 1.49503 22.3524L5.12003 18.3286V14.0849L1.49878 10.2699C1.47574 10.2468 1.44273 10.2324 1.40753 10.2324ZM7.84253 17.1536C7.84253 17.1536 2.3415 23.3297 2.27878 23.3924C2.10534 23.5658 1.86563 23.6724 1.60003 23.6724C1.55011 23.6724 1.50178 23.6663 1.45378 23.6586C1.58306 23.8833 1.77265 24.0685 2.00753 24.1824L2.00503 24.1861C2.56183 24.469 4.39936 25.4026 4.64128 25.5011C4.7936 25.5619 4.95427 25.5924 5.12003 25.5924C5.34211 25.5924 5.56166 25.535 5.75878 25.4224C5.7735 25.4141 11.2175 20.8336 11.2175 20.8336L7.84253 17.1536Z" fill="#0C75FF"/>
    </svg>
  )
}

function SpotifyLibraryIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 30 30" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.72911 0 0 6.7291 0 15C0 23.2709 6.72911 30 15 30C23.2709 30 30 23.2715 30 15C30 6.72845 23.2709 0 15 0ZM21.349 21.7421C21.1606 22.0251 20.8503 22.1776 20.5341 22.1776C20.3477 22.1776 20.1593 22.1248 19.9924 22.0133C18.3802 20.9383 15.6461 20.2212 13.3643 20.2219C10.9431 20.2232 9.12817 20.8177 9.10991 20.8236C8.59881 20.997 8.04403 20.718 7.87322 20.2056C7.70242 19.6932 7.97949 19.139 8.49189 18.9689C8.57795 18.9402 10.6295 18.2681 13.3643 18.2668C15.6461 18.2655 18.8196 18.8809 21.0778 20.3862C21.5277 20.686 21.6489 21.293 21.349 21.7421ZM23.2996 17.7394C23.0877 18.0797 22.722 18.2668 22.3484 18.2668C22.1463 18.2668 21.9416 18.2127 21.7578 18.0973C18.8346 16.2758 15.8305 15.8905 13.2424 15.9133C10.3205 15.9394 7.98405 16.4968 7.94428 16.5085C7.35299 16.6767 6.73106 16.3312 6.56221 15.7373C6.39337 15.1421 6.73954 14.5234 7.33409 14.3553C7.51467 14.3038 9.84658 13.7301 13.039 13.7033C15.9498 13.6792 19.5771 14.101 22.9423 16.1976C23.4658 16.5235 23.6268 17.2146 23.2996 17.7394ZM25.2456 13.0586C25.0024 13.4719 24.5669 13.702 24.1197 13.702C23.8954 13.702 23.6686 13.644 23.4606 13.5228C20.0537 11.5227 15.9114 11.0983 13.0364 11.0944C13.0227 11.0944 13.009 11.0944 12.9953 11.0944C9.51867 11.0944 6.84124 11.7059 6.81451 11.7124C6.11174 11.8734 5.41223 11.4392 5.24925 10.7378C5.08627 10.0369 5.5211 9.33678 6.22191 9.17315C6.34252 9.14512 9.20314 8.48668 12.9953 8.48668C13.0103 8.48668 13.0253 8.48668 13.0403 8.48668C16.238 8.49124 20.8705 8.97757 24.7814 11.2736C25.402 11.6387 25.61 12.438 25.2456 13.0586Z" fill="#2DFF42"/>
    </svg>
  )
}

function TradingViewLibraryIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--ares-text-primary)' }}>
      <path d="M15.8654 8.2789c0 1.3541 -1.0978 2.4519 -2.452 2.4519 -1.354 0 -2.4519 -1.0978 -2.4519 -2.452 0 -1.354 1.0978 -2.4518 2.452 -2.4518 1.3541 0 2.4519 1.0977 2.4519 2.4519zM9.75 6H0v4.9038h4.8462v7.2692H9.75Zm8.5962 0H24l-5.1058 12.173h-5.6538z" fill="currentColor" />
    </svg>
  )
}

function TickerLibraryIcon() {
  return (
    <svg width="31" height="31" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--ares-accent)' }}>
      <polyline points="2 12 6 8 10 14 14 9 18 13 22 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}
