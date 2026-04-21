import type { MacroEvent, TradingViewConnectorState } from '../../shared/perception.types'
import { generateRemoteText } from './ai-provider'
import { newsService } from './news-service'
import { analysisStore } from './analysis-store'
import { formatTradingViewConnectorContext } from './tutor-prompt'

export interface OperatorAlert {
  id: string
  content: string
  triggeredBy: string[]
  at: number
}

type AlertCallback = (alert: OperatorAlert) => void

const COOLDOWN_MS = 3 * 60 * 1000   // 3 min entre análises proativas
const SNAPSHOT_DELAY_MS = 1_500     // aguarda estado estabilizar ao entrar no modo
const MIN_SIGNALS_TO_TRIGGER = 1

const listeners: Set<AlertCallback> = new Set()
let active = false
let lastAlertAt = 0
let lastHotNewsAt = 0
let prevState: TradingViewConnectorState | null = null
let unsubscribe: (() => void) | null = null
let unsubscribeNews: (() => void) | null = null
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let getStateFn: (() => TradingViewConnectorState) | null = null

function emit(alert: OperatorAlert) {
  for (const cb of listeners) cb(alert)
}

function diffSignals(prev: TradingViewConnectorState, next: TradingViewConnectorState): string[] {
  const triggers: string[] = []

  // New pattern hints
  const newPatterns = next.patternHints.filter(p => !prev.patternHints.includes(p))
  if (newPatterns.length) triggers.push(...newPatterns)

  // New sequence patterns
  const newSeq = next.sequencePatternHints.filter(p => !prev.sequencePatternHints.includes(p))
  if (newSeq.length) triggers.push(...newSeq)

  // New indicator signals
  const newSigs = next.indicatorSignals.filter(s => !prev.indicatorSignals.includes(s))
  if (newSigs.length) triggers.push(...newSigs)

  // Candle direction flip (bullish ↔ bearish, ignore neutral/unknown)
  const relevantDir = (d: string) => d === 'bullish' || d === 'bearish'
  if (
    relevantDir(prev.candleDirection) &&
    relevantDir(next.candleDirection) &&
    prev.candleDirection !== next.candleDirection
  ) {
    triggers.push(`candle flipped ${prev.candleDirection} → ${next.candleDirection}`)
  }

  // Range state change (contracting → expanding = breakout setup)
  if (
    prev.rangeState !== 'unknown' &&
    next.rangeState !== 'unknown' &&
    prev.rangeState !== next.rangeState
  ) {
    triggers.push(`range ${prev.rangeState} → ${next.rangeState}`)
  }

  return triggers
}

async function generate(
  system: string,
  prompt: string,
  triggers: string[],
  state?: TradingViewConnectorState
) {
  try {
    const result = await generateRemoteText({
      sensitive: false,
      system,
      prompt,
      feature: 'tutor'
    })
    if (!result?.text?.trim()) return
    const content = result.text.trim()
    const alert: OperatorAlert = {
      id: `alert-${Date.now()}`,
      content,
      triggeredBy: triggers,
      at: Date.now()
    }
    emit(alert)

    if (state?.symbol) {
      void analysisStore.save({
        id: alert.id,
        symbol: state.symbol,
        timestamp: alert.at,
        summary: content,
        triggeredBy: triggers,
        price: state.currentPrice ?? null,
        timeframe: state.timeframe ?? null
      })
    }
  } catch {
    // falha silenciosa — não interrompe o operador
  }
}

async function runHotNewsAlert(state: TradingViewConnectorState) {
  const now = Date.now()
  if (now - lastHotNewsAt < COOLDOWN_MS) return
  const hotItems = newsService.getSnapshot().hotItems
  if (!hotItems.length) return
  lastHotNewsAt = now

  const tvBlock = formatTradingViewConnectorContext(state)
  const headlines = hotItems.map((h, i) => `[${i + 1}] ${h.title}`).join('\n')

  const system = [
    'Você é um coanalista de mercado autônomo.',
    'Uma notícia de alto impacto foi detectada. Conecte-a ao setup atual do gráfico.',
    'Máximo 3 frases: qual é o evento, como pode afetar o ativo, e o que observar no preço.',
    'Não use markdown, bullets ou headers. Fale como analista ao vivo.',
    'Responda em português brasileiro.'
  ].join('\n')

  const prompt = [
    `Notícias quentes:\n${headlines}`,
    tvBlock
  ].join('\n\n')

  await generate(system, prompt, hotItems.map(h => h.title), state)
}

async function runSnapshot(state: TradingViewConnectorState) {
  if (!active || !state.connected || !state.symbol) return
  lastAlertAt = Date.now()

  const tvBlock = formatTradingViewConnectorContext(state)
  const newsBlock = newsService.formatForPrompt(state.symbol)

  const system = [
    'Você é um coanalista de mercado autônomo. O trader acabou de abrir o modo operador.',
    'Faça uma leitura rápida do setup atual: estrutura do preço, momentum e o que observar.',
    'Máximo 3 frases. Direto, como um analista entrando numa sala de operações.',
    'Não use markdown, bullets ou headers.',
    'Se houver notícias recentes relevantes, mencione em uma frase.',
    'Responda em português brasileiro.'
  ].join('\n')

  const prompt = [
    'Snapshot inicial — descreva o setup atual do gráfico.',
    tvBlock,
    newsBlock || ''
  ].filter(Boolean).join('\n\n')

  await generate(system, prompt, ['snapshot'], state)
}

async function runAnalysis(state: TradingViewConnectorState, triggers: string[]) {
  const now = Date.now()
  if (now - lastAlertAt < COOLDOWN_MS) return
  lastAlertAt = now

  const tvBlock = formatTradingViewConnectorContext(state)
  const newsBlock = newsService.formatForPrompt(state.symbol ?? '')

  const system = [
    'Você é um coanalista de mercado autônomo monitorando um gráfico em tempo real.',
    'Seu papel é alertar o trader sobre eventos técnicos relevantes que acabaram de ocorrer.',
    'Seja direto e específico — máximo 3 frases curtas.',
    'Mencione o padrão detectado, o nível de preço relevante e o que isso pode sinalizar.',
    'Não repita o que o trader já pode ver. Dê contexto e implicação.',
    'Não use markdown, bullets ou headers. Escreva como um analista falando ao vivo.',
    'Se houver notícias recentes relevantes, mencione brevemente.',
    'Responda em português brasileiro.'
  ].join('\n')

  const prompt = [
    `Eventos detectados: ${triggers.join(' | ')}`,
    tvBlock,
    newsBlock || ''
  ].filter(Boolean).join('\n\n')

  await generate(system, prompt, triggers, state)
}

function onStateChange(state: TradingViewConnectorState) {
  if (!active || !state.connected || !state.symbol) return

  const prev = prevState
  prevState = state

  if (!prev || !prev.connected) return

  const triggers = diffSignals(prev, state)
  if (triggers.length >= MIN_SIGNALS_TO_TRIGGER) {
    void runAnalysis(state, triggers)
  }
}

export const operatorAnalyst = {
  start(tradingViewService: {
    onStatusChange: (cb: (s: TradingViewConnectorState) => void) => () => void
    getState: () => TradingViewConnectorState
  }) {
    if (active) return
    active = true
    prevState = null
    lastAlertAt = 0
    lastHotNewsAt = 0
    getStateFn = tradingViewService.getState
    unsubscribe = tradingViewService.onStatusChange(onStateChange)
    unsubscribeNews = newsService.onUpdate(snap => {
      if (!active || !snap.hotItems.length) return
      const state = tradingViewService.getState()
      if (state.connected && state.symbol) void runHotNewsAlert(state)
    })

    snapshotTimer = setTimeout(() => {
      snapshotTimer = null
      const state = tradingViewService.getState()
      void runSnapshot(state)
    }, SNAPSHOT_DELAY_MS)
  },

  stop() {
    active = false
    if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null }
    unsubscribe?.()
    unsubscribe = null
    unsubscribeNews?.()
    unsubscribeNews = null
    prevState = null
    getStateFn = null
  },

  analyzeNow() {
    if (!active || !getStateFn) return
    const state = getStateFn()
    if (!state.connected || !state.symbol) return
    lastAlertAt = 0
    void runSnapshot(state)
  },

  onAlert(cb: AlertCallback): () => void {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  briefMacroEvent(event: MacroEvent, state: TradingViewConnectorState) {
    if (!active) return
    const until = Math.round((event.timestamp - Date.now()) / 60000)
    const tvBlock = formatTradingViewConnectorContext(state)
    const fc = event.forecast ? ` | Previsão: ${event.forecast} / Anterior: ${event.previous ?? '–'}` : ''

    const system = [
      'Você é um coanalista de mercado autônomo.',
      'Um evento macro de alto impacto está prestes a ser divulgado.',
      'Faça um briefing pré-evento: o que é o indicador, o que o mercado espera, e como o setup atual pode reagir.',
      'Máximo 4 frases. Tom de analista ao vivo, sem markdown.',
      'Responda em português brasileiro.'
    ].join('\n')

    const prompt = [
      `Evento: ${event.country} ${event.title} — daqui ${until} minuto(s)${fc}`,
      tvBlock
    ].join('\n\n')

    void generate(system, prompt, [`macro:${event.title}`], state)
  }
}
