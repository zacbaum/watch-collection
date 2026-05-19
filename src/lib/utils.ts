import { format, parse, parseISO, differenceInDays, isValid } from 'date-fns'
import type { Currency, Money } from '../types'

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function parseDdmmyyyy(s: string): string | null {
  const d = parse(s.trim(), 'dd/MM/yyyy', new Date())
  if (!isValid(d)) return null
  return format(d, 'yyyy-MM-dd')
}

export function formatDate(iso: string, fmt = 'd MMM yyyy'): string {
  try {
    return format(parseISO(iso), fmt)
  } catch {
    return iso
  }
}

export function daysSince(iso: string): number {
  try {
    return differenceInDays(new Date(), parseISO(iso))
  } catch {
    return 0
  }
}

export const currencySymbols: Record<Currency, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  CAD: 'C$',
  CHF: 'CHF ',
  AUD: 'A$',
  JPY: '¥',
  SGD: 'S$',
  HKD: 'HK$',
}

export function formatMoney(m: Money | undefined | null): string {
  if (!m || m.amount == null) return '—'
  const sym = currencySymbols[m.currency] ?? `${m.currency} `
  return `${sym}${m.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function formatGbp(amount: number | undefined | null): string {
  if (amount == null) return '—'
  return `£${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function classNames(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ')
}

/**
 * Title-case an enum-like value for display. "spring-drive" → "Spring drive".
 * Word boundaries are dashes, underscores, or whitespace. Acronyms like "gmt"
 * become "GMT" via the small special-case map below.
 */
const UPPERCASE_TOKENS = new Set(['gmt', 'pvd', 'dlc'])
export function titleCase(value: string | undefined | null): string {
  if (!value) return ''
  return value
    .split(/[-_\s]+/)
    .map((part) => {
      if (UPPERCASE_TOKENS.has(part.toLowerCase())) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join(' ')
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Fix common encoding issues from old exports (e.g. WÄnaka → Wānaka). */
export function fixEncoding(s: string): string {
  if (!s) return s
  return s
    .replace(/W[ÄA]?naka/gi, 'Wānaka')
    .replace(/�/g, '')
    .trim()
}

/** Pretty location string: "City, Country" or whatever subset is present. */
export function formatLocation(loc?: { city?: string; region?: string; country?: string }): string {
  if (!loc) return ''
  const parts = [loc.city, loc.country].filter(Boolean)
  return parts.join(', ')
}
