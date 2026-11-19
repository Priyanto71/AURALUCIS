import { useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'

const METHODS = ['Cash', 'Card', 'bKash', 'Nagad', 'Bank']

export default function Buyback() {
  const [customers, setCustomers] = useState([])
  const [rates, setRates] = useState([])
  const [history, setHistory] = useState([])
  const [form, setForm] = useState({
    customerId: '', metalType: '', purity: '', grossWeight: '',
    stoneWeight: '0', settlementMethod: 'Cash', payoutReference: '', notes: '',
  })
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const [c, r, h] = await Promise.all([
        api.get('/api/customers'),
        api.get('/api/rates'),
        api.get('/api/buybacks'),
      ])
      setCustomers(c)
      setRates(r)
      setHistory(h)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  useEffect(() => { load() }, [])

  const metals = [...new Set(rates.map(r => r.metalType))]
  const purities = rates
    .filter(r => r.metalType === form.metalType)
    .map(r => r.purity || 'Standard')
  const selectedRate = rates.find(
    r => r.metalType === form.metalType && (r.purity || 'Standard') === form.purity
  )
  const gross = Number(form.grossWeight) || 0
  const stone = Number(form.stoneWeight) || 0
  const net = gross - stone
  const value = selectedRate && net > 0
    ? Math.round(net * Number(selectedRate.ratePerGram) * 100) / 100
    : 0

  const change = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const submit = async (e) => {
    e.preventDefault()
    if (!selectedRate) {
      setMsg({ type: 'error', text: 'Choose a metal and purity with a current rate.' })
      return
    }
    if (gross <= 0 || stone < 0 || stone >= gross ||
        !Number.isFinite(gross) || !Number.isFinite(stone) ||
        Math.round(gross * 1000) !== gross * 1000 ||
        Math.round(stone * 1000) !== stone * 1000) {
      setMsg({ type: 'error', text: 'Enter valid weights with at most 3 decimal places. Stone weight must be less than gross weight.' })
      return
    }
    if (value <= 0) {
      setMsg({ type: 'error', text: 'Calculated payout must be greater than zero.' })
      return
    }

    setSaving(true)
    setMsg(null)
    try {
      const result = await api.post('/api/buybacks', {
        customerId: form.customerId ? Number(form.customerId) : null,
        metalType: form.metalType,
        purity: form.purity,
        grossWeight: gross,
        stoneWeight: stone,
        settlementMethod: form.settlementMethod,
        payoutReference: form.payoutReference.trim() || null,
        notes: form.notes.trim() || null,
      })
      setMsg({
        type: 'ok',
        text: `Buyback #${result.transactionId} recorded. Net ${result.netWeight}g; payout ${money(result.valuationAmount)}.`,
      })
      setForm(f => ({
        ...f, grossWeight: '', stoneWeight: '0',
        payoutReference: '', notes: '',
      }))
      await load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  const exportCsv = () => downloadCsv('old-gold-buybacks.csv',
    ['Transaction', 'Date', 'Customer', 'Metal', 'Purity', 'Gross weight',
      'Stone weight', 'Net weight', 'Rate/gram', 'Payout', 'Method',
      'Reference', 'Status'],
    history.map(r => [
      r.transactionId, new Date(r.txnDate).toLocaleString(), r.customerName,
      r.metalType, r.purity, r.grossWeight, r.stoneWeight, r.netWeight,
      r.ratePerGram, r.valuationAmount, r.settlementMethod,
      r.payoutReference, r.status,
    ]))

  return (
    <>
      <Msg msg={msg} />

      <form className="card" onSubmit={submit}>
        <h2>Old-gold buyback</h2>
        <p className="hint">Record gold purchased from a customer. The payout is calculated using the current metal and purity rate.</p>

        <div className="grid">
          <label>Customer (optional)
            <select value={form.customerId} onChange={e => change('customerId', e.target.value)}>
              <option value="">Walk-in customer</option>
              {customers.map(c => (
                <option key={c.customerId} value={c.customerId}>
                  {c.firstName} {c.lastName}{c.phone ? ` — ${c.phone}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label>Metal
            <select required value={form.metalType}
              onChange={e => setForm(f => ({ ...f, metalType: e.target.value, purity: '' }))}>
              <option value="">Choose metal</option>
              {metals.map(m => <option key={m}>{m}</option>)}
            </select>
          </label>

          <label>Purity
            <select required value={form.purity} onChange={e => change('purity', e.target.value)}>
              <option value="">Choose purity</option>
              {[...new Set(purities)].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          <label>Gross weight (grams)
            <input required type="number" min="0.001" step="0.001"
              value={form.grossWeight} onChange={e => change('grossWeight', e.target.value)} />
          </label>

          <label>Stone weight (grams)
            <input required type="number" min="0" step="0.001"
              value={form.stoneWeight} onChange={e => change('stoneWeight', e.target.value)} />
          </label>

          <label>Payment method
            <select value={form.settlementMethod} onChange={e => change('settlementMethod', e.target.value)}>
              {METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </label>

          <label>Payout reference (optional)
            <input maxLength="100" value={form.payoutReference}
              onChange={e => change('payoutReference', e.target.value)} />
          </label>

          <label>Notes (optional)
            <input maxLength="500" value={form.notes}
              onChange={e => change('notes', e.target.value)} />
          </label>
        </div>

        <div className="summary">
          <div><span>Current rate per gram</span><b>{selectedRate ? money(selectedRate.ratePerGram) : '—'}</b></div>
          <div><span>Net gold weight</span><b>{net > 0 ? `${net.toFixed(3)} g` : '—'}</b></div>
          <div className="grand"><span>Buyback payout</span><b>{money(value)}</b></div>
        </div>

        <button className="primary" disabled={saving || !selectedRate || value <= 0}>
          {saving ? 'Saving...' : 'Record buyback and payout'}
        </button>
      </form>

      <div className="card">
        <div className="cardhead">
          <h2>Buyback history</h2>
          <button className="small" disabled={!history.length} onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Customer</th><th>Metal / purity</th>
                <th className="right">Net weight</th><th className="right">Rate/g</th>
                <th className="right">Payout</th><th>Method</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map(r => (
                <tr key={r.transactionId}>
                  <td>{r.transactionId}</td>
                  <td>{new Date(r.txnDate).toLocaleString()}</td>
                  <td>{r.customerName || 'Walk-in'}</td>
                  <td>{r.metalType} / {r.purity}</td>
                  <td className="right">{Number(r.netWeight).toFixed(3)} g</td>
                  <td className="right">{money(r.ratePerGram)}</td>
                  <td className="right">{money(r.valuationAmount)}</td>
                  <td>{r.settlementMethod}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan="9" className="hint">No buybacks recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

