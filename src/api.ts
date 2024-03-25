import {
  AccessServiceContext,
  ConsoleServiceContext,
  ConsumerServiceContext,
  CustomerServiceContext,
  ProviderServiceContext,
  SpaceServiceContext,
  StoreServiceContext,
  SubscriptionServiceContext,
  RateLimitServiceContext,
  RevocationServiceContext,
  PlanServiceContext,
  UploadServiceContext,
  UsageServiceContext,
  ErrorReporter,
  Signer
} from '@web3-storage/upload-api'
import { ServiceContext as ClaimServiceContext } from '@web3-storage/content-claims/server/service/api'

export interface ServiceContext
  extends AccessServiceContext,
    ClaimServiceContext,
    ConsoleServiceContext,
    ConsumerServiceContext,
    CustomerServiceContext,
    ProviderServiceContext,
    SpaceServiceContext,
    StoreServiceContext,
    SubscriptionServiceContext,
    RateLimitServiceContext,
    RevocationServiceContext,
    PlanServiceContext,
    UploadServiceContext,
    UsageServiceContext {}

export interface UcantoServerContext extends ServiceContext {
  id: Signer
  errorReporter: ErrorReporter
}

export type Range = { offset: number, length?: number } | { offset?: number, length: number } | { suffix: number }
