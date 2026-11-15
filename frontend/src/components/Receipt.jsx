import { useEffect, useRef, useState } from 'react'
import { api, money } from '../api.js'
import Modal from './Modal.jsx'
import QrCode from './QrCode.jsx'
import Msg from '../pages/Messages.jsx'

const digits = (s) => (s ?? '').replace(/\D/g, '')
// Bangladesh numbers written as 01XXXXXXXXX need the country code 880 for WhatsApp
const waNumber = (s) => { const d = digits(s); return d.startsWith('0') ? `88${d}` : d }

// Printable receipt for one order: print, download as PDF, e-mail, SMS, WhatsApp. The QR code opens the public receipt page.
export default function Receipt({ orderId, onClose }) {
  const [r, setR] = useState(null)
  const [msg, setMsg] = useState(null)
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState('')
  const sheet = useRef(null)

  useEffect(() => {
    api.get(`/api/orders/${orderId}/receipt`).then(setR).catch((e) => setMsg({ type: 'error', text: e.message }))
  }, [orderId])

  const text = r && `${r.shopName} receipt ${r.receiptNo}: total ${money(r.totalAmount)}, paid ${money(r.paidAmount)}, due ${money(r.dueAmount)}. Check: ${r.publicUrl}`

  const downloadPdf = async () => {
    setBusy('pdf'); setMsg(null)
    try {
      // loaded only when needed, so the rest of the website stays small
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
      const canvas = await html2canvas(sheet.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      let w = 100
      let h = (canvas.height * w) / canvas.width
      const maxH = 270
      if (h > maxH) { w = (w * maxH) / h; h = maxH }
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (210 - w) / 2, 12, w, h)
      pdf.save(`${r.receiptNo}.pdf`)
    } catch (e) { setMsg({ type: 'error', text: 'Could not create the PDF: ' + e.message }) }
    finally { setBusy('') }
  }

  const send = async (kind) => {
    setBusy(kind); setMsg(null)
    try {
      await api.post(`/api/orders/${orderId}/${kind}`, { to: to.trim() || null })
      setMsg({ type: 'ok', text: kind === 'email' ? 'Receipt e-mailed.' : 'Receipt SMS sent.' })
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setBusy('') }
  }

  return (
    <Modal onClose={onClose}>
      <Msg msg={msg} />
      {r && (
        <>
          <div className="receipt-sheet" ref={sheet}>
            <div className="r-head">
              <img src="/logo.png" alt="" />
              <h2>{r.shopName}</h2>
              <p>{r.shopTagline}</p>
              {(r.shopAddress || r.shopPhone) && <p>{r.shopAddress} {r.shopPhone}</p>}
            </div>

            <div className="r-meta">
              <div><span>Receipt no.</span><b>{r.receiptNo}</b></div>
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

            <div className="r-sums">
              <div><span>Subtotal</span><b>{money(r.subTotal)}</b></div>
              {r.discountAmount > 0 && <div><span>Discount</span><b>-{money(r.discountAmount)}</b></div>}
              {r.vatAmount > 0 && <div><span>VAT ({Number(r.vatPercent)}%)</span><b>{money(r.vatAmount)}</b></div>}
            </div>
            <div className="r-total"><span>TOTAL</span><b>{money(r.totalAmount)}</b></div>
            <div className="r-sums">
              {r.payments.map((p) => (
                <div key={p.paymentId}><span>Paid by {p.method}</span><b>{money(p.amount)}</b></div>
              ))}
              <div><span>Paid</span><b>{money(r.paidAmount)}</b></div>
              {r.dueAmount > 0 && <div className="r-due"><span>DUE</span><b>{money(r.dueAmount)}</b></div>}
            </div>

            <div className="r-qr">
              <QrCode text={r.publicUrl} size={96} />
              <p>Scan to check this receipt online</p>
            </div>
            <p className="r-foot">Thank you for choosing {r.shopName}.</p>
          </div>

          <div className="send no-print">
            <label>Send to (e-mail or phone; empty = the customer's)
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={r.customerEmail || r.customerPhone || 'name@example.com or 01XXXXXXXXX'} />
            </label>
            <div className="sendbtns">
              <button className="small" disabled={!!busy} onClick={() => send('email')}>{busy === 'email' ? 'Sending...' : 'E-mail'}</button>
              <button className="small" disabled={!!busy} onClick={() => send('sms')}>{busy === 'sms' ? 'Sending...' : 'SMS'}</button>
              <a className="small linkbtn" target="_blank" rel="noreferrer"
                href={`https://wa.me/${waNumber(to.includes('@') ? '' : (to || r.customerPhone))}?text=${encodeURIComponent(text)}`}>WhatsApp</a>
            </div>
          </div>
        </>
      )}
      <div className="modal-actions no-print">
        {r && <button className="small" disabled={busy === 'pdf'} onClick={downloadPdf}>{busy === 'pdf' ? 'Creating PDF...' : 'Download PDF'}</button>}
        {r && <button className="primary" onClick={() => window.print()}>Print</button>}
        <button className="small" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
