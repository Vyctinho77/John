import { randomUUID } from 'crypto'
import type { TradeAuditRecord } from '../../shared/market-autonomy.types'

const recentTradeAuditRecords: TradeAuditRecord[] = []
const MAX_TRADE_AUDIT_RECORDS = 300

export function appendTradeAuditRecord(
  input: Omit<TradeAuditRecord, 'id' | 'createdAt'>
): TradeAuditRecord {
  const record: TradeAuditRecord = {
    ...input,
    id: randomUUID(),
    createdAt: Date.now()
  }

  recentTradeAuditRecords.push(record)
  if (recentTradeAuditRecords.length > MAX_TRADE_AUDIT_RECORDS) {
    recentTradeAuditRecords.shift()
  }

  return record
}

export function listTradeAuditRecords(): TradeAuditRecord[] {
  return [...recentTradeAuditRecords]
}

export function getTradeAuditRecordsBySymbol(symbol: string): TradeAuditRecord[] {
  return recentTradeAuditRecords.filter(record => record.symbol === symbol)
}

export function clearTradeAuditRecords(): void {
  recentTradeAuditRecords.length = 0
}
