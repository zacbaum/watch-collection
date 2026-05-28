import type { Location } from '../types'

const CACHE_KEY = 'watch-collection.geocache.v1'

interface Cache {
  reverse: Record<string, Location>
}

function loadCache(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { reverse: {} }
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
