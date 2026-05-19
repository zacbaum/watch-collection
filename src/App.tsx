import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Collection } from './pages/Collection'
import { WatchDetail } from './pages/WatchDetail'
import { LogWear } from './pages/LogWear'
import { Wishlist } from './pages/Wishlist'
import { Analytics } from './pages/Analytics'
import { Settings } from './pages/Settings'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/collection/:id" element={<WatchDetail />} />
        <Route path="/log" element={<LogWear />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}

export default App
