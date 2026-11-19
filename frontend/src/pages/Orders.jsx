import { Fragment, useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'
import Modal from '../components/Modal.jsx'
import Receipt from '../components/Receipt.jsx'

const METHODS = ['Cash', 'Card', 'bKash', 'Nagad', 'Bank']

export default function Orders({ user, initialQuery }) {
  const isManager = ['Manager', 'Owner'].includes(user.role)
  const [orders, setOrders] = useState([])
  const [open, setOpen] = useState(null)
  const [items, setItems] = useState([])
  const [receiptId, setReceiptId] = useState(null)
  const [payFor, setPayFor] = useState(null) // order that is taking a payment
  const [pay, setPay] = useState({ amount: '', method: 'Cash', note: '' })
  const [msg, setMsg] = useState(null)
  // filters (done in the browser on the loaded list)
  const [status, setStatus] = useState('All')
  const [q, setQ] = useState(initialQuery ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [dueOnly, setDueOnly] = useState(false)

  const load = async () => {
    try { setOrders(await api.get('/api/orders')) } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [])

  const shown = orders.filter((o) => {
    const d = new Date(o.orderDate)
    const text = `${o.orderId} ${o.customerName ?? ''} ${o.employeeName ?? ''}`.toLowerCase()
    return (status === 'All' || o.status === status)
      && text.includes(q.toLowerCase())
      && (!from || d >= new Date(`${from}T00:00:00`))
      && (!to || d <= new Date(`${to}T23:59:59`))
      && (!dueOnly || o.dueAmount > 0)
  })

  const toggle = async (id) => {
    if (open === id) return setOpen(null)
    try { setItems(await api.get(`/api/orders/${id}/items`)); setOpen(id) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const complete = async (id) => {
    try { await api.post(`/api/orders/${id}/complete`); setMsg({ type: 'ok', text: `Order #${id} completed.` }); load() }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const cancel = async (o) => {
    if (!confirm(`Cancel order #${o.orderId}? Stock will be returned.`)) return
    try { await api.post(`/api/orders/${o.orderId}/cancel`); setMsg({ type: 'ok', text: `Order #${o.orderId} cancelled.` }); setOpen(null); load() }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const startPay = (o) => { setPayFor(o); setPay({ amount: String(o.dueAmount), method: 'Cash', note: '' }) }

  const submitPay = async (e) => {
    e.preventDefault()
    try {
      await api.post(`/api/orders/${payFor.orderId}/payments`, { amount: Number(pay.amount), method: pay.method, note: pay.note || null })
      setMsg({ type: 'ok', text: `Payment of ${money(pay.amount)} received for order #${payFor.orderId}.` })
      setPayFor(null); load()
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const clearFilters = () => { setStatus('All'); setQ(''); setFrom(''); setTo(''); setDueOnly(false) }

  const exportCsv = () => downloadCsv('orders.csv',
    ['Order', 'Date', 'Customer', 'Staff', 'Status', 'Items', 'Discount', 'VAT', 'Total', 'Returned', 'Paid', 'Due'],
    shown.map((o) => [o.orderId, new Date(o.orderDate).toLocaleDateString(), o.customerName, o.employeeName, o.status,
      o.itemCount, o.discountAmount, o.vatAmount, o.orderTotal, o.returnedAmount, o.paidAmount, o.dueAmount]))

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <div className="cardhead">
          <h2>Orders <span className="hint">({shown.length} of {orders.length})</span></h2>
          <button className="small" onClick={exportCsv}>Export CSV</button>
        </div>

        <div className="row">
          <label className="grow">Search<input placeholder="Order no., customer or staff..." value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label>Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>All</option><option>Completed</option><option>Pending</option><option>Cancelled</option>
            </select>
          </label>
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="checkline"><input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} /> Has due</label>
          <button className="small" onClick={clearFilters}>Clear</button>
        </div>

        <div className="tablewrap">
          <table>
            <thead><tr><th>#</th><th>Date</th><th>Customer</th><th>Staff</th><th>Status</th><th className="right">Items</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Due</th><th></th></tr></thead>
            <tbody>
              {shown.map((o) => (
                <Fragment key={o.orderId}>
                  <tr>
                    <td>{o.orderId}</td>
                    <td>{new Date(o.orderDate).toLocaleDateString()}</td>
                    <td>{o.customerName}</td><td>{o.employeeName}</td>
                    <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                    <td className="right">{o.itemCount}</td>
                    <td className="right">{money(o.orderTotal)}{o.returnedAmount > 0 && <> <span className="badge" title="Value of returned items">returned {money(o.returnedAmount)}</span></>}</td>
                    <td className="right">{money(o.paidAmount)}</td>
                    <td className={`right ${o.dueAmount > 0 ? 'dueamt' : ''}`}>{money(o.dueAmount)}</td>
                    <td className="actions">
                      <button className="small" onClick={() => toggle(o.orderId)}>{open === o.orderId ? 'Hide' : 'Items'}</button>
                      <button className="small" onClick={() => setReceiptId(o.orderId)}>Receipt</button>
                      {o.dueAmount > 0 && <button className="small" onClick={() => startPay(o)}>Take payment</button>}
                      {o.status === 'Pending' && <button className="small" onClick={() => complete(o.orderId)}>Complete</button>}
                      {isManager && o.status !== 'Cancelled' && !(o.returnedAmount > 0) && <button className="small danger" onClick={() => cancel(o)}>Cancel</button>}
                    </td>
                  </tr>
                  {open === o.orderId && items.map((i) => (
                    <tr key={i.itemId} style={{ background: 'var(--th)' }}>
                      <td></td><td colSpan="3">{i.productName}</td><td></td>
                      <td className="right">{i.quantity} x {money(i.unitPrice)}</td>
                      <td className="right">{money(i.lineTotal)}</td><td colSpan="3"></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {shown.length === 0 && <tr><td colSpan="10" className="hint">No orders match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {payFor && (
        <Modal onClose={() => setPayFor(null)}>
          <h2>Take payment, order #{payFor.orderId}</h2>
          <p className="hint">{payFor.customerName}. Total {money(payFor.orderTotal)}, paid {money(payFor.paidAmount)}, due {money(payFor.dueAmount)}.</p>
          <form className="stack" onSubmit={submitPay}>
            <label>Amount
              <input required type="number" min="0.01" max={payFor.dueAmount} step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            </label>
            <label>Method
              <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label>Note (optional)<input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></label>
            <div className="modal-actions">
              <button className="primary">Receive payment</button>
              <button type="button" className="small" onClick={() => setPayFor(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
      {receiptId && <Receipt orderId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  )
}
