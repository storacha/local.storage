import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok, error } from '@ucanto/server'
import { nanoid } from 'nanoid'
import { RecordNotFound } from './lib.js'

/** @implements {UploadAPI.RateLimitsStorage} */
export class RateLimitsStore {
  #store

  /**
   * @param {API.TransactionalStore<API.RateLimitRecord>} store
   */
  constructor (store) {
    this.#store = store
  }

  /**
   * @param {string} subject 
   * @param {number} rate 
   */
  add (subject, rate) {
    return this.#store.transact(async s => {
      const insertedAt = new Date().toISOString()
      const id = nanoid()
      const record = {
        id,
        subject,
        rate,
        insertedAt
      }
      await s.put(`d/${id}`, record)
      await s.put(`i/${subject}/${id}`, record)
      return ok({ id })
    })
  }

  /** @param {string} subject */
  list (subject) {
    return this.#store.transact(async s => {
      const rateLimits = []
      for await (const [, v] of s.entries({ prefix: `i/${subject}/` })) {
        rateLimits.push({ id: v.id, rate: v.rate })
      }
      return ok(rateLimits)
    })
  }

  /** @param {string} id */
  remove (id) {
    return this.#store.transact(async s => {
      const record = await s.get(`d/${id}`)
      if (!record) return error(new RecordNotFound())

      await s.del(`d/${id}`)
      await s.del(`i/${record.subject}/${id}`)
      return ok({})
    })
  }
}
