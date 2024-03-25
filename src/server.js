import * as API from './api.js'
import * as Server from '@ucanto/server'
import { CAR } from '@ucanto/transport'
import { create as createRevocationChecker } from '@web3-storage/upload-api/utils/revocation'
import { createService as createStoreService } from '@web3-storage/upload-api/store'
import { createService as createUploadService } from '@web3-storage/upload-api/upload'
import { createService as createConsoleService } from '@web3-storage/upload-api/console'
import { createService as createAccessService } from '@web3-storage/upload-api/access'
import { createService as createConsumerService } from '@web3-storage/upload-api/consumer'
import { createService as createCustomerService } from '@web3-storage/upload-api/customer'
import { createService as createSpaceService } from '@web3-storage/upload-api/space'
import { createService as createProviderService } from '@web3-storage/upload-api/provider'
import { createService as createSubscriptionService } from '@web3-storage/upload-api/subscription'
import { createService as createAdminService } from '@web3-storage/upload-api/admin'
import { createService as createRateLimitService } from '@web3-storage/upload-api/rate-limit'
import { createService as createUcanService } from '@web3-storage/upload-api/ucan'
import { createService as createPlanService } from '@web3-storage/upload-api/plan'
import { createService as createUsageService } from '@web3-storage/upload-api/usage'
import { createService as createClaimsService } from '@web3-storage/content-claims/server/service'

/** @param {API.UcantoServerContext} options */
export const createServer = ({ id, ...context }) => Server.create({
  ...createRevocationChecker(context),
  id,
  codec: CAR.inbound,
  service: createService(context),
  catch: error => context.errorReporter.catch(error)
})

/** @param {API.ServiceContext} context */
export const createService = context => ({
  access: createAccessService(context),
  console: createConsoleService(context),
  consumer: createConsumerService(context),
  customer: createCustomerService(context),
  provider: createProviderService(context),
  'rate-limit': createRateLimitService(context),
  admin: createAdminService(context),
  space: createSpaceService(context),
  store: createStoreService(context),
  subscription: createSubscriptionService(context),
  upload: createUploadService(context),
  ucan: createUcanService(context),
  plan: createPlanService(context),
  usage: createUsageService(context),
  ...createClaimsService(context)
})
