import fs from 'node:fs'
import path from 'node:path'
import * as Link from 'multiformats/link'
import * as Block from 'multiformats/block'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import * as Pail from '@web3-storage/pail'
import { MultiBlockFetcher } from '@web3-storage/pail/block'
import { ShardBlock } from '@web3-storage/pail/shard'
import { FsBlockstore } from 'blockstore-fs'
import Queue from 'p-queue'
import defer from 'p-defer'
import { Map as LinkMap } from 'lnmap'

/**
 * @template T
 * @typedef {import('./api.js').TransactionalStore<T>} ITransactionalStore
 */

/**
 * @template T
 * @typedef {import('./api.js').Store<T>} IStore
 */

/**
 * A store that uses transactions to ensure data consistency.
 *
 * @template T
 * @implements {ITransactionalStore<T>}
 */
export class Store {
  /** @type {LinkStore<import('@web3-storage/pail/api').ShardLink>} */
  #root
  #queue
  #blocks
  #codec

  /**
   * Creates a new store that uses transactions to ensure data consistency.
   *
   * @param {string} dir
   * @param {{ codec?: import('multiformats').BlockCodec }} [options]
   */
  constructor (dir, options) {
    this.#root = new LinkStore(path.join(dir, 'root'))
    this.#blocks = new BlockStore(path.join(dir, 'blocks'))
    this.#queue = new Queue({ concurrency: 1 })
    this.#codec = options?.codec ?? codec
  }

  /**
   * @template R
   * @param {(store: IStore<T>) => Promise<R>} fn
   * @returns {Promise<R>}
   */
  transact (fn) {
    return transact({
      queue: this.#queue,
      root: this.#root,
      blocks: this.#blocks,
      codec: this.#codec
    }, fn)
  }

  /**
   * Partitions a transactional store using the provided keyspace prefix.
   *
   * @template P
   * @param {string} prefix
   * @param {{ codec?: import('multiformats').BlockCodec }} [options]
   * @returns {ITransactionalStore<P>}
   */
  partition (prefix, options) {
    const config = {
      queue: this.#queue,
      root: this.#root,
      blocks: this.#blocks,
      codec: this.#codec,
      ...options
    }
    return {
      /**
       * @template R
       * @param {(store: IStore<P>) => Promise<R>} fn
       * @returns {Promise<R>}
       */
      transact (fn) {
        return transact(config, store => fn(new SubTxnStore(prefix, store)))
      }
    }
  }
}

/**
 * @template T
 * @template R
 * @param {object} config
 * @param {Queue} config.queue Transaction queue.
 * @param {LinkStore} config.root Storage for the DAG root.
 * @param {BlockStore} config.blocks
 * @param {import('multiformats').BlockCodec} config.codec
 * @param {(store: IStore<T>) => Promise<R>} fn
 * @returns {Promise<R>}
 */
const transact = async ({ queue, root, blocks, codec }, fn) => {
  /** @type {import('p-defer').DeferredPromise<R>} */
  const { promise, resolve, reject } = defer()
  await queue.add(async () => {
    try {
      let rootLink = await root.get()
      if (!rootLink) {
        const block = await ShardBlock.create()
        await blocks.put(block.cid, block.bytes)
        await root.set(block.cid)
        rootLink = block.cid
      }
      const txn = new TxnStore({ root: rootLink, blocks, codec })
      const result = await fn(txn)
      for (const a of txn.additions) {
        await blocks.put(a.cid, a.bytes)
      }
      await root.set(txn.root)
      for (const r of txn.removals) {
        await blocks.del(r.cid)
      }
      resolve(result)
      if (rootLink.toString() !== txn.root.toString()) {
        console.log(`Transaction commit: ${txn.root}`)
      }
    } catch (err) {
      reject(err)
    }
  })
  return promise
}

/**
 * @template T
 * @implements {IStore<T>}
 */
class TxnStore {
  #root
  #blocks
  /** @type {Map<import('multiformats').Link, import('multiformats').Block>} */
  #additions
  /** @type {Map<import('multiformats').Link, import('multiformats').Block>} */
  #removals
  #codec

  /**
   * @param {object} params
   * @param {import('@web3-storage/pail/api').ShardLink} params.root
   * @param {import('@web3-storage/pail/api').BlockFetcher} params.blocks
   * @param {import('multiformats').BlockCodec} params.codec
   */
  constructor ({ root, blocks, codec }) {
    this.#blocks = new MultiBlockFetcher({
      // @ts-expect-error
      get: async cid => this.#additions.get(cid)
    }, blocks)
    this.#root = root
    this.#additions = new LinkMap()
    this.#removals = new LinkMap()
    this.#codec = codec
  }

  get root () {
    return this.#root
  }

  get additions () {
    return [...this.#additions.values()]
  }

  get removals () {
    return [...this.#removals.values()]
  }

  /**
   * @param {string} key 
   * @param {T} value 
   */
  async put (key, value) {
    const valueBlock = await Block.encode({ value, codec: this.#codec, hasher })
    this.#additions.set(valueBlock.cid, valueBlock)
    if (this.#removals.has(valueBlock.cid)) {
      this.#removals.delete(valueBlock.cid)
    }

    // TODO: remove the value when putting to an existing key?

    const res = await Pail.put(this.#blocks, this.#root, key, valueBlock.cid)
    this.#applyDiff(res)
  }

  /** @param {string} key */
  async del (key) {
    const valueLink = await Pail.get(this.#blocks, this.#root, key)
    if (!valueLink) return

    const valueBlock = await this.#blocks.get(valueLink)
    if (!valueBlock) throw new Error(`missing value for key: ${key}: ${valueLink}`)

    // @ts-expect-error
    this.#additions.delete(valueBlock.cid)
    // TODO: this could be referenced somewhere else in the pail
    // this.#removals.set(valueBlock.cid, valueBlock)

    const res = await Pail.del(this.#blocks, this.#root, key)
    this.#applyDiff(res)
  }

  /**
   * @param {{ root: import('@web3-storage/pail/api').ShardLink } & import('@web3-storage/pail/api').ShardDiff} diff 
   */
  #applyDiff (diff) {
    for (const a of diff.additions) {
      if (this.#removals.has(a.cid)) {
        this.#removals.delete(a.cid)
      }
      this.#additions.set(a.cid, a)
    }
    for (const r of diff.removals) {
      if (this.#additions.has(r.cid)) {
        this.#additions.delete(r.cid)
      }
      this.#removals.set(r.cid, r)
    }
    this.#root = diff.root
  }

  /** @param {string} key */
  async get (key) {
    const valueLink = await Pail.get(this.#blocks, this.#root, key)
    if (!valueLink) return
    const valueBlock = await this.#blocks.get(valueLink)
    if (!valueBlock) throw new Error(`missing value for key: ${key}: ${valueLink}`)
    return this.#codec.decode(valueBlock.bytes)
  }

  /** @param {string} key */
  async has (key) {
    const exists = await Pail.get(this.#blocks, this.#root, key)
    return Boolean(exists)
  }

  /**
   * @param {{ gt?: string, prefix?: string }} [options]
   * @returns {AsyncIterable<[string, T]>}
   */
  async * entries (options) {
    for await (const [k, v] of Pail.entries(this.#blocks, this.#root, options)) {
      const valueBlock = await this.#blocks.get(v)
      if (!valueBlock) throw new Error('missing value for key')
      yield [k, codec.decode(valueBlock.bytes)]
    }
  }
}

/**
 * @template T
 * @implements {IStore<T>}
 */
class SubTxnStore {
  #prefix
  #store

  /**
   * @param {string} prefix
   * @param {IStore<T>} store
   */
  constructor (prefix, store) {
    this.#prefix = prefix
    this.#store = store
  }

  /**
   * @param {string} key 
   * @param {T} value 
   */
  put (key, value) {
    return this.#store.put(`${this.#prefix}${key}`, value)
  }

  /** @param {string} key */
  del (key) {
    return this.#store.del(`${this.#prefix}${key}`)
  }

  /** @param {string} key */
  get (key) {
    return this.#store.get(`${this.#prefix}${key}`)
  }

  /** @param {string} key */
  has (key) {
    return this.#store.has(`${this.#prefix}${key}`)
  }

  /**
   * @param {{ gt?: string, prefix?: string }} [options]
   * @returns {AsyncIterable<[string, T]>}
   */
  async * entries (options) {
    options = { ...options }
    if (options.gt) {
      options.gt = `${this.#prefix}${options.gt}`
    } else {
      options.prefix = this.#prefix
    }
    for await (const [k, v] of this.#store.entries(options)) {
      yield [k.slice(this.#prefix.length), v]
    }
  }
}

/**
 * A store for a single CID.
 *
 * @template {import('multiformats').Link} T
 */
class LinkStore {
  #link
  #filepath

  /** @param {string} filepath */
  constructor (filepath) {    
    this.#filepath = filepath
    try {
      this.#link = /** @type {T} */ (Link.decode(fs.readFileSync(filepath)))
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  async get () {
    return this.#link
  }

  /** @param {T} link */
  async set (link) {
    await fs.promises.writeFile(this.#filepath, link.bytes)
    this.#link = link
  }
}

export class BlockStore {
  #bs

  /** @param {string} dir */
  constructor (dir) {
    fs.mkdirSync(dir, { recursive: true })
    this.#bs = new FsBlockstore(dir)
  }

  /**
   * @param {import('multiformats').UnknownLink} cid
   * @param {Uint8Array} bytes
   */
  put (cid, bytes) {
    // @ts-expect-error
    return this.#bs.put(cid, bytes)
  }

  /**
   * @template {unknown} T
   * @template {number} C
   * @template {number} A
   * @template {import('multiformats').Version} V
   * @param {import('multiformats').Link<T, C, A, V>} cid
   * @returns {Promise<import('multiformats').Block<T, C, A, V> | undefined>}
   */
  async get (cid) {
    try {
      // @ts-expect-error
      const bytes = await this.#bs.get(cid)
      return { cid, bytes }
    } catch {}
  }

  /** @param {import('multiformats').UnknownLink} cid */
  del (cid) {
    // @ts-expect-error
    return this.#bs.delete(cid)
  }
}
