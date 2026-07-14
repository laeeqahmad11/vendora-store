import { APP_NAME } from '@/lib/constants'

/**
 * SEO metadata for public pages. React 19 hoists <title>/<meta> rendered
 * anywhere in the tree into <head>, so no external helmet library is needed.
 */
export function SEO({ title, description }: { title?: string; description?: string }) {
  const fullTitle = title ? `${title} · ${APP_NAME}` : `${APP_NAME} — Multi-Vendor Marketplace`
  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
    </>
  )
}
