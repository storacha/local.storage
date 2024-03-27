import { AccountDID, DID, ISO8601Date, ProviderDID, SpaceDID, UCANLink } from '@web3-storage/upload-api'
import { EntriesOptions } from '@web3-storage/pail/api'

export { EntriesOptions }

export interface Store<T> {
  put: (key: string, value: T) => Promise<void>
  get: (key: string) => Promise<T|undefined>
  has: (key: string) => Promise<boolean>
  del: (key: string) => Promise<void>
  entries: (options?: EntriesOptions) => AsyncIterable<[string, T]>
}

export interface TransactionalStore<T> {
  transact<R> (fn: (store: Store<T>) => Promise<R>): Promise<R>
}

///////////////////////////////////////////////////////////////////////////////

export interface SubscriptionRecord {
  customer: AccountDID
  provider: ProviderDID
  subscription: string
  cause: UCANLink
  insertedAt: ISO8601Date
}

export interface ConsumerRecord {
  consumer: SpaceDID
  customer: AccountDID
  provider: ProviderDID
  subscription: string
  cause: UCANLink
  insertedAt: ISO8601Date
}

export interface SpaceMetricRecord {
  value: number
  space: SpaceDID
}

export interface DelegationRecord {
  cause?: UCANLink
  bytes: Uint8Array
  insertedAt: ISO8601Date
}

export interface RateLimitRecord {
  id: string
  subject: string
  rate: number
  insertedAt: ISO8601Date
  updatedAt?: ISO8601Date
}

export interface CustomerRecord {
  customer: AccountDID
  account: string
  product: DID
  insertedAt: ISO8601Date
  updatedAt?: ISO8601Date
}

export interface RevocationRecord {
  revoke: UCANLink
  scopes: { [scope: DID]: { cause: UCANLink } }
}

export interface SpaceDiffRecord {
  provider: ProviderDID
  space: SpaceDID
  subscription: string
  cause: UCANLink
  delta: number
  receiptAt: ISO8601Date
  insertedAt: ISO8601Date
}

export interface SpaceSnapshotRecord {
  provider: ProviderDID
  space: SpaceDID
  size: bigint
  recordedAt: ISO8601Date
  insertedAt: ISO8601Date
}

export interface ClaimRecord {
  cause: UCANLink
  bytes: Uint8Array
  content: Uint8Array // multihash
}
