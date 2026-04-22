# Market Autonomy Backlog

## Objetivo

Este backlog traduz o roadmap de autonomia operacional em mercado para um plano tecnico implementavel dentro do repositorio atual do John.

O foco inicial e:

1. fundacao deterministica
2. simulacao local
3. read-only de mercado
4. trade copilot

Nao inclui live trading como alvo inicial.

---

## Escopo imediato

Escopo das proximas entregas:

- Fase 0: design executavel + simulacao local + chaos testing
- Fase 1: leitura de mercado e propostas estruturadas sem execucao
- Fase 2: copilot com aprovacao humana

Fora do escopo imediato:

- broker real
- live trading
- multiplas estrategias concorrentes
- multi-asset routing

---

## Principios de implementacao

- toda decisao operacional importante precisa ser auditavel
- LLM nunca executa ordem direto
- policy e risk engine sao deterministicos
- paper/simulacao vem antes de broker externo
- estado de ordem, posicao e cooldown precisa ser reconciliavel

---

## Mapa do repo atual

Pontos do codigo que podem servir de base:

- `desktop/src/main/services/tradingview.ts`
- `desktop/src/main/services/tradingview-command-router.ts`
- `desktop/src/main/services/analysis-store.ts`
- `desktop/src/main/services/news-service.ts`
- `desktop/src/main/services/calendar-service.ts`
- `desktop/src/main/services/observability.ts`
- `desktop/src/main/services/tutor.ts`
- `desktop/src/main/services/tutor-prompt.ts`
- `desktop/src/shared/perception.types.ts`
- `desktop/src/shared/proactive.types.ts`

Lacunas claras hoje:

- nao existe modelo proprio de ordem/posicao/fill
- nao existe risk engine
- nao existe broker adapter
- nao existe paper broker
- nao existe strategy engine dedicado
- nao existe state machine operacional para trades

---

## Modulos novos sugeridos

## Shared types

Arquivos sugeridos:

- `desktop/src/shared/market-autonomy.types.ts`

Conteudo esperado:

- `MarketSnapshot`
- `MarketRegime`
- `TradeIdea`
- `RiskDecision`
- `ExecutionIntent`
- `OrderState`
- `PositionState`
- `BrokerOrderEvent`
- `MarketAutonomyPolicy`
- `TradeAuditRecord`

## Main services

Arquivos sugeridos:

- `desktop/src/main/services/market-data.ts`
- `desktop/src/main/services/market-state-store.ts`
- `desktop/src/main/services/market-regime.ts`
- `desktop/src/main/services/strategy-engine.ts`
- `desktop/src/main/services/strategy-rules/breakout.ts`
- `desktop/src/main/services/risk-policy.ts`
- `desktop/src/main/services/risk-engine.ts`
- `desktop/src/main/services/execution-policy.ts`
- `desktop/src/main/services/brokers/base.ts`
- `desktop/src/main/services/brokers/paper-broker.ts`
- `desktop/src/main/services/trade-supervisor.ts`
- `desktop/src/main/services/trade-audit-log.ts`
- `desktop/src/main/services/kill-switch.ts`
- `desktop/src/main/services/trade-copilot.ts`
- `desktop/src/main/services/trade-chaos-tests.ts`

## Renderer / UI

Arquivos provaveis:

- `desktop/src/renderer/src/components/HUD/`
- `desktop/src/renderer/src/components/Diagnostics/`

Adicoes provaveis:

- badge de autonomia
- painel de risco
- painel de trade proposal
- replay basico de decisao

---

## Fase 0 - Fundacao e simulacao local

### Objetivo

Definir os contratos operacionais e provar que o sistema consegue:

- gerar uma ideia
- passar pelo risco
- simular execucao
- reconciliar estado
- falhar limpo

### Epico 0.1 - Shared domain model

Entregas:

- criar `market-autonomy.types.ts`
- definir enums e interfaces base
- definir formatos de evento

Tarefas:

- modelar `MarketRegime`
- modelar `MarketSnapshot`
- modelar `TradeIdea`
- modelar `RiskDecision`
- modelar `ExecutionIntent`
- modelar `OrderState`, `PositionState`, `FillEvent`
- modelar `MarketAutonomyPolicy`
- modelar `TradeAuditRecord`

Criterio de pronto:

- todos os modulos futuros conseguem depender desse arquivo sem redefinir tipos

### Epico 0.2 - Policy e risk foundation

Entregas:

- `risk-policy.ts`
- `risk-engine.ts`

Tarefas:

- criar policy default para `read_only`, `copilot` e `paper_auto`
- implementar validacoes:
  - max risk per trade
  - max daily loss
  - max trades per session
  - max open positions
  - allowed symbols
  - allowed strategies
  - allowed timeframes
  - cooldown apos loss
- retornar `RiskDecision` com `violations`

Criterio de pronto:

- qualquer `TradeIdea` pode ser aceita ou bloqueada com motivo explicito

### Epico 0.3 - Paper broker local

Entregas:

- `brokers/base.ts`
- `brokers/paper-broker.ts`

Tarefas:

- definir interface do broker adapter
- criar estado local de ordens
- criar estado local de posicao
- simular fills de forma simples
- suportar:
  - place
  - cancel
  - replace
  - list open orders
  - list open positions

Criterio de pronto:

- uma ordem pode ser criada, preenchida e refletida em posicao local

### Epico 0.4 - Supervisor e audit log

Entregas:

- `trade-supervisor.ts`
- `trade-audit-log.ts`

Tarefas:

- registrar snapshot usado
- registrar ideia gerada
- registrar decisao de risco
- registrar intent de execucao
- registrar resposta do broker
- registrar eventos de ordem/fill

Criterio de pronto:

- cada tentativa de trade gera um rastro completo de auditoria

### Epico 0.5 - Chaos testing local

Entregas:

- `trade-chaos-tests.ts`

Casos minimos:

- market data stale
- regime invalido para a estrategia
- risk engine bloqueando
- cooldown ativo
- broker rejeitando ordem
- fill parcial seguido de cancelamento
- reconciliacao falhando

Criterio de pronto:

- o sistema para limpo em cada caso
- sem ordem "fantasma"
- sem posicao incoerente
- sem estado corrompido

---

## Fase 1 - Market Read Only

### Objetivo

Dar ao John uma camada propria de leitura de mercado, setup e regime, sem executar nada.

### Epico 1.1 - Market snapshot consolidado

Entregas:

- `market-data.ts`
- `market-state-store.ts`

Tarefas:

- consolidar dados de TradingView
- anexar noticias e calendario quando relevantes
- manter snapshot atual e ultimo snapshot valido
- expor leitura unica para outros modulos

Dependencias:

- `tradingview.ts`
- `analysis-store.ts`
- `news-service.ts`
- `calendar-service.ts`

Criterio de pronto:

- existe um `MarketSnapshot` confiavel por simbolo/timeframe

### Epico 1.2 - Classificador de regime

Entregas:

- `market-regime.ts`

Tarefas:

- classificar:
  - trending
  - ranging
  - high_volatility
  - low_liquidity
  - uncertain
- usar sinais simples:
  - range
  - ATR/volatilidade
  - spread
  - estrutura recente

Criterio de pronto:

- toda leitura de mercado vem com `marketRegime`

### Epico 1.3 - Strategy engine inicial

Entregas:

- `strategy-engine.ts`
- `strategy-rules/breakout.ts`

Tarefas:

- definir interface de estrategia
- implementar 1 setup inicial apenas
- validar compatibilidade entre setup e `marketRegime`
- produzir `TradeIdea` sem ordem real

Criterio de pronto:

- John gera uma proposta estruturada ou bloqueia com motivo

### Epico 1.4 - Exposicao no HUD

Entregas:

- card ou painel basico de mercado

Conteudo minimo:

- simbolo
- timeframe
- regime
- setup detectado
- confidence
- status: `no trade / candidate / blocked`

Criterio de pronto:

- usuario consegue inspecionar a leitura sem abrir logs

---

## Fase 2 - Trade Copilot

### Objetivo

Transformar leitura em proposta aprovada manualmente.

### Epico 2.1 - Proposal builder

Entregas:

- `trade-copilot.ts`

Tarefas:

- montar proposta final com:
  - lado
  - entrada
  - stop
  - alvo
  - tamanho
  - risco estimado
  - tese
  - invalidação
- ligar isso ao risk engine

Criterio de pronto:

- cada proposta ja sai em formato executavel

### Epico 2.2 - Human approval flow

Entregas:

- fluxo de aprovacao manual na UI

Tarefas:

- aprovar
- rejeitar
- registrar motivo
- disparar paper broker apenas apos aprovacao

Criterio de pronto:

- nenhuma execucao acontece sem gesto explicito do usuario

### Epico 2.3 - Replay de decisao

Entregas:

- view de replay simples

Tarefas:

- mostrar:
  - snapshot
  - regime
  - ideia
  - risco
  - decisao final

Criterio de pronto:

- qualquer proposta pode ser auditada depois

---

## Fase 3 - Paper Auto Guarded

### Objetivo

Permitir execucao automatica em ambiente controlado de paper trading.

### Entregas principais

- state machine de ordem
- reconciliacao automatica
- kill switch
- limites diarios
- freeze automatico por violacao

### Dependencias obrigatorias

- Fase 0 completa
- Fase 1 completa
- Fase 2 com replay funcional

---

## Ordem recomendada de implementacao

1. `market-autonomy.types.ts`
2. `risk-policy.ts`
3. `risk-engine.ts`
4. `brokers/base.ts`
5. `brokers/paper-broker.ts`
6. `trade-audit-log.ts`
7. `trade-supervisor.ts`
8. `trade-chaos-tests.ts`
9. `market-data.ts`
10. `market-regime.ts`
11. `strategy-engine.ts`
12. `strategy-rules/breakout.ts`
13. UI read-only
14. `trade-copilot.ts`
15. human approval flow

---

## Dependencias entre modulos

- `strategy-engine` depende de:
  - `market-data`
  - `market-regime`
  - `market-autonomy.types`

- `risk-engine` depende de:
  - `risk-policy`
  - `market-autonomy.types`

- `paper-broker` depende de:
  - `brokers/base`
  - `market-autonomy.types`

- `trade-supervisor` depende de:
  - `risk-engine`
  - `execution-policy`
  - `paper-broker`
  - `trade-audit-log`

---

## Criterio de sucesso das fases iniciais

### Fase 0

- sistema simula operacao completa
- falha limpo em chaos cases
- auditoria completa

### Fase 1

- leitura de mercado consistente
- regime explicito
- uma estrategia funcional
- nenhuma execucao

### Fase 2

- proposta estruturada
- sizing deterministico
- aprovacao humana obrigatoria
- replay funcional

---

## Recomendacao pratica

O melhor corte inicial para comecar no codigo e:

- criar `market-autonomy.types.ts`
- criar `risk-policy.ts`
- criar `risk-engine.ts`
- criar `brokers/base.ts`
- criar `brokers/paper-broker.ts`

Esse conjunto ja estabelece a espinha dorsal sem prender o design a broker real, e permite comecar a Fase 0 de forma limpa.
