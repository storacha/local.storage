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

/**
 * @param {InvocationConfig} conf
 * @param {import('multiformats').UnknownLink} content
 * @param {import('multiformats').Link} includes
 */
export const createInclusionClaim = (conf, content, includes) => {
  return Assert.inclusion.delegate({
    issuer: conf.issuer,
    audience: conf.audience,
    with: conf.audience.did(),
    nb: {
      content,
      includes
    },
    expiration: Infinity,
    proofs: conf.proofs
  })
}

/**
 * @param {InvocationConfig} conf
 * @param {import('multiformats').UnknownLink} content
 * @param {import('multiformats').Link[]} parts
 */
export const createPartitionClaim = (conf, content, parts) => {
  return Assert.partition.delegate({
    issuer: conf.issuer,
    audience: conf.audience,
    with: conf.audience.did(),
    nb: {
      content,
      parts
    },
    expiration: Infinity,
    proofs: conf.proofs
  })
}
