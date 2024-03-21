import fs from 'node:fs'
import * as ed25519 from '@ucanto/principal/ed25519'
import { DID } from '@ucanto/server'
import { base32 } from 'multiformats/bases/base32'
import * as Digest from 'multiformats/hashes/digest'
import dotenv from 'dotenv'
import * as Link from 'multiformats/link'
import { mustGetEnv } from './util.js'

dotenv.config()

/** @see https://github.com/web3-storage/w3infra/blob/a1f171de30748d5bb4068cf54302bf92f2b076f1/upload-api/service.js#L12-L16 */
const MAX_UPLOAD_SIZE = 127*(1<<25)
const LIBP2P_KEY_CODE = 0x72

const signer = ed25519.parse(mustGetEnv('PRIVATE_KEY'))
// @ts-expect-error
const libp2pKey = Link.create(LIBP2P_KEY_CODE, Digest.create(0xed, signer.verifier))
const did = DID.parse(`did:web:${libp2pKey.toString(base32)}.local.web3.storage`).did()

const pkg = JSON.parse(fs.readFileSync(`${import.meta.dirname}/../package.json`, 'utf8'))
const banner = fs.readFileSync(`${import.meta.dirname}/banner.txt`, 'utf8')
const apiPort = process.env.API_PORT ?? 3000
const uploadPort = process.env.UPLOAD_PORT ?? 3001

export const config = { 
  pkg,
  banner,
  apiPort,
  uploadPort,
  dataDir: process.env.DATA_DIR ?? './data',
  signer: signer.withDID(did),
  publicApiURL: new URL(process.env.PUBLIC_API_URL ? process.env.PUBLIC_API_URL : `http://localhost:${apiPort}`),
  publicUploadURL: new URL(process.env.PUBLIC_UPLOAD_URL ? process.env.PUBLIC_UPLOAD_URL : `http://localhost:${uploadPort}`),
  maxUploadSize: MAX_UPLOAD_SIZE
}
