import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import type { OperatorAnalysis } from '@shared/perception.types'

const MAX_ENTRIES = 100
const MAX_PER_SYMBOL = 10
const MAX_PROMPT_ENTRIES = 3
const MAX_SUMMARY_LEN = 300

const STORE_PATH = join(app.getPath('userData'), 'operator-analyses.json')

let entries: OperatorAnalysis[] = []
let loaded = false

async function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = await readFile(STORE_PATH, 'utf-8')
    entries = JSON.parse(raw)
    if (!Array.isArray(entries)) entries = []
  } catch {
    entries = []
  }
}

async function persist() {
  try {
    await mkdir(dirname(STORE_PATH), { recursive: true })
    await writeFile(STORE_PATH, JSON.stringify(entries), 'utf-8')
  } catch {
    // falha silenciosa
  }
}

export const analysisStore = {
  async save(analysis: OperatorAnalysis): Promise<void> {
    await load()
    entries.unshift(analysis)

    // Limite por símbolo
    const sym = analysis.symbol.toUpperCase()
    let symCount = 0
    entries = entries.filter(e => {
      if (e.symbol.toUpperCase() !== sym) return true
      symCount++
      return symCount <= MAX_PER_SYMBOL
    })

    // Limite global FIFO
    if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES)

    await persist()
  },

  async list(symbol?: string): Promise<OperatorAnalysis[]> {
    await load()
    if (!symbol) return entries
    const sym = symbol.toUpperCase()
    return entries.filter(e => e.symbol.toUpperCase() === sym)
  },

  async clear(): Promise<void> {
    entries = []
    loaded = true
    await persist()
  },

  async formatForPrompt(symbol: string): Promise<string> {
    await load()
    const sym = symbol.toUpperCase()
    const relevant = entries
      .filter(e => e.symbol.toUpperCase() === sym)
      .slice(0, MAX_PROMPT_ENTRIES)
    if (!relevant.length) return ''

    const lines = relevant.map(e => {
      const date = new Date(e.timestamp).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      })
      const tf = e.timeframe ? ` [${e.timeframe}]` : ''
      const price = e.price ? ` @ ${e.price}` : ''
      const summary = e.summary.length > MAX_SUMMARY_LEN
        ? e.summary.slice(0, MAX_SUMMARY_LEN - 1) + '…'
        : e.summary
      return `[${date}${tf}${price}] ${summary}`
    })

    return `--- Análises anteriores (${sym}) ---\n${lines.join('\n')}\n---`
  }
}
