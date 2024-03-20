import { base64pad } from 'multiformats/bases/base64'
import * as UploadAPI from '@web3-storage/upload-api/types'
import * as API from './api.js'

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

  /** @param {UploadAPI.UnknownLink} link */
  has (link) {
    return this.#store.transact(s => s.has(link.toString()))
  }

  /**
   * @param {UploadAPI.UnknownLink} link
   * @param {number} size
   */
  async createUploadUrl (link, size) {
    const checksum = base64pad.baseEncode(link.multihash.digest)
    return {
      url: this.#url,
      headers: {
        'x-amz-checksum-sha256': checksum,
        'content-length': String(size),
      },
    }
  }
}