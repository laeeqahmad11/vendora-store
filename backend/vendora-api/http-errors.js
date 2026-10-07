const SAFE_HTTP_ERROR = Symbol('vendora.safe-http-error')

export class SafeHttpError extends Error {
  constructor(code, message, { status } = {}) {
    super(message)
    this.name = 'SafeHttpError'
    this.code = code
    this.status = status
    Object.defineProperty(this, SAFE_HTTP_ERROR, { value: true })
  }
}

export function isSafeHttpError(error) {
  return error?.[SAFE_HTTP_ERROR] === true
}
