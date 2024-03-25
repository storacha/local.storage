import { Assert } from '@web3-storage/content-claims/capability'

/**
 * @typedef {{
*   issuer: import('@ucanto/interface').Signer
*   audience: import('@ucanto/interface').Principal
*   proofs: import('@ucanto/interface').Proof[]
* }} InvocationConfig
*/

/**
 * @param {InvocationConfig} conf
 * @param {import('multiformats').UnknownLink} content
 * @param {URL} location
 */
export const createLocationClaim = (conf, content, location) => {
  return Assert.location.delegate({
    issuer: conf.issuer,
    audience: conf.audience,
    with: conf.audience.did(),
    nb: {
      content,
      location: [/** @type {import('@ucanto/interface').URI} */(location.toString())]
    },
    expiration: Infinity,
    proofs: conf.proofs
  })
}
