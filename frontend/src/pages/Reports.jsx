import { useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'
import { LineChart, PieChart } from '../components/Charts.jsx'

// yyyy-MM-dd in the user's own time zone
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d }

// Manager-only sales and profit report for a date range, with charts and CSV export.
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


  const quick = async (n) => {
    const nextFrom = ymd(daysAgo(n))
    const nextTo = ymd(new Date())

    setFrom(nextFrom)
    setTo(nextTo)

    try {
      setData(await api.get(`/api/reports/sales?from=${nextFrom}&to=${nextTo}`))
      setMsg(null)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const s = data?.summary

  const table = (title, rows, qtyTitle, file, withProfit) => (
    <div className="card">
      <div className="cardhead">
        <h2>{title}</h2>
        <button className="small" disabled={!rows?.length}
          onClick={() => downloadCsv(file, ['Name', qtyTitle, 'Revenue', ...(withProfit ? ['Profit'] : [])],
            rows.map((r) => [r.label, r.qty, r.revenue, ...(withProfit ? [r.profit] : [])]))}>
          Export CSV
        </button>
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Name</th><th className="right">{qtyTitle}</th><th className="right">Revenue</th>{withProfit && <th className="right">Profit</th>}</tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td><td className="right">{r.qty}</td><td className="right">{money(r.revenue)}</td>
                {withProfit && <td className="right">{money(r.profit)}</td>}
              </tr>
            ))}
            {!rows?.length && <tr><td colSpan="4" className="hint">No sales in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )

  const exportSummary = () => downloadCsv(`sales-summary-${from}-to-${to}.csv`, ['Measure', 'Value'], [
    ['From', from], ['To', to],
    ['Total sales (incl. VAT)', s.totalSales], ['VAT collected', s.vatTotal], ['Discounts given', s.discountTotal],
    ['Money collected', s.collected], ['Still due', s.dueTotal], ['Orders', s.orderCount], ['Items sold', s.itemsSold],
    ['Average order', s.averageOrder], ['Cost of items sold', s.cost], ['Gross profit', s.grossProfit], ['Profit margin %', s.profitMargin],
  ])

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <h2>Sales and profit report <span className="hint">(completed orders only)</span></h2>
        <div className="row">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="primary" onClick={run}>Show report</button>
          <button className="small" onClick={() => quick(6)}>Last 7 days</button>
          <button className="small" onClick={() => quick(29)}>Last 30 days</button>
          <button className="small" onClick={() => quick(89)}>Last 90 days</button>
          {data && <button className="small" onClick={exportSummary}>Export summary CSV</button>}
        </div>
      </div>

      {data && (
        <>
          {s.zeroCostLines > 0 && (
            <p className="msg error">
              {s.zeroCostLines} sold item line(s) have no cost price, so the profit below is too high.
              Enter the cost price of your products (Products tab, or when restocking).
            </p>
          )}

          <div className="stats">
            <div className="stat"><span>Total sales (incl. VAT)</span><b>{money(s.totalSales)}</b></div>
            <div className="stat"><span>Gross profit</span><b>{money(s.grossProfit)}</b></div>
            <div className="stat"><span>Profit margin</span><b>{s.profitMargin}%</b></div>
            <div className="stat"><span>Cost of items sold</span><b>{money(s.cost)}</b></div>
            <div className="stat"><span>Discounts given</span><b>{money(s.discountTotal)}</b></div>
            <div className="stat"><span>VAT collected</span><b>{money(s.vatTotal)}</b></div>
            <div className="stat"><span>Money collected</span><b>{money(s.collected)}</b></div>
            <div className="stat"><span>Still due</span><b>{money(s.dueTotal)}</b></div>
            <div className="stat"><span>Orders</span><b>{s.orderCount}</b></div>
            <div className="stat"><span>Items sold</span><b>{s.itemsSold}</b></div>
            <div className="stat"><span>Average order</span><b>{money(s.averageOrder)}</b></div>
            <div className="stat"><span>Returns processed</span><b>{money(s.returnedCredit)}</b></div>
            <div className="stat"><span>Refunded in cash/card</span><b>{money(s.refundedAmount)}</b></div>
          </div>
          <p className="hint">Sales, profit and dues are net of returned items (a return reduces the sale it came from). Profit = price of the items kept - their cost price - discounts. VAT is not counted as income. "Returns processed" are returns made in this period (credit value, incl. exchanges).</p>

          <div className="card">
            <div className="cardhead">
              <h2>Sales by day</h2>
              <button className="small" disabled={!data.byDay.length}
                onClick={() => downloadCsv('sales-by-day.csv', ['Date', 'Orders', 'Revenue'],
                  data.byDay.map((d) => [new Date(d.saleDay).toLocaleDateString(), d.orderCount, d.total]))}>
                Export CSV
              </button>
            </div>
            <LineChart data={data.byDay.map((d) => ({ label: new Date(d.saleDay).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' }), value: Number(d.total) }))} />
          </div>

          <div className="two">
            <div className="card">
              <h2>Sales by category</h2>
              <PieChart data={data.byCategory.map((r) => ({ label: r.label, value: Number(r.revenue) }))} />
            </div>
            <div className="card">
              <h2>Money received by method</h2>
              <PieChart data={data.byPayment.map((r) => ({ label: r.label, value: Number(r.revenue) }))} />
            </div>
          </div>

          <div className="two">
            {table('Sales by category', data.byCategory, 'Qty', 'sales-by-category.csv', true)}
            {table('Sales by employee', data.byEmployee, 'Orders', 'sales-by-employee.csv', false)}
          </div>
          {table('Sales by product', data.byProduct, 'Qty', 'sales-by-product.csv', true)}
          {table('Payments by method', data.byPayment, 'Payments', 'payments-by-method.csv', false)}
        </>
      )}
    </>
  )
}
