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
import Setup from './pages/Setup.jsx'
import ChangePassword from './components/ChangePassword.jsx'
import{LayoutDashboard, ShoppingBasket,UserRound,ShoppingCart, ScrollText,Package,ChartLine, Settings, Sun,Moon,KeyRound, LogOut} from 'lucide-react'

const TABS = {
  Dashboard, Products, Customers, 'New sale': NewSale, Orders, Stock, Reports, Setup,
}
const ICONS = {
  Dashboard: <LayoutDashboard />, Products: <ShoppingBasket />, Customers: <UserRound />, 'New sale': <ShoppingCart />, Orders: <ScrollText />, Stock: <Package />, Reports: <ChartLine />, Setup: <Settings />,
}
const THEME_KEY = 'auralucis_theme'

export default function App() {
  const [user, setUser] = useState(getUser())
  const [tab, setTab] = useState('Dashboard')
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

  // Reports show money totals, so only a Manager gets that tab
  const names = Object.keys(TABS).filter((t) => t !== 'Reports' || user.role === 'Manager')
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
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <button className="small" title="Change password" onClick={() => setShowPassword(true)}><KeyRound /></button>
            <button className="small" title="Logout" onClick={logout}><span className="lbl-txt">Logout</span><span className="lbl-ico"><LogOut /></span></button>
          </div>
        </div>
      </aside>

      <main className="content">
        <h2 className="pagetitle">{current}</h2>
        <Page user={user} />
      </main>

      {showPassword && <ChangePassword onClose={() => setShowPassword(false)} />}
    </div>
  )
}
