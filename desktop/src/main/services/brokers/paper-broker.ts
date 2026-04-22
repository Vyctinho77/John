import { randomUUID } from 'crypto'
import type {
  AccountState,
  BrokerOrderEvent,
  BrokerReplacePatch,
  ExecutionIntent,
  ExecutionResult,
  OrderState,
  PositionState
} from '../../../shared/market-autonomy.types'
import type { BrokerAdapter, UnsubscribeFn } from './base'

export interface PaperBrokerScenario {
  rejectOrders?: boolean
  rejectionReason?: string
  partialFillRatio?: number
  cancelAfterPartialFill?: boolean
  breakReconciliation?: boolean
}

export class PaperBroker implements BrokerAdapter {
  private accountState: AccountState = {
    broker: 'paper',
    equityUsd: 10_000,
    cashUsd: 10_000,
    buyingPowerUsd: 10_000,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    updatedAt: Date.now()
  }

  private orders = new Map<string, OrderState>()
  private positions = new Map<string, PositionState>()
  private subscribers = new Set<(event: BrokerOrderEvent) => void>()
  private scenario: PaperBrokerScenario

  constructor(scenario: PaperBrokerScenario = {}) {
    this.scenario = scenario
  }

  async getAccountState(): Promise<AccountState> {
    return { ...this.accountState }
  }

  async getOpenOrders(): Promise<OrderState[]> {
    return [...this.orders.values()].filter(order =>
      order.status === 'pending'
      || order.status === 'accepted'
      || order.status === 'partially_filled'
    )
  }

  async getOpenPositions(): Promise<PositionState[]> {
    if (this.scenario.breakReconciliation) {
      return []
    }
    return [...this.positions.values()]
  }

  async placeOrder(intent: ExecutionIntent): Promise<ExecutionResult> {
    const createdAt = Date.now()
    const entryOrder = this.createOrderState(intent, createdAt)

    if (this.scenario.rejectOrders) {
      const rejected: OrderState = {
        ...entryOrder,
        status: 'rejected',
        rejectionReason: this.scenario.rejectionReason ?? 'paper_rejection',
        updatedAt: createdAt
      }
      this.orders.set(rejected.id, rejected)
      this.emit({
        type: 'rejected',
        order: rejected,
        at: createdAt
      })
      return {
        accepted: false,
        orderIds: [rejected.id],
        message: rejected.rejectionReason ?? 'paper_rejection'
      }
    }

    this.orders.set(entryOrder.id, entryOrder)
    this.emit({
      type: 'accepted',
      order: entryOrder,
      at: createdAt
    })

    const partialFillRatio = this.normalizePartialFillRatio(this.scenario.partialFillRatio)
    if (partialFillRatio !== null) {
      const partialOrder = this.partiallyFillOrder(entryOrder, partialFillRatio, createdAt + 1)
      this.orders.set(partialOrder.id, partialOrder)
      this.applyPositionFromOrder(partialOrder)
      this.emit({
        type: 'partially_filled',
        order: partialOrder,
        at: createdAt + 1
      })

      if (this.scenario.cancelAfterPartialFill) {
        const canceled: OrderState = {
          ...partialOrder,
          status: 'canceled',
          updatedAt: createdAt + 2
        }
        this.orders.set(canceled.id, canceled)
        this.emit({
          type: 'canceled',
          order: canceled,
          at: createdAt + 2
        })
        return {
          accepted: true,
          orderIds: [canceled.id],
          message: 'paper_order_partially_filled_then_canceled'
        }
      }
    }

    const filledOrder = this.fillOrder(entryOrder, createdAt + 1)
    this.orders.set(filledOrder.id, filledOrder)
    this.applyPositionFromOrder(filledOrder)
    this.emit({
      type: 'filled',
      order: filledOrder,
      at: createdAt + 1
    })

    return {
      accepted: true,
      orderIds: [filledOrder.id],
      message: 'paper_order_filled'
    }
  }

  async cancelOrder(orderId: string): Promise<void> {
    const current = this.orders.get(orderId)
    if (!current) return

    const canceled: OrderState = {
      ...current,
      status: 'canceled',
      updatedAt: Date.now()
    }
    this.orders.set(orderId, canceled)
    this.emit({
      type: 'canceled',
      order: canceled,
      at: canceled.updatedAt
    })
  }

  async replaceOrder(orderId: string, patch: BrokerReplacePatch): Promise<void> {
    const current = this.orders.get(orderId)
    if (!current) return

    const updated: OrderState = {
      ...current,
      quantity: patch.quantity ?? current.quantity,
      remainingQuantity: patch.quantity ?? current.remainingQuantity,
      limitPrice: patch.limitPrice ?? current.limitPrice,
      stopPrice: patch.stopPrice ?? current.stopPrice,
      updatedAt: Date.now()
    }
    this.orders.set(orderId, updated)
  }

  async subscribeOrderEvents(onEvent: (event: BrokerOrderEvent) => void): Promise<UnsubscribeFn> {
    this.subscribers.add(onEvent)
    return () => {
      this.subscribers.delete(onEvent)
    }
  }

  private createOrderState(intent: ExecutionIntent, createdAt: number): OrderState {
    const orderId = randomUUID()
    return {
      id: orderId,
      clientOrderId: intent.entryOrder.clientOrderId ?? orderId,
      broker: 'paper',
      symbol: intent.symbol,
      side: intent.entryOrder.side,
      type: intent.entryOrder.type,
      status: 'accepted',
      quantity: intent.quantity,
      filledQuantity: 0,
      remainingQuantity: intent.quantity,
      limitPrice: intent.entryOrder.limitPrice ?? null,
      stopPrice: intent.entryOrder.stopPrice ?? null,
      averageFillPrice: null,
      createdAt,
      updatedAt: createdAt,
      rejectionReason: null
    }
  }

  private fillOrder(order: OrderState, at: number): OrderState {
    const fillPrice = order.limitPrice ?? order.stopPrice ?? 0
    return {
      ...order,
      status: 'filled',
      filledQuantity: order.quantity,
      remainingQuantity: 0,
      averageFillPrice: fillPrice,
      updatedAt: at
    }
  }

  private partiallyFillOrder(order: OrderState, ratio: number, at: number): OrderState {
    const fillPrice = order.limitPrice ?? order.stopPrice ?? 0
    const filledQuantity = Number((order.quantity * ratio).toFixed(6))
    const remainingQuantity = Number((order.quantity - filledQuantity).toFixed(6))

    return {
      ...order,
      status: 'partially_filled',
      filledQuantity,
      remainingQuantity,
      averageFillPrice: fillPrice,
      updatedAt: at
    }
  }

  private applyPositionFromOrder(order: OrderState): void {
    if (!order.averageFillPrice) return
    if (order.filledQuantity <= 0) return

    const side = order.side === 'buy' ? 'long' : 'short'
    const existing = this.positions.get(order.symbol)

    if (!existing) {
      this.positions.set(order.symbol, {
        symbol: order.symbol,
        side,
        quantity: order.filledQuantity,
        averageEntryPrice: order.averageFillPrice,
        markPrice: order.averageFillPrice,
        unrealizedPnl: 0,
        realizedPnl: 0,
        openedAt: order.updatedAt,
        updatedAt: order.updatedAt
      })
      return
    }

    const totalQuantity = existing.quantity + order.filledQuantity
    const averageEntryPrice = (
      existing.averageEntryPrice * existing.quantity
      + order.averageFillPrice * order.filledQuantity
    ) / totalQuantity

    this.positions.set(order.symbol, {
      ...existing,
      quantity: totalQuantity,
      averageEntryPrice: Number(averageEntryPrice.toFixed(6)),
      markPrice: order.averageFillPrice,
      updatedAt: order.updatedAt
    })
  }

  private emit(event: BrokerOrderEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event)
    }
  }

  private normalizePartialFillRatio(value?: number): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    if (value <= 0 || value >= 1) return null
    return value
  }
}
