import type { Currency, Money } from '../types'

const CACHE_KEY = 'watch-collection.fxcache.v1'

interface Cache {
  /** key = `${date}|${from}|${to}` */
  rates: Record<string, number>
}

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { rates: {} }
}

function saveCache(c: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

/**
 * Look up historical FX rate via frankfurter.app (ECB rates, free, no key).
 * Returns `to` per 1 unit of `from` on the given date.
 */
export async function historicalRate(
  date: string,
  from: Currency,
  to: Currency,
): Promise<number> {
  if (from === to) return 1
  const key = `${date}|${from}|${to}`
  const cache = loadCache()
  if (cache.rates[key]) return cache.rates[key]

  const url = `https://api.frankfurter.app/${date}?from=${from}&to=${to}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FX lookup failed: ${res.status}`)
  const json = await res.json()
  const rate: number | undefined = json?.rates?.[to]
  if (!rate || !isFinite(rate)) throw new Error(`No rate for ${from}→${to} on ${date}`)
  cache.rates[key] = rate
  saveCache(cache)
  return rate
}

/** Convert a Money amount to GBP using historical rates on a given date. */
export async function toGbp(money: Money, date: string): Promise<number> {
  if (money.currency === 'GBP') return money.amount
  try {
    const rate = await historicalRate(date, money.currency, 'GBP')
    return money.amount * rate
  } catch {
    return money.amount
  }
}
