# Market Autonomy Roadmap

## Objetivo

Este documento descreve como dar ao John capacidade operacional em mercado sem transformar a execucao em um bloco opaco dirigido apenas por LLM.

A meta nao e "fazer trade sozinho" logo de cara.

A meta correta e construir um sistema com:

- leitura de mercado confiavel
- politica de risco deterministica
- execucao auditavel
- paper trading primeiro
- autonomia crescente por niveis

---

## Principio central

O LLM pode propor.

O sistema deterministico decide se pode executar.

A execucao real nunca deve depender apenas de texto livre do modelo.

Toda ordem precisa passar por:

1. leitura de contexto
2. geracao de plano
3. validacao de risco
4. validacao operacional
5. execucao
6. reconciliacao
7. auditoria

---

## Niveis de autonomia

### Nivel 0 - Read Only

O John:

- le mercado
- resume contexto
- descreve estrutura
- aponta setups
- nao gera ordem

### Nivel 1 - Trade Copilot

O John:

- gera uma proposta de operacao
- sugere entrada, stop, alvo e tamanho
- explica tese e invalidação
- espera aprovacao humana

Execucao:

- sempre manual

### Nivel 2 - Guarded Paper Execution

O John:

- pode enviar ordens em ambiente de paper trading
- opera apenas dentro de policy rigida

Exemplos de travas:

- um unico mercado
- um unico timeframe
- um unico setup permitido
- no maximo uma posicao aberta
- perda diaria maxima
- risco fixo por trade
- horarios permitidos

### Nivel 3 - Guarded Live Execution

Mesmo desenho do Nivel 2, mas com capital real e limites ainda mais conservadores.

So deve existir depois de:

- metricas de paper confiaveis
- replay de decisao
- kill switch validado
- reconciliacao de ordem/fill sem falhas

### Nivel 4 - Semi-Autonomous Strategy Operator

O John:

- opera mais de um setup ou ativo
- ajusta parametros dentro de faixa permitida
- executa com pouca intervencao humana

Esse nivel exige muito mais maturidade operacional e nao deve ser o primeiro alvo.

---

## Arquitetura proposta

## 1. Market Data Layer

Responsabilidade:

- obter candles
- obter ticker, spread e depth quando existir
- obter posicao atual
- obter ordens abertas
- obter fills e PnL
- obter estado de sessao do mercado

Requisitos:

- fonte primaria confiavel
- timestamps consistentes
- reconciliação entre snapshot e stream
- cache curto para leitura local

Arquivos/modulos sugeridos:

- `desktop/src/main/services/market-data.ts`
- `desktop/src/main/services/market-state-store.ts`

Saida esperada:

```ts
interface MarketSnapshot {
  symbol: string
  venue: string
  timeframe: string
  timestamp: number
  marketRegime: 'trending' | 'ranging' | 'high_volatility' | 'low_liquidity' | 'uncertain'
  lastPrice: number
  bid?: number
  ask?: number
  spreadBps?: number
  candles: Candle[]
  indicators: Record<string, number>
  openPosition: PositionState | null
  openOrders: OrderState[]
  session: MarketSessionState
}
```

## 2. Strategy Engine

Responsabilidade:

- transformar `MarketSnapshot` em hipoteses operacionais
- detectar setup
- montar tese, invalidação e contexto

Aqui o LLM pode ajudar, mas nao deve ser a unica fonte.

Desenho recomendado:

- camada heuristica/tecnica primeiro
- camada LLM como explicadora, classificadora ou desempate
- a strategy tambem precisa validar compatibilidade entre setup e `marketRegime`

Saida esperada:

```ts
interface TradeIdea {
  strategyId: string
  symbol: string
  side: 'long' | 'short'
  confidence: number
  thesis: string
  invalidation: string
  entry: {
    type: 'market' | 'limit' | 'stop_limit'
    price?: number
  }
  stopLoss?: {
    price: number
  }
  takeProfit?: {
    price: number
  }
  timeHorizon: 'scalp' | 'intraday' | 'swing'
  tags: string[]
}
```

Arquivos/modulos sugeridos:

- `desktop/src/main/services/strategy-engine.ts`
- `desktop/src/main/services/strategy-rules/`
- `desktop/src/main/services/strategy-llm-assist.ts`

## 3. Risk Engine

Responsabilidade:

- transformar ideia em permissao ou bloqueio
- validar restricoes de risco e exposicao
- calcular tamanho da posicao

Essa camada deve ser 100% deterministica.

Regras tipicas:

- risco maximo por trade
- perda diaria maxima
- perda semanal maxima
- maximo de trades por sessao
- maximo de exposicao por ativo
- maximo de alavancagem
- proibicao de media contra posicao
- proibicao de piramidar fora de policy
- janela de cooldown apos loss
- bloqueio perto de evento macro

O cooldown precisa entrar explicitamente no fluxo:

- ao fechar trade com loss, o sistema marca `cooldownUntil`
- antes de permitir qualquer nova ideia executavel, o Risk Engine consulta esse estado
- se `now < cooldownUntil`, a decisao deve ser bloqueada sem chegar na execucao

Saida esperada:

```ts
interface RiskDecision {
  allowed: boolean
  reason: string
  positionSize?: {
    quantity: number
    notional: number
    riskUsd: number
  }
  violations: string[]
}
```

Arquivos/modulos sugeridos:

- `desktop/src/main/services/risk-engine.ts`
- `desktop/src/main/services/risk-policy.ts`

## 4. Execution Policy Layer

Responsabilidade:

- validar se a ordem proposta e executavel no broker/exchange escolhido
- converter `TradeIdea + RiskDecision` em intent de ordem
- decidir tipo de ordem permitido

Exemplos:

- permitir apenas `limit + stop + take profit`
- bloquear market orders em baixa liquidez
- exigir stop loss obrigatorio
- impedir ordens sem `client_order_id`
- impedir ordens fora do horario

Saida esperada:

```ts
interface ExecutionIntent {
  broker: 'alpaca' | 'ibkr' | 'binance' | 'paper'
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  entryOrder: BrokerOrderRequest
  protectiveOrders: BrokerOrderRequest[]
}
```

Arquivos/modulos sugeridos:

- `desktop/src/main/services/execution-policy.ts`

## 5. Broker Adapter Layer

Responsabilidade:

- enviar ordens
- cancelar ordens
- substituir ordens
- ler posicoes
- reconciliar fills

Cada broker precisa de adapter proprio.

Arquivos/modulos sugeridos:

- `desktop/src/main/services/brokers/base.ts`
- `desktop/src/main/services/brokers/paper-broker.ts`
- `desktop/src/main/services/brokers/alpaca-adapter.ts`
- `desktop/src/main/services/brokers/ibkr-adapter.ts`

Interface sugerida:

```ts
interface BrokerAdapter {
  getAccountState(): Promise<AccountState>
  getOpenOrders(): Promise<OrderState[]>
  getOpenPositions(): Promise<PositionState[]>
  placeOrder(intent: ExecutionIntent): Promise<ExecutionResult>
  cancelOrder(orderId: string): Promise<void>
  replaceOrder(orderId: string, patch: BrokerReplacePatch): Promise<void>
  subscribeOrderEvents(onEvent: (event: BrokerOrderEvent) => void): Promise<UnsubscribeFn>
}
```

## 6. Supervision Layer

Responsabilidade:

- logs estruturados
- replay de decisao
- alerta de falha
- kill switch
- freeze por violacao de risco

Eventos que precisam ficar gravados:

- snapshot usado na decisao
- ideia gerada
- decisao do risk engine
- intent enviada ao broker
- resposta do broker
- fill parcial/final
- motivo de cancelamento
- motivo de bloqueio

Arquivos/modulos sugeridos:

- `desktop/src/main/services/trade-audit-log.ts`
- `desktop/src/main/services/trade-supervisor.ts`
- `desktop/src/main/services/kill-switch.ts`

---

## Fluxo operacional

```text
Market Data
  -> Strategy Engine
  -> Trade Idea
  -> Risk Engine
  -> Execution Policy
  -> Broker Adapter
  -> Order / Fill Events
  -> Reconciliation
  -> Audit Log
  -> HUD / Alerts / Diagnostics
```

Observacao:

- o `Risk Engine` deve consultar estado de cooldown antes de liberar qualquer nova operacao
- o `Strategy Engine` deve tratar `marketRegime` como input explicito, nao como inferencia implícita espalhada

---

## Regras de seguranca obrigatorias

Essas regras deveriam existir antes de qualquer live trading.

### Hard Stops

- kill switch manual global
- max daily loss
- max session loss
- max consecutive losses
- max open positions
- max pending orders
- max notional exposure

### Operational Guards

- bloquear se market data estiver stale
- bloquear se clock estiver fora de sync
- bloquear se posicao local divergir do broker
- bloquear se houver ordem aberta sem reconciliacao
- bloquear se stop de protecao nao puder ser criado
- bloquear se spread/liquidez fugirem da policy

### Strategy Guards

- operar somente setups explicitamente cadastrados
- exigir regime de mercado compativel
- impedir entrada fora de horario permitido
- impedir reversao instantanea sem regra clara

---

## Policy model sugerido

```ts
interface MarketAutonomyPolicy {
  mode: 'read_only' | 'copilot' | 'paper_auto' | 'live_guarded'
  allowedSymbols: string[]
  allowedTimeframes: string[]
  allowedStrategies: string[]
  maxRiskPerTradeUsd: number
  maxDailyLossUsd: number
  maxTradesPerSession: number
  maxOpenPositions: number
  maxOpenOrders: number
  requireStopLoss: boolean
  requireTakeProfit: boolean
  allowMarketOrders: boolean
  allowOvernight: boolean
  cooldownAfterLossSec: number
  blockNearMacroEventsMin: number
}
```

Essa policy deve ficar separada do LLM e ser versionada.

---

## UX recomendada

O John precisa expor claramente em que nivel de autonomia esta.

Elementos recomendados:

- `Mode: Read Only / Copilot / Paper Auto / Live Guarded`
- `Risk: enabled / blocked`
- `Broker: paper / alpaca / ibkr`
- `Open position`
- `Daily PnL`
- `Kill switch`
- `Last blocked reason`

Tambem faz sentido ter um painel de replay:

- ideia
- risco
- ordem
- fill
- saida

---

## Roadmap

## Fase 0 - Design e simulacao local

Objetivo:

- desenhar contratos
- simular execucao sem broker real

Entregas:

- tipos base (`TradeIdea`, `RiskDecision`, `ExecutionIntent`)
- policy model
- paper broker local
- log de decisao
- chaos test local com falhas simuladas por etapa

Criterio de pronto:

- possivel rodar uma operacao completa em memoria do inicio ao fim
- possivel falhar de forma limpa em cada etapa sem corromper estado interno

Chaos cases minimos:

- market data stale
- regime de mercado invalido para a estrategia
- risk engine bloqueando por policy
- cooldown ativo apos loss
- broker rejeitando ordem
- fill parcial seguido de cancelamento
- falha de reconciliacao entre ordem local e estado do broker

## Fase 1 - Read Only de mercado

Objetivo:

- John ler mercado sem executar

Entregas:

- market snapshot consolidado
- strategy engine inicial
- explicacao de setup
- HUD de contexto operacional

Criterio de pronto:

- John consegue dizer:
  - qual ativo
  - qual timeframe
  - qual setup
  - qual invalidação
  - por que nao operar

## Fase 2 - Copilot

Objetivo:

- John propor operacoes, mas sem autonomia de envio

Entregas:

- proposta estruturada de trade
- sizing pelo risk engine
- aprovacao manual
- replay de decisao

Criterio de pronto:

- toda operacao proposta ja sai com:
  - entrada
  - stop
  - alvo
  - tamanho
  - tese
  - motivo de bloqueio, se houver

## Fase 3 - Paper Auto Guarded

Objetivo:

- executar automaticamente em paper trading

Entregas:

- broker adapter paper
- order state machine
- reconciliacao de fills
- kill switch
- limites diarios

Criterio de pronto:

- sistema opera em paper por varias sessoes sem divergencia entre estado interno e broker

## Fase 4 - Broker real em modo manual

Objetivo:

- integrar broker real, mas ainda com aprovacao humana

Entregas:

- adapter do broker escolhido
- account sync
- order/fill stream
- validacao operacional real

Criterio de pronto:

- usuario aprova manualmente e o sistema executa/reconcilia sem ambiguidade

## Fase 5 - Live Guarded

Objetivo:

- permitir execucao real com policy rigida

Entregas:

- live trading com travas
- freeze automatico por violacao
- relatorio de performance
- auditoria completa

Criterio de pronto:

- kill switch, limites e reconciliacao testados sob falha

## Fase 6 - Semi-Autonomous Expansion

Objetivo:

- ampliar estrategias ou mercados sem perder controle

Entregas:

- policy por estrategia
- score de regime
- roteamento entre setups
- comparativo de desempenho por estrategia

---

## Ordem recomendada

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3

Nao pular direto para live.

Se o sistema nao for confiavel em `paper_auto`, ele tambem nao sera confiavel com dinheiro real.

---

## Recomendacao objetiva

O primeiro alvo correto para o John e:

`Trade Copilot + Risk Engine + Paper Broker`

Nao:

`LLM decide e manda ordem`

Essa segunda opcao parece mais rapida, mas cria exatamente o tipo de risco operacional que depois fica caro de desmontar.
