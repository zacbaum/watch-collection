/**
 * Static lookup of known cities → coords. Keyed by both "City" and "City, Country".
 * Lets the map paint instantly without hitting Nominatim for places we've already
 * been. New locations (from browser geolocation) come with their own lat/lng, so
 * this table only needs to cover historic CSV-imported data.
 */

export interface Coords {
  lat: number
  lng: number
}

const RAW: Array<[string, string, Coords]> = [
  // [city, country, coords]
  ['Amersham', 'United Kingdom', { lat: 51.6736, lng: -0.6094 }],
  ['London', 'United Kingdom', { lat: 51.5074, lng: -0.1278 }],
  ['Plymouth', 'United Kingdom', { lat: 50.3755, lng: -4.1427 }],
  ['Toronto', 'Canada', { lat: 43.6532, lng: -79.3832 }],
  ['Kingston', 'Canada', { lat: 44.2312, lng: -76.486 }],
  ['Carling Township', 'Canada', { lat: 45.3819, lng: -80.2167 }],
  ['Saint Kitts and Nevis', 'Saint Kitts and Nevis', { lat: 17.1554, lng: -62.5797 }],
  ['Bali', 'Indonesia', { lat: -8.4095, lng: 115.1889 }],
  ['Copenhagen', 'Denmark', { lat: 55.6761, lng: 12.5683 }],
  ['Edinburgh', 'United Kingdom', { lat: 55.9533, lng: -3.1883 }],
  ['Zakynthos', 'Greece', { lat: 37.7869, lng: 20.899 }],
  ['Grindelwald', 'Switzerland', { lat: 46.6244, lng: 8.0414 }],
  ['Bled', 'Slovenia', { lat: 46.3683, lng: 14.1147 }],
  ['Wānaka', 'New Zealand', { lat: -44.7032, lng: 169.1321 }],
  ['Christchurch', 'New Zealand', { lat: -43.532, lng: 172.6362 }],
  ['Auckland', 'New Zealand', { lat: -36.8485, lng: 174.7633 }],
  ['Paris', 'France', { lat: 48.8566, lng: 2.3522 }],
  ['Wānaka', 'New Zealand', { lat: -44.6991, lng: 169.1404 }],
  ['Christchurch', 'New Zealand', { lat: -43.532, lng: 172.6362 }],
  ['Singapore', 'Singapore', { lat: 1.3521, lng: 103.8198 }],
  ['Nashville', 'United States', { lat: 36.1627, lng: -86.7816 }],
  ['Milan', 'Italy', { lat: 45.4642, lng: 9.19 }],
  ['Dublin', 'Ireland', { lat: 53.3498, lng: -6.2603 }],
  ['Saint Kitts and Nevis', 'Saint Kitts and Nevis', { lat: 17.3578, lng: -62.783 }],
  ['Cancun', 'Mexico', { lat: 21.1619, lng: -86.8515 }],
  ['Nice', 'France', { lat: 43.7102, lng: 7.262 }],
  ['Monte-Carlo', 'Monaco', { lat: 43.7384, lng: 7.4246 }],
  ['Pathos', 'Cyprus', { lat: 34.7768, lng: 32.4218 }], // Paphos
  ['Paphos', 'Cyprus', { lat: 34.7768, lng: 32.4218 }],
  ['Larnaca', 'Cyprus', { lat: 34.9229, lng: 33.6233 }],
  ['Ithaca', 'Greece', { lat: 38.4153, lng: 20.725 }],
]

const lookup = new Map<string, Coords>()
for (const [city, country, coords] of RAW) {
  lookup.set(city.toLowerCase(), coords)
  lookup.set(`${city.toLowerCase()}|${country.toLowerCase()}`, coords)
}

export function lookupCoords(city?: string, country?: string): Coords | null {
  if (city) {
    const withCountry = country ? lookup.get(`${city.toLowerCase()}|${country.toLowerCase()}`) : null
    return withCountry ?? lookup.get(city.toLowerCase()) ?? null
  }
  // Fall back to country-as-key lookup for country-only entries (city-states,
  // small nations like Saint Kitts and Nevis, etc.)
  if (country) return lookup.get(country.toLowerCase()) ?? null
  return null
}

export interface KnownPlace extends Coords {
  city: string
  country: string
  distanceKm: number
}

function distanceKm(a: Coords, b: Coords): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/**
 * Find the closest known historic city within `maxKm` of a point.
 * Used at log-time so a wear captured anywhere in/near Amersham gets the
 * canonical "Amersham, United Kingdom" label, matching the imported sheet.
 */
export function findNearestKnownCity(
  lat: number,
  lng: number,
  maxKm = 25,
): KnownPlace | null {
  const target = { lat, lng }
  // Dedupe by city (Pathos and Paphos share coords; only need one in results)
  const seen = new Set<string>()
  let best: KnownPlace | null = null
  for (const [city, country, coords] of RAW) {
    if (seen.has(city)) continue
    seen.add(city)
    const d = distanceKm(target, coords)
    if (d <= maxKm && (best == null || d < best.distanceKm)) {
      best = { city, country, ...coords, distanceKm: d }
    }
  }
  return best
}

/** All known places (city + country pairs) — useful for autocomplete. */
export function knownPlaces(): Array<{ city: string; country: string }> {
  const seen = new Set<string>()
  const out: Array<{ city: string; country: string }> = []
  for (const [city, country] of RAW) {
    const key = `${city}|${country}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ city, country })
  }
  return out
}
