import type {
  AccountState,
  BrokerOrderEvent,
  BrokerReplacePatch,
  ExecutionIntent,
  ExecutionResult,
  OrderState,
  PositionState
} from '../../../shared/market-autonomy.types'

export type UnsubscribeFn = () => void

export interface BrokerAdapter {
  getAccountState(): Promise<AccountState>
  getOpenOrders(): Promise<OrderState[]>
  getOpenPositions(): Promise<PositionState[]>
  placeOrder(intent: ExecutionIntent): Promise<ExecutionResult>
  cancelOrder(orderId: string): Promise<void>
  replaceOrder(orderId: string, patch: BrokerReplacePatch): Promise<void>
  subscribeOrderEvents(onEvent: (event: BrokerOrderEvent) => void): Promise<UnsubscribeFn>
}
