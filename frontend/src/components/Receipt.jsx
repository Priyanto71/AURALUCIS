import { useEffect, useState } from 'react'
import { api, money } from '../api.js'
import Modal from './Modal.jsx'
import Msg from '../pages/Messages.jsx'

// Printable receipt for one order. "Print" opens the browser print dialog (Save as PDF also works).
export default function Receipt({ orderId, onClose }) {
  const [r, setR] = useState(null)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    api.get(`/api/orders/${orderId}/receipt`).then(setR).catch((e) => setMsg({ type: 'error', text: e.message }))
  }, [orderId])

  return (
    <Modal onClose={onClose}>
      <Msg msg={msg} />
      {r && (
        <div className="receipt-sheet">
          <div className="r-head">
            <img src="/logo.png" alt="AURALUCIS" />
            <h2>AURALUCIS</h2>
            <p>Where Luxury Meets Precision.</p>
          </div>

          <div className="r-meta">
            <div><span>Receipt no.</span><b>AL-{String(r.orderId).padStart(6, '0')}</b></div>
            <div><span>Date</span><b>{new Date(r.orderDate).toLocaleString()}</b></div>
            <div><span>Customer</span><b>{r.customerName}</b></div>
            {r.customerPhone && <div><span>Phone</span><b>{r.customerPhone}</b></div>}
            <div><span>Served by</span><b>{r.employeeName}</b></div>
            {r.status !== 'Completed' && <div><span>Status</span><b className={`r-status ${r.status}`}>{r.status.toUpperCase()}</b></div>}
          </div>

          <table className="r-table">
            <thead><tr><th>Item</th><th className="right">Qty</th><th className="right">Price</th><th className="right">Total</th></tr></thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.itemId}>
                  <td>{i.productName}</td>
                  <td className="right">{i.quantity}</td>
                  <td className="right">{money(i.unitPrice)}</td>
                  <td className="right">{money(i.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="r-total"><span>TOTAL</span><b>{money(r.totalAmount)}</b></div>
          <p className="r-foot">Thank you for choosing AURALUCIS.</p>
        </div>
      )}
      <div className="modal-actions no-print">
        {r && <button className="primary" onClick={() => window.print()}>Print</button>}
        <button className="small" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
