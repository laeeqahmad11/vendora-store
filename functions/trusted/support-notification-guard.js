export const TRUSTED_SUPPORT_NOTIFICATION_REVISION_FIELD =
  '_trustedSupportNotificationRevision'

function supportNotificationRevision(data) {
  if (
    data === undefined ||
    data === null ||
    !Object.hasOwn(data, TRUSTED_SUPPORT_NOTIFICATION_REVISION_FIELD)
  ) {
    return 0
  }

  const value = data[TRUSTED_SUPPORT_NOTIFICATION_REVISION_FIELD]
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function trustedSupportNotificationsAlreadyCommitted(event, before, after) {
  if (event?.authType !== 'service_account') return false

  const beforeRevision = supportNotificationRevision(before)
  const afterRevision = supportNotificationRevision(after)

  return (
    beforeRevision !== null &&
    afterRevision !== null &&
    afterRevision > 0 &&
    afterRevision === beforeRevision + 1
  )
}
