import { useEffect, useState } from 'react'
import { api, getUser, money } from '../api.js'
import QrCode from '../components/QrCode.jsx'

// Public page opened by the QR code on a receipt. No login; it shows a safe, read-only copy.
export default function Verify({ code }) {
  const [r, setR] = useState(null)
  const [err, setErr] = useState('')
  const user = getUser()

  useEffect(() => {
    api.get(`/api/public/receipt/${code}`).then(setR).catch((e) => setErr(e.message))
  }, [code])

  const openInSystem = () => {
    const number = parseInt(r.receiptNo.replace(/\D/g, ''), 10)
    sessionStorage.setItem('auralucis_goto', JSON.stringify({ tab: 'Orders', q: String(number) }))
    window.location.href = '/'
  }

  return (
    <div className="login-wrap">
      <div className="verify-card">
        {err && <p className="msg error">{err === 'Request failed (404)' ? 'This receipt was not found.' : err}</p>}
        {!r && !err && <p>Loading...</p>}
        {r && (
          <div className="receipt-sheet">
            <div className="r-head">
              <img src="/logo.png" alt="" />
              <h2>{r.shopName}</h2>
              <p>{r.shopTagline}</p>
              {(r.shopAddress || r.shopPhone) && <p>{r.shopAddress} {r.shopPhone}</p>}
            </div>
            <p className="r-verified">✔ Genuine receipt</p>
            <div className="r-meta">
              <div><span>Receipt no.</span><b>{r.receiptNo}</b></div>
              <div><span>Date</span><b>{new Date(r.orderDate).toLocaleString()}</b></div>
              {r.customerName && <div><span>Customer</span><b>{r.customerName}</b></div>}
              <div><span>Status</span><b className={`r-status ${r.status}`}>{r.status.toUpperCase()}</b></div>
            </div>
            <table className="r-table">
              <thead><tr><th>Item</th><th className="right">Qty</th><th className="right">Total</th></tr></thead>
              <tbody>
                {r.items.map((i, k) => (
                  <tr key={k}><td>{i.productName}</td><td className="right">{i.quantity}</td><td className="right">{money(i.lineTotal)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="r-sums">
              <div><span>Subtotal</span><b>{money(r.subTotal)}</b></div>
              {r.discountAmount > 0 && <div><span>Discount</span><b>-{money(r.discountAmount)}</b></div>}
              {r.vatAmount > 0 && <div><span>VAT ({Number(r.vatPercent)}%)</span><b>{money(r.vatAmount)}</b></div>}
            </div>
            <div className="r-total"><span>TOTAL</span><b>{money(r.totalAmount)}</b></div>
            <div className="r-sums">
              <div><span>Paid</span><b>{money(r.paidAmount)}</b></div>
              {r.dueAmount > 0 && <div className="r-due"><span>DUE</span><b>{money(r.dueAmount)}</b></div>}
            </div>
            <p className="r-foot">Thank you for choosing {r.shopName}.</p>
          </div>
        )}
        {r && user && (
          <p style={{ textAlign: 'center' }}>
            <button className="primary" onClick={openInSystem}>Open this order in the system</button>
          </p>
        )}
      </div>
    </div>
  )
}
