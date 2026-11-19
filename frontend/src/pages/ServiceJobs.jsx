import { useEffect, useState } from 'react'
import { api, money, getUser } from '../api.js'
import Msg from './Messages.jsx'

const blank = {
  customerId: '', jobType: 'REPAIR', description: '', metalType: '',
  purity: '', weightGrams: '', dueDate: '', estimatedCharge: '0', notes: '',
}

const methods = ['Cash', 'Card', 'bKash', 'Nagad', 'Bank']
const statuses = ['RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED']

export default function ServiceJobs() {
  const canManagePayments = ['Manager', 'Owner'].includes(getUser()?.role)
  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] = useState([])
  const [form, setForm] = useState(blank)
  const [selected, setSelected] = useState('')
  const [payment, setPayment] = useState({ amount: '', method: 'Cash', note: '' })
  const [charge, setCharge] = useState('')
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('ALL')

  const load = async () => {
    try {
      const [j, c] = await Promise.all([
        api.get('/api/servicejobs'),
        api.get('/api/customers'),
      ])
      setJobs(j)
      setCustomers(c)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  useEffect(() => { load() }, [])

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const current = jobs.find(j => String(j.jobId) === String(selected))
  const due = current
    ? Number(current.finalCharge ?? current.estimatedCharge) - Number(current.paidAmount)
    : 0

  const create = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const result = await api.post('/api/servicejobs', {
        customerId: Number(form.customerId),
        jobType: form.jobType,
        description: form.description.trim(),
        metalType: form.metalType.trim() || null,
        purity: form.purity.trim() || null,
        weightGrams: form.weightGrams ? Number(form.weightGrams) : null,
        dueDate: form.dueDate || null,
        estimatedCharge: Number(form.estimatedCharge),
        notes: form.notes.trim() || null,
      })
      setForm(blank)
      setMsg({ type: 'ok', text: `Job ${result.jobNumber} created.` })
      await load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (job, status) => {
    try {
      await api.put(`/api/servicejobs/${job.jobId}/status`, { status })
      setMsg({ type: 'ok', text: `${job.jobNumber} status updated to ${status}.` })
      await load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const saveCharge = async (e) => {
    e.preventDefault()
    if (!current) return
    try {
      await api.put(`/api/servicejobs/${current.jobId}/charge`, {
        finalCharge: Number(charge),
      })
      setMsg({ type: 'ok', text: 'Final charge updated.' })
      setCharge('')
      await load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const addPayment = async (e) => {
    e.preventDefault()
    if (!current) return
    try {
      const result = await api.post(`/api/servicejobs/${current.jobId}/payments`, {
        amount: Number(payment.amount),
        method: payment.method,
        note: payment.note.trim() || null,
      })
      setMsg({ type: 'ok', text: `Payment recorded. Remaining balance: ${money(result.balance)}.` })
      setPayment({ amount: '', method: 'Cash', note: '' })
      await load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const shown = filter === 'ALL' ? jobs : jobs.filter(j => j.status === filter)

  return (
    <>
      <Msg msg={msg} />

      <form className="card" onSubmit={create}>
        <h2>New custom order / repair</h2>
        <div className="grid">
          <label>Customer
            <select required value={form.customerId} onChange={e => update('customerId', e.target.value)}>
              <option value="">Select customer</option>
              {customers.map(c => <option key={c.customerId} value={c.customerId}>
                {c.firstName} {c.lastName} {c.phone ? `— ${c.phone}` : ''}
              </option>)}
            </select>
          </label>

          <label>Job type
            <select value={form.jobType} onChange={e => update('jobType', e.target.value)}>
              <option value="REPAIR">Repair</option>
              <option value="CUSTOM_ORDER">Custom order</option>
            </select>
          </label>

          <label>Description
            <input required maxLength="1000" value={form.description}
              onChange={e => update('description', e.target.value)} />
          </label>

          <label>Metal type
            <input maxLength="50" value={form.metalType}
              onChange={e => update('metalType', e.target.value)} />
          </label>

          <label>Purity
            <input maxLength="20" value={form.purity}
              onChange={e => update('purity', e.target.value)} />
          </label>

          <label>Weight (grams)
            <input type="number" min="0.001" step="0.001" value={form.weightGrams}
              onChange={e => update('weightGrams', e.target.value)} />
          </label>

          <label>Due date
            <input type="date" value={form.dueDate}
              onChange={e => update('dueDate', e.target.value)} />
          </label>

          <label>Estimated charge
            <input required type="number" min="0" step="0.01"
              value={form.estimatedCharge}
              onChange={e => update('estimatedCharge', e.target.value)} />
          </label>

          <label>Notes
            <input maxLength="1000" value={form.notes}
              onChange={e => update('notes', e.target.value)} />
          </label>
        </div>
        <button className="primary" disabled={saving}>
          {saving ? 'Saving...' : 'Create service job'}
        </button>
      </form>

      <div className="card">
        <div className="cardhead">
          <h2>Service jobs</h2>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Job</th><th>Type</th><th>Customer</th><th>Description</th>
                <th>Due date</th><th>Status</th><th className="right">Charge</th>
                <th className="right">Paid</th><th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(j => (
                <tr key={j.jobId}>
                  <td>{j.jobNumber}</td>
                  <td>{j.jobType === 'REPAIR' ? 'Repair' : 'Custom order'}</td>
                  <td>{j.customerName}<div className="hint">{j.customerPhone}</div></td>
                  <td>{j.description}</td>
                  <td>{j.dueDate ? String(j.dueDate).slice(0, 10) : '—'}</td>
                  <td>{j.status}</td>
                  <td className="right">{money(j.finalCharge ?? j.estimatedCharge)}</td>
                  <td className="right">{money(j.paidAmount)}</td>
                  <td>
                    <button className="small" onClick={() => {
                      setSelected(String(j.jobId))
                      setCharge(String(j.finalCharge ?? j.estimatedCharge))
                    }}>Manage</button>
                    {j.status === 'RECEIVED' && <button className="small" onClick={() => changeStatus(j, 'IN_PROGRESS')}>Start</button>}
                    {j.status === 'IN_PROGRESS' && <button className="small" onClick={() => changeStatus(j, 'READY')}>Ready</button>}
                    {j.status === 'READY' && <button className="small" onClick={() => changeStatus(j, 'DELIVERED')}>Deliver</button>}
                    {['RECEIVED', 'IN_PROGRESS'].includes(j.status) &&
                      <button className="small" onClick={() => changeStatus(j, 'CANCELLED')}>Cancel</button>}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan="9" className="hint">No service jobs found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {current && (
        <div className="card">
          <h2>Manage {current.jobNumber}</h2>
          <p className="hint">{current.customerName} · {current.description} · {current.status}</p>
          <div className="summary">
            <div><span>Estimated charge</span><b>{money(current.estimatedCharge)}</b></div>
            <div><span>Paid</span><b>{money(current.paidAmount)}</b></div>
            <div className="grand"><span>Balance</span><b>{money(due)}</b></div>
          </div>

                    {!['DELIVERED', 'CANCELLED'].includes(current.status) && (
            <>
              {canManagePayments && (
                <>
                  <form className="grid" onSubmit={saveCharge}>
                    <label>Set final charge
                      <input required type="number" min="0" step="0.01"
                        value={charge} onChange={e => setCharge(e.target.value)} />
                    </label>
                    <button className="small">Save final charge</button>
                  </form>

                  <form className="grid" onSubmit={addPayment}>
                    <label>Payment amount
                      <input required type="number" min="0.01" step="0.01"
                        value={payment.amount}
                        onChange={e => setPayment(p => ({ ...p, amount: e.target.value }))} />
                    </label>
                    <label>Method
                      <select value={payment.method}
                        onChange={e => setPayment(p => ({ ...p, method: e.target.value }))}>
                        {methods.map(m => <option key={m}>{m}</option>)}
                      </select>
                    </label>
                    <label>Note
                      <input maxLength="255" value={payment.note}
                        onChange={e => setPayment(p => ({ ...p, note: e.target.value }))} />
                    </label>
                    <button className="primary">Receive payment</button>
                  </form>
                </>
              )}
            </>
          )}
          <button className="small" onClick={() => setSelected('')}>Close</button>
        </div>
      )}
    </>
  )
}


