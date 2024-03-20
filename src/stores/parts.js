import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { Link } from '@ucanto/server'
import { Set as LinkSet } from 'lnset'

/** @implements {UploadAPI.DudewhereBucket} */
export class PartsStore {
  #store

  /**
   * @param {API.TransactionalStore<Array<import('multiformats').Link>>} store
   */
  constructor (store) {
    this.#store = store
  }

  /**
   * @param {string} root
   * @param {string} shard
   */
  put (root, shard) {
    return this.#store.transact(async s => {
      const key = `d/${root}`
      let record = await s.get(key)
      if (!record) {
        record = []
      }
      const parts = new LinkSet(record)
      parts.add(Link.parse(shard))
      await s.put(key, [...parts.values()])
    })
  }
}