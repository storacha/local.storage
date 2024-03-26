import { Failure } from '@ucanto/server'
import { coerce } from 'multiformats/bytes'

export class RecordNotFound extends Failure {
  constructor () {
    super()
    this.name = /** @type {const} */ ('RecordNotFound')
  }

  describe () {
    return 'record not found'
  }
}

export class RecordKeyConflict extends Failure {
  constructor () {
    super()
    this.name = /** @type {const} */ ('RecordKeyConflict')
  }

  describe () {
    return 'record key conflict'
  }
}

/** @type {import('multiformats').BlockCodec<0x0202, Uint8Array>} */
export const CARCodec = {
  name: 'car',
  code: 0x0202,
  encode: d => coerce(d),
  decode: d => coerce(d)
}

/** @type {import('multiformats').BlockCodec<0x0401, Uint8Array>} */
export const MultihashIndexSortedCodec = {
  name: 'car-multihash-index-sorted',
  code: 0x0401,
  encode: d => coerce(d),
  decode: d => coerce(d)
}
