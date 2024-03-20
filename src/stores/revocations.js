import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok } from '@ucanto/server'

/** @implements {UploadAPI.RevocationsStorage} */
export class RevocationsStore {
  #store

  /**
   * @param {API.TransactionalStore<API.RevocationRecord>} store
   */
  constructor (store) {
    this.#store = store
  }

  /** @param {UploadAPI.Revocation} revocation */
  add (revocation) {
    return this.#store.transact(async s => {
      const key = `d/${revocation.revoke}`
      let record = await s.get(key)
      if (!record) {
        record = { revoke: revocation.revoke, scopes: {} }
      }
      record.scopes[revocation.scope] = { cause: revocation.cause }
      await s.put(key, record)
      return ok({})
    })
  }

  /** @param {UploadAPI.Revocation} revocation */
  reset (revocation) {
    return this.#store.transact(async s => {
      await s.put(`d/${revocation.revoke}`, /** @type {API.RevocationRecord} */ ({
        revoke: revocation.revoke,
        scopes: { [revocation.scope]: { cause: revocation.cause } }
      }))
      return ok({})
    })
  }

  /** @param {UploadAPI.RevocationQuery} query */
  query (query) {
    return this.#store.transact(async s => {
      /** @type {UploadAPI.MatchingRevocations} */
      const matches = {}
      for (const revoke of Object.keys(query)) {
        const record = await s.get(`d/${revoke}`)
        if (!record) continue
        matches[revoke] = record.scopes
      }
      return ok(matches)
    })
  }
}