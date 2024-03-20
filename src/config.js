import * as ed25519 from '@ucanto/principal/ed25519'
import { DID } from '@ucanto/server'
import { base32 } from 'multiformats/bases/base32'
import dotenv from 'dotenv'
import { mustGetEnv } from './util.js'

dotenv.config()

/** @see https://github.com/web3-storage/w3infra/blob/a1f171de30748d5bb4068cf54302bf92f2b076f1/upload-api/service.js#L12-L16 */
const MAX_UPLOAD_SIZE = 127*(1<<25)

const signer = ed25519.parse(mustGetEnv('PRIVATE_KEY'))
// @ts-expect-error
const did = DID.parse(`did:web:${base32.encode(signer.verifier)}.local.web3.storage`).did()

export const config = {
  port: process.env.PORT ?? 3000,
  dataDir: mustGetEnv('DATA_DIR'),
  signer: signer.withDID(did),
  publicUploadURL: new URL(mustGetEnv('PUBLIC_UPLOAD_URL')),
  maxUploadSize: MAX_UPLOAD_SIZE
}
