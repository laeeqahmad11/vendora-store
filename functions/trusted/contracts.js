import { domainFail } from '../domain/errors.js'
import { validFirestoreDocumentId } from '../domain/identifiers.js'

const VERIFIED_ACTOR = Symbol('vendora.verified-actor')

export const NEWSLETTER_MAX_BODY_BYTES = 1024

/** @typedef {{code:string,message:string}} TrustedOperationError */
/** @typedef {{productId:string,variantId?:string,quantity:number}} CheckoutLineInput */
/** @typedef {{items:CheckoutLineInput[],delivery:object,paymentMethod:'cod',couponCode?:string,specialInstructions?:string,giftNote?:string,idempotencyKey:string}} CheckoutIntent */
/** @typedef {{principalId:string,provider:string}} VerifiedActorContext */
/** @typedef {{actor:VerifiedActorContext,intent:CheckoutIntent}} PlaceOrderInput */
/** @typedef {{orderIds:string[],orderNumbers:string[]}} PlaceOrderResult */
/** @typedef {{actor:VerifiedActorContext,code:string,items:CheckoutLineInput[]}} PreviewCouponInput */
/** @typedef {{valid:boolean,discount:number,message?:string}} PreviewCouponResult */
/** @typedef {{email:string}} SubscribeNewsletterInput */
/** @typedef {{subscribed:true}} SubscribeNewsletterResult */
/** @typedef {{actor:VerifiedActorContext,orderId:string,reason:string}} CancelOrderInput */
/** @typedef {{orderId:string,status:'cancelled'}} CancelOrderResult */
/** @typedef {{actor:VerifiedActorContext,productId:string,stock?:number,variantStocks?:Array<{variantId:string,stock:number}>}} SetProductInventoryInput */
/** @typedef {{productId:string,stock:number,variants:object[]|null}} SetProductInventoryResult */
/** @typedef {{actor:VerifiedActorContext,productId:string,variantId?:string,change:number,reason:'restock'|'adjustment'|'return',note?:string}} AdjustProductStockInput */
/** @typedef {{productId:string,variantId:string|null,stock:number}} AdjustProductStockResult */
/** @typedef {{actor:VerifiedActorContext,productId:string,status:'approved'|'rejected'|'archived',reason?:string}} ModerateProductInput */
/** @typedef {{productId:string,status:'approved'|'rejected'|'archived',publiclyVisible:boolean}} ModerateProductResult */
/** @typedef {{actor:VerifiedActorContext,storeId:string,status:'approved'|'rejected'|'suspended',reason?:string}} ModerateStoreInput */
/** @typedef {{storeId:string,status:'approved'|'rejected'|'suspended'}} ModerateStoreResult */
/** @typedef {{actor:VerifiedActorContext,storeId:string,profile:object}} UpdateStoreProfileInput */
/** @typedef {{storeId:string,updated:true}} UpdateStoreProfileResult */
/** @typedef {{actor:VerifiedActorContext,storeId:string,verified:boolean}} SetStoreVerifiedInput */
/** @typedef {{storeId:string,verified:boolean}} SetStoreVerifiedResult */
/** @typedef {{actor:VerifiedActorContext,userId:string,role:'admin'|'customer'}} ChangeUserRoleInput */
/** @typedef {{userId:string,role:'admin'|'customer'}} ChangeUserRoleResult */
/** @typedef {{actor:VerifiedActorContext,userId:string,suspended:boolean}} SetUserSuspendedInput */
/** @typedef {{userId:string,suspended:boolean}} SetUserSuspendedResult */
/** @typedef {{actor:VerifiedActorContext,orderId:string,nextStatus:'confirmed'|'packed'|'ready'|'dispatched'|'delivered',note?:string}} TransitionOrderInput */
/** @typedef {{orderId:string,status:'confirmed'|'packed'|'ready'|'dispatched'|'delivered'}} TransitionOrderResult */
/** @typedef {{actor:VerifiedActorContext,orderId:string}} ConfirmOrderCashInput */
/** @typedef {{orderId:string,status:'completed',cashReceived:true}} ConfirmOrderCashResult */
/** @typedef {{actor:VerifiedActorContext,orderId:string,reason:string}} RequestOrderRefundInput */
/** @typedef {{orderId:string,status:'refund_requested'}} RequestOrderRefundResult */
/** @typedef {{actor:VerifiedActorContext,orderId:string,decision:'approve'|'decline'}} DecideOrderReturnInput */
/** @typedef {{orderId:string,status:'returned'|'completed'}} DecideOrderReturnResult */
/** @typedef {{actor:VerifiedActorContext,subject:string,orderId?:string,priority:'low'|'medium'|'high',message:string}} CreateSupportTicketInput */
/** @typedef {{ticketId:string}} CreateSupportTicketResult */
/** @typedef {{actor:VerifiedActorContext,ticketId:string,text:string}} ReplySupportTicketInput */
/** @typedef {{ticketId:string,replied:true}} ReplySupportTicketResult */
/** @typedef {{actor:VerifiedActorContext,ticketId:string,status:'open'|'in_progress'|'resolved'|'closed'}} SetSupportTicketStatusInput */
/** @typedef {{ticketId:string,status:'open'|'in_progress'|'resolved'|'closed',changed:boolean}} SetSupportTicketStatusResult */

/**
 * Creates a capability used only at a provider's verified authentication
 * boundary. Trusted operations reject plain request/body objects even if they
 * contain a plausible principalId.
 *
 * The symbol brand is a programming boundary only. It is not authentication
 * and is not a cryptographic security boundary. A provider adapter MUST
 * independently verify caller credentials before creating an actor. It must
 * never mint trust from request/body actorId, role, ownership, suspension, or
 * authorization claims. Every external provider adapter requires a security
 * review and provider-level authentication tests.
 */
export function createVerifiedActorFactory(provider) {
  if (typeof provider !== 'string' || !provider.trim()) {
    domainFail('internal', 'Verified actor provider is unavailable.')
  }
  const normalizedProvider = provider.trim()
  return (principalId) => {
    if (!validFirestoreDocumentId(principalId)) {
      domainFail('unauthenticated', 'Verified actor identity is invalid.')
    }
    const context = { principalId, provider: normalizedProvider }
    Object.defineProperty(context, VERIFIED_ACTOR, { value: true })
    return Object.freeze(context)
  }
}

export function verifiedPrincipalId(actor) {
  if (!actor || actor[VERIFIED_ACTOR] !== true || !validFirestoreDocumentId(actor.principalId)) {
    domainFail('unauthenticated', 'Verified actor context is required.')
  }
  return actor.principalId
}

/**
 * Semantic guarantees required from every repository adapter. Runtime shape
 * checks below cannot prove these guarantees; the independent repository
 * conformance suite is the executable acceptance gate.
 */
export const TRANSACTION_SEMANTICS = Object.freeze({
  atomicity: 'All staged writes commit together or none commit.',
  isolation: 'Decision reads are strongly consistent and participate in conflict detection.',
  contention: 'Inventory, coupon, first-order, cancellation, and idempotency races are serializable.',
  retries: 'The adapter automatically retries conflicts or provides equivalent conflict-safe behavior.',
  callback: 'The callback may run more than once; failed-attempt writes and generated IDs are discarded.',
  sideEffects: 'Transaction callbacks must stage repository writes only; external side effects are forbidden.',
  creates: 'Create-only writes fail on collision and never overwrite an existing record.',
  time: 'Read timestamps are canonical epoch milliseconds; commit timestamps are adapter-owned.',
})

/**
 * Provider-independent transaction port. Multi-reads return an ID-keyed Map
 * containing exactly one entry per requested ID (record or null). Read records
 * contain canonical epoch-millisecond timestamps and no provider objects.
 *
 * @typedef {Object} TrustedCommerceTransaction
 * @property {() => string} newOrderId
 * @property {() => string} newCouponUsageId
 * @property {() => string} newSupportTicketId
 * @property {(id:string) => Promise<object|null>} getUser
 * @property {(id:string) => Promise<object|null>} getStore
 * @property {(id:string) => Promise<object|null>} getMerchantApplication
 * @property {(ids:string[]) => Promise<Map<string,object|null>>} getStores
 * @property {(id:string) => Promise<object|null>} getProduct
 * @property {(ids:string[]) => Promise<Map<string,object|null>>} getProducts
 * @property {(id:string) => Promise<object|null>} getOrder
 * @property {(customerId:string,requestId:string) => Promise<object|null>} getCheckoutRequest
 * @property {(customerId:string) => Promise<object|null>} getCustomerOrderState
 * @property {(customerId:string) => Promise<boolean>} hasPriorCustomerOrder
 * @property {(code:string) => Promise<object[]>} findCouponsByCode
 * @property {(couponId:string,customerId:string) => Promise<object|null>} getCustomerCouponUsage
 * @property {(id:string) => Promise<object|null>} getNewsletterSubscription
 * @property {(id:string) => Promise<object|null>} getSupportTicket
 * @property {() => Promise<object[]>} getAdminUsers
 * @property {(id:string,data:object) => void} createOrder
 * @property {(id:string,patch:object,timelineEntries?:object[]) => void} updateOrder
 * @property {(id:string,patch:object,serverTimestampFields?:string[]) => void} updateProduct
 * @property {(id:string,status:'approved'|'rejected'|'suspended') => void} updateStoreStatus
 * @property {(id:string,patch:object) => void} updateStoreProfile
 * @property {(id:string,verified:boolean) => void} updateStoreVerified
 * @property {(id:string,status:'approved'|'rejected'|'suspended',rejectionReason:string) => void} updateMerchantApplicationStatus
 * @property {(id:string,projection:object) => void} setPublicStore
 * @property {(id:string) => void} deletePublicStore
 * @property {(ownerId:string,storeId:string) => void} promoteStoreOwnerToMerchant
 * @property {(id:string,role:'admin'|'customer') => void} updateUserRole
 * @property {(id:string,suspended:boolean) => void} updateUserSuspended
 * @property {(id:string,usedCount:number) => void} updateCouponUsageCount
 * @property {(id:string,data:object) => void} createCouponUsage
 * @property {(couponId:string,customerId:string,data:object,exists:boolean) => void} writeCustomerCouponUsage
 * @property {(customerId:string,data:object,exists:boolean) => void} writeCustomerOrderState
 * @property {(customerId:string,requestId:string,data:object) => void} createCheckoutRequest
 * @property {(id:string,data:object) => void} createNewsletterSubscription
 * @property {(id:string,data:object) => void} createSupportTicket
 * @property {(id:string,message:object,notificationRevision:number) => void} appendSupportTicketMessage
 * @property {(id:string,status:'open'|'in_progress'|'resolved'|'closed',notificationRevision:number) => void} updateSupportTicketStatus
 * @property {(data:object) => void} createInventoryLog
 * @property {(data:object) => void} createActivityLog
 * @property {(data:object) => void} createNotification
 */

/**
 * @typedef {Object} TrustedCommerceRepository
 * @property {<T>(operation:(transaction:TrustedCommerceTransaction)=>Promise<T>) => Promise<T>} runTransaction
 * @property {(actorId:string,storeId:string) => Promise<{user:object|null,store:object|null}>} getStoreModerationPrerequisites
 * @property {(storeId:string,storeApproved:boolean) => Promise<void>} reconcileStoreProductVisibility
 * @property {() => Promise<string[]>} getAdminUserIds
 * @property {(actorId:string,userId:string) => Promise<{actor:object|null,target:object|null,store:object|null}>} getUserAdministrationPrerequisites
 */

export const TRUSTED_OPERATION_NAMES = Object.freeze([
  'placeOrder',
  'previewCoupon',
  'subscribeNewsletter',
  'cancelOrder',
  'setProductInventory',
  'adjustProductStock',
  'moderateProduct',
  'moderateStore',
  'updateStoreProfile',
  'setStoreVerified',
  'changeUserRole',
  'setUserSuspended',
  'transitionOrder',
  'confirmOrderCash',
  'requestOrderRefund',
  'decideOrderReturn',
  'createSupportTicket',
  'replySupportTicket',
  'setSupportTicketStatus',
])

export const TRUSTED_ERROR_CODES = Object.freeze([
  'unauthenticated',
  'invalid-argument',
  'permission-denied',
  'not-found',
  'already-exists',
  'failed-precondition',
  'resource-exhausted',
  'aborted',
  'internal',
])

export const TRANSACTION_PORT_METHODS = Object.freeze([
  'newOrderId',
  'newCouponUsageId',
  'newSupportTicketId',
  'getUser',
  'getStore',
  'getMerchantApplication',
  'getStores',
  'getProduct',
  'getProducts',
  'getOrder',
  'getCheckoutRequest',
  'getCustomerOrderState',
  'hasPriorCustomerOrder',
  'findCouponsByCode',
  'getCustomerCouponUsage',
  'getNewsletterSubscription',
  'getSupportTicket',
  'getAdminUsers',
  'createOrder',
  'updateOrder',
  'updateProduct',
  'updateStoreStatus',
  'updateStoreProfile',
  'updateStoreVerified',
  'updateMerchantApplicationStatus',
  'setPublicStore',
  'deletePublicStore',
  'promoteStoreOwnerToMerchant',
  'updateUserRole',
  'updateUserSuspended',
  'updateCouponUsageCount',
  'createCouponUsage',
  'writeCustomerCouponUsage',
  'writeCustomerOrderState',
  'createCheckoutRequest',
  'createNewsletterSubscription',
  'createSupportTicket',
  'appendSupportTicketMessage',
  'updateSupportTicketStatus',
  'createInventoryLog',
  'createActivityLog',
  'createNotification',
])

export const TRUSTED_OPERATION_CONTRACTS = Object.freeze({
  placeOrder: Object.freeze({
    input: 'PlaceOrderInput{actor:VerifiedActorContext,intent:CheckoutIntent}',
    output: 'PlaceOrderResult{orderIds:string[],orderNumbers:string[]}',
  }),
  previewCoupon: Object.freeze({
    input: 'PreviewCouponInput{actor:VerifiedActorContext,code,items}',
    output: 'PreviewCouponResult{valid,discount,message?}',
  }),
  subscribeNewsletter: Object.freeze({
    input: 'SubscribeNewsletterInput{email}',
    output: 'SubscribeNewsletterResult{subscribed:true}',
  }),
  cancelOrder: Object.freeze({
    input: 'CancelOrderInput{actor:VerifiedActorContext,orderId,reason}',
    output: "CancelOrderResult{orderId,status:'cancelled'}",
  }),
  setProductInventory: Object.freeze({
    input: 'SetProductInventoryInput{actor:VerifiedActorContext,productId,stock?,variantStocks?}',
    output: 'SetProductInventoryResult{productId,stock,variants}',
  }),
  adjustProductStock: Object.freeze({
    input: 'AdjustProductStockInput{actor:VerifiedActorContext,productId,variantId?,change,reason,note?}',
    output: 'AdjustProductStockResult{productId,variantId,stock}',
  }),
  moderateProduct: Object.freeze({
    input: "ModerateProductInput{actor:VerifiedActorContext,productId,status:'approved'|'rejected'|'archived',reason?}",
    output: 'ModerateProductResult{productId,status,publiclyVisible}',
  }),
  moderateStore: Object.freeze({
    input: "ModerateStoreInput{actor:VerifiedActorContext,storeId,status:'approved'|'rejected'|'suspended',reason?}",
    output: 'ModerateStoreResult{storeId,status}',
  }),
  updateStoreProfile: Object.freeze({
    input: 'UpdateStoreProfileInput{actor:VerifiedActorContext,storeId,profile}',
    output: 'UpdateStoreProfileResult{storeId,updated:true}',
  }),
  setStoreVerified: Object.freeze({
    input: 'SetStoreVerifiedInput{actor:VerifiedActorContext,storeId,verified:boolean}',
    output: 'SetStoreVerifiedResult{storeId,verified:boolean}',
  }),
  changeUserRole: Object.freeze({
    input: "ChangeUserRoleInput{actor:VerifiedActorContext,userId,role:'admin'|'customer'}",
    output: 'ChangeUserRoleResult{userId,role}',
  }),
  setUserSuspended: Object.freeze({
    input: 'SetUserSuspendedInput{actor:VerifiedActorContext,userId,suspended:boolean}',
    output: 'SetUserSuspendedResult{userId,suspended}',
  }),
  transitionOrder: Object.freeze({
    input: 'TransitionOrderInput{actor:VerifiedActorContext,orderId,nextStatus,note?}',
    output: 'TransitionOrderResult{orderId,status}',
  }),
  confirmOrderCash: Object.freeze({
    input: 'ConfirmOrderCashInput{actor:VerifiedActorContext,orderId}',
    output: "ConfirmOrderCashResult{orderId,status:'completed',cashReceived:true}",
  }),
  requestOrderRefund: Object.freeze({
    input: 'RequestOrderRefundInput{actor:VerifiedActorContext,orderId,reason}',
    output: "RequestOrderRefundResult{orderId,status:'refund_requested'}",
  }),
  decideOrderReturn: Object.freeze({
    input: "DecideOrderReturnInput{actor:VerifiedActorContext,orderId,decision:'approve'|'decline'}",
    output: "DecideOrderReturnResult{orderId,status:'returned'|'completed'}",
  }),
  createSupportTicket: Object.freeze({
    input: 'CreateSupportTicketInput{actor:VerifiedActorContext,subject,orderId?,priority,message}',
    output: 'CreateSupportTicketResult{ticketId}',
  }),
  replySupportTicket: Object.freeze({
    input: 'ReplySupportTicketInput{actor:VerifiedActorContext,ticketId,text}',
    output: 'ReplySupportTicketResult{ticketId,replied:true}',
  }),
  setSupportTicketStatus: Object.freeze({
    input: 'SetSupportTicketStatusInput{actor:VerifiedActorContext,ticketId,status}',
    output: 'SetSupportTicketStatusResult{ticketId,status,changed}',
  }),
  error: Object.freeze({ shape: 'TrustedDomainError{code,message}', codes: TRUSTED_ERROR_CODES }),
})

export function assertTrustedRepository(repository) {
  if (
    !repository ||
    typeof repository.runTransaction !== 'function' ||
    typeof repository.getStoreModerationPrerequisites !== 'function' ||
    typeof repository.reconcileStoreProductVisibility !== 'function' ||
    typeof repository.getAdminUserIds !== 'function' ||
    typeof repository.getUserAdministrationPrerequisites !== 'function' ||
    typeof repository.transactionSemantics !== 'string'
  ) {
    domainFail('internal', 'Trusted commerce repository is unavailable.')
  }
}

export function assertTransactionPort(transaction) {
  for (const method of TRANSACTION_PORT_METHODS) {
    if (typeof transaction?.[method] !== 'function') {
      domainFail('internal', `Trusted transaction method ${method} is unavailable.`)
    }
  }
}
