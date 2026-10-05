import { useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'

// yyyy-MM-dd in the user's own time zone
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d }

// Manager-only sales report for a date range, with CSV export for each table.
export default function Reports() {
  const [from, setFrom] = useState(ymd(daysAgo(29)))
  const [to, setTo] = useState(ymd(new Date()))
  const [data, setData] = useState(null)
  const [msg, setMsg] = useState(null)

  const run = async () => {
    try {
      setData(await api.get(`/api/reports/sales?from=${from}&to=${to}`))
      setMsg(null)
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { run() }, [])

  const quick = (n) => { setFrom(ymd(daysAgo(n))); setTo(ymd(new Date())) }
  const s = data?.summary

  const rowsTable = (title, rows, qtyTitle, file) => (
    <div className="card">
      <div className="cardhead">
        <h2>{title}</h2>
        <button className="small" disabled={!rows?.length}
          onClick={() => downloadCsv(file, [title.replace('Sales by ', ''), qtyTitle, 'Revenue'], rows.map((r) => [r.label, r.qty, r.revenue]))}>
          Export CSV
        </button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr><th>Name</th><th className="right">{qtyTitle}</th><th className="right">Revenue</th></tr></thead>
        <tbody>
          {rows?.map((r) => <tr key={r.label}><td>{r.label}</td><td className="right">{r.qty}</td><td className="right">{money(r.revenue)}</td></tr>)}
          {!rows?.length && <tr><td colSpan="3" className="hint">No sales in this range.</td></tr>}
        </tbody>
      </table></div>
    </div>
  )

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <h2>Sales report <span className="hint">(completed orders only)</span></h2>
        <div className="row">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="primary" onClick={run}>Show report</button>
          <button className="small" onClick={() => quick(6)}>Last 7 days</button>
          <button className="small" onClick={() => quick(29)}>Last 30 days</button>
          <button className="small" onClick={() => quick(89)}>Last 90 days</button>
        </div>
      </div>

      {data && (
        <>
          <div className="stats">
            <div className="stat"><span>Total sales</span><b>{money(s.totalSales)}</b></div>
            <div className="stat"><span>Orders</span><b>{s.orderCount}</b></div>
            <div className="stat"><span>Items sold</span><b>{s.itemsSold}</b></div>
            <div className="stat"><span>Average order</span><b>{money(s.averageOrder)}</b></div>
          </div>

          <div className="card">
            <div className="cardhead">
              <h2>Sales by day</h2>
              <button className="small" disabled={!data.byDay.length}
                onClick={() => downloadCsv('sales-by-day.csv', ['Date', 'Orders', 'Revenue'],
                  data.byDay.map((d) => [new Date(d.saleDay).toLocaleDateString(), d.orderCount, d.total]))}>
                Export CSV
              </button>
            </div>
            <div className="tablewrap"><table>
              <thead><tr><th>Date</th><th className="right">Orders</th><th className="right">Revenue</th></tr></thead>
              <tbody>
                {data.byDay.map((d) => (
                  <tr key={d.saleDay}><td>{new Date(d.saleDay).toLocaleDateString()}</td><td className="right">{d.orderCount}</td><td className="right">{money(d.total)}</td></tr>
                ))}
                {!data.byDay.length && <tr><td colSpan="3" className="hint">No sales in this range.</td></tr>}
              </tbody>
            </table></div>
          </div>

          <div className="two">
            {rowsTable('Sales by category', data.byCategory, 'Qty', 'sales-by-category.csv')}
            {rowsTable('Sales by employee', data.byEmployee, 'Orders', 'sales-by-employee.csv')}
          </div>
          {rowsTable('Sales by product', data.byProduct, 'Qty', 'sales-by-product.csv')}
        </>
      )}
    </>
  )
}
