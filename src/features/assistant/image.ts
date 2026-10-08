export interface PreparedImage {
  mimeType: 'image/jpeg'
  /** Base64 without the data-URL prefix */
  data: string
  /** `data:` URL for an in-chat preview */
  dataUrl: string
  width: number
  height: number
}

/** Scales (w, h) to fit inside `max`×`max`, keeping the aspect ratio; never upscales. */
export function fitWithin(width: number, height: number, max = 1024): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close(): void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      // fall back to <img> (older Safari, HEIC handled by the OS picker)
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Resizes a photo client-side to ≤ 1024 px on the long side and re-encodes as JPEG 0.8. */
export async function prepareImage(file: Blob, max = 1024, quality = 0.8): Promise<PreparedImage> {
  const img = await decode(file)
  const size = fitWithin(img.width, img.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')
  ctx.fillStyle = '#fff' // transparent PNGs → white, not black, in JPEG
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.drawImage(img.source, 0, 0, size.width, size.height)
  img.close()
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return { mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl, ...size }
}
