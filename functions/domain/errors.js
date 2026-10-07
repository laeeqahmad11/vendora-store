export class TrustedDomainError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TrustedDomainError'
    this.code = code
  }
}

export function domainFail(code, message) {
  throw new TrustedDomainError(code, message)
}
