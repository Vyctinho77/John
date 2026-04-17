# TradingView

## Visao geral

A integracao com TradingView no John usa o site oficial do TradingView aberto dentro do app, com sessao isolada do Electron e um conector local que observa o `BrowserView` para extrair estado do grafico.

O objetivo do v1 e:

- ler o contexto estrutural do TradingView com alta confianca
- permitir navegacao leve por simbolo e timeframe
- combinar DOM observavel com screenshot/OCR
- manter o John em modo read-only, sem ordens nem automacao de trade

## Arquivos principais

- `desktop/src/main/services/tradingview.ts`
- `desktop/src/main/services/tradingview-command-router.ts`
- `desktop/src/shared/perception.types.ts`
- `desktop/src/main/services/bridge.ts`
- `desktop/src/main/services/tutor.ts`
- `desktop/src/main/services/tutor-prompt.ts`
- `desktop/src/main/services/tutor-domains.ts`
- `desktop/src/preload/index.ts`
- `desktop/src/renderer/src/components/HUD/HudExpanded.tsx`

## Host dentro do app

O TradingView abre em uma janela dedicada do Electron.

Detalhes:

- `BrowserWindow` separada
- `BrowserView` isolado
- `partition: persist:tradingview`
- URL base: `https://www.tradingview.com/chart/`

Essa sessao separada preserva:

- cookies
- login do usuario
- navegacao do TradingView

Sem misturar isso com o resto do app.

## Observacao da pagina

O main injeta um script de observacao no `webContents` para ler DOM e sinais de interacao.

Eventos observados:

- `did-finish-load`
- `did-navigate`
- `page-title-updated`
- polling periodico

O script tenta extrair:

- `loggedIn`
- `url`
- `title`
- `symbol`
- `exchange`
- `timeframe`
- `currentPrice`
- `priceChange`
- `ohlc`
- `indicatorValues`
- `layoutHints`
- `watchlistVisible`
- `indicatorsVisible`
- `drawingToolsVisible`
- `selectedPanel`

Tambem ha rastreamento local do ponteiro sobre o chart para inferir quando o crosshair esta ativo.

## Estado do conector

O tipo principal e `TradingViewConnectorState`.

Campos relevantes:

```ts
{
  connected: boolean
  loggedIn: boolean
  lowConfidence: boolean
  url: string | null
  title: string | null
  symbol: string | null
  exchange: string | null
  timeframe: string | null
  crosshairActive: boolean
  crosshairConfidence: number
  hoveredCandleTime: string | null
  ohlcSource: 'hovered' | 'last-visible' | 'unknown'
  ohlcConfidence: number
  currentPrice: string | null
  priceChange: string | null
  ohlc: { open; high; low; close }
  recentHigh: string | null
  recentLow: string | null
  rangeState: 'expanding' | 'contracting' | 'balanced' | 'unknown'
  previousOhlc: { open; high; low; close } | null
  previousCandleTime: string | null
  candleDirection: 'bullish' | 'bearish' | 'neutral' | 'unknown'
  candleStructure: string | null
  patternHints: string[]
  structureHints: string[]
  contextualPatternHints: string[]
  sequencePatternHints: string[]
  indicatorValues: Record<string, string>
  indicatorConfidence: number
  layoutHints: string[]
  watchlistVisible: boolean
  indicatorsVisible: boolean
  drawingToolsVisible: boolean
  selectedPanel: string | null
  lastObservedAt: number | null
}
```

## Leitura tecnica local

O conector ja nao para em simbolo e timeframe. Ele tenta interpretar a candle visivel.

### Leitura da candle atual

A partir do OHLC observado, o servico deriva:

- `candleDirection`
- `candleStructure`
- `patternHints`

Exemplos de `patternHints`:

- `doji-ish`
- `small-body`
- `strong-body`
- `upper-wick-rejection`
- `lower-wick-rejection`
- `indecision`
- `impulse-candle`

### Comparacao com a candle anterior

Quando ha duas candles comparaveis, o conector deriva:

- `previousOhlc`
- `previousCandleTime`
- `contextualPatternHints`

Exemplos:

- `inside-bar`
- `outside-bar`
- `range-expansion`
- `range-contraction`
- `direction-shift`

### Memoria curta de sequencia

O servico guarda uma sequencia curta de 2 a 3 candles comparaveis e deriva:

- `sequencePatternHints`

Exemplos:

- `two-candle-continuation`
- `three-candle-continuation`
- `failed-continuation`
- `fresh-expansion`
- `fresh-compression`
- `compression-then-expansion`

### Estrutura local de range

O conector agora tambem deriva sinais simples de estrutura local a partir da sequencia curta de candles comparaveis:

- `recentHigh`
- `recentLow`
- `rangeState`
- `structureHints`

Exemplos:

- `expanding`
- `contracting`
- `balanced`
- `higher-structure`
- `lower-structure`
- `range-compression`
- `range-expansion`
- `three-candle-tightening`
- `directional-sequence`

### Confianca de leitura

O conector agora expõe sinais explícitos de confiança para a parte mais sensível da leitura:

- `crosshairConfidence`
- `ohlcConfidence`
- `indicatorConfidence`

Tambem normaliza sinais semânticos simples de indicadores em:

- `indicatorSignals`

Uso esperado:

- quando o crosshair estiver ativo e o tempo da vela estiver coerente, a leitura da vela sob o mouse sobe de confiança
- quando o crosshair estiver ativo mas a legenda nao parecer fresca, o tutor trata a leitura como provisoria
- indicadores so devem pesar forte quando o parser consegue extrair pares nome/valor com confiança razoável

Exemplos de `indicatorSignals`:

- `rsi-visible`
- `rsi-overbought`
- `rsi-oversold`
- `rsi-mid`
- `macd-visible`
- `macd-positive`
- `macd-negative`
- `ema-visible`
- `sma-visible`
- `moving-averages-visible`
- `vwap-visible`
- `volume-visible`
- `bollinger-visible`

## Crosshair e candle sob o mouse

Quando o ponteiro esta sobre o chart, o conector marca:

- `crosshairActive = true`
- `hoveredCandleTime`
- `ohlcSource = 'hovered'`

Isso melhora perguntas do tipo:

- `le essa vela`
- `qual a maxima dessa candle?`
- `isso aqui parece rejeicao?`

Quando nao ha sinal do crosshair, o conector trata o OHLC como leitura da ultima candle visivel.

## Comandos locais

`tradingview-command-router.ts` roda antes do tutor geral.

Comandos suportados hoje:

- `abre BTCUSDT`
- `abre BTCUSDT em 15m`
- `muda para 1h`
- `resume o grafico`
- `le essa vela`

Fluxo:

1. parser local tenta classificar a intencao
2. se falhar, pode usar um fallback leve por LLM
3. a acao e executada no main
4. a resposta volta como `TutorResponse` local, sem inventar estado

## Superficie preload

O preload expoe:

```ts
window.tradingViewAPI.open()
window.tradingViewAPI.close()
window.tradingViewAPI.getStatus()
window.tradingViewAPI.setSymbol(symbol)
window.tradingViewAPI.setTimeframe(tf)
window.tradingViewAPI.executeAction(payload)
window.tradingViewAPI.onStatusUpdate(cb)
```

## Acoes inline na HUD

Pedidos locais do TradingView agora podem voltar com `TutorResponse.actions`, no mesmo padrao usado pelo Spotify.

Hoje o roteador monta acoes rapidas como:

- `Abrir TradingView`
- `Resumir grafico`
- `Abrir BTCUSDT`
- `15m`
- `1h`

Fluxo:

1. o pedido cai no `tradingview-command-router.ts`
2. o main responde com texto curto + `actions`
3. a HUD renderiza chips clicaveis
4. o clique chama `window.tradingViewAPI.executeAction(...)`
5. a resposta volta localmente, sem nova rodada do tutor

## Como o tutor usa isso

O tutor injeta um bloco `TradingView (live connector)` no prompt.

Prioridade:

- simbolo, timeframe, OHLC, preco e indicadores devem vir primeiro do conector
- screenshot e OCR entram para complementar leitura visual do grafico
- quando houver `recentHigh`, `recentLow`, `rangeState` e `structureHints`, eles passam a ancorar leituras de compressao, expansao e range local

O dominio `market` em `tutor-domains.ts` usa esses campos para:

- ler candle atual
- comparar com a candle anterior
- falar de sequencia curta
- responder com linguagem de trader mais natural

## UI atual

Na Biblioteca, o card do TradingView mostra:

- icone oficial
- aberto ou fechado
- simbolo e timeframe
- preco atual
- variacao
- high/low recente quando disponivel
- resumo da leitura da candle
- estado local de range quando disponivel

Tambem ha abertura e fechamento da janela do TradingView pelo HUD.

## Limitacoes atuais

- a extracao depende do DOM do TradingView continuar reconhecivel
- nem todo layout expoe os mesmos dados
- leituras numericas ainda dependem do que a legenda e elementos visiveis mostram
- nao ha colocacao de ordens
- nao ha integracao com Broker API
- nao ha redistribuicao de biblioteca privada do TradingView

## Decisao de produto do v1

O v1 usa o site oficial do TradingView dentro do app. Ele nao usa:

- `Advanced Charts`
- `Widgets`
- `Broker API`

Isso reduz custo de integracao e aproveita a sessao real do usuario.

## Resumo

Hoje o John ja consegue:

- perceber que o TradingView esta aberto
- identificar simbolo e timeframe
- ler preco, variacao e OHLC quando a pagina expoe isso
- interpretar candle atual, candle anterior e sequencia curta
- navegar para outro simbolo ou timeframe

Ele ainda nao e um motor de execucao de trade. O foco atual e leitura confiavel do grafico e navegacao assistida.
