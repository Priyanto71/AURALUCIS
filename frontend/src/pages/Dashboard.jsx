import { useEffect, useState } from 'react'
import { api, money } from '../api.js'
import Msg from './Messages.jsx'

export default function Dashboard() {
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    api.get('/api/reports/dashboard').then(setD).catch((e) => setMsg({ type: 'error', text: e.message }))
  }, [])

  if (!d) return <Msg msg={msg} />
  const s = d.summary
  const maxDay = Math.max(1, ...d.last7Days.map((x) => Number(x.total)))

  return (
    <>
      <Msg msg={msg} />
      <div className="stats">
        <div className="stat"><span>Total sales</span><b>{money(s.totalSales)}</b></div>
        <div className="stat"><span>Completed orders</span><b>{s.completedOrders}</b></div>
        <div className="stat"><span>Cancelled orders</span><b>{s.cancelledOrders}</b></div>
        <div className="stat"><span>Products</span><b>{s.productCount}</b></div>
        <div className="stat"><span>Stock value</span><b>{money(s.stockValue)}</b></div>
      </div>

      <div className="card">
        <h2>Sales, last 7 days</h2>
        {d.last7Days.length === 0 && <p>No sales yet.</p>}
        {d.last7Days.map((x) => (
          <div className="barrow" key={x.saleDay}>
            <span className="barlabel">{new Date(x.saleDay).toLocaleDateString()}</span>
            <div className="bartrack"><div className="bar" style={{ width: `${(Number(x.total) / maxDay) * 100}%` }} /></div>
            <span className="barval">{money(x.total)} ({x.orderCount} {x.orderCount === 1 ? 'order' : 'orders'})</span>
          </div>
        ))}
      </div>

      <div className="two">
        <div className="card">
          <h2>Top selling products</h2>
          <table>
            <thead><tr><th>Product</th><th className="right">Sold</th><th className="right">Revenue</th></tr></thead>
            <tbody>
              {d.topProducts.map((p) => (
                <tr key={p.productName}><td>{p.productName}</td><td className="right">{p.qtySold}</td><td className="right">{money(p.revenue)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Low stock (3 or less)</h2>
          {d.lowStock.length === 0 ? <p>All products are well stocked.</p> : (
            <table>
              <thead><tr><th>Product</th><th className="right">Stock</th></tr></thead>
              <tbody>
                {d.lowStock.map((p) => (
                  <tr key={p.productId}><td>{p.productName}</td><td className="right">{p.stockQuantity}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
