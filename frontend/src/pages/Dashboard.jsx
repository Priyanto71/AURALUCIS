import { useEffect, useState } from 'react'
import { api, money } from '../api.js'
import Msg from './Messages.jsx'
import { LineChart, PieChart } from '../components/Charts.jsx'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// one point for each of the last 30 days (days without sales count as 0)
function last30(rows) {
  const byDay = new Map(rows.map((r) => [ymd(new Date(r.saleDay)), Number(r.total)]))
  const out = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    out.push({ label: `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`, value: byDay.get(ymd(d)) ?? 0 })
  }
  return out
}

export default function Dashboard() {
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    api.get('/api/reports/dashboard').then(setD).catch((e) => setMsg({ type: 'error', text: e.message }))
  }, [])

  if (!d) return <Msg msg={msg} />
  const s = d.summary

  return (
    <>
      <Msg msg={msg} />
      <div className="stats">
        <div className="stat"><span>Total sales</span><b>{money(s.totalSales)}</b></div>
        <div className="stat"><span>Due (unpaid)</span><b>{money(s.dueTotal)}</b></div>
        <div className="stat"><span>Completed orders</span><b>{s.completedOrders}</b></div>
        <div className="stat"><span>Pending orders</span><b>{s.pendingOrders}</b></div>
        <div className="stat"><span>Cancelled orders</span><b>{s.cancelledOrders}</b></div>
        <div className="stat"><span>Products</span><b>{s.productCount}</b></div>
        <div className="stat"><span>Stock value</span><b>{money(s.stockValue)}</b></div>
      </div>

      <div className="card">
        <h2>Sales, last 30 days</h2>
        <LineChart data={last30(d.last30Days)} />
      </div>

      <div className="two">
        <div className="card">
          <h2>Sales by category <span className="hint">(30 days)</span></h2>
          <PieChart data={d.categoryShare.map((r) => ({ label: r.label, value: Number(r.revenue) }))} />
        </div>
        <div className="card">
          <h2>Money received by method <span className="hint">(30 days)</span></h2>
          <PieChart data={d.paymentShare.map((r) => ({ label: r.label, value: Number(r.revenue) }))} />
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h2>Top selling products</h2>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Product</th><th className="right">Sold</th><th className="right">Revenue</th></tr></thead>
              <tbody>
                {d.topProducts.map((p) => (
                  <tr key={p.productName}><td>{p.productName}</td><td className="right">{p.qtySold}</td><td className="right">{money(p.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Low stock (3 or less)</h2>
          {d.lowStock.length === 0 ? <p>All products are well stocked.</p> : (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Product</th><th className="right">Stock</th></tr></thead>
                <tbody>
                  {d.lowStock.map((p) => (
                    <tr key={p.productId}><td>{p.productName}</td><td className="right">{p.stockQuantity}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
