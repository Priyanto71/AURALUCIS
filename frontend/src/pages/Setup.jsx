import { useEffect, useState } from 'react'
import { api } from '../api.js'
import Msg from './Messages.jsx'

// Master data: categories, suppliers and employees (only a Manager can add).
export default function Setup({ user }) {
  const isManager = user.role === 'Manager'
  const [msg, setMsg] = useState(null)
  const flash = (type, text) => setMsg({ type, text })

  return (
    <>
      <Msg msg={msg} />
      <Categories isManager={isManager} flash={flash} />
      <Suppliers isManager={isManager} flash={flash} />
      <Employees isManager={isManager} flash={flash} />
    </>
  )
}

function useList(url, flash) {
  const [rows, setRows] = useState([])
  const load = async () => {
    try { setRows(await api.get(url)) } catch (e) { flash('error', e.message) }
  }
  useEffect(() => { load() }, [])
  return [rows, load]
}

function Categories({ isManager, flash }) {
  const [rows, load] = useList('/api/categories', flash)
  const [f, setF] = useState({ categoryName: '', description: '' })
  const save = async (e) => {
    e.preventDefault()
    try { await api.post('/api/categories', f); setF({ categoryName: '', description: '' }); flash('ok', 'Category added.'); load() }
    catch (err) { flash('error', err.message) }
  }
  return (
    <div className="card">
      <h2>Categories</h2>
      {isManager && (
        <form className="grid" onSubmit={save}>
          <label>Name<input required value={f.categoryName} onChange={(e) => setF({ ...f, categoryName: e.target.value })} /></label>
          <label>Description<input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <button className="primary">Add</button>
        </form>
      )}
      <div className="tablewrap"><table>
        <thead><tr><th>ID</th><th>Name</th><th>Description</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.categoryId}><td>{c.categoryId}</td><td>{c.categoryName}</td><td>{c.description}</td></tr>)}</tbody>
      </table></div>
    </div>
  )
}

const emptySupplier = { supplierName: '', contactPerson: '', phone: '', email: '', address: '' }

function Suppliers({ isManager, flash }) {
  const [rows, load] = useList('/api/suppliers', flash)
  const [f, setF] = useState(emptySupplier)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    try { await api.post('/api/suppliers', f); setF(emptySupplier); flash('ok', 'Supplier added.'); load() }
    catch (err) { flash('error', err.message) }
  }
  return (
    <div className="card">
      <h2>Suppliers</h2>
      {isManager && (
        <form className="grid" onSubmit={save}>
          <label>Name<input required value={f.supplierName} onChange={set('supplierName')} /></label>
          <label>Contact person<input value={f.contactPerson} onChange={set('contactPerson')} /></label>
          <label>Phone<input value={f.phone} onChange={set('phone')} /></label>
          <label>Email<input value={f.email} onChange={set('email')} /></label>
          <label>Address<input value={f.address} onChange={set('address')} /></label>
          <button className="primary">Add</button>
        </form>
      )}
      <div className="tablewrap"><table>
        <thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Address</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.supplierId}><td>{s.supplierId}</td><td>{s.supplierName}</td><td>{s.contactPerson}</td><td>{s.phone}</td><td>{s.email}</td><td>{s.address}</td></tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}

const emptyEmployee = { firstName: '', lastName: '', role: 'Staff', phone: '', email: '', username: '', password: '' }

function Employees({ isManager, flash }) {
  const [rows, load] = useList('/api/employees', flash)
  const [f, setF] = useState(emptyEmployee)
  const [editingId, setEditingId] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const startEdit = (e) => {
    setF({ ...emptyEmployee, firstName: e.firstName, lastName: e.lastName, role: e.role === 'Manager' ? 'Manager' : 'Staff', phone: e.phone ?? '', email: e.email ?? '' })
    setEditingId(e.employeeId)
  }
  const cancelEdit = () => { setEditingId(null); setF(emptyEmployee) }

  const save = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await api.put(`/api/employees/${editingId}`, { firstName: f.firstName, lastName: f.lastName, role: f.role, phone: f.phone, email: f.email })
        flash('ok', 'Employee updated.')
      } else {
        await api.post('/api/employees', f)
        flash('ok', 'Employee added. They can log in now.')
      }
      cancelEdit(); load()
    } catch (err) { flash('error', err.message) }
  }

  const toggleActive = async (emp) => {
    const enable = emp.isActive !== 1
    if (!confirm(`${enable ? 'Enable' : 'Disable'} the login of ${emp.firstName} ${emp.lastName}?`)) return
    try { await api.post(`/api/employees/${emp.employeeId}/active`, { active: enable }); flash('ok', enable ? 'Account enabled.' : 'Account disabled.'); load() }
    catch (err) { flash('error', err.message) }
  }

  const resetPassword = async (emp) => {
    const pw = prompt(`New password for ${emp.firstName} ${emp.lastName} (at least 6 characters):`)
    if (pw === null) return
    try { await api.post(`/api/employees/${emp.employeeId}/reset-password`, { newPassword: pw }); flash('ok', 'Password reset. The person must sign in again.') }
    catch (err) { flash('error', err.message) }
  }

  return (
    <div className="card">
      <h2>Employees</h2>
      {isManager && (
        <form className="grid" onSubmit={save}>
          <label>First name<input required value={f.firstName} onChange={set('firstName')} /></label>
          <label>Last name<input required value={f.lastName} onChange={set('lastName')} /></label>
          <label>Role
            <select value={f.role} onChange={set('role')}>
              <option>Staff</option>
              <option>Manager</option>
            </select>
          </label>
          <label>Phone<input value={f.phone} onChange={set('phone')} /></label>
          <label>Email (unique)<input value={f.email} onChange={set('email')} /></label>
          {!editingId && <label>Username (unique)<input required value={f.username} onChange={set('username')} /></label>}
          {!editingId && <label>Password (min 6)<input required type="password" minLength="6" value={f.password} onChange={set('password')} /></label>}
          <div>
            <button className="primary">{editingId ? 'Update' : 'Add'}</button>{' '}
            {editingId && <button type="button" className="small" onClick={cancelEdit}>Cancel</button>}
          </div>
        </form>
      )}
      <div className="tablewrap"><table>
        <thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Username</th><th>Phone</th><th>Email</th><th>Status</th>{isManager && <th></th>}</tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.employeeId}>
              <td>{e.employeeId}</td><td>{e.firstName} {e.lastName}</td><td>{e.role}</td><td>{e.username}</td><td>{e.phone}</td><td>{e.email}</td>
              <td><span className={`badge ${e.isActive === 1 ? 'Active' : 'Disabled'}`}>{e.isActive === 1 ? 'Active' : 'Disabled'}</span></td>
              {isManager && (
                <td className="actions">
                  <button className="small" onClick={() => startEdit(e)}>Edit</button>
                  <button className="small" onClick={() => resetPassword(e)}>Reset password</button>
                  <button className={`small${e.isActive === 1 ? ' danger' : ''}`} onClick={() => toggleActive(e)}>{e.isActive === 1 ? 'Disable' : 'Enable'}</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  )
}
