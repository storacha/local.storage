import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'

/** @implements {UploadAPI.SubscriptionsStorage} */
export class SubscriptionsStore {
  #store

  /**
   * @param {API.TransactionalStore<API.ConsumerRecord>} store
   */
  constructor (store) {
    this.#store = store
  }

  /** @param {UploadAPI.AccountDID} customer */
  list (customer) {
    return this.#store.transact(async s => {
      /** @type {Record<string, API.ConsumerRecord[]>} */
      const subs = {}
      for await (const [, v] of s.entries({ prefix: `i/cu/${customer}/` })) {
        subs[v.subscription] = subs[v.subscription] || []
        subs[v.subscription].push(v)
      }

      /** @type {import('@web3-storage/upload-api').SubscriptionListItem[]} */
      const subscriptions = []
      for (const [subscription, consumers] of Object.entries(subs)) {
        subscriptions.push({
          subscription,
          provider: consumers[0].provider,
          consumers: consumers.map(c => c.consumer)
        })
      }

      return { ok: { results: subscriptions } }
    })
  }
}