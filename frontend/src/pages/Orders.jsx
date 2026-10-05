import { Fragment, useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'
import Receipt from '../components/Receipt.jsx'

export default function Orders({ user }) {
  const isManager = user.role === 'Manager'
  const [orders, setOrders] = useState([])
  const [open, setOpen] = useState(null)
  const [items, setItems] = useState([])
  const [receiptId, setReceiptId] = useState(null)
  const [msg, setMsg] = useState(null)
  // filters (done in the browser on the loaded list)
  const [status, setStatus] = useState('All')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

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

  const clearFilters = () => { setStatus('All'); setQ(''); setFrom(''); setTo('') }

  const exportCsv = () => downloadCsv('orders.csv', ['Order', 'Date', 'Customer', 'Staff', 'Status', 'Items', 'Total'],
    shown.map((o) => [o.orderId, new Date(o.orderDate).toLocaleDateString(), o.customerName, o.employeeName, o.status, o.itemCount, o.orderTotal]))

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
          <button className="small" onClick={clearFilters}>Clear</button>
        </div>

        <div className="tablewrap"><table>
          <thead><tr><th>#</th><th>Date</th><th>Customer</th><th>Staff</th><th>Status</th><th className="right">Items</th><th className="right">Total</th><th></th></tr></thead>
          <tbody>
            {shown.map((o) => (
              <Fragment key={o.orderId}>
                <tr>
                  <td>{o.orderId}</td>
                  <td>{new Date(o.orderDate).toLocaleDateString()}</td>
                  <td>{o.customerName}</td><td>{o.employeeName}</td>
                  <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                  <td className="right">{o.itemCount}</td>
                  <td className="right">{money(o.orderTotal)}</td>
                  <td className="actions">
                    <button className="small" onClick={() => toggle(o.orderId)}>{open === o.orderId ? 'Hide' : 'Items'}</button>
                    <button className="small" onClick={() => setReceiptId(o.orderId)}>Receipt</button>
                    {o.status === 'Pending' && <button className="small" onClick={() => complete(o.orderId)}>Complete</button>}
                    {isManager && o.status !== 'Cancelled' && <button className="small danger" onClick={() => cancel(o)}>Cancel</button>}
                  </td>
                </tr>
                {open === o.orderId && items.map((i) => (
                  <tr key={i.itemId} style={{ background: 'var(--th)' }}>
                    <td></td><td colSpan="3">{i.productName}</td><td></td>
                    <td className="right">{i.quantity} x {money(i.unitPrice)}</td>
                    <td className="right">{money(i.lineTotal)}</td><td></td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {shown.length === 0 && <tr><td colSpan="8" className="hint">No orders match.</td></tr>}
          </tbody>
        </table></div>
      </div>
      {receiptId && <Receipt orderId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  )
}
