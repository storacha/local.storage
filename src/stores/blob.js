import { base64pad } from 'multiformats/bases/base64'
import { base58btc } from 'multiformats/bases/base58'
import { sha256 } from 'multiformats/hashes/sha2'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok, error } from '@ucanto/server'
import * as API from './api.js'
import { RecordNotFound } from './lib.js'

export class BlobPutEvent extends Event {
  /** @param {import('multiformats').MultihashDigest} digest */
  constructor (digest) {
    super('put')
    this.digest = digest
  }
}

export class BlobStore extends EventTarget {
  #store
  #signer
  #url

  /**
   * @param {API.TransactionalStore<Uint8Array>} store
   * @param {import('@ucanto/server').Signer} signer
   * @param {URL} url
   */
  constructor (store, signer, url) {
    super()
    this.#store = store
    this.#signer = signer
    this.#url = url
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {Promise<UploadAPI.Result<{ digest: import('multiformats').MultihashDigest }>>}
   */
  async put (bytes) {
    const digest = await sha256.digest(bytes)
    await this.#store.transact(s => s.put(`d/${base58btc.encode(digest.bytes)}`, bytes))
    this.dispatchEvent(new BlobPutEvent(digest))
    return ok({ digest })
  }

  /** @param {import('multiformats').MultihashDigest} digest */
  has (digest) {
    return this.#store.transact(s => s.has(`d/${base58btc.encode(digest.bytes)}`))
  }

  /**
   * @param {import('multiformats').MultihashDigest} digest
   * @param {{ range?: import('../api.js').Range }} [options]
   * @returns {Promise<import('@ucanto/interface').Result<ReadableStream<Uint8Array>, import('@web3-storage/upload-api').RecordNotFound>>}
   */
  async stream (digest, options) {
    const { range } = options ?? {}
    const bytes = await this.#store.transact(s => s.get(`d/${base58btc.encode(digest.bytes)}`))
    if (!bytes) return error(new RecordNotFound())
    return ok(
      /** @type {ReadableStream<Uint8Array>} */
      new ReadableStream({
        pull (controller) {
          if (range) {
            if ('suffix' in range) {
              controller.enqueue(bytes.slice(-range.suffix))
            } else if (range.offset && range.length) {
              controller.enqueue(bytes.slice(range.offset, range.offset + range.length))
            } else if (range.offset) {
              controller.enqueue(bytes.slice(range.offset))
            } else if (range.length) {
              controller.enqueue(bytes.slice(0, range.length))
            }
          } else {
            controller.enqueue(bytes)
          }
          controller.close()
        }
      })
    )
  }

  /**
   * @param {import('multiformats').MultihashDigest} digest
   * @param {number} size
   */
  async createUploadURL (digest, size) {
    // TODO: sign
    return {
      url: new URL(`blob/${base58btc.encode(digest.bytes)}`, this.#url),
      headers: {
        'x-amz-checksum-sha256': base64pad.baseEncode(digest.digest),
        'content-length': String(size),
      },
    }
  }
}
