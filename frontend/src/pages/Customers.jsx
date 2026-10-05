import { useEffect, useState } from 'react'
import { api } from '../api.js'
import Msg from './Messages.jsx'

const empty = { firstName: '', lastName: '', phone: '', email: '', address: '' }

export default function Customers() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState(null)

  const load = async (phone = search) => {
    try { setRows(await api.get('/api/customers' + (phone ? `?phone=${encodeURIComponent(phone)}` : ''))) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load('') }, [])

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
        <h2>Customers</h2>
        <p>
          <input placeholder="Search by mobile..." value={search} onChange={(e) => setSearch(e.target.value)} />{' '}
          <button className="small" onClick={() => load(search)}>Search</button>
        </p>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.customerId}>
                <td>{c.customerId}</td><td>{c.firstName} {c.lastName}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.address}</td>
                <td><button className="small" onClick={() => startEdit(c)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
