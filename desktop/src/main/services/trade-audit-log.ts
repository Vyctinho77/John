import { randomUUID } from 'crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import type { TradeAuditRecord } from '../../shared/market-autonomy.types'
import { getLocalUserDataPath } from './local-user-data.ts'

const recentTradeAuditRecords: TradeAuditRecord[] = []
export const MAX_TRADE_AUDIT_RECORDS = 300
let loadedFromDisk = false

export function appendTradeAuditRecord(
  input: Omit<TradeAuditRecord, 'id' | 'createdAt'>
): TradeAuditRecord {
  loadTradeAuditRecordsIfNeeded()
  const record: TradeAuditRecord = {
    ...input,
    id: randomUUID(),
    createdAt: Date.now()
  }

  recentTradeAuditRecords.push(record)
  if (recentTradeAuditRecords.length > MAX_TRADE_AUDIT_RECORDS) {
    recentTradeAuditRecords.shift()
  }

  persistTradeAuditRecords()
  return record
}

export function listTradeAuditRecords(): TradeAuditRecord[] {
  loadTradeAuditRecordsIfNeeded()
  return [...recentTradeAuditRecords]
}

export function getTradeAuditRecordsBySymbol(symbol: string): TradeAuditRecord[] {
  loadTradeAuditRecordsIfNeeded()
  return recentTradeAuditRecords.filter(record => record.symbol === symbol)
}

export function clearTradeAuditRecords(): void {
  recentTradeAuditRecords.length = 0
  loadedFromDisk = true
  try {
    rmSync(getTradeAuditStoragePath(), { force: true })
  } catch {
    // Memory is authoritative for the current process.
  }
}

export function resetTradeAuditCacheForTests(): void {
  recentTradeAuditRecords.length = 0
  loadedFromDisk = false
}

function loadTradeAuditRecordsIfNeeded(): void {
  if (loadedFromDisk) return
  loadedFromDisk = true

  const storagePath = getTradeAuditStoragePath()
  if (!existsSync(storagePath)) return

  try {
    const parsed = JSON.parse(readFileSync(storagePath, 'utf8'))
    if (!Array.isArray(parsed)) return
    recentTradeAuditRecords.length = 0
    recentTradeAuditRecords.push(...parsed.filter(isTradeAuditRecord).slice(-MAX_TRADE_AUDIT_RECORDS))
  } catch {
    recentTradeAuditRecords.length = 0
  }
}

function persistTradeAuditRecords(): void {
  writeFileSync(
    getTradeAuditStoragePath(),
    JSON.stringify(recentTradeAuditRecords.slice(-MAX_TRADE_AUDIT_RECORDS), null, 2),
    'utf8'
  )
}

function getTradeAuditStoragePath(): string {
  return process.env.ARES_TRADE_AUDIT_PATH ?? getLocalUserDataPath('trade-audit-records.json')
}

function isTradeAuditRecord(value: unknown): value is TradeAuditRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TradeAuditRecord>
  return typeof record.id === 'string'
    && typeof record.symbol === 'string'
    && typeof record.strategyId === 'string'
    && typeof record.phase === 'string'
    && typeof record.snapshotTimestamp === 'number'
    && typeof record.createdAt === 'number'
    && Boolean(record.payload)
}
