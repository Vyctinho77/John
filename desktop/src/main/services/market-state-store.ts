import type { MarketSnapshot } from '@shared/market-autonomy.types'

export interface MarketStateSnapshot {
  current: MarketSnapshot | null
  lastValid: MarketSnapshot | null
  updatedAt: number | null
  lastValidAt: number | null
  invalidReason: string | null
}

class MarketStateStore {
  private current: MarketSnapshot | null = null
  private lastValid: MarketSnapshot | null = null
  private updatedAt: number | null = null
  private lastValidAt: number | null = null
  private invalidReason: string | null = null

  setSnapshot(snapshot: MarketSnapshot): void {
    this.current = cloneSnapshot(snapshot)
    this.lastValid = cloneSnapshot(snapshot)
    this.updatedAt = Date.now()
    this.lastValidAt = this.updatedAt
    this.invalidReason = null
  }

  markInvalid(reason: string): void {
    this.current = null
    this.updatedAt = Date.now()
    this.invalidReason = reason
  }

  getState(): MarketStateSnapshot {
    return {
      current: this.current ? cloneSnapshot(this.current) : null,
      lastValid: this.lastValid ? cloneSnapshot(this.lastValid) : null,
      updatedAt: this.updatedAt,
      lastValidAt: this.lastValidAt,
      invalidReason: this.invalidReason
    }
  }

  clear(): void {
    this.current = null
    this.lastValid = null
    this.updatedAt = null
    this.lastValidAt = null
    this.invalidReason = null
  }
}

export const marketStateStore = new MarketStateStore()

function cloneSnapshot(snapshot: MarketSnapshot): MarketSnapshot {
  return {
    ...snapshot,
    candles: snapshot.candles.map(candle => ({ ...candle })),
    indicators: { ...snapshot.indicators },
    openPosition: snapshot.openPosition ? { ...snapshot.openPosition } : null,
    openOrders: snapshot.openOrders.map(order => ({ ...order }))
  }
}
