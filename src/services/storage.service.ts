/**
 * Image/file "upload" service.
 *
 * NOTE: This project runs on the Firebase Spark (free) plan, which cannot
 * provision a Cloud Storage bucket. Instead of uploading to Storage, we
 * compress images client-side and return a base64 `data:` URL, which callers
 * persist inline in Firestore documents. Every consumer treats the result as
 * an opaque `<img src>` string, so this is a drop-in for the Storage flow.
 *
 * Firestore caps a document at ~1 MB, so images are compressed to a tight byte
 * budget: product docs can hold up to 8 images, and 8 × ~100 KB stays safely
 * under the limit. Swap this file back to Cloud Storage once on the Blaze plan.
 */

// ~80 KB per image: 8 images ≈ 640 KB, leaving headroom for the rest of the
// product document under Firestore's 1 MB cap.
const IMAGE_MAX_BYTES = 80_000
// Single-file uploads (e.g. store application documents) live in their own doc.
const FILE_MAX_BYTES = 700_000

/** Approximate decoded byte size of a data URL from its base64 payload. */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Math.floor(b64.length * 0.75)
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Downscale + JPEG-compress an image to a base64 data URL, progressively
 * lowering dimension then quality until it fits within `maxBytes`.
 */
async function compressToDataUrl(file: File, maxBytes: number): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const longest = Math.max(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const dimensions = [1200, 1000, 800, 640, 480]
  const qualities = [0.72, 0.6, 0.5, 0.42]
  let smallest = ''

  for (const targetDim of dimensions) {
    const scale = Math.min(1, targetDim / longest)
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      smallest = dataUrl
      if (dataUrlBytes(dataUrl) <= maxBytes) {
        bitmap.close()
        return dataUrl
      }
    }
  }
  bitmap.close()
  // Couldn't hit the budget; return the most-compressed variant we produced.
  return smallest
}

function isCompressibleImage(file: File): boolean {
  return file.type.startsWith('image/') && file.type !== 'image/gif'
}

export const storageService = {
  /** Compresses an image and returns an inline base64 data URL. */
  async uploadImage(file: File, _folder: string): Promise<string> {
    if (isCompressibleImage(file)) return compressToDataUrl(file, IMAGE_MAX_BYTES)
    // GIF / non-canvas-encodable image: store as-is if small enough.
    const dataUrl = await fileToDataUrl(file)
    if (dataUrlBytes(dataUrl) > IMAGE_MAX_BYTES) {
      throw new Error('Image is too large. Please upload a smaller file (max ~100 KB for this format).')
    }
    return dataUrl
  },

  /** Returns an inline base64 data URL for an arbitrary file (images compressed). */
  async uploadFile(file: File, _folder: string): Promise<string> {
    if (isCompressibleImage(file)) return compressToDataUrl(file, FILE_MAX_BYTES)
    const dataUrl = await fileToDataUrl(file)
    if (dataUrlBytes(dataUrl) > FILE_MAX_BYTES) {
      throw new Error('File is too large (max ~700 KB without Cloud Storage). Please upload a smaller or compressed file.')
    }
    return dataUrl
  },

  /**
   * No-op for inline data URLs (nothing to delete). Kept for API compatibility
   * so callers that clean up replaced images don't need to change.
   */
  async deleteByUrl(_url: string) {
    // Inline data: URLs live inside their owning document; removing the field
    // (or overwriting the doc) is the delete. Nothing external to remove.
  },
}
