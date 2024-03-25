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

export interface ServiceContext
  extends AccessServiceContext,
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
