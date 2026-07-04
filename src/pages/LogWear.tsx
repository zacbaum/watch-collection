import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { Gate } from '../components/Gate'
import { Card } from '../components/Card'
import { Monogram } from '../components/Monogram'
import { Photo } from '../components/Photo'
import { useData, useDataContext } from '../hooks/useData'
import type { Location, WearLogEntry } from '../types'
import { getCurrentPosition, reverseGeocode } from '../lib/geocode'
import { classNames, todayIso } from '../lib/utils'
import { findNearestKnownCity, knownPlaces } from '../lib/cityCoords'
import { MapPin, AlertCircle, CheckCircle2, RefreshCw, X, Shuffle } from 'lucide-react'

export function LogWear() {
  return (
    <Gate>
      <LogWearInner />
    </Gate>
  )
}

function LogWearInner() {
  const data = useData()
  const { mutate } = useDataContext()
  const navigate = useNavigate()
  const owned = useMemo(
    () =>
      data.watches
        .filter((w) => w.status === 'owned')
        .sort((a, b) => {
          const ba = a.brand.localeCompare(b.brand, undefined, { sensitivity: 'base' })
          if (ba !== 0) return ba
          return a.model.localeCompare(b.model, undefined, { sensitivity: 'base' })
        }),
    [data.watches],
  )
  const [date, setDate] = useState(todayIso())
  const [watchId, setWatchId] = useState<string>('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [snapped, setSnapped] = useState<string | null>(null)
  const [locStatus, setLocStatus] = useState<'idle' | 'pending' | 'ok' | 'denied' | 'error'>('idle')
  const [locError, setLocError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Is there already an entry for the selected date?
  const existingEntry = useMemo(
    () => data.wearLog.find((e) => e.date === date),
    [data.wearLog, date],
  )
  const existingWatch = existingEntry
    ? data.watches.find((w) => w.id === existingEntry.watchId)
    : null

  function pickRandom() {
    // Avoid picking whatever's already selected so a repeated click always
    // gives you a different option.
    const candidates = watchId ? owned.filter((w) => w.id !== watchId) : owned
    if (candidates.length === 0) return
    const i = Math.floor(Math.random() * candidates.length)
    setWatchId(candidates[i].id)
  }

  async function handleDelete() {
    if (!existingEntry) return
    setBusy(true)
    try {
      await mutate(
        (d) => ({
          ...d,
          wearLog: d.wearLog.filter((e) => e.id !== existingEntry.id),
        }),
        {
          message: `Delete wear entry on ${date}`,
        },
      )
    } finally {
      setBusy(false)
    }
  }

  // Build the autocomplete suggestion list: historic wear-log locations + known cities
  const suggestions = useMemo(() => {
    const set = new Set<string>()
    for (const e of data.wearLog) {
      if (e.location?.city) {
        const label = [e.location.city, e.location.country].filter(Boolean).join(', ')
        set.add(label)
      }
    }
    for (const k of knownPlaces()) set.add(`${k.city}, ${k.country}`)
    return Array.from(set).sort()
  }, [data.wearLog])

  async function captureLocation() {
    setLocStatus('pending')
    setLocError(null)
    setSnapped(null)
    try {
      const pos = await getCurrentPosition()
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setCoords({ lat, lng })

      // Snap to nearest known historic city first — keeps names consistent
      // with the imported sheet.
      const near = findNearestKnownCity(lat, lng, 25)
      if (near) {
        setCity(near.city)
        setCountry(near.country)
        setSnapped(`Snapped to "${near.city}" (${near.distanceKm.toFixed(1)} km away)`)
        setLocStatus('ok')
        return
      }

      // Otherwise reverse geocode via Nominatim
      try {
        const loc = await reverseGeocode(lat, lng)
        setCity(loc.city ?? '')
        setCountry(loc.country ?? '')
        setLocStatus('ok')
      } catch (e) {
        setLocStatus('ok')
        setLocError(`Coords captured, name lookup failed: ${(e as Error).message}`)
      }
    } catch (e) {
      const err = e as GeolocationPositionError | Error
      const code = (err as GeolocationPositionError).code
      if (code === 1) {
        setLocStatus('denied')
        setLocError('Permission denied — type a location below.')
      } else {
        setLocStatus('error')
        setLocError(err.message || 'Failed to get location')
      }
    }
  }

  function onPickSuggestion(label: string) {
    const idx = label.lastIndexOf(',')
    if (idx === -1) {
      setCity(label.trim())
      setCountry('')
    } else {
      setCity(label.slice(0, idx).trim())
      setCountry(label.slice(idx + 1).trim())
    }
    setSnapped(null)
  }

  async function handleSave() {
    if (!watchId) return
    setBusy(true)
    try {
      const trimmedCity = city.trim()
      const trimmedCountry = country.trim()
      let finalLocation: Location | undefined
      if (trimmedCity || trimmedCountry || coords) {
        finalLocation = {
          city: trimmedCity || undefined,
          country: trimmedCountry || undefined,
          lat: coords?.lat,
          lng: coords?.lng,
        }
      }
      const entry: WearLogEntry = {
        id: nanoid(10),
        watchId,
        date,
        location: finalLocation,
        source: coords ? 'geolocation' : 'manual',
        createdAt: new Date().toISOString(),
      }
      const w = data.watches.find((x) => x.id === watchId)
      await mutate(
        (d) => {
          // Replace ANY entry for this date (one wear per day) — preserves the
          // existing id so the URL stays stable.
          const existing = d.wearLog.findIndex((e) => e.date === entry.date)
          const wearLog = [...d.wearLog]
          if (existing >= 0) wearLog[existing] = { ...entry, id: wearLog[existing].id }
          else wearLog.push(entry)
          return { ...d, wearLog }
        },
        { message: `Log ${w?.brand ?? ''} ${w?.model ?? ''} on ${date}` },
      )
      setDone(true)
      setTimeout(() => navigate('/'), 800)
    } finally {
      setBusy(false)
    }
  }

  if (owned.length === 0) {
    return (
      <div className="text-sm text-text-muted">
        No owned watches yet. Add or import some first.
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-md">
      <h1 className="text-2xl font-display font-medium tracking-tight">Log wear</h1>

      {existingEntry && existingWatch && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5 flex items-center gap-3 text-xs">
          <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-text-muted text-[11px]">
              Already logged for {date === todayIso() ? 'today' : date}
            </div>
            <div className="text-sm text-text truncate">
              {existingWatch.brand}{' '}
              <span className="text-text-muted">{existingWatch.model}</span>
              {existingEntry.location?.city && (
                <span className="text-text-subtle">
                  {' · '}
                  {existingEntry.location.city}
                </span>
              )}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              Picking a watch below will replace this entry — no duplicate.
            </div>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="px-2 py-1 text-[11px] rounded-md border border-border text-danger hover:bg-surface-2 shrink-0"
          >
            Delete
          </button>
        </div>
      )}

      <Card>
        <div className="space-y-3">
          <label className="block text-xs text-text-muted">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
            />
          </label>
          <div className="block text-xs text-text-muted">
            <div className="flex items-center justify-between mb-1">
              <span>Watch</span>
              <button
                type="button"
                onClick={pickRandom}
                className="px-2 py-0.5 text-[11px] rounded-md border border-border hover:bg-surface-2 inline-flex items-center gap-1"
              >
                <Shuffle size={11} /> Pick for me
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {owned.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWatchId(w.id)}
                  className={classNames(
                    'flex items-center gap-2 p-2 rounded-md border text-left transition',
                    watchId === w.id
                      ? 'border-accent bg-accent-soft'
                      : 'border-border hover:border-border-strong',
                  )}
                >
                  {w.photos?.[0] ? (
                    <Photo
                      path={w.photos[0]}
                      alt={`${w.brand} ${w.model}`}
                      className="w-9 h-9 rounded object-cover shrink-0 border border-border"
                    />
                  ) : (
                    <Monogram brand={w.brand} model={w.model} size={36} rounded="md" />
                  )}
                  <div className="min-w-0">
                    <div className="text-text font-medium text-xs truncate">{w.brand}</div>
                    <div className="text-text-muted text-[11px] truncate">{w.model}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="block text-xs text-text-muted">
            Location
            <datalist id="log-location-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={captureLocation}
                disabled={locStatus === 'pending'}
                className="px-3 py-1.5 text-xs rounded-md border border-border flex items-center gap-1 shrink-0"
              >
                {locStatus === 'pending' ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <MapPin size={12} />
                )}
                {locStatus === 'ok' ? 'Update' : 'Use my location'}
              </button>
              {coords && (
                <span className="text-[11px] text-text-muted inline-flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-success" />
                  {coords.lat.toFixed(3)}, {coords.lng.toFixed(3)}
                </span>
              )}
              {(city || country) && (
                <button
                  type="button"
                  onClick={() => {
                    setCity('')
                    setCountry('')
                    setCoords(null)
                    setSnapped(null)
                    setLocStatus('idle')
                  }}
                  className="ml-auto p-2 -m-1.5 text-text-subtle hover:text-text"
                  title="Clear"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2">
              <input
                value={city}
                onChange={(e) => {
                  setCity(e.target.value)
                  setSnapped(null)
                }}
                list="log-location-suggestions"
                placeholder="City"
                className="text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
                onInput={(e) => {
                  // If the user picked a datalist suggestion that contains a comma,
                  // split it into city + country in one step
                  const v = (e.target as HTMLInputElement).value
                  if (v.includes(',')) onPickSuggestion(v)
                }}
              />
              <input
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value)
                  setSnapped(null)
                }}
                placeholder="Country"
                className="text-sm px-2 py-1.5 border border-border rounded-md bg-bg"
              />
            </div>
            {snapped && (
              <div className="text-[11px] text-text-muted mt-1">{snapped}</div>
            )}
            {locError && (
              <div className="text-xs text-warning mt-1 flex items-center gap-1">
                <AlertCircle size={12} /> {locError}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={handleSave}
            disabled={busy || !watchId || done}
            className="w-full px-3 py-2 text-sm rounded-md bg-accent text-on-accent disabled:opacity-50"
          >
            {done
              ? 'Logged ✓'
              : busy
                ? 'Saving…'
                : existingEntry
                  ? 'Replace wear'
                  : 'Log wear'}
          </button>
        </div>
      </Card>
    </div>
  )
}
