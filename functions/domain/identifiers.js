export function containsControlCharacter(value) {
  if (typeof value !== 'string') return false
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) return true
  }
  return false
}

export function validFirestoreDocumentId(value, maximumLength = 128) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    value !== '.' &&
    value !== '..' &&
    !/^__.*__$/.test(value) &&
    !value.includes('/') &&
    !containsControlCharacter(value)
  )
}
