import { useEffect, useState } from 'react'
import { api, getUser, clearUser } from './api.js'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Products from './pages/Products.jsx'
import Customers from './pages/Customers.jsx'
import NewSale from './pages/NewSale.jsx'
import Orders from './pages/Orders.jsx'
import Stock from './pages/Stock.jsx'
import Reports from './pages/Reports.jsx'
import Audit from './pages/Audit.jsx'
import Rates from './pages/Rates.jsx'
import Returns from './pages/Returns.jsx'
import Purchases from './pages/Purchases.jsx'
import Setup from './pages/Setup.jsx'
import ChangePassword from './components/ChangePassword.jsx'

const TABS = {
  Dashboard, Products, Customers, 'New sale': NewSale, Orders, Returns, Stock, Purchases, Rates, Reports, Audit, Setup,
}
const ICONS = {
  Dashboard: '📊', Products: '💎', Customers: '👤', 'New sale': '🛒', Orders: '🧾', Returns: '↩️', Stock: '📦', Purchases: '🚚', Rates: '💰', Reports: '📈', Audit: '🕵️', Setup: '⚙️',
}
const THEME_KEY = 'auralucis_theme'
const MANAGER_ONLY = ['Returns', 'Purchases', 'Rates', 'Reports', 'Audit']

// the public QR page can send a logged-in employee straight to an order
function readGoto() {
  try {
    const g = JSON.parse(sessionStorage.getItem('auralucis_goto'))
    sessionStorage.removeItem('auralucis_goto')
    return g
  } catch { return null }
}

export default function App() {
  const [user, setUser] = useState(getUser())
  const [goto] = useState(readGoto)
  const [tab, setTab] = useState(goto?.tab || 'Dashboard')
  const [theme, setTheme] = useState(localStorage.getItem(THEME_KEY) || 'light')
  const [showPassword, setShowPassword] = useState(false)

  // light / dark mode: a data-theme attribute on <html> switches the CSS colours
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

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

  // Reports and the audit log are for Managers only
  const names = Object.keys(TABS).filter((t) => !MANAGER_ONLY.includes(t) || user.role === 'Manager')
  const Page = TABS[names.includes(tab) ? tab : 'Dashboard']
  const current = names.includes(tab) ? tab : 'Dashboard'

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
          {names.map((t) => (
            <button key={t} className={t === current ? 'active' : ''} onClick={() => setTab(t)}>
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
          <div className="userbtns">
            <button className="small" title="Light / dark mode" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button className="small" title="Change password" onClick={() => setShowPassword(true)}>🔑</button>
            <button className="small" title="Logout" onClick={logout}><span className="lbl-txt">Logout</span><span className="lbl-ico">🚪</span></button>
          </div>
        </div>
      </aside>

      <main className="content">
        <h2 className="pagetitle">{current}</h2>
        <Page user={user} initialQuery={current === goto?.tab ? goto?.q : undefined} />
      </main>

      {showPassword && <ChangePassword onClose={() => setShowPassword(false)} />}
    </div>
  )
}
