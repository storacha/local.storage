import fs from 'node:fs'
import http from 'node:http'
import { authorize } from '@web3-storage/upload-api/validate'
import * as DIDMailto from '@web3-storage/did-mailto'
import { Store } from './stores/transactional.js'
import { StoreStore } from './stores/store.js'
import { UploadStore } from './stores/upload.js'
import { ProvisionsStore } from './stores/provisions.js'
import { DelegationsStore } from './stores/delegations.js'
import { RateLimitsStore } from './stores/rate-limits.js'
import { PlansStore } from './stores/plans.js'
import { SubscriptionsStore } from './stores/subscriptions.js'
import { RevocationsStore } from './stores/revocations.js'
import { UsageStore } from './stores/usage.js'
import { BlobStore } from './stores/blob.js'
import { PartsStore } from './stores/parts.js'
import { CARCodec } from './stores/lib.js'
import { config } from './config.js'
import { createServer } from './server.js'

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
const blobStore = store.partition('blob/', { codec: CARCodec })
const partsStore = store.partition('part/')

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
  carStoreBucket: new BlobStore(blobStore, config.signer, config.publicUploadURL),
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

  // PUT /blob/:cid ///////////////////////////////////////////////////////////
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
