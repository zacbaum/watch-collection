import { colorFor, tint } from '../lib/palette'

/**
 * Small colored monogram chip used as a stand-in for a watch photo. Color is
 * deterministic from the brand name so the same brand always gets the same chip.
 */
export function Monogram({
  brand,
  model,
  size = 36,
  rounded = 'full',
}: {
  brand: string
  model?: string
  size?: number
  rounded?: 'full' | 'lg' | 'md'
}) {
  const initials = makeInitials(brand)
  const bg = colorFor(brand)
  const fg = '#ffffff'
  const ring = tint(bg, 0.7)
  const radiusClass =
    rounded === 'full' ? 'rounded-full' : rounded === 'lg' ? 'rounded-lg' : 'rounded-md'

  return (
    <div
      className={`flex items-center justify-center font-semibold tracking-tight shrink-0 ${radiusClass}`}
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: fg,
        boxShadow: `inset 0 0 0 1px ${ring}`,
        fontSize: size * 0.4,
      }}
      title={`${brand}${model ? ' ' + model : ''}`}
    >
      {initials}
    </div>
  )
}

function makeInitials(brand: string): string {
  const cleaned = brand.replace(/[^A-Za-z\s]/g, '').trim()
  if (!cleaned) return '?'
  const parts = cleaned.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
