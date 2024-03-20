import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok, error, CBOR } from '@ucanto/server'
import { RecordKeyConflict } from './lib.js'

/** @implements {UploadAPI.ProvisionsStorage} */
export class ProvisionsStore {
  #subscriptionStore
  #consumerStore
  #spaceMetricsStore

  /**
   * @param {API.TransactionalStore<API.SubscriptionRecord>} subscriptionStore
   * @param {API.TransactionalStore<API.ConsumerRecord>} consumerStore
   * @param {API.TransactionalStore<API.SpaceMetricRecord>} spaceMetricsStore
   * @param {UploadAPI.ProviderDID[]} services
   */
  constructor (subscriptionStore, consumerStore, spaceMetricsStore, services) {
    this.#subscriptionStore = subscriptionStore
    this.#consumerStore = consumerStore
    this.#spaceMetricsStore = spaceMetricsStore
    this.services = services
  }

  /** @param {UploadAPI.SpaceDID} consumer */
  getStorageProviders (consumer) {
    return this.#consumerStore.transact(async s => {
      /** @type {UploadAPI.ProviderDID[]} */
      const providers = []
      for await (const [k, v] of s.entries({ prefix: `i/co/${consumer}/` })) {
        providers.push(v.provider)
      }
      return ok(providers)
    })
  }

  /** @param {UploadAPI.SpaceDID} consumer */
  hasStorageProvider (consumer) {
    return this.#consumerStore.transact(async s => {
      for await (const _ of s.entries({ prefix: `i/co/${consumer}/` })) {
        return ok(true)
      }
      return ok(false)
    })
  }

  /** @param {UploadAPI.Provision} item */
  async put (item) {
    const { cause, consumer, customer, provider } = item
    const subscription = await encodeSubscriptionID(item)

    await this.#subscriptionStore.transact(async s => {
      const key = `d/${subscription}/${provider}`
      const exists = await s.get(key)
      if (exists) return

      const record = {
        cause: cause.cid,
        provider,
        customer,
        subscription,
        insertedAt: new Date().toISOString()
      }
      await s.put(key, record)
      await s.put(`i/c/${customer}/${provider}/${subscription}`, record)
    })

    return this.#consumerStore.transact(async s => {
      const key = `d/${subscription}/${provider}`
      const exists = await s.get(key)
      if (exists) return error(new RecordKeyConflict())

      const record = {
        cause: cause.cid,
        provider,
        consumer,
        customer,
        subscription,
        insertedAt: new Date().toISOString()
      }
      await s.put(key, record)
      await s.put(`i/co/${consumer}/${provider}`, record)
      await s.put(`i/cu/${customer}/${provider}/${subscription}`, record)
      return ok({ id: subscription })
    })
  }

  /**
   * @param {UploadAPI.ProviderDID} provider
   * @param {UploadAPI.SpaceDID} consumer
   */
  async getConsumer (provider, consumer) {
    const [record, allocated] = await Promise.all([
      this.#consumerStore.transact(s => s.get(`i/co/${consumer}/${provider}`)),
      this.#spaceMetricsStore.transact(async s => {
        const record = await s.get(`d/${consumer}/store/add-size-total`)
        return record?.value ?? 0
      })
    ])
    if (!record) {
      return error({ name: 'ConsumerNotFound', message: `Consumer not found: ${consumer}` })
    }
    return ok({
      did: consumer,
      allocated,
      limit: 1_000_000_000,
      subscription: record.subscription
    })
  }

  /**
   * @param {UploadAPI.ProviderDID} provider
   * @param {UploadAPI.AccountDID} customer
   */
  async getCustomer (provider, customer) {
    const subscriptions = await this.#subscriptionStore.transact(async s => {
      const subscriptions = []
      for await (const [k, v] of s.entries({ prefix: `i/c/${customer}/${provider}/` })) {
        subscriptions.push(v.subscription)
      }
      return subscriptions
    })
    return ok({ did: customer, subscriptions })
  }

  /**
   * @param {UploadAPI.ProviderDID} provider
   * @param {string} subscription
   */
  async getSubscription (provider, subscription) {
    return await this.#consumerStore.transact(async s => {
      const record = await s.get(`d/${subscription}/${provider}`)
      if (!record) {
        return error({ name: 'SubscriptionNotFound', message: `Subscription not found: ${subscription}` })
      }
      return ok({ customer: record.customer, consumer: record.consumer })
    })
  }

  // AFAIK this is in the interface but unused
  async count () {
    return 0n
  }
}

/**
 * Create a subscription ID for a given provision. Currently 
 * uses a CID generated from `consumer` which ensures a space
 * can be provisioned at most once.
 * 
 * @param {UploadAPI.Provision} item
 */
export const encodeSubscriptionID = async ({ consumer }) =>
  (await CBOR.write({ consumer })).cid.toString()
