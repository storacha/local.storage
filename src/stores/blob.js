import { base64pad } from 'multiformats/bases/base64'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { CAR } from '@ucanto/transport'
import { ok, error } from '@ucanto/server'
import * as API from './api.js'
import { RecordNotFound } from './lib.js'

/** @implements {UploadAPI.CarStoreBucket} */
export class BlobStore {
  #store
  #signer
  #url

  /**
   * @param {API.TransactionalStore<Uint8Array>} store
   * @param {import('@ucanto/server').Signer} signer
   * @param {URL} url
   */
  constructor (store, signer, url) {
    this.#store = store
    this.#signer = signer
    this.#url = url
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {Promise<UploadAPI.Result<{ link: UploadAPI.CARLink }>>}
   */
  async put (bytes) {
    const link = await CAR.codec.link(bytes)
    await this.#store.transact(s => s.put(`d/${link}`, bytes))
    return ok({ link })
  }

  /** @param {UploadAPI.UnknownLink} link */
  has (link) {
    return this.#store.transact(s => s.has(link.toString()))
  }

  /**
   * @param {UploadAPI.UnknownLink} link
   * @param {{ range?: import('../api.js').Range }} [options]
   * @returns {Promise<import('@ucanto/interface').Result<ReadableStream<Uint8Array>, import('@web3-storage/upload-api').RecordNotFound>>}
   */
  async stream (link, options) {
    const { range } = options ?? {}
    const bytes = await this.#store.transact(s => s.get(`d/${link}`))
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
   * @param {UploadAPI.UnknownLink} link
   * @param {number} size
   */
  async createUploadUrl (link, size) {
    const checksum = base64pad.baseEncode(link.multihash.digest)
    return {
      url: new URL(`blob/${link}`, this.#url),
      headers: {
        'x-amz-checksum-sha256': checksum,
        'content-length': String(size),
      },
    }
  }
}