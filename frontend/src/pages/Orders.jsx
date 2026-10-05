import { Fragment, useEffect, useState } from 'react'
import { api } from '../api.js'
import Msg from './Messages.jsx'

export default function Orders({ user }) {
  const [orders, setOrders] = useState([])
  const [open, setOpen] = useState(null)
  const [items, setItems] = useState([])
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try { setOrders(await api.get('/api/orders')) } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [])

  const toggle = async (id) => {
    if (open === id) return setOpen(null)
    try { setItems(await api.get(`/api/orders/${id}/items`)); setOpen(id) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const cancel = async (id) => {
    if (!confirm(`Cancel order #${id}? Stock will be returned.`)) return
    try { await api.post(`/api/orders/${id}/cancel`); setMsg({ type: 'ok', text: `Order #${id} cancelled.` }); setOpen(null); load() }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <h2>Orders</h2>
        <table>
          <thead><tr><th>#</th><th>Date</th><th>Customer</th><th>Staff</th><th>Status</th><th className="right">Items</th><th className="right">Total</th><th></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <Fragment key={o.orderId}>
                <tr>
                  <td>{o.orderId}</td>
                  <td>{new Date(o.orderDate).toLocaleDateString()}</td>
                  <td>{o.customerName}</td><td>{o.employeeName}</td>
                  <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                  <td className="right">{o.itemCount}</td>
                  <td className="right">{Number(o.orderTotal).toFixed(2)}</td>
                  <td>
                    <button className="small" onClick={() => toggle(o.orderId)}>{open === o.orderId ? 'Hide' : 'Items'}</button>
                    {user.role === 'Manager' && o.status !== 'Cancelled' && <button className="small danger" onClick={() => cancel(o.orderId)}>Cancel</button>}
                  </td>
                </tr>
                {open === o.orderId && items.map((i) => (
                  <tr key={i.itemId} style={{ background: '#faf8f1' }}>
                    <td></td><td colSpan="3">{i.productName}</td><td></td>
                    <td className="right">{i.quantity} x {Number(i.unitPrice).toFixed(2)}</td>
                    <td className="right">{Number(i.lineTotal).toFixed(2)}</td><td></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
