import { useEffect, useState } from 'react'
import { ArrowLeft, Gem, LockKeyhole, Search, Sun, Moon } from 'lucide-react'
import { api, money } from '../api.js'
import Msg from './Messages.jsx'

export default function PublicCatalog({ onAdminLogin }) {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('auralucis_theme') || 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('auralucis_theme', theme)
    window.dispatchEvent(new CustomEvent('auralucis-theme-change', { detail: theme }))
  }, [theme])

  const toggleTheme = () => setTheme(current => current === 'dark' ? 'light' : 'dark')
  const openProduct = async p => { try { setSelected(await api.get(`/api/catalog/${p.productId}`)) } catch { setSelected(p) } }
  useEffect(() => { api.get('/api/catalog').then(setItems).catch(e => setError(e.message)) }, [])
  const shown = items.filter(p => `${p.productName} ${p.metalType} ${p.purity || ''}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="public-catalog">
    <header className="catalog-header">
      <div className="catalog-brand"><img src="/logo.png" alt=""/><div><h1>AURALUCIS</h1><p>Where Luxury Meets Precision.</p></div></div>
      <div className="catalog-header-actions">
        <button
          className="catalog-theme"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}
        </button>
        <button className="catalog-login" onClick={onAdminLogin}><LockKeyhole size={16}/> Staff login</button>
      </div>
    </header>
    <section className="catalog-hero"><span>THE AURALUCIS COLLECTION</span><h2>Timeless pieces.<br/>Exceptional craftsmanship.</h2><p>Explore our curated jewellery collection.</p></section>
    {selected ? <section className="catalog-detail">
      <button className="catalog-back" onClick={() => setSelected(null)}><ArrowLeft size={16}/> Back to collection</button>
      <div className="catalog-detail-grid"><div className="catalog-detail-image">{selected.imageUrl ? <img src={selected.imageUrl} alt={selected.productName}/> : <Gem size={64}/>}</div>
        <div><span className="catalog-kicker">AURALUCIS COLLECTION</span><h2>{selected.productName}</h2><p className="catalog-price">৳ {money(selected.sellingPrice)}</p><p>{selected.description || 'A carefully selected jewellery piece from AURALUCIS.'}</p>
          <dl><dt>Metal</dt><dd>{selected.metalType} {selected.purity || ''}</dd>{selected.weightGrams != null && <><dt>Weight</dt><dd>{selected.weightGrams} g</dd></>}</dl>
        </div></div>
    </section> : <main className="catalog-main"><div className="catalog-section-head"><div><span className="catalog-kicker">DISCOVER</span><h2>Our Collection</h2></div><label className="catalog-search"><Search size={17}/><input placeholder="Search jewellery..." value={query} onChange={e => setQuery(e.target.value)}/></label></div>
      {error && <Msg msg={{type:'error',text:error}}/>}
      {!error && items.length === 0 && <p className="catalog-empty">Our collection is being updated. Please visit again soon.</p>}
      <div className="catalog-grid">{shown.map(p => <button className="catalog-card" key={p.productId} onClick={() => openProduct(p)}><div className="catalog-card-image">{p.imageUrl ? <img src={p.imageUrl} alt={p.productName}/> : <Gem size={42}/>}</div><div className="catalog-card-info"><span>{p.metalType} {p.purity || ''}</span><h3>{p.productName}</h3><b>৳ {money(p.sellingPrice)}</b></div></button>)}</div>
      {items.length > 0 && shown.length === 0 && <p className="catalog-empty">No matching products found.</p>}
    </main>}
    <footer className="catalog-footer">AURALUCIS · Where Luxury Meets Precision.</footer>
  </div>
}
