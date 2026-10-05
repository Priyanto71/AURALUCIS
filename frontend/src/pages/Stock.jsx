import { useEffect, useState } from 'react'
import { api } from '../api.js'
import Msg from './Messages.jsx'

export default function Stock({ user }) {
  const [products, setProducts] = useState([])
  const [txns, setTxns] = useState([])
  const [f, setF] = useState({ productId: '', quantity: 1, remarks: '' })
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try {
      const [p, t] = await Promise.all([api.get('/api/products'), api.get('/api/stock/transactions')])
      setProducts(p); setTxns(t)
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/stock/restock', { productId: Number(f.productId), quantity: Number(f.quantity), remarks: f.remarks })
      setMsg({ type: 'ok', text: 'Stock added.' }); setF({ productId: '', quantity: 1, remarks: '' }); load()
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  return (
    <>
      <Msg msg={msg} />
      {user.role === 'Manager' && (
      <div className="card">
        <h2>Restock product</h2>
        <form className="grid" onSubmit={submit}>
          <label>Product
            <select required value={f.productId} onChange={set('productId')}>
              <option value="">Select...</option>
              {products.map((p) => <option key={p.productId} value={p.productId}>{p.productName} (now {p.stockQuantity})</option>)}
            </select>
          </label>
          <label>Quantity<input required type="number" min="1" value={f.quantity} onChange={set('quantity')} /></label>
          <label>Remarks<input value={f.remarks} onChange={set('remarks')} placeholder="Supplier delivery" /></label>
          <button className="primary">Add stock</button>
        </form>
      </div>
      )}
      <div className="card">
        <h2>Recent stock movements</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Date</th><th>Product</th><th>Type</th><th className="right">Qty</th><th>Remarks</th></tr></thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.txnId}>
                <td>{t.txnId}</td><td>{new Date(t.txnDate).toLocaleString()}</td><td>{t.productName}</td>
                <td>{t.txnType}</td><td className="right">{t.quantity}</td><td>{t.remarks}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  )
}
