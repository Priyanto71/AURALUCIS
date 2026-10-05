import { useEffect, useState } from 'react'
import { api, getUser, clearUser } from './api.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Products from './pages/Products.jsx'
import Customers from './pages/Customers.jsx'
import NewSale from './pages/NewSale.jsx'
import Orders from './pages/Orders.jsx'
import Stock from './pages/Stock.jsx'
import Setup from './pages/Setup.jsx'

const TABS = {
  Dashboard, Products, Customers, 'New sale': NewSale, Orders, Stock, Setup,
}
const ICONS = {
  Dashboard: '📊', Products: '💎', Customers: '👤', 'New sale': '🛒', Orders: '🧾', Stock: '📦', Setup: '⚙️',
}

export default function App() {
  const [user, setUser] = useState(getUser())
  const [tab, setTab] = useState('Dashboard')

  // api.js fires this when the server says the token is no longer valid
  useEffect(() => {
    const h = () => setUser(null)
    window.addEventListener('auth-expired', h)
    return () => window.removeEventListener('auth-expired', h)
  }, [])

  const logout = async () => {
    try { await api.post('/api/auth/logout') } catch { /* ignore */ }
    clearUser()
    setUser(null)
  }

  if (!user) return <Login onLogin={(u) => { setTab('Dashboard'); setUser(u) }} />

  const Page = TABS[tab]
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="AURALUCIS logo" />
          <div>
            <h1>AURALUCIS</h1>
            <p className="tagline">Where Luxury Meets Precision.</p>
          </div>
        </div>

        <nav>
          {Object.keys(TABS).map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
              <span className="ico">{ICONS[t]}</span>
              <span className="lbl">{t}</span>
            </button>
          ))}
        </nav>

        <div className="userbox">
          <div className="who">
            <span className="uname">{user.name}</span>
            <span className="badge role">{user.role}</span>
          </div>
          <button className="small" onClick={logout}>Logout</button>
        </div>
      </aside>

      <main className="content">
        <h2 className="pagetitle">{tab}</h2>
        <Page user={user} />
      </main>
    </div>
  )
}
