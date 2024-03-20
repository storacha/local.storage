import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok, Delegation } from '@ucanto/server'

/** @implements {UploadAPI.DelegationsStorage} */
export class DelegationsStore {
  #store

  /**
   * @param {API.TransactionalStore<API.DelegationRecord>} store
   */
  constructor (store) {
    this.#store = store
  }


  /**
   * @param {Array<UploadAPI.Delegation<UploadAPI.Tuple<UploadAPI.Capability>>>} delegations 
   * @param {{ cause?: UploadAPI.Link }} [options]
   */
  putMany (delegations, options) {
    return this.#store.transact(async s => {
      for (const d of delegations) {
        const archive = await d.archive()
        if (!archive.ok) return archive

        await s.put(`d/${d.audience}/${d.cid}`, Object.assign({
          bytes: archive.ok,
          insertedAt: new Date().toISOString()
        }, options?.cause ? { cause: options.cause } : {}))
      }
      return ok({})
    })
  }

  /** @param {UploadAPI.DelegationsStorageQuery} query */
  find (query) {
    return this.#store.transact(async s => {
      const delegations = []
      for await (const [, v] of s.entries({ prefix: `d/${query.audience}/` })) {
        const delegation = await Delegation.extract(v.bytes)
        if (!delegation.ok) return delegation
        delegations.push(delegation.ok)
      }
      return ok(delegations)
    })
  }

  // AFAIK this is in the interface but unused
  async count () {
    return 0n
  }
}