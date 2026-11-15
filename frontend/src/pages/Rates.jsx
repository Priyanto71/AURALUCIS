import { useEffect, useMemo, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'

// Manager only: today's gold / silver rate per gram. Products priced "by metal rate" are repriced at once.
export default function Rates() {
  const [current, setCurrent] = useState([])
  const [history, setHistory] = useState([])
  const [products, setProducts] = useState([])
  const [f, setF] = useState({ metalType: 'Gold', purity: '', ratePerGram: '' })
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try {
      const [c, h, p] = await Promise.all([api.get('/api/rates'), api.get('/api/rates/history'), api.get('/api/products')])
      setCurrent(c); setHistory(h); setProducts(p)
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [])

  // metals and purities that already exist on products help to fill the form
  const metals = useMemo(() => [...new Set(products.map((p) => p.metalType))].sort(), [products])
  const purities = useMemo(() => [...new Set(products.filter((p) => p.metalType === f.metalType).map((p) => p.purity).filter(Boolean))].sort(), [products, f.metalType])

  const save = async (e) => {
    e.preventDefault()
    try {
      const r = await api.post('/api/rates', { metalType: f.metalType, purity: f.purity || null, ratePerGram: Number(f.ratePerGram) })
      setMsg({ type: 'ok', text: `Rate saved. ${r.repriced} product(s) priced by this rate were repriced.` })
      setF({ ...f, ratePerGram: '' }); load()
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const useRate = (r) => setF({ metalType: r.metalType, purity: r.purity ?? '', ratePerGram: String(r.ratePerGram) })

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <h2>Set today's rate</h2>
        <form className="grid" onSubmit={save}>
          <label>Metal
            <input required list="metal-list" value={f.metalType} onChange={(e) => setF({ ...f, metalType: e.target.value })} />
            <datalist id="metal-list">{metals.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label>Purity
            <input list="purity-list" value={f.purity} placeholder="22K" onChange={(e) => setF({ ...f, purity: e.target.value })} />
            <datalist id="purity-list">{purities.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label>Rate per gram<input required type="number" min="0.01" step="0.01" value={f.ratePerGram} onChange={(e) => setF({ ...f, ratePerGram: e.target.value })} /></label>
          <button className="primary">Save rate</button>
        </form>
        <p className="hint">
          Price of a piece = weight (grams) x rate per gram. Only products set to "By metal rate" (Products tab) change.
          Orders already sold or on hold keep their price.
        </p>
      </div>

      <div className="card">
        <h2>Current rates</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Metal</th><th>Purity</th><th className="right">Rate / gram</th><th>Since</th><th>Set by</th><th className="right">Products priced by it</th><th></th></tr></thead>
            <tbody>
              {current.map((r) => (
                <tr key={r.rateId}>
                  <td>{r.metalType}</td><td>{r.purity}</td><td className="right">{money(r.ratePerGram)}</td>
                  <td>{new Date(r.effectiveFrom).toLocaleString()}</td><td>{r.setByName}</td><td className="right">{r.productCount}</td>
                  <td><button className="small" onClick={() => useRate(r)}>Change</button></td>
                </tr>
              ))}
              {current.length === 0 && <tr><td colSpan="7" className="hint">No rate set yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="cardhead">
          <h2>Rate history</h2>
          <button className="small" disabled={!history.length}
            onClick={() => downloadCsv('metal-rate-history.csv', ['When', 'Metal', 'Purity', 'Rate per gram', 'Set by'],
              history.map((r) => [new Date(r.effectiveFrom).toLocaleString(), r.metalType, r.purity, r.ratePerGram, r.setByName]))}>
            Export CSV
          </button>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>When</th><th>Metal</th><th>Purity</th><th className="right">Rate / gram</th><th>Set by</th></tr></thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.rateId}>
                  <td>{new Date(r.effectiveFrom).toLocaleString()}</td><td>{r.metalType}</td><td>{r.purity}</td>
                  <td className="right">{money(r.ratePerGram)}</td><td>{r.setByName}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan="5" className="hint">No history yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
