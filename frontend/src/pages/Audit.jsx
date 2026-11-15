import { useEffect, useState } from 'react'
import { api, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'

const ENTITIES = ['', 'Auth', 'Order', 'Product', 'Employee', 'Customer', 'Settings']

// Manager only: who did what, and when.
export default function Audit() {
  const [rows, setRows] = useState([])
  const [entity, setEntity] = useState('')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState(null)

  const load = async (e = entity) => {
    try { setRows(await api.get('/api/audit' + (e ? `?entity=${encodeURIComponent(e)}` : ''))); setMsg(null) }
    catch (err) { setMsg({ type: 'error', text: err.message }) }
  }
  useEffect(() => { load('') }, [])

  const shown = rows.filter((r) =>
    `${r.employeeName ?? ''} ${r.action} ${r.entity} ${r.entityId ?? ''} ${r.details ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  const exportCsv = () => downloadCsv('audit-log.csv', ['#', 'When', 'Who', 'Action', 'What', 'Id', 'Details'],
    shown.map((r) => [r.auditId, new Date(r.createdAt).toLocaleString(), r.employeeName, r.action, r.entity, r.entityId, r.details]))

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <div className="cardhead">
          <h2>Audit log <span className="hint">(latest 500 entries)</span></h2>
          <button className="small" onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="row">
          <label className="grow">Search<input placeholder="Person, action, details..." value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label>Show
            <select value={entity} onChange={(e) => { setEntity(e.target.value); load(e.target.value) }}>
              {ENTITIES.map((x) => <option key={x} value={x}>{x || 'Everything'}</option>)}
            </select>
          </label>
          <button className="small" onClick={() => load()}>Refresh</button>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>#</th><th>When</th><th>Who</th><th>Action</th><th>What</th><th>Details</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.auditId}>
                  <td>{r.auditId}</td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.employeeName ?? '-'}</td>
                  <td><span className="badge">{r.action}</span></td>
                  <td>{r.entity}{r.entityId ? ` #${r.entityId}` : ''}</td>
                  <td className="wrap">{r.details}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan="6" className="hint">Nothing recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
