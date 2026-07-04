import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'

// Route-level code splitting: Home stays eager (it's the landing view);
// everything else — especially Analytics (recharts + leaflet, the bulk of
// the bundle) — loads on first navigation. The PWA service worker precaches
// all chunks, so offline still works after the first visit.
const Collection = lazy(() =>
  import('./pages/Collection').then((m) => ({ default: m.Collection })),
)
const WatchDetail = lazy(() =>
  import('./pages/WatchDetail').then((m) => ({ default: m.WatchDetail })),
)
const LogWear = lazy(() =>
  import('./pages/LogWear').then((m) => ({ default: m.LogWear })),
)
const Wishlist = lazy(() =>
  import('./pages/Wishlist').then((m) => ({ default: m.Wishlist })),
)
const Analytics = lazy(() =>
  import('./pages/Analytics').then((m) => ({ default: m.Analytics })),
)
const Settings = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings })),
)

function App() {
  return (
    <Layout>
      <Suspense fallback={<div className="text-sm text-text-muted">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/collection" element={<Collection />} />
          <Route path="/collection/:id" element={<WatchDetail />} />
          <Route path="/log" element={<LogWear />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
