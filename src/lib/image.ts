/** Downscale + re-encode a photo before storing. Phone camera shots are
 *  3–5 MB; at 1600px JPEG they land around 200–400 KB, which keeps
 *  IndexedDB and the backup repo lean with no visible loss at app sizes.
 *  createImageBitmap applies EXIF orientation on modern Safari/Chrome. */
export async function compressImage(
  file: Blob,
  maxDim = 1600,
  quality = 0.82,
): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('Image encode failed')
    return blob
  } finally {
    bmp.close()
  }
}
