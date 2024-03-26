import * as API from './api.js'
import * as ClaimsAPI from '@web3-storage/content-claims/server/api'
import { Delegation } from '@ucanto/server'
import { base58btc } from 'multiformats/bases/base58'
import * as Digest from 'multiformats/hashes/digest'

/** @implements {ClaimsAPI.ClaimStore} */
export class ClaimStore {
  #store

  /**
   * @param {API.TransactionalStore<API.ClaimRecord>} store
   */
  constructor (store) {
    this.#store = store
  }

  /**
   * @param {import('@ucanto/interface').UnknownLink} link
   */
  get (link) {
    return this.#store.transact(async s => {
      /** @type {ClaimsAPI.Claim[]} */
      const claims = []
      for await (const [, v] of s.entries({ prefix: `d/${base58btc.encode(link.multihash.bytes)}` })) {
        const claim = await Delegation.extract(v.bytes)
        if (claim.error) {
          console.error('failed to extract claim from archive', claim.error)
          continue
        }
        const value = /** @type {ClaimsAPI.AnyAssertCap} */ (claim.ok.capabilities[0])
        claims.push({
          claim: v.cause,
          bytes: v.bytes,
          content: Digest.decode(v.content),
          value,
          expiration: claim.ok.expiration
        })
      }
      return claims
    })
  }


  /** @param {ClaimsAPI.Claim} claim */
  put (claim) {
    return this.#store.transact(async s => {
      await s.put(`d/${base58btc.encode(claim.content.bytes)}/${claim.claim}`, {
        cause: claim.claim,
        bytes: claim.bytes,
        content: claim.content.bytes
      })
    })
  }
}