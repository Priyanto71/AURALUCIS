import { useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'
import Modal from '../components/Modal.jsx'
import Receipt from '../components/Receipt.jsx'

const empty = { firstName: '', lastName: '', phone: '', email: '', address: '' }

export default function Customers() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState(null)
  const [history, setHistory] = useState(null) // purchase history shown in a pop-up
  const [receiptId, setReceiptId] = useState(null)

  const load = async () => {
    try { setRows(await api.get('/api/customers')) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [])

  const shown = rows.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.phone ?? ''} ${c.email ?? ''} ${c.address ?? ''}`.toLowerCase().includes(search.toLowerCase()))

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const startEdit = (c) => {
    setForm({ firstName: c.firstName, lastName: c.lastName, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '' })
    setEditingId(c.customerId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const cancelEdit = () => { setEditingId(null); setForm(empty) }

  const save = async (e) => {
    e.preventDefault()
    try {
      if (editingId) await api.put(`/api/customers/${editingId}`, form)
      else await api.post('/api/customers', form)
      setMsg({ type: 'ok', text: editingId ? 'Customer updated.' : 'Customer added.' })
      cancelEdit(); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const openHistory = async (id) => {
    try { setHistory(await api.get(`/api/customers/${id}/history`)) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const exportCsv = () => downloadCsv('customers.csv', ['ID', 'First name', 'Last name', 'Phone', 'Email', 'Address'],
    shown.map((c) => [c.customerId, c.firstName, c.lastName, c.phone, c.email, c.address]))

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <h2>{editingId ? `Edit customer #${editingId}` : 'Add customer'}</h2>
        <form className="grid" onSubmit={save}>
          <label>First name<input required value={form.firstName} onChange={set('firstName')} /></label>
          <label>Last name<input required value={form.lastName} onChange={set('lastName')} /></label>
          <label>Phone (unique)<input value={form.phone} onChange={set('phone')} /></label>
          <label>Email<input value={form.email} onChange={set('email')} /></label>
          <label>Address<input value={form.address} onChange={set('address')} /></label>
          <div>
            <button className="primary">{editingId ? 'Update' : 'Save'}</button>{' '}
            {editingId && <button type="button" className="small" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="cardhead">
          <h2>Customers <span className="hint">({shown.length} of {rows.length})</span></h2>
          <button className="small" onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="row">
          <label className="grow">Search<input placeholder="Name, mobile, email, address..." value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        </div>
        <div className="tablewrap"><table>
          <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th></th></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.customerId}>
                <td>{c.customerId}</td><td>{c.firstName} {c.lastName}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.address}</td>
                <td className="actions">
                  <button className="small" onClick={() => openHistory(c.customerId)}>History</button>
                  <button className="small" onClick={() => startEdit(c)}>Edit</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="6" className="hint">No customers match.</td></tr>}
          </tbody>
        </table></div>
      </div>

      {history && (
        <Modal wide onClose={() => setHistory(null)}>
          <h2>{history.customer.firstName} {history.customer.lastName}</h2>
          <p className="hint">{history.customer.phone} {history.customer.email && ` | ${history.customer.email}`} {history.customer.address && ` | ${history.customer.address}`}</p>
          <div className="stats">
            <div className="stat"><span>Total spent (completed)</span><b>{money(history.totalSpent)}</b></div>
            <div className="stat"><span>Orders</span><b>{history.orderCount}</b></div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div className="tablewrap"><table>
              <thead><tr><th>#</th><th>Date</th><th>Status</th><th>Served by</th><th className="right">Items</th><th className="right">Total</th><th></th></tr></thead>
              <tbody>
                {history.orders.map((o) => (
                  <tr key={o.orderId}>
                    <td>{o.orderId}</td><td>{new Date(o.orderDate).toLocaleDateString()}</td>
                    <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                    <td>{o.employeeName}</td><td className="right">{o.itemCount}</td><td className="right">{money(o.orderTotal)}</td>
                    <td><button className="small" onClick={() => setReceiptId(o.orderId)}>Receipt</button></td>
                  </tr>
                ))}
                {history.orders.length === 0 && <tr><td colSpan="7" className="hint">No orders yet.</td></tr>}
              </tbody>
            </table></div>
          </div>
          <div className="modal-actions"><button className="small" onClick={() => setHistory(null)}>Close</button></div>
        </Modal>
      )}
      {receiptId && <Receipt orderId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  )
}
