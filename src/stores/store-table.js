import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok, error } from '@ucanto/server'
import { RecordKeyConflict, RecordNotFound } from './lib.js'

/** @implements {UploadAPI.StoreTable} */
export class StoreTable {
  #store

  /**
   * @param {API.TransactionalStore<UploadAPI.StoreAddInput & { insertedAt: UploadAPI.ISO8601Date }>} store
   */
  constructor (store) {
    this.#store = store
  }

  /** @param {UploadAPI.UnknownLink} link */
  inspect (link) {
    return this.#store.transact(async s => {
      const spaces = []
      for await (const [, v] of s.entries({ prefix: `i/${link}` })) {
        spaces.push({ did: v.space, insertedAt: v.insertedAt })
      }
      return ok({ spaces })
    })
  }

  /**
   * @param {UploadAPI.DID} space 
   * @param {UploadAPI.UnknownLink} link
   */
  exists (space, link) {
    return this.#store.transact(async s => ok(await s.has(`d/${space}/${link}`)))
  }

  /**
   * @param {UploadAPI.DID} space 
   * @param {UploadAPI.UnknownLink} link
   */
  get (space, link) {
    return this.#store.transact(async s => {
      const res = await s.get(`d/${space}/${link}`)
      return res ? ok(res) : error(new RecordNotFound())
    })
  }

  /**
   * @param {UploadAPI.StoreAddInput} item 
   */
  insert (item) {
    return this.#store.transact(async s => {
      const record = { ...item, insertedAt: new Date().toISOString() }
      const exists = await s.get(`d/${record.space}/${record.link}`)
      if (exists) {
        return error(new RecordKeyConflict())
      }

      await s.put(`d/${record.space}/${record.link}`, record)
      await s.put(`i/${record.link}/${record.space}`, record)
      return ok({
        link: item.link,
        size: item.size,
        origin: item.origin
      })
    })
  }

  /**
   * @param {UploadAPI.DID} space 
   * @param {UploadAPI.UnknownLink} link
   */
  remove (space, link) {
    return this.#store.transact(async s => {
      const item = await s.get(`d/${space}/${link}`)
      if (!item) {
        return error(new RecordNotFound())
      }

      await s.del(`d/${space}/${link}`)
      await s.del(`i/${link}/${space}`)
      return ok({ size: item.size })
    })
  }

  /**
   * @param {UploadAPI.DID} space 
   * @param {UploadAPI.ListOptions} [options]
   */
  list (space, options) {
    if (options?.pre) {
      // pail not support listing entries backwards
      return Promise.resolve(error(new Error('pre not implemented')))
    }
    return this.#store.transact(async s => {
      const size = options?.size ?? 20
      const prefix = `d/${space}/`
      const gt = `${prefix}${options?.cursor ?? ''}`

      const results = []
      let more = false
      for await (const [k, v] of s.entries({ gt })) {
        if (!k.startsWith(prefix)) {
          break
        }
        if (results.length + 1 > size) {
          more = true
          break
        }

        results.push({
          link: v.link,
          size: v.size,
          origin: v.origin,
          insertedAt: v.insertedAt
        })
      }

      const before = results.at(0)?.link.toString()
      const after = more ? results.at(-1)?.link.toString() : undefined
      return ok(Object.assign(
        { size: results.length, results },
        before ? { before } : {},
        after ? { cursor: after, after } : {},
      ))
    })
  }
}