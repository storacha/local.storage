import * as API from './api.js'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok, error } from '@ucanto/server'
import { Set as LinkSet } from 'lnset'
import { RecordNotFound } from './lib.js'

export class UploadAddEvent extends Event {
  /**
   * @param {import('multiformats').UnknownLink} root
   * @param {import('multiformats').Link[]} shards
   */
  constructor (root, shards) {
    super('add')
    this.root = root
    this.shards = shards
  }
}

/** @implements {UploadAPI.UploadTable} */
export class UploadStore extends EventTarget {
  #store

  /**
   * @param {API.TransactionalStore<UploadAPI.UploadAddInput & { insertedAt: UploadAPI.ISO8601Date, updatedAt: UploadAPI.ISO8601Date }>} store
   */
  constructor (store) {
    super()
    this.#store = store
  }

/** @param {UploadAPI.UnknownLink} root */
inspect (root) {
  return this.#store.transact(async s => {
    const spaces = []
    for await (const [, v] of s.entries({ prefix: `i/${root}` })) {
      spaces.push({ did: v.space, insertedAt: v.insertedAt })
    }
    return ok({ spaces })
  })
}

/**
 * @param {UploadAPI.DID} space 
 * @param {UploadAPI.UnknownLink} root
 */
exists (space, root) {
  return this.#store.transact(async s => ok(await s.has(`d/${space}/${root}`)))
}

/**
 * @param {UploadAPI.DID} space 
 * @param {UploadAPI.UnknownLink} root
 */
get (space, root) {
  return this.#store.transact(async s => {
    const res = await s.get(`d/${space}/${root}`)
    return res ? ok(res) : error(new RecordNotFound())
  })
}

/**
 * @param {UploadAPI.UploadAddInput} item 
 */
upsert (item) {
  return this.#store.transact(async s => {
    let record = await s.get(`d/${item.space}/${item.root}`)
    const now = new Date().toISOString()
    if (record) {
      const shards = new LinkSet(record.shards)
      for (const s of item.shards ?? []) {
        shards.add(s)
      }
      record = { ...record, shards: [...shards.values()], updatedAt: now }
    } else {
      record = { ...item, insertedAt: now, updatedAt: now }
    }

    await s.put(`d/${record.space}/${record.root}`, record)
    await s.put(`i/${record.root}/${record.space}`, record)
    this.dispatchEvent(new UploadAddEvent(record.root, record.shards ?? []))
    return ok({ root: record.root, shards: record.shards })
  })
}

/**
 * @param {UploadAPI.DID} space 
 * @param {UploadAPI.UnknownLink} root
 */
remove (space, root) {
  return this.#store.transact(async s => {
    const record = await s.get(`d/${space}/${root}`)
    if (!record) {
      return error(new RecordNotFound())
    }

    await s.del(`d/${space}/${root}`)
    await s.del(`i/${root}/${space}`)
    return ok({ root: record.root, shards: record.shards })
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
        root: v.root,
        shards: v.shards,
        insertedAt: v.insertedAt,
        updatedAt: v.updatedAt
      })
    }

    const before = results.at(0)?.root.toString()
    const after = more ? results.at(-1)?.root.toString() : undefined
    return ok(Object.assign(
      { size: results.length, results },
      before ? { before } : {},
      after ? { cursor: after, after } : {},
    ))
  })
}
}