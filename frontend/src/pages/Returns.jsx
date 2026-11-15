import { useEffect, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'
import Receipt from '../components/Receipt.jsx'

const round2 = (n) => Math.round(n * 100) / 100
const METHODS = ['Cash', 'Card', 'bKash', 'Nagad', 'Bank']
const REASONS = ['Customer changed mind', 'Wrong size', 'Defect or damage', 'Wrong item sold', 'Other']

// Manager only: return items from a completed order, then refund the money or exchange for other items.
export default function Returns({ initialQuery }) {
  const [orderNo, setOrderNo] = useState(initialQuery ?? '')
  const [data, setData] = useState(null) // { order, subTotal, lines }
  const [qty, setQty] = useState({}) // itemId -> pieces to return
  const [reasonKind, setReasonKind] = useState(REASONS[0])
  const [reasonNote, setReasonNote] = useState('')
  const [mode, setMode] = useState('REFUND') // REFUND | EXCHANGE
  const [refundMethod, setRefundMethod] = useState('Cash')
  const [products, setProducts] = useState([])
  const [vatPercent, setVatPercent] = useState(0)
  const [newItems, setNewItems] = useState([]) // [{ productId, quantity }]
  const [pickId, setPickId] = useState('')
  const [pickQty, setPickQty] = useState(1)
  const [payMethod, setPayMethod] = useState('Cash')
  const [payFull, setPayFull] = useState(true)
  const [paidNow, setPaidNow] = useState('')
  const [history, setHistory] = useState([])
  const [receiptId, setReceiptId] = useState(null)
  const [msg, setMsg] = useState(null)

  const loadAll = async () => {
    try {
      const [p, s, h] = await Promise.all([api.get('/api/products'), api.get('/api/settings'), api.get('/api/returns')])
      setProducts(p); setVatPercent(Number(s.vat_percent) || 0); setHistory(h)
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (initialQuery) find() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const find = async (e) => {
    e?.preventDefault()
    try {
      setData(await api.get(`/api/returns/order/${Number(orderNo)}`))
      setQty({}); setNewItems([]); setMsg(null)
    } catch (err) { setData(null); setMsg({ type: 'error', text: err.message }) }
  }

  const lines = data?.lines ?? []
  const o = data?.order
  const sub = data?.subTotal ?? 0

  // the same arithmetic the database does
  const itemsValue = round2(lines.reduce((s, l) => s + (Number(qty[l.itemId]) || 0) * l.unitPrice, 0))
  const disc = sub > 0 ? round2((itemsValue * (o?.discountAmount ?? 0)) / sub) : 0
  const net = itemsValue - disc
  const vat = round2((net * (o?.vatPercent ?? 0)) / 100)
  const credit = o ? Math.min(round2(net + vat), round2(o.totalAmount - o.returnedAmount)) : 0
  const refundable = o ? Math.max(0, round2(o.paidAmount - (o.totalAmount - o.returnedAmount - credit))) : 0

  const find2 = (id) => products.find((p) => p.productId === Number(id))
  const piecePrice = (p) => Number(p.unitPrice) + Number(p.makingCharge)
  const newSub = round2(newItems.reduce((s, l) => { const p = find2(l.productId); return s + (p ? piecePrice(p) * l.quantity : 0) }, 0))
  const newTotal = round2(newSub + round2((newSub * vatPercent) / 100))
  const diff = round2(newTotal - refundable)
  const tooLow = mode === 'EXCHANGE' && newItems.length > 0 && refundable > newTotal

  const addNew = () => {
    const p = find2(pickId); const q = Number(pickQty)
    if (!p || q <= 0) return
    const inList = newItems.find((l) => l.productId === p.productId)
    const total = (inList?.quantity ?? 0) + q
    if (total > p.stockQuantity) { setMsg({ type: 'error', text: `Only ${p.stockQuantity} of ${p.productName} in stock.` }); return }
    setMsg(null)
    setNewItems(inList ? newItems.map((l) => (l.productId === p.productId ? { ...l, quantity: total } : l)) : [...newItems, { productId: p.productId, quantity: q }])
    setPickId(''); setPickQty(1)
  }

  const setReturnQty = (l, v) => {
    const n = Math.max(0, Math.min(l.remainingQty, Number(v) || 0))
    setQty({ ...qty, [l.itemId]: n })
  }

  const submit = async (e) => {
    e.preventDefault()
    const items = lines.filter((l) => (Number(qty[l.itemId]) || 0) > 0).map((l) => ({ itemId: l.itemId, quantity: Number(qty[l.itemId]) }))
    if (items.length === 0) { setMsg({ type: 'error', text: 'Enter how many pieces are returned.' }); return }
    const reason = reasonNote.trim() ? `${reasonKind} - ${reasonNote.trim()}` : reasonKind
    try {
      if (mode === 'REFUND') {
        const r = await api.post('/api/returns', { orderId: o.orderId, reason, items, refundMethod })
        setMsg({ type: 'ok', text: `Return #${r.returnId} saved. Value of the returned items ${money(r.credit)}. Refund paid back: ${money(r.refunded)} (${refundMethod}).` })
      } else {
        const r = await api.post('/api/returns/exchange', {
          orderId: o.orderId, reason, returnItems: items, newItems,
          paymentMethod: payMethod, paidAmount: payFull ? null : Number(paidNow) || 0,
        })
        setMsg({ type: 'ok', text: `Exchange done. New order #${r.newOrderId}: total ${money(r.newTotal)}, credit used ${money(r.applied)}, paid ${money(r.paid)}${r.due > 0 ? `, due ${money(r.due)}` : ''}.` })
        setReceiptId(r.newOrderId)
      }
      await find(); await loadAll()
      setReasonNote('')
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  const exportCsv = () => downloadCsv('returns.csv',
    ['Return', 'Date', 'Order', 'Customer', 'Reason', 'Value of items', 'Credit', 'Refunded', 'Method', 'New order'],
    history.map((r) => [r.returnId, new Date(r.returnDate).toLocaleString(), r.orderId, r.customerName, r.reason, r.itemsAmount, r.creditAmount, r.refundAmount, r.refundMethod, r.exchangeOrderId]))

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <h2>Return or exchange</h2>
        <form className="row" onSubmit={find}>
          <label>Order number<input required type="number" min="1" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="for example 12" /></label>
          <button className="primary">Find order</button>
        </form>
        <p className="hint">Only a completed order can have items returned. The value paid back includes the order's discount share and VAT.</p>
      </div>

      {data && (
        <form className="card" onSubmit={submit}>
          <h2>Order #{o.orderId} <span className="hint">{o.customerName} | {new Date(o.orderDate).toLocaleDateString()} | <span className={`badge ${o.status}`}>{o.status}</span></span></h2>
          <p className="hint">Total {money(o.totalAmount)} | paid {money(o.paidAmount)} | already returned {money(o.returnedAmount)}</p>

          {o.status !== 'Completed' ? <p className="msg error">Only a completed order can have items returned.</p> : (
            <>
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Item</th><th className="right">Price</th><th className="right">Sold</th><th className="right">Returned</th><th className="right">Return now</th></tr></thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.itemId}>
                        <td>{l.productName}</td><td className="right">{money(l.unitPrice)}</td>
                        <td className="right">{l.quantity}</td><td className="right">{l.returnedQty}</td>
                        <td className="right">
                          <input type="number" min="0" max={l.remainingQty} disabled={l.remainingQty === 0} style={{ width: 80 }}
                            value={qty[l.itemId] ?? ''} placeholder="0" onChange={(e) => setReturnQty(l, e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid" style={{ marginTop: 12 }}>
                <label>Reason
                  <select value={reasonKind} onChange={(e) => setReasonKind(e.target.value)}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                </label>
                <label>Note (optional)<input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} /></label>
                <label>What does the customer want?
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="REFUND">Money back (refund)</option>
                    <option value="EXCHANGE">Exchange for other items</option>
                  </select>
                </label>
                {mode === 'REFUND' && (
                  <label>Pay the money back by
                    <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                  </label>
                )}
              </div>

              {mode === 'EXCHANGE' && (
                <>
                  <h3>New items</h3>
                  <div className="grid">
                    <label>Product
                      <select value={pickId} onChange={(e) => setPickId(e.target.value)}>
                        <option value="">Select...</option>
                        {products.map((p) => (
                          <option key={p.productId} value={p.productId} disabled={p.stockQuantity === 0}>{p.productName} - {money(piecePrice(p))} - stock {p.stockQuantity}</option>
                        ))}
                      </select>
                    </label>
                    <label>Quantity<input type="number" min="1" value={pickQty} onChange={(e) => setPickQty(e.target.value)} /></label>
                    <button type="button" className="primary" onClick={addNew}>Add</button>
                  </div>
                  {newItems.length > 0 && (
                    <div className="tablewrap">
                      <table>
                        <thead><tr><th>Product</th><th className="right">Price</th><th className="right">Qty</th><th className="right">Total</th><th></th></tr></thead>
                        <tbody>
                          {newItems.map((l) => { const p = find2(l.productId); return (
                            <tr key={l.productId}>
                              <td>{p?.productName}</td><td className="right">{p && money(piecePrice(p))}</td><td className="right">{l.quantity}</td>
                              <td className="right">{p && money(piecePrice(p) * l.quantity)}</td>
                              <td><button type="button" className="small danger" onClick={() => setNewItems(newItems.filter((x) => x.productId !== l.productId))}>Remove</button></td>
                            </tr>) })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="grid">
                    <label>Customer pays the difference by
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                    </label>
                    <label className="checkline"><input type="checkbox" checked={payFull} onChange={(e) => setPayFull(e.target.checked)} /> Pays the full difference now</label>
                    {!payFull && <label>Paid now<input type="number" min="0" step="0.01" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} /></label>}
                  </div>
                </>
              )}

              <div className="summary">
                <div><span>Value of returned items</span><b>{money(itemsValue)}</b></div>
                {disc > 0 && <div><span>Discount share</span><b>-{money(disc)}</b></div>}
                {vat > 0 && <div><span>VAT share</span><b>{money(vat)}</b></div>}
                <div className="grand"><span>Credit for the customer</span><b>{money(credit)}</b></div>
                <div><span>Money the customer is owed back</span><b>{money(refundable)}</b></div>
                {mode === 'EXCHANGE' && newItems.length > 0 && (
                  <>
                    <div><span>New items (with VAT)</span><b>{money(newTotal)}</b></div>
                    <div className={diff > 0 ? 'duecell' : ''}><span>Customer pays the difference</span><b>{money(Math.max(0, diff))}</b></div>
                  </>
                )}
              </div>
              {tooLow && <p className="msg error">The returned items are worth more than the new items. Add more new items, or use a refund.</p>}
              <p className="hint">These amounts are an estimate. The database calculates the final values.</p>

              <p>
                <button className="primary" disabled={tooLow || itemsValue === 0 || (mode === 'EXCHANGE' && newItems.length === 0)}>
                  {mode === 'REFUND' ? 'Return items and refund' : 'Return items and exchange'}
                </button>
              </p>
            </>
          )}
        </form>
      )}

      <div className="card">
        <div className="cardhead">
          <h2>Return history</h2>
          <button className="small" disabled={!history.length} onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>#</th><th>Date</th><th>Order</th><th>Customer</th><th>Reason</th><th className="right">Credit</th><th className="right">Refunded</th><th>Method</th><th></th></tr></thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.returnId}>
                  <td>{r.returnId}</td><td>{new Date(r.returnDate).toLocaleString()}</td><td>{r.orderId}</td><td>{r.customerName}</td>
                  <td className="wrap">{r.reason}</td><td className="right">{money(r.creditAmount)}</td>
                  <td className="right">{money(r.refundAmount)}</td>
                  <td>{r.refundMethod === 'Exchange' ? `Exchange (order #${r.exchangeOrderId})` : r.refundMethod}</td>
                  <td>{r.exchangeOrderId && <button className="small" onClick={() => setReceiptId(r.exchangeOrderId)}>New receipt</button>}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan="9" className="hint">No returns yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {receiptId && <Receipt orderId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  )
}
