import { Fragment, useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'
import Modal from '../components/Modal.jsx'

const METHODS = ['Cash', 'Card', 'bKash', 'Nagad', 'Bank']
const round2 = (n) => Math.round(n * 100) / 100

// Manager only: record what was bought from a supplier, and pay the supplier (all at once or in parts).
export default function Purchases() {
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [list, setList] = useState([])
  const [form, setForm] = useState({ supplierId: '', invoiceNo: '', note: '' })
  const [lines, setLines] = useState([]) // [{ productId, quantity, unitCost }]
  const [pick, setPick] = useState({ productId: '', quantity: 1, unitCost: '' })
  const [payFull, setPayFull] = useState(false)
  const [paidNow, setPaidNow] = useState('')
  const [method, setMethod] = useState('Cash')
  const [open, setOpen] = useState(null)
  const [detail, setDetail] = useState(null)
  const [payFor, setPayFor] = useState(null)
  const [pay, setPay] = useState({ amount: '', method: 'Cash', note: '' })
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try {
      const [s, p, l] = await Promise.all([api.get('/api/suppliers'), api.get('/api/products'), api.get('/api/purchases')])
      setSuppliers(s); setProducts(p); setList(l)
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [])

  const product = (id) => products.find((p) => p.productId === Number(id))
  const total = round2(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0))
  const owed = round2(list.reduce((s, r) => s + Number(r.dueAmount), 0))
  const bought = round2(list.reduce((s, r) => s + Number(r.totalAmount), 0))

  const choose = (e) => {
    const p = product(e.target.value)
    setPick({ ...pick, productId: e.target.value, unitCost: p && p.costPrice > 0 ? String(p.costPrice) : pick.unitCost })
  }

  const addLine = () => {
    const q = Number(pick.quantity); const c = Number(pick.unitCost)
    if (!pick.productId || q <= 0 || pick.unitCost === '' || c < 0) { setMsg({ type: 'error', text: 'Choose a product, a quantity and its cost price.' }); return }
    setMsg(null)
    setLines([...lines, { productId: Number(pick.productId), quantity: q, unitCost: c }])
    setPick({ productId: '', quantity: 1, unitCost: '' })
  }

  const save = async (e) => {
    e.preventDefault()
    if (lines.length === 0) { setMsg({ type: 'error', text: 'Add at least one product.' }); return }
    try {
      const r = await api.post('/api/purchases', {
        supplierId: Number(form.supplierId), invoiceNo: form.invoiceNo || null, note: form.note || null, items: lines,
        paidAmount: payFull ? total : Number(paidNow) || 0, paymentMethod: method,
      })
      setMsg({ type: 'ok', text: `Purchase #${r.purchaseId} saved. Total ${money(r.total)}, paid ${money(r.paid)}, still owed ${money(r.due)}. Stock and cost prices are updated.` })
      setLines([]); setForm({ ...form, invoiceNo: '', note: '' }); setPayFull(false); setPaidNow(''); load()
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const toggle = async (id) => {
    if (open === id) return setOpen(null)
    try { setDetail(await api.get(`/api/purchases/${id}`)); setOpen(id) } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const startPay = (r) => { setPayFor(r); setPay({ amount: String(r.dueAmount), method: 'Cash', note: '' }) }

  const submitPay = async (e) => {
    e.preventDefault()
    try {
      await api.post(`/api/purchases/${payFor.purchaseId}/payments`, { amount: Number(pay.amount), method: pay.method, note: pay.note || null })
      setMsg({ type: 'ok', text: `Paid ${money(pay.amount)} to ${payFor.supplierName}.` })
      setPayFor(null); setOpen(null); load()
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const exportCsv = () => downloadCsv('purchases.csv', ['#', 'Date', 'Invoice', 'Supplier', 'Items', 'Total', 'Paid', 'Owed'],
    list.map((r) => [r.purchaseId, new Date(r.purchaseDate).toLocaleDateString(), r.invoiceNo, r.supplierName, r.itemCount, r.totalAmount, r.paidAmount, r.dueAmount]))

  return (
    <>
      <Msg msg={msg} />
      <div className="stats">
        <div className="stat"><span>Purchases</span><b>{list.length}</b></div>
        <div className="stat"><span>Total bought</span><b>{money(bought)}</b></div>
        <div className="stat"><span>Owed to suppliers</span><b>{money(owed)}</b></div>
      </div>

      <form className="card" onSubmit={save}>
        <h2>New purchase</h2>
        <div className="grid">
          <label>Supplier
            <select required value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">Select...</option>
              {suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
            </select>
          </label>
          <label>Invoice number<input value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} /></label>
          <label>Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        </div>

        <h3>Items bought</h3>
        <div className="grid">
          <label>Product
            <select value={pick.productId} onChange={choose}>
              <option value="">Select...</option>
              {products.map((p) => <option key={p.productId} value={p.productId}>{p.productName} (stock {p.stockQuantity})</option>)}
            </select>
          </label>
          <label>Quantity<input type="number" min="1" value={pick.quantity} onChange={(e) => setPick({ ...pick, quantity: e.target.value })} /></label>
          <label>Cost price per piece<input type="number" min="0" step="0.01" value={pick.unitCost} onChange={(e) => setPick({ ...pick, unitCost: e.target.value })} /></label>
          <button type="button" className="primary" onClick={addLine}>Add</button>
        </div>
        {lines.length > 0 && (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Product</th><th className="right">Qty</th><th className="right">Cost / piece</th><th className="right">Line total</th><th></th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{product(l.productId)?.productName}</td><td className="right">{l.quantity}</td>
                    <td className="right">{money(l.unitCost)}</td><td className="right">{money(l.quantity * l.unitCost)}</td>
                    <td><button type="button" className="small danger" onClick={() => setLines(lines.filter((_, k) => k !== i))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid">
          <label>Pay the supplier by
            <select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label className="checkline"><input type="checkbox" checked={payFull} onChange={(e) => setPayFull(e.target.checked)} /> Pay everything now</label>
          {!payFull && <label>Paid now (empty = nothing yet)<input type="number" min="0" step="0.01" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} /></label>}
        </div>
        <div className="summary">
          <div className="grand"><span>Total of this purchase</span><b>{money(total)}</b></div>
          <div><span>Paying now</span><b>{money(payFull ? total : Number(paidNow) || 0)}</b></div>
          <div className="duecell"><span>Still owed</span><b>{money(round2(total - (payFull ? total : Number(paidNow) || 0)))}</b></div>
        </div>
        <p className="hint">Saving adds the pieces to the stock and updates each product's average cost price.</p>
        <p><button className="primary">Save purchase</button></p>
      </form>

      <div className="card">
        <div className="cardhead">
          <h2>Purchases</h2>
          <button className="small" disabled={!list.length} onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>#</th><th>Date</th><th>Invoice</th><th>Supplier</th><th className="right">Items</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Owed</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => (
                <Fragment key={r.purchaseId}>
                  <tr>
                    <td>{r.purchaseId}</td><td>{new Date(r.purchaseDate).toLocaleDateString()}</td><td>{r.invoiceNo}</td><td>{r.supplierName}</td>
                    <td className="right">{r.itemCount}</td><td className="right">{money(r.totalAmount)}</td><td className="right">{money(r.paidAmount)}</td>
                    <td className={`right ${r.dueAmount > 0 ? 'dueamt' : ''}`}>{money(r.dueAmount)}</td>
                    <td className="actions">
                      <button className="small" onClick={() => toggle(r.purchaseId)}>{open === r.purchaseId ? 'Hide' : 'Details'}</button>
                      {r.dueAmount > 0 && <button className="small" onClick={() => startPay(r)}>Pay supplier</button>}
                    </td>
                  </tr>
                  {open === r.purchaseId && detail && (
                    <tr style={{ background: 'var(--th)' }}>
                      <td></td>
                      <td colSpan="8">
                        {detail.purchase.note && <p className="hint">Note: {detail.purchase.note}</p>}
                        {detail.items.map((i, k) => <div key={k}>{i.productName}: {i.quantity} x {money(i.unitCost)} = {money(i.lineTotal)}</div>)}
                        {detail.payments.length > 0 && <p className="hint" style={{ marginTop: 8 }}>Payments to the supplier:</p>}
                        {detail.payments.map((x, k) => <div key={k}>{new Date(x.paidAt).toLocaleDateString()}: {money(x.amount)} by {x.method} {x.note && `(${x.note})`}</div>)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {list.length === 0 && <tr><td colSpan="9" className="hint">No purchases yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {payFor && (
        <Modal onClose={() => setPayFor(null)}>
          <h2>Pay supplier, purchase #{payFor.purchaseId}</h2>
          <p className="hint">{payFor.supplierName}. Total {money(payFor.totalAmount)}, paid {money(payFor.paidAmount)}, owed {money(payFor.dueAmount)}.</p>
          <form className="stack" onSubmit={submitPay}>
            <label>Amount
              <input required type="number" min="0.01" max={payFor.dueAmount} step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </label>
            <label>Method
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label>Note (optional)<input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></label>
            <div className="modal-actions">
              <button className="primary">Pay</button>
              <button type="button" className="small" onClick={() => setPayFor(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
