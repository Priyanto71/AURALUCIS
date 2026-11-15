import { useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'

const REASONS_OUT = ['Damaged', 'Lost', 'Stolen', 'Counting correction', 'Other']
const REASONS_IN = ['Found', 'Counting correction', 'Returned by customer', 'Other']

export default function Stock({ user }) {
  const isManager = user.role === 'Manager'
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [txns, setTxns] = useState([])
  const [f, setF] = useState({ productId: '', quantity: 1, unitCost: '', supplierId: '', remarks: '' })
  const [a, setA] = useState({ productId: '', direction: 'OUT', quantity: 1, reason: 'Damaged', note: '' })
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try {
      const [p, s, t] = await Promise.all([api.get('/api/products'), api.get('/api/suppliers'), api.get('/api/stock/transactions')])
      setProducts(p); setSuppliers(s); setTxns(t)
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setAdj = (k) => (e) => setA({ ...a, [k]: e.target.value })

  const pickProduct = (e) => {
    const p = products.find((x) => x.productId === Number(e.target.value))
    setF({ ...f, productId: e.target.value, supplierId: p?.supplierName ? (suppliers.find((s) => s.supplierName === p.supplierName)?.supplierId ?? '') : '' })
  }

  const restock = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/stock/restock', {
        productId: Number(f.productId), quantity: Number(f.quantity), remarks: f.remarks,
        unitCost: f.unitCost === '' ? null : Number(f.unitCost),
        supplierId: f.supplierId === '' ? null : Number(f.supplierId),
      })
      setMsg({ type: 'ok', text: 'Stock added.' })
      setF({ productId: '', quantity: 1, unitCost: '', supplierId: '', remarks: '' }); load()
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const adjust = async (e) => {
    e.preventDefault()
    const qty = Number(a.quantity)
    if (!confirm(`${a.direction === 'OUT' ? 'Remove' : 'Add'} ${qty} piece(s) (${a.reason})?`)) return
    try {
      await api.post('/api/stock/adjust', {
        productId: Number(a.productId), quantityChange: a.direction === 'OUT' ? -qty : qty, reason: a.reason, note: a.note || null,
      })
      setMsg({ type: 'ok', text: 'Stock adjusted.' })
      setA({ productId: '', direction: 'OUT', quantity: 1, reason: 'Damaged', note: '' }); load()
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const exportCsv = () => downloadCsv('stock-history.csv',
    ['#', 'Date', 'Product', 'Type', 'Qty', ...(isManager ? ['Unit cost', 'Supplier'] : []), 'Remarks'],
    txns.map((t) => [t.txnId, new Date(t.txnDate).toLocaleString(), t.productName, t.txnType, t.quantity, ...(isManager ? [t.unitCost, t.supplierName] : []), t.remarks]))

  return (
    <>
      <Msg msg={msg} />
      {isManager && (
        <>
          <div className="card">
            <h2>Restock product</h2>
            <form className="grid" onSubmit={restock}>
              <label>Product
                <select required value={f.productId} onChange={pickProduct}>
                  <option value="">Select...</option>
                  {products.map((p) => <option key={p.productId} value={p.productId}>{p.productName} (now {p.stockQuantity})</option>)}
                </select>
              </label>
              <label>Quantity<input required type="number" min="1" value={f.quantity} onChange={set('quantity')} /></label>
              <label>Cost price per piece<input type="number" min="0" step="0.01" value={f.unitCost} onChange={set('unitCost')} placeholder="what you paid" /></label>
              <label>Supplier
                <select value={f.supplierId} onChange={set('supplierId')}>
                  <option value="">-</option>
                  {suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
                </select>
              </label>
              <label>Remarks<input value={f.remarks} onChange={set('remarks')} placeholder="Supplier delivery" /></label>
              <button className="primary">Add stock</button>
            </form>
            <p className="hint">With a cost price, the product's average cost is updated and used in the profit report.</p>
          </div>

          <div className="card">
            <h2>Stock adjustment (damaged, lost, found, correction)</h2>
            <form className="grid" onSubmit={adjust}>
              <label>Product
                <select required value={a.productId} onChange={setAdj('productId')}>
                  <option value="">Select...</option>
                  {products.map((p) => <option key={p.productId} value={p.productId}>{p.productName} (now {p.stockQuantity})</option>)}
                </select>
              </label>
              <label>What happened
                <select value={a.direction} onChange={(e) => setA({ ...a, direction: e.target.value, reason: e.target.value === 'OUT' ? 'Damaged' : 'Found' })}>
                  <option value="OUT">Remove from stock</option>
                  <option value="IN">Add to stock</option>
                </select>
              </label>
              <label>Quantity<input required type="number" min="1" value={a.quantity} onChange={setAdj('quantity')} /></label>
              <label>Reason
                <select value={a.reason} onChange={setAdj('reason')}>
                  {(a.direction === 'OUT' ? REASONS_OUT : REASONS_IN).map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label>Note (optional)<input value={a.note} onChange={setAdj('note')} /></label>
              <button className="primary">Save adjustment</button>
            </form>
          </div>
        </>
      )}

      <div className="card">
        <div className="cardhead">
          <h2>Recent stock movements</h2>
          <button className="small" onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>#</th><th>Date</th><th>Product</th><th>Type</th><th className="right">Qty</th>{isManager && <th className="right">Unit cost</th>}{isManager && <th>Supplier</th>}<th>Remarks</th></tr></thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.txnId}>
                  <td>{t.txnId}</td><td>{new Date(t.txnDate).toLocaleString()}</td><td>{t.productName}</td>
                  <td><span className={`badge tx-${t.txnType}`}>{t.txnType}</span></td>
                  <td className="right">{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</td>
                  {isManager && <td className="right">{t.unitCost != null ? money(t.unitCost) : ''}</td>}
                  {isManager && <td>{t.supplierName}</td>}
                  <td>{t.remarks}</td>
                </tr>
              ))}
              {txns.length === 0 && <tr><td colSpan="8" className="hint">No stock movements yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
