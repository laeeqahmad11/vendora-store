import { TrustedDomainError } from '../../functions/domain/errors.js'
import { isSafeHttpError, SafeHttpError } from './http-errors.js'
import {
  assertOrderId,
  assertProductId,
  assertStoreId,
  assertSupportTicketId,
  assertUserId,
  cancelBody,
  checkoutBody,
  couponPreviewBody,
  createSupportTicketBody,
  inventoryAdjustBody,
  inventorySetBody,
  orderCommandBody,
  productModerationBody,
  safePathname,
  storeModerationBody,
  storeProfileBody,
  storeVerificationBody,
  supportReplyBody,
  supportStatusBody,
  userRoleBody,
  userSuspensionBody,
} from './schemas.js'

export const MAX_BODY_BYTES = 64 * 1024
export const REQUEST_ID_HEADER = 'x-request-id'

const HEALTH_PATH = '/health'
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u
const SAFE_METHOD = /^[A-Z]{1,16}$/u
const ALLOWED_REQUEST_HEADERS = Object.freeze([
  'authorization',
  'content-type',
  'x-firebase-appcheck',
  REQUEST_ID_HEADER,
])
const LOG_ERROR_CODES = new Set([
  'none',
  'unauthenticated',
  'invalid-argument',
  'permission-denied',
  'not-found',
  'method-not-allowed',
  'already-exists',
  'failed-precondition',
  'resource-exhausted',
  'aborted',
  'internal',
])

const STATUS_BY_CODE = Object.freeze({
  unauthenticated: 401,
  'invalid-argument': 400,
  'permission-denied': 403,
  'not-found': 404,
  'already-exists': 409,
  'failed-precondition': 412,
  'resource-exhausted': 429,
  aborted: 409,
  internal: 500,
})

function apiError(code, message, status = STATUS_BY_CODE[code] ?? 500, headers) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

function corsHeaders(request, allowedOrigins) {
  const origin = request.headers.get('origin')
  if (!origin) return {}
  if (!allowedOrigins.has(origin)) {
    throw new SafeHttpError('permission-denied', 'Origin is not allowed.')
  }
  return {
    'access-control-allow-origin': origin,
    'access-control-expose-headers': REQUEST_ID_HEADER,
    vary: 'Origin',
  }
}

function preflight(request, headers) {
  const requestedMethod = request.headers.get('access-control-request-method')
  const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  if (
    !request.headers.get('origin') ||
    requestedMethod !== 'POST' ||
    requestedHeaders.some((value) => !ALLOWED_REQUEST_HEADERS.includes(value))
  ) {
    return apiError('permission-denied', 'CORS preflight is not allowed.', 403)
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      'access-control-allow-methods': 'POST',
      'access-control-allow-headers': ALLOWED_REQUEST_HEADERS.join(', '),
      'access-control-max-age': '600',
    },
  })
}

async function readJson(request, maximumBytes = MAX_BODY_BYTES) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType)) {
    throw new SafeHttpError('invalid-argument', 'Content-Type must be application/json.')
  }
  if (request.headers.has('content-encoding')) {
    throw new SafeHttpError('invalid-argument', 'Encoded request bodies are not supported.')
  }
  const lengthHeader = request.headers.get('content-length')
  if (lengthHeader !== null) {
    if (!/^\d+$/u.test(lengthHeader)) {
      throw new SafeHttpError('invalid-argument', 'Content-Length is invalid.')
    }
    if (Number(lengthHeader) > maximumBytes) {
      throw new SafeHttpError('invalid-argument', 'Request body is too large.', { status: 413 })
    }
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new SafeHttpError('invalid-argument', 'JSON request body is required.')
  }
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maximumBytes) {
      await reader.cancel()
      throw new SafeHttpError('invalid-argument', 'Request body is too large.', { status: 413 })
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new SafeHttpError('invalid-argument', 'Request body must contain valid JSON.')
  }
}

function route(pathname) {
  if (pathname === '/checkout/place') {
    return { name: 'placeOrder', pattern: '/checkout/place', schema: checkoutBody }
  }
  if (pathname === '/coupons/preview') {
    return { name: 'previewCoupon', pattern: '/coupons/preview', schema: couponPreviewBody }
  }
  if (pathname === '/inventory/set') {
    return { name: 'setProductInventory', pattern: '/inventory/set', schema: inventorySetBody }
  }
  if (pathname === '/inventory/adjust') {
    return { name: 'adjustProductStock', pattern: '/inventory/adjust', schema: inventoryAdjustBody }
  }
  if (pathname === '/support/tickets') {
    return { name: 'createSupportTicket', pattern: '/support/tickets', schema: createSupportTicketBody }
  }
  const supportReply = /^\/support\/tickets\/([^/]+)\/reply$/u.exec(pathname)
  if (supportReply) {
    return {
      name: 'replySupportTicket',
      pattern: '/support/tickets/:ticketId/reply',
      ticketId: assertSupportTicketId(supportReply[1]),
      schema: supportReplyBody,
    }
  }
  const supportStatus = /^\/support\/tickets\/([^/]+)\/status$/u.exec(pathname)
  if (supportStatus) {
    return {
      name: 'setSupportTicketStatus',
      pattern: '/support/tickets/:ticketId/status',
      ticketId: assertSupportTicketId(supportStatus[1]),
      schema: supportStatusBody,
    }
  }
  const moderation = /^\/products\/([^/]+)\/moderate$/u.exec(pathname)
  if (moderation) {
    return {
      name: 'moderateProduct',
      pattern: '/products/:productId/moderate',
      productId: assertProductId(moderation[1]),
      schema: productModerationBody,
    }
  }
  const storeModeration = /^\/stores\/([^/]+)\/moderate$/u.exec(pathname)
  if (storeModeration) {
    return {
      name: 'moderateStore',
      pattern: '/stores/:storeId/moderate',
      storeId: assertStoreId(storeModeration[1]),
      schema: storeModerationBody,
    }
  }
  const storeVerification = /^\/stores\/([^/]+)\/verification$/u.exec(pathname)
  if (storeVerification) {
    return {
      name: 'setStoreVerified',
      pattern: '/stores/:storeId/verification',
      storeId: assertStoreId(storeVerification[1]),
      schema: storeVerificationBody,
    }
  }
  const storeProfile = /^\/stores\/([^/]+)\/profile$/u.exec(pathname)
  if (storeProfile) {
    return {
      name: 'updateStoreProfile',
      pattern: '/stores/:storeId/profile',
      storeId: assertStoreId(storeProfile[1]),
      schema: storeProfileBody,
    }
  }
  const userRole = /^\/users\/([^/]+)\/role$/u.exec(pathname)
  if (userRole) {
    return {
      name: 'changeUserRole',
      pattern: '/users/:userId/role',
      userId: assertUserId(userRole[1]),
      schema: userRoleBody,
    }
  }
  const userSuspension = /^\/users\/([^/]+)\/suspension$/u.exec(pathname)
  if (userSuspension) {
    return {
      name: 'setUserSuspended',
      pattern: '/users/:userId/suspension',
      userId: assertUserId(userSuspension[1]),
      schema: userSuspensionBody,
    }
  }
  const cancel = /^\/orders\/([^/]+)\/cancel$/u.exec(pathname)
  if (cancel) {
    return {
      name: 'cancelOrder',
      pattern: '/orders/:orderId/cancel',
      orderId: assertOrderId(cancel[1]),
      schema: cancelBody,
    }
  }
  const command = /^\/orders\/([^/]+)\/command$/u.exec(pathname)
  if (command) {
    return {
      name: 'command',
      pattern: '/orders/:orderId/command',
      orderId: assertOrderId(command[1]),
      schema: orderCommandBody,
    }
  }
  return null
}

function operationInput(match, actor, body) {
  if (match.name === 'placeOrder') return { actor, intent: body }
  if (match.name === 'previewCoupon') return { actor, ...body }
  if (match.name === 'cancelOrder') return { actor, orderId: match.orderId, reason: body.reason }
  if (match.name === 'setProductInventory') return { actor, ...body }
  if (match.name === 'adjustProductStock') return { actor, ...body }
  if (match.name === 'moderateProduct') return { actor, productId: match.productId, ...body }
  if (match.name === 'moderateStore') return { actor, storeId: match.storeId, ...body }
  if (match.name === 'updateStoreProfile') return { actor, storeId: match.storeId, profile: body }
  if (match.name === 'setStoreVerified') return { actor, storeId: match.storeId, verified: body.verified }
  if (match.name === 'changeUserRole') return { actor, userId: match.userId, role: body.role }
  if (match.name === 'setUserSuspended') return { actor, userId: match.userId, suspended: body.suspended }
  if (match.name === 'createSupportTicket') return { actor, ...body }
  if (match.name === 'replySupportTicket') return { actor, ticketId: match.ticketId, text: body.text }
  if (match.name === 'setSupportTicketStatus') return { actor, ticketId: match.ticketId, status: body.status }
  const { command, ...parameters } = body
  return { actor, orderId: match.orderId, command, parameters }
}

/** @returns {string} */
function defaultRequestId() {
  return crypto.randomUUID()
}

function generatedRequestId(createRequestId) {
  try {
    const value = createRequestId()
    if (typeof value === 'string' && SAFE_REQUEST_ID.test(value)) return value
  } catch {
    // Fall through to the Web Crypto generator without exposing provider details.
  }
  return crypto.randomUUID()
}

function acceptedRequestId(request, generated) {
  const incoming = request.headers.get(REQUEST_ID_HEADER)
  if (incoming === null) return generated
  if (!SAFE_REQUEST_ID.test(incoming)) {
    throw new SafeHttpError('invalid-argument', 'Request ID is invalid.')
  }
  return incoming
}

function safeMethod(value) {
  return SAFE_METHOD.test(value) ? value : 'OTHER'
}

function safeLogErrorCode(value) {
  return LOG_ERROR_CODES.has(value) ? value : 'internal'
}

function mappedError(error, headers) {
  const code = error?.code
  if (error instanceof TrustedDomainError) {
    const message = code === 'internal' ? 'The request could not be completed.' : error.message
    return {
      code: safeLogErrorCode(code),
      response: apiError(code, message, STATUS_BY_CODE[code], headers),
    }
  }
  if (isSafeHttpError(error)) {
    return {
      code: safeLogErrorCode(code),
      response: apiError(code, error.message, error.status ?? STATUS_BY_CODE[code], headers),
    }
  }
  return {
    code: 'internal',
    response: apiError('internal', 'The request could not be completed.', 500, headers),
  }
}

function emitRequestLog(logRequest, entry) {
  try {
    logRequest(Object.freeze(entry))
  } catch {
    // Observability must never break or alter the trusted response boundary.
  }
}

export function createVendoraApiHandler({
  trustedCommerce,
  resolveActor,
  verifyAppCheck,
  allowedOrigins = /** @type {string[]} */ ([]),
  logRequest = () => {},
  createRequestId = defaultRequestId,
  now = () => performance.now(),
}) {
  if (
    !trustedCommerce ||
    typeof resolveActor !== 'function' ||
    typeof verifyAppCheck !== 'function' ||
    typeof logRequest !== 'function' ||
    typeof createRequestId !== 'function' ||
    typeof now !== 'function'
  ) {
    throw new TypeError('Vendora API dependencies are unavailable.')
  }
  const origins = new Set(allowedOrigins)

  return async function handleVendoraApi(request) {
    const startedAt = now()
    let requestId = generatedRequestId(createRequestId)
    let normalizedRoute = 'unmatched'
    let errorCode = 'internal'
    let responseCors = {}
    let response
    try {
      responseCors = corsHeaders(request, origins)
      requestId = acceptedRequestId(request, requestId)
      const pathname = safePathname(new URL(request.url))
      if (request.method === 'OPTIONS') {
        normalizedRoute = pathname === HEALTH_PATH ? HEALTH_PATH : (route(pathname)?.pattern ?? 'unmatched')
        response = preflight(request, responseCors)
        errorCode = response.ok ? 'none' : 'permission-denied'
      } else if (pathname === HEALTH_PATH) {
        normalizedRoute = HEALTH_PATH
        if (request.method === 'GET') {
          response = new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8', ...responseCors },
          })
          errorCode = 'none'
        } else {
          response = apiError('method-not-allowed', 'Only GET is allowed.', 405, {
            ...responseCors,
            allow: 'GET',
          })
          errorCode = 'method-not-allowed'
        }
      } else {
        const match = route(pathname)
        normalizedRoute = match?.pattern ?? 'unmatched'
        if (!match) {
          response = apiError('not-found', 'Endpoint not found.', 404, responseCors)
          errorCode = 'not-found'
        } else if (request.method !== 'POST') {
          response = apiError('method-not-allowed', 'Only POST is allowed.', 405, {
            ...responseCors,
            allow: 'POST, OPTIONS',
          })
          errorCode = 'method-not-allowed'
        } else {
          await verifyAppCheck(request)
          const actor = await resolveActor(request)
          const body = match.schema(await readJson(request, match.maximumBodyBytes))
          const input = operationInput(match, actor, body)
          const result = match.name === 'command'
            ? await trustedCommerce[input.command]({ actor, orderId: match.orderId, ...input.parameters })
            : await trustedCommerce[match.name](input)
          response = new Response(JSON.stringify({ data: result }), {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8', ...responseCors },
          })
          errorCode = 'none'
        }
      }
    } catch (error) {
      const mapped = mappedError(error, responseCors)
      response = mapped.response
      errorCode = mapped.code
    }
    response.headers.set(REQUEST_ID_HEADER, requestId)
    const finishedAt = now()
    const elapsed = Number.isFinite(startedAt) && Number.isFinite(finishedAt)
      ? Math.max(0, Math.round(finishedAt - startedAt))
      : 0
    emitRequestLog(logRequest, {
      event: 'vendora.trusted_api.request',
      requestId,
      method: safeMethod(request.method),
      route: normalizedRoute,
      status: response.status,
      durationMs: elapsed,
      errorCode: safeLogErrorCode(errorCode),
    })
    return response
  }
}
