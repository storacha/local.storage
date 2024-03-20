import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok, error } from '@ucanto/server'

/** @implements {UploadAPI.UsageStorage} */
export class UsageStore {
  #spaceDiffStore
  #spaceSnapshotStore

  /**
   * @param {API.TransactionalStore<API.SpaceDiffRecord>} spaceDiffStore
   * @param {API.TransactionalStore<API.SpaceSnapshotRecord>} spaceSnapshotStore
   */
  constructor (spaceDiffStore, spaceSnapshotStore) {
    this.#spaceDiffStore = spaceDiffStore
    this.#spaceSnapshotStore = spaceSnapshotStore
  }

  /**
   * @param {UploadAPI.ProviderDID} provider
   * @param {UploadAPI.SpaceDID} space
   * @param {{ from: Date, to: Date }} period
   */
  async report (provider, space, period) {
    const initial = await this.#spaceSnapshotStore.transact(async s => {
      const record = await s.get(`d/${provider}/${space}/${period.from.toISOString()}`)
      return record?.size ?? 0n
    })

    return this.#spaceDiffStore.transact(async s => {
      let final = initial
      const events = []
      const prefix = `d/${provider}/${space}/`

      for await (const [k, v] of s.entries({ gt: `${prefix}/${period.from.toISOString()}` })) {
        if (!k.startsWith(prefix)) break
        if (new Date(v.receiptAt).getTime() > period.to.getTime()) break
        events.push({
          cause: v.cause,
          delta: v.delta,
          receiptAt: v.receiptAt
        })
        final += BigInt(v.delta)
      }


      if (final > Number.MAX_SAFE_INTEGER) {
        return error(new Error('space is bigger than MAX_SAFE_INTEGER'))
      }

      const report = {
        provider,
        space,
        period: {
          from: period.from.toISOString(),
          to: period.to.toISOString()
        },
        size: {
          initial: Number(initial),
          final: Number(final)
        },
        events,
      }
      return ok(report)
    })
  }
}