import type { Location } from '../types'

const CACHE_KEY = 'watch-collection.geocache.v1'

interface Cache {
  reverse: Record<string, Location>
  forward: Record<string, Location>
}

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { reverse: {}, forward: {} }
}

function saveCache(c: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* quota — drop oldest by rebuilding */
  }
}

/** Reverse geocode lat/lng to city/region/country using Nominatim. */
export async function reverseGeocode(lat: number, lng: number): Promise<Location> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  const cache = loadCache()
  if (cache.reverse[key]) return { ...cache.reverse[key], lat, lng }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.ok) throw new Error(`Nominatim reverse failed: ${res.status}`)
  const json = await res.json()
  const addr = json.address ?? {}
  const loc: Location = {
    city: addr.city || addr.town || addr.village || addr.hamlet || addr.county || addr.state,
    region: addr.state || addr.region,
    country: addr.country,
    lat,
    lng,
  }
  cache.reverse[key] = { city: loc.city, region: loc.region, country: loc.country }
  saveCache(cache)
  return loc
}

/** Forward geocode a free-text query to lat/lng + structured place. */
export async function forwardGeocode(query: string): Promise<Location | null> {
  const trimmed = query.trim()
  if (!trimmed) return null
  const cache = loadCache()
  if (cache.forward[trimmed.toLowerCase()]) return cache.forward[trimmed.toLowerCase()]

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(trimmed)}&limit=1&addressdetails=1`
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
  if (!res.ok) return null
  const arr = await res.json()
  if (!Array.isArray(arr) || arr.length === 0) return null
  const top = arr[0]
  const addr = top.address ?? {}
  const loc: Location = {
    city: addr.city || addr.town || addr.village || addr.hamlet || top.name,
    region: addr.state || addr.region,
    country: addr.country,
    lat: parseFloat(top.lat),
    lng: parseFloat(top.lon),
  }
  cache.forward[trimmed.toLowerCase()] = loc
  saveCache(cache)
  return loc
}

/** Browser geolocation wrapper. */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60_000,
    })
  })
}
