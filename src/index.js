import http from 'node:http'
import { Store } from './stores/transactional.js'
import { StoreTable } from './stores/store-table.js'
import { UploadTable } from './stores/upload-table.js'
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

const storeTable = new StoreTable(storeStore)
const uploadTable = new UploadTable(uploadStore)
const provisionsStorage = new ProvisionsStore(subscriptionStore, consumerStore, spaceMetricsStore, [config.signer.did()])
const delegationsStorage = new DelegationsStore(delegationsStore)
const rateLimitsStorage = new RateLimitsStore(rateLimitsStore)
const plansStorage = new PlansStore(customerStore)
const subscriptionsStorage = new SubscriptionsStore(consumerStore)
const revocationsStorage = new RevocationsStore(revocationsStore)
const usageStorage = new UsageStore(spaceDiffStore, spaceSnapshotStore)
const carStoreBucket = new BlobStore(blobStore, config.signer, config.publicUploadURL)
const dudewhereBucket = new PartsStore(partsStore)

const server = createServer({
  // Ucanto config
  id: config.signer,
  signer: config.signer,
  errorReporter: { catch: err => console.error(err) },

  // Access service config
  email: { sendValidation: async input => console.log('Sending email:', input) },
  url: new URL('http://localhost'), // URL used in validation emails

  // store/add config
  maxUploadSize: config.maxUploadSize,

  // Stores
  storeTable,
  uploadTable,
  provisionsStorage,
  delegationsStorage,
  rateLimitsStorage,
  plansStorage,
  subscriptionsStorage,
  revocationsStorage,
  usageStorage,

  carStoreBucket,  // used on store/add to determine if status = 'upload' or status = 'done' in response [X]
  dudewhereBucket, // on upload/add we write root => CAR(s) mapping [X]

  // filecoin storefront
  // taskStore, // [X]
  // receiptStore, // [X]

  // aggregatorId, // aggregator service DID, will be replaced with aggregator service config [X]
  // pieceStore, // [X]
  // filecoinSubmitQueue, // [X]
  // pieceOfferQueue, // [X]

  // dealTrackerService, // connection and invocation config for deal tracker service
})

const httpServer = http.createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const response = await server.request({
    method: req.method ?? 'POST',
    // @ts-expect-error
    headers: req.headers,
    body: Buffer.from(chunks)
  })
  res.statusCode = response.status ?? 200
  res.write(response.body)
  res.end()
})

httpServer.listen(config.port, () => {
  console.log(`Service DID: ${config.signer.did()} (${config.signer.toDIDKey()})`)
  console.log(`Listening on: ${config.port}`)
})
