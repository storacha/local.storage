import fs from 'node:fs'
import http from 'node:http'
import { Writable } from 'node:stream'
import { authorize } from '@web3-storage/upload-api/validate'
import * as DIDMailto from '@web3-storage/did-mailto'
import { walkClaims } from '@web3-storage/content-claims/server'
import * as Digest from 'multiformats/hashes/digest'
import * as raw from 'multiformats/codecs/raw'
import * as Link from 'multiformats/link'
import { base58btc } from 'multiformats/bases/base58'
import { CARReaderStream, CARWriterStream } from 'carstream'
import { MultihashIndexSortedWriter } from 'cardex'
import { Store } from './stores/transactional.js'
import { StoreStore } from './stores/store.js'
import { UploadAddEvent, UploadStore } from './stores/upload.js'
import { ProvisionsStore } from './stores/provisions.js'
import { DelegationsStore } from './stores/delegations.js'
import { RateLimitsStore } from './stores/rate-limits.js'
import { PlansStore } from './stores/plans.js'
import { SubscriptionsStore } from './stores/subscriptions.js'
import { RevocationsStore } from './stores/revocations.js'
import { UsageStore } from './stores/usage.js'
import { BlobStore } from './stores/blob.js'
import { CARPutEvent, CARStore } from './stores/car.js'
import { PartsStore } from './stores/parts.js'
import { ClaimStore } from './stores/claims.js'
import { parseRange } from './http.js'
import { config } from './config.js'
import { createServer } from './server.js'
import { createInclusionClaim, createLocationClaim, createPartitionClaim } from './claims.js'
import { concatStream } from './util.js'

const store = new Store(config.dataDir)
const storeStore = store.partition('store/')
const uploadStore = store.partition('upload/')
const subscriptionStore = store.partition('subscription/')
const consumerStore = store.partition('consumer/')
const spaceMetricsStore = store.partition('space-metric/')
const delegationsStore = store.partition('delegation/')
const rateLimitsStore = store.partition('rate-limit/')
const customerStore = store.partition('customer/')
const revocationsStore = store.partition('revocation/')
const spaceDiffStore = store.partition('space-diff/')
const spaceSnapshotStore = store.partition('space-snapshot/')
const blobStore = store.partition('blob/', { codec: raw })
const partsStore = store.partition('part/')
const claimStore = store.partition('claim/')

const blobStorage = new BlobStore(blobStore, config.signer, config.publicUploadURL)

const context = {
  // Ucanto config
  id: config.signer,
  signer: config.signer,
  errorReporter: { catch: err => console.error(err) },

  // Access service config
  email: { sendValidation: async input => console.log('Sending email:', input) },
  url: config.publicApiURL, // URL used in validation emails

  // store/add config
  maxUploadSize: config.maxUploadSize,

  // Stores
  storeTable: new StoreStore(storeStore),
  uploadTable: new UploadStore(uploadStore),
  provisionsStorage: new ProvisionsStore(subscriptionStore, consumerStore, spaceMetricsStore, [config.signer.did()]),
  delegationsStorage: new DelegationsStore(delegationsStore),
  rateLimitsStorage: new RateLimitsStore(rateLimitsStore),
  plansStorage: new PlansStore(customerStore),
  subscriptionsStorage: new SubscriptionsStore(consumerStore),
  revocationsStorage: new RevocationsStore(revocationsStore),
  usageStorage: new UsageStore(spaceDiffStore, spaceSnapshotStore),
  // used on store/add to determine if status = 'upload' or status = 'done' in response [X]
  carStoreBucket: new CARStore(blobStorage),
  // on upload/add we write root => CAR(s) mapping [X]
  dudewhereBucket: new PartsStore(partsStore),

  // filecoin storefront
  // taskStore, // [X]
  // receiptStore, // [X]

  // aggregatorId, // aggregator service DID, will be replaced with aggregator service config [X]
  // pieceStore, // [X]
  // filecoinSubmitQueue, // [X]
  // pieceOfferQueue, // [X]

  // dealTrackerService, // connection and invocation config for deal tracker service

  // Content Claims
  claimStore: new ClaimStore(claimStore)
}

// Create a location claim when a CAR is added
context.carStoreBucket.addEventListener('put', async e => {
  if (e instanceof CARPutEvent) {
    await createAndStoreLocationClaim(e.link)
  }
})

// Create CAR index when CAR is added
context.carStoreBucket.addEventListener('put', async e => {
  if (e instanceof CARPutEvent) {
    const carStream = await blobStorage.stream(e.link.multihash)
    if (!carStream.ok) return console.error('failed to stream CAR from blob store', carStream.error)

    const { readable, writable } = new TransformStream()
    const writer = MultihashIndexSortedWriter.createWriter({ writer: writable.getWriter() })

    const [, bytes] = await Promise.all([
      carStream.ok
        .pipeThrough(new CARReaderStream())
        .pipeTo(new WritableStream({
          write: async block => { await writer.add(block.cid, block.offset) },
          close: async () => { await writer.close() }
        })),
      concatStream(readable)
    ])

    const putResult = await blobStorage.put(bytes)
    if (!putResult.ok) return console.error('failed to store CAR index', putResult.error)
    
    const { digest } = putResult.ok
    const includes = Link.create(MultihashIndexSortedWriter.codec, digest)

    console.log(`Indexed CAR: ${e.link} => ${includes}`)

    await createAndStoreLocationClaim(includes)
    
    const claim = await createInclusionClaim({
      issuer: config.signer,
      audience: config.signer,
      proofs: []
    }, e.link, includes)

    const archive = await claim.archive()
    if (archive.error) return console.error('failed to archive delegation', archive.error)

    await context.claimStore.put({
      claim: claim.cid,
      bytes: archive.ok,
      content: e.link.multihash,
      // @ts-expect-error
      value: claim.capabilities[0]
    })

    console.log(`Content inclusion claimed: ${e.link} includes: ${includes}`)
  }
})

// Create a partition claim when `upload/add` is invoked
context.uploadTable.addEventListener('add', async e => {
  if (e instanceof UploadAddEvent) {
    const claim = await createPartitionClaim({
      issuer: config.signer,
      audience: config.signer,
      proofs: []
    }, e.root, e.shards)

    const archive = await claim.archive()
    if (archive.error) return console.error('failed to archive delegation', archive.error)

    await context.claimStore.put({
      claim: claim.cid,
      bytes: archive.ok,
      content: e.root.multihash,
      // @ts-expect-error
      value: claim.capabilities[0]
    })

    console.log(`Content partition claimed: ${e.root} parts: ${e.shards.map(s => String(s))}`)
  }
})

/**
 * @param {import('multiformats').UnknownLink} content
 */
const createAndStoreLocationClaim = async (content) => {
  const location = new URL(`/blob/${base58btc.encode(content.multihash.bytes)}`, config.publicUploadURL)
  const claim = await createLocationClaim({
    issuer: config.signer,
    audience: config.signer,
    proofs: []
  }, content, location)

  const archive = await claim.archive()
  if (archive.error) return console.error('failed to archive delegation', archive.error)

  await context.claimStore.put({
    claim: claim.cid,
    bytes: archive.ok,
    content: content.multihash,
    // @ts-expect-error
    value: claim.capabilities[0]
  })
  console.log(`Content location claimed: ${content} location: ${location}`)
}

const server = createServer(context)

console.log(config.banner)
console.log(`Service DID: ${config.signer.did()} (${config.signer.toDIDKey()})`)

const httpServer = http.createServer(async (req, res) => {
  if (req.url !== '/') console.log(`${req.method} ${req.url}`)

  // GET /validate-email //////////////////////////////////////////////////////
  if (req.method === 'GET' && req.url === '/version') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.write(JSON.stringify({
      name: config.pkg.name,
      version: config.pkg.version,
      did: config.signer.did(),
      publicKey: config.signer.toDIDKey()
    }))
    return res.end()
  }
  if (req.method === 'GET' && req.url?.startsWith('/validate-email?')) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html')
    res.write(await fs.promises.readFile(`${import.meta.dirname}/validate-email.html`))
    return res.end()
  }

  // POST /validate-email /////////////////////////////////////////////////////
  if (req.method === 'POST' && req.url?.startsWith('/validate-email?')) {
    const { searchParams } = new URL(req.url, config.publicApiURL)
    const authResult = await authorize(searchParams.get('ucan') ?? '', context)
    if (authResult.error) {
      console.error(new Error('failed authorization', { cause: authResult.error }))
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/html')
      res.write(`Oops something went wrong: ${authResult.error.message}`)
      return res.end()
    }

    const customer = DIDMailto.fromEmail(authResult.ok.email)
    const account = `placeholder:acc-${Date.now()}`
    const product = 'did:web:starter.local.web3.storage'
    console.log(`Skipping payment flow and initializing ${customer} with plan ${product}`)
    const initResult = await context.plansStorage.initialize(customer, account, product)
    if (initResult.error && initResult.error.name !== 'CustomerExists') {
      console.error(new Error('failed customer initialization', { cause: initResult.error }))
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/html')
      res.write(`Oops something went wrong: ${initResult.error.message}`)
      return res.end()
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html')
    res.write(await fs.promises.readFile(`${import.meta.dirname}/validated-email.html`))
    return res.end()
  }

  // PUT /blob/:multihash /////////////////////////////////////////////////////
  if (req.method === 'PUT' && req.url?.startsWith('/blob/')) {
    // TODO: validate signed URL
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const bytes = Buffer.concat(chunks)  
    const result = await context.carStoreBucket.put(bytes)
    if (result.ok) console.log(`Stored: ${result.ok.link} (${bytes.length} bytes)`)
    return res.end()
  }

  // GET /blob/:multihash /////////////////////////////////////////////////////
  if (req.method === 'GET' && req.url?.startsWith('/blob/')) {
    let digest
    try {
      const url = new URL(req.url, config.publicApiURL)
      digest = Digest.decode(base58btc.decode(url.pathname.split('/')[2]))
    } catch (err) {
      res.statusCode = 400
      res.write(`invalid multihash: ${err.message}`)
      return res.end()
    }

    let range
    if (req.headers.range) {
      try {
        range = parseRange(req.headers.range)
        console.log(`Range: ${req.headers.range}`)
      } catch (err) {
        res.statusCode = 400
        res.write(`invalid range: ${err.message}`)
        return res.end()
      }
    }
    const result = await blobStorage.stream(digest, { range })
    if (result.error) {
      console.error('failed to read blob', result.error, range)
      res.statusCode = result.error.name === 'RecordNotFound' ? 404 : 500
      res.write('failed to read blob')
      return res.end()
    }

    return await result.ok.pipeTo(Writable.toWeb(res))
  }

  // GET /claims/:cid /////////////////////////////////////////////////////////
  if (req.method === 'GET' && req.url?.startsWith('/claims/')) {
    const url = new URL(req.url, config.publicApiURL)

    let link
    try {
      link = Link.parse(url.pathname.split('/')[2])
    } catch (err) {
      res.statusCode = 400
      res.write(`invalid CID: ${err.message}`)
      return res.end()
    }

    const walkcsv = url.searchParams.get('walk')
    const walk = new Set(walkcsv ? walkcsv.split(',') : [])
    const readable = walkClaims({ claimFetcher: context.claimStore }, link, walk)
    res.setHeader('Content-Type', 'application/vnd.ipld.car; version=1;')
    return await readable.pipeThrough(new CARWriterStream()).pipeTo(Writable.toWeb(res))
  }

  // POST / ///////////////////////////////////////////////////////////////////
  if (req.method === 'POST' && req.url === '/') {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const response = await server.request({
      method: req.method ?? 'POST',
      // @ts-expect-error
      headers: req.headers,
      body: Buffer.concat(chunks)
    })
    res.statusCode = response.status ?? 200
    for (const [k, v] of Object.entries(response.headers)) {
      res.setHeader(k, v)
    }
    res.write(response.body)
    return res.end()
  }

  res.statusCode = 404
  res.end()
})

httpServer.listen(config.apiPort, () => {
  console.log(`Server listening on :${config.apiPort}`)
})
