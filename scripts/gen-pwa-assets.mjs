// Generates PWA raster assets without any image dependencies:
//   - pwa-192.png / pwa-512.png    app icons (rounded, transparent corners)
//   - apple-touch-icon.png (180)   opaque full-bleed (iOS applies its own mask)
//   - public/splash/*.png          solid-colour iOS startup images, light+dark
//
// The icon is a from-scratch rasterization of public/favicon.svg's geometry
// (dark rounded square, light strap bars, watch face ring, blue hands).
// Run: node scripts/gen-pwa-assets.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')

// ─── Minimal PNG encoder ────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}
/** pixels: Uint8Array, RGBA if alpha else RGB, row-major. */
function encodePng(width, height, pixels, alpha) {
  const bpp = alpha ? 4 : 3
  const raw = Buffer.alloc(height * (1 + width * bpp))
  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * bpp)
    raw[off] = 0 // filter: none
    pixels.subarray(y * width * bpp, (y + 1) * width * bpp).forEach((v, i) => {
      raw[off + 1 + i] = v
    })
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = alpha ? 6 : 2 // color type
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── Icon rasterizer (favicon.svg geometry in 32-unit space) ────────────────
const BG = [0x1c, 0x19, 0x17]
const LIGHT = [0xe7, 0xe5, 0xe4]
const BLUE = [0x25, 0x63, 0xeb]

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
function inRoundedRect(x, y, r) {
  if (x < 0 || x > 32 || y < 0 || y > 32) return false
  const cx = Math.max(r, Math.min(32 - r, x))
  const cy = Math.max(r, Math.min(32 - r, y))
  return Math.hypot(x - cx, y - cy) <= r || (x >= r && x <= 32 - r) || (y >= r && y <= 32 - r)
    ? Math.hypot(x - Math.max(r, Math.min(32 - r, x)), y - Math.max(r, Math.min(32 - r, y))) <= r
    : false
}
/** Returns [r,g,b,a] for a point in 32-unit icon space. */
function sampleIcon(x, y, opaque) {
  const dCenter = Math.hypot(x - 16, y - 16)
  // Topmost first: hands + dot (blue)
  if (
    dCenter <= 1 ||
    distToSegment(x, y, 16, 16, 16, 10) <= 1 ||
    distToSegment(x, y, 16, 16, 20, 18) <= 1
  )
    return [...BLUE, 255]
  // Ring (2-unit stroke on r=9 circle)
  if (Math.abs(dCenter - 9) <= 1) return [...LIGHT, 255]
  // Strap bars
  if (x >= 11 && x <= 21 && ((y >= 3 && y <= 6) || (y >= 26 && y <= 29))) return [...LIGHT, 255]
  // Background
  if (opaque) return [...BG, 255]
  return inRoundedRect(x, y, 6) ? [...BG, 255] : [0, 0, 0, 0]
}

function renderIcon(size, opaque) {
  const SS = 4 // 4×4 supersampling
  const px = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = ((x + (sx + 0.5) / SS) / size) * 32
          const uy = ((y + (sy + 0.5) / SS) / size) * 32
          const [cr, cg, cb, ca] = sampleIcon(ux, uy, opaque)
          r += cr * ca
          g += cg * ca
          b += cb * ca
          a += ca
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      px[i] = a > 0 ? Math.round(r / a) : 0
      px[i + 1] = a > 0 ? Math.round(g / a) : 0
      px[i + 2] = a > 0 ? Math.round(b / a) : 0
      px[i + 3] = Math.round(a / n)
    }
  }
  return encodePng(size, size, px, true)
}

// ─── Solid-colour splash screens ────────────────────────────────────────────
function renderSolid(width, height, [r, g, b]) {
  const px = new Uint8Array(width * height * 3)
  for (let i = 0; i < px.length; i += 3) {
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
  }
  return encodePng(width, height, px, false)
}

// Warm theme backgrounds (the app default): light #fdfbf6, dark #1c1611
const SPLASH_LIGHT = [0xfd, 0xfb, 0xf6]
const SPLASH_DARK = [0x1c, 0x16, 0x11]

// Portrait CSS-pixel size + DPR for common iPhones
export const SPLASH_DEVICES = [
  { w: 440, h: 956, r: 3 }, // 16 Pro Max
  { w: 430, h: 932, r: 3 }, // 14 Pro Max, 15 Plus/Pro Max
  { w: 428, h: 926, r: 3 }, // 12/13 Pro Max, 14 Plus
  { w: 402, h: 874, r: 3 }, // 16 Pro
  { w: 393, h: 852, r: 3 }, // 14 Pro, 15, 16
  { w: 390, h: 844, r: 3 }, // 12, 13, 14
  { w: 375, h: 812, r: 3 }, // X, XS, 11 Pro, 12/13 mini
  { w: 414, h: 896, r: 3 }, // XS Max, 11 Pro Max
  { w: 414, h: 896, r: 2 }, // XR, 11
  { w: 375, h: 667, r: 2 }, // SE 2/3
]

writeFileSync(join(pub, 'pwa-192.png'), renderIcon(192, false))
writeFileSync(join(pub, 'pwa-512.png'), renderIcon(512, false))
writeFileSync(join(pub, 'apple-touch-icon.png'), renderIcon(180, true))
console.log('icons: pwa-192.png, pwa-512.png, apple-touch-icon.png')

mkdirSync(join(pub, 'splash'), { recursive: true })
for (const d of SPLASH_DEVICES) {
  const W = d.w * d.r
  const H = d.h * d.r
  writeFileSync(join(pub, 'splash', `splash-${W}x${H}.png`), renderSolid(W, H, SPLASH_LIGHT))
  writeFileSync(join(pub, 'splash', `splash-${W}x${H}-dark.png`), renderSolid(W, H, SPLASH_DARK))
}
console.log(`splash: ${SPLASH_DEVICES.length} sizes × light/dark`)
