import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok, error } from '@ucanto/server'

/** @implements {UploadAPI.PlansStorage} */
export class PlansStore {
  #store

  /**
   * @param {API.TransactionalStore<API.CustomerRecord>} store
   */
  constructor (store) {
    this.#store = store
  }

  /**
   * @param {UploadAPI.AccountDID} customer
   * @param {string} account
   * @param {UploadAPI.DID} product
   */
  initialize (customer, account, product) {
    return this.#store.transact(async s => {
      const key = `d/${customer}`
      const exists = await s.get(key)
      if (exists) return error({
        name: /** @type {const} */ ('CustomerExists'),
        message: `Customer already exists: ${customer}`
      })

      await s.put(key, {
        customer,
        account,
        product,
        insertedAt: new Date().toISOString()
      })
      return ok({})
    })
  }

  /** @param {UploadAPI.AccountDID} customer */
  get (customer) {
    return this.#store.transact(async s => {
      const key = `d/${customer}`
      const record = await s.get(key)
      if (!record) return error({
        name: /** @type {const} */ ('PlanNotFound'),
        message: `Plan not found`
      })

      return ok({
        product: record.product,
        updatedAt: record.updatedAt ?? record.insertedAt
      })
    })
  }

  /**
   * @param {UploadAPI.AccountDID} customer
   * @param {UploadAPI.DID} product
   */
  set (customer, product) {
    return this.#store.transact(async s => {
      const key = `d/${customer}`
      const record = await s.get(key)
      if (!record) return error({
        name: /** @type {const} */ ('CustomerNotFound'),
        message: `Customer not found: ${customer}`
      })

      await s.put(key, {
        ...record,
        product,
        updatedAt: new Date().toISOString()
      })
      return ok({})
    })
  }
}