# Roadmap Tecnico

## Objetivo

Este roadmap organiza os proximos blocos de evolucao do Ares por impacto x esforco.

A prioridade atual nao e adicionar mais features aleatorias. E melhorar:

- confiabilidade da leitura de contexto
- precisao da resposta em superficies complexas, como TradingView
- consistencia de UX entre chat e acoes locais
- controle de custo por feature

## Ordem recomendada

1. observabilidade e confianca por fonte
2. TradingView mais preciso
3. acoes inline e UX contextual
4. roteamento de custo por feature

## Sprint 1 - Observabilidade e confianca por fonte

### Objetivo

Fazer o Ares explicar melhor de onde veio cada resposta e reduzir erros por contexto velho.

### Status atual

Bloco inicial implementado:

- `TutorResponse.debug`
- `sourceConfidence`
- `dominantContextSource`
- fresh-screen guard no tutor
- badge discreto de origem na HUD
- refresh guard em `getContextSnapshot()` antes do tutor
- resumo da ultima resposta no painel de diagnostico

Ainda aberto nesta sprint:

- diagnostico visual mais detalhado para replay/debug

### Entregas

- envelope de debug por resposta
- confidence por fonte de contexto
- watchdog de stale context
- badge discreto da origem dominante da resposta na HUD

### Arquivos provaveis

- `desktop/src/main/services/tutor.ts`
- `desktop/src/main/services/tutor-prompt.ts`
- `desktop/src/main/services/perception.ts`
- `desktop/src/main/services/bridge.ts`
- `desktop/src/shared/perception.types.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/preload/index.d.ts`
- `desktop/src/renderer/src/components/HUD/HUD.tsx`
- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`

### Mudancas tecnicas

- introduzir um `ResponseDebugEnvelope`
- registrar:
  - provider
  - modelo
  - screenshot usada
  - OCR usado
  - conectores usados
  - latencia total
  - fonte dominante
- normalizar `sourceConfidence` para:
  - `bridge`
  - `vision`
  - `ocr`
  - `memory`
- se `change_summary` indicar mudanca relevante de tela, reduzir peso de memoria antiga

### Criterios de pronto

- cada resposta relevante pode ser explicada por logs estruturados
- a UI consegue mostrar origem dominante sem poluir o chat
- respostas deixam de ficar presas em contexto visual antigo com frequencia

### Riscos

- poluir demais a UI com metadado
- criar logs verbosos demais sem utilidade pratica

## Sprint 2 - TradingView de maior precisao

### Objetivo

Subir a leitura tecnica do grafico alem de candle isolada.

### Status atual

Bloco inicial implementado:

- `recentHigh`
- `recentLow`
- `rangeState`
- `structureHints`
- `indicatorConfidence`
- `crosshairConfidence`
- `ohlcConfidence`
- `indicatorSignals`
- tutor e prompt usando esses sinais
- card da Biblioteca refletindo range local

Ainda aberto nesta sprint:

- opcional: mais cobertura para indicadores menos comuns e layouts exoticos

### Entregas

- leitura mais confiavel do crosshair
- separacao melhor entre `hovered candle` e `last visible candle`
- parser melhor para indicadores visiveis
- leitura estrutural de range, expansao e contracao

### Arquivos provaveis

- `desktop/src/main/services/tradingview.ts`
- `desktop/src/main/services/tradingview-command-router.ts`
- `desktop/src/main/services/tutor.ts`
- `desktop/src/main/services/tutor-prompt.ts`
- `desktop/src/main/services/tutor-domains.ts`
- `desktop/src/shared/perception.types.ts`
- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`

### Mudancas tecnicas

- enriquecer `TradingViewConnectorState`
- adicionar sinais como:
  - `rangeState`
  - `recentHigh`
  - `recentLow`
  - `structureHints`
  - `indicatorConfidence`
- melhorar polling e script injetado para crosshair e legend values
- refinar o dominio `market` para falar de range e falha de continuacao com menos invencao

### Criterios de pronto

- perguntas como `essa vela rejeitou?` e `isso expandiu range?` ficam mais confiaveis
- o tutor distingue melhor vela sob o mouse versus ultima vela visivel
- leituras numericas ficam claramente marcadas como `alta confianca` ou `baixa confianca`

### Riscos

- DOM do TradingView mudar
- excesso de heuristica fraca parecer precisao falsa

## Sprint 3 - UX contextual e acoes inline

### Objetivo

Unificar a experiencia de acao real do Ares, para ele agir mais e inventar menos.

### Entregas

- acoes inline para TradingView e VS Code no mesmo padrao do Spotify
- estados vazios e de erro melhores na Biblioteca
- memoria curta visual melhor no chat
- respostas contextuais mais objetivas quando a intencao for clara

### Arquivos provaveis

- `desktop/src/main/index.ts`
- `desktop/src/main/services/tradingview-command-router.ts`
- `desktop/src/main/services/bridge.ts`
- `desktop/src/shared/perception.types.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/preload/index.d.ts`
- `desktop/src/renderer/src/components/HUD/HUD.tsx`
- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`
- `desktop/src/renderer/src/components/HUD/TutorActionChips.tsx`

### Mudancas tecnicas

- adicionar acoes para TradingView:
  - `abrir simbolo`
  - `mudar timeframe`
  - `resumir candle`
- as actions do TradingView agora percorrem o mesmo caminho do Spotify:
  - `TutorResponse.actions`
  - IPC dedicado `tradingview:execute-action`
  - `window.tradingViewAPI.executeAction(...)`
  - execucao direta pela HUD sem nova rodada do tutor
- estudar um primeiro conjunto de acoes locais para VS Code:
  - `ler arquivo atual`
  - `explicar diagnostico`
  - `revisar diff atual`
  - agora existe `vscode-command-router.ts` com execucao local para:
    - `report_state`
    - `read_code`
    - `explain_diagnostics`
    - `review_diff`
    - `summarize_terminal`
  - essas actions usam:
    - `TutorResponse.actions`
    - IPC `vscode:execute-action`
    - `window.vscodeAPI.executeAction(...)`
    - execucao direta pela HUD
- melhorar placeholders da Biblioteca conforme conector ativo e contexto dominante

### Criterios de pronto

- mais pedidos claros terminam em acao local real
- menos respostas textuais que simulam execucao
- cards da Biblioteca falam melhor o estado atual do sistema

### Riscos

- abrir acoes demais sem garantia de confiabilidade
- criar UX inconsistente entre conectores

## Sprint 4 - Custo por feature

### Objetivo

Controlar gasto de tokens por superficie funcional, nao so globalmente.

### Entregas

- trilhas explicitas por feature:
  - heuristica/local
  - modelo barato
  - modelo forte
- configuracao de modelo por tarefa
- cache contextual para respostas repetitivas
- metrica basica de custo por feature

### Arquivos provaveis

- `desktop/src/main/services/ai-provider.ts`
- `desktop/src/main/services/tutor.ts`
- `desktop/src/main/services/intermediate-thought-codex.ts`
- `desktop/src/main/services/intermediate-thought.ts`
- `desktop/src/main/index.ts`
- `desktop/src/main/services/settings.ts`
- `desktop/src/shared/perception.types.ts`
- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`

### Mudancas tecnicas

- configurar modelos diferentes para:
  - tutor principal
  - visao
  - stage 2
  - titulos
  - roteadores com fallback LLM
- adicionar cache quando:
  - prompt mudou pouco
  - screenshot mudou pouco
  - conector dominante manteve o mesmo estado
- registrar custo e modelo por tarefa

### Criterios de pronto

- o custo medio por sessao cai
- o sistema fica previsivel em qual modelo cada bloco usa
- respostas repetidas em contexto quase igual deixam de consumir modelo forte sem necessidade

### Riscos

- cache excessivo gerar resposta velha
- granularidade ruim de configuracao complicar UX

## Backlog transversal

Itens que podem entrar em qualquer sprint quando fizer sentido:

- testes de regressao do bridge
- testes de OCR e stale context
- testes de roteadores locais
- modo diagnostico interno para debug rapido
- melhoria da documentacao de fluxos de erro

## Definicao de sucesso

Vamos considerar esse roadmap bem executado quando:

- o Ares errar menos por confusao de fonte
- o TradingView responder com mais seguranca tecnica
- a HUD explicar melhor o que o Ares viu e fez
- o custo por sessao cair sem piorar a experiencia

## Ordem de execucao recomendada

1. Sprint 1
2. Sprint 2
3. Sprint 3
4. Sprint 4

Essa ordem existe porque:

- primeiro vem diagnostico e confianca
- depois precisao de superficie complexa
- depois refinamento de experiencia
- por fim, otimizacao economica mais profunda
