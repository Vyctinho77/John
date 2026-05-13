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
  onOpenTab
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
