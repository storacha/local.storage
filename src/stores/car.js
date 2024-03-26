import * as Link from 'multiformats/link'
import * as UploadAPI from '@web3-storage/upload-api/types'
import { ok } from '@ucanto/server'
import { BlobStore } from './blob.js'

export class CARPutEvent extends Event {
  /** @param {UploadAPI.UnknownLink} link */
  constructor (link) {
    super('put')
    this.link = link
  }
}

/** @implements {UploadAPI.CarStoreBucket} */
export class CARStore extends EventTarget {
  #store

  /** @param {BlobStore} store */
  constructor (store) {
    super()
    this.#store = store
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {Promise<UploadAPI.Result<{ link: UploadAPI.Link }>>}
   */
  async put (bytes) {
    const result = await this.#store.put(bytes)
    if (!result.ok) return result
    const link = Link.create(0x0202, result.ok.digest)
    this.dispatchEvent(new CARPutEvent(link))
    return ok({ link })
  }

  /** @param {UploadAPI.UnknownLink} link */
  has (link) {
    return this.#store.has(link.multihash)
  }

  /**
   * @param {UploadAPI.UnknownLink} link
   * @param {number} size
   */
  createUploadUrl (link, size) {
    return this.#store.createUploadURL(link.multihash, size)
  }
}
