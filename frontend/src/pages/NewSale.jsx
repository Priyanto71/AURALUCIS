import { useEffect, useState } from 'react'
import { api, money } from '../api.js'
import Msg from './Messages.jsx'
import Receipt from '../components/Receipt.jsx'

const round2 = (n) => Math.round(n * 100) / 100
const METHODS = ['Cash', 'Card', 'bKash', 'Nagad', 'Bank']
const STAFF_MAX_DISCOUNT = 10 // %, the server enforces the same limit

export default function NewSale({ user }) {
  const isManager = user.role === 'Manager'
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [vatPercent, setVatPercent] = useState(0)
  const [customerId, setCustomerId] = useState('')
  const [pickId, setPickId] = useState('')
  const [pickQty, setPickQty] = useState(1)
  const [cart, setCart] = useState([]) // [{ productId, quantity }]
  const [discType, setDiscType] = useState('NONE') // NONE | AMOUNT | PERCENT
  const [discValue, setDiscValue] = useState('')
  const [method, setMethod] = useState('Cash')
  const [payFull, setPayFull] = useState(true)
  const [paidNow, setPaidNow] = useState('')
  const [pending, setPending] = useState(false)
  const [receiptId, setReceiptId] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try {
      const [c, p, s] = await Promise.all([api.get('/api/customers'), api.get('/api/products'), api.get('/api/settings')])
      setCustomers(c); setProducts(p); setVatPercent(Number(s.vat_percent) || 0)
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }
  useEffect(() => { load() }, [])

  const find = (id) => products.find((p) => p.productId === Number(id))
  const piecePrice = (p) => Number(p.unitPrice) + Number(p.makingCharge)

  const addToCart = () => {
    const p = find(pickId)
    const qty = Number(pickQty)
    if (!p || qty <= 0) return
    const inCart = cart.find((l) => l.productId === p.productId)
    const newQty = (inCart?.quantity ?? 0) + qty
    if (newQty > p.stockQuantity) {
      setMsg({ type: 'error', text: `Only ${p.stockQuantity} of ${p.productName} in stock.` })
      return
    }
    setMsg(null)
    setCart(inCart
      ? cart.map((l) => (l.productId === p.productId ? { ...l, quantity: newQty } : l))
      : [...cart, { productId: p.productId, quantity: qty }])
    setPickId(''); setPickQty(1)
  }

  const removeLine = (id) => setCart(cart.filter((l) => l.productId !== id))

  // the same arithmetic the database does: items - discount, then VAT on the rest
  const subTotal = round2(cart.reduce((sum, l) => {
    const p = find(l.productId)
    return sum + (p ? piecePrice(p) * l.quantity : 0)
  }, 0))
  const dv = Number(discValue) || 0
  const discount = discType === 'PERCENT' ? round2(subTotal * dv / 100) : discType === 'AMOUNT' ? round2(dv) : 0
  const discPct = subTotal > 0 ? (discount / subTotal) * 100 : 0
  const overLimit = !isManager && discPct > STAFF_MAX_DISCOUNT + 0.0001
  const net = round2(subTotal - discount)
  const vat = round2(net * vatPercent / 100)
  const total = round2(net + vat)
  const paying = pending ? (payFull ? 0 : Number(paidNow) || 0) : (payFull ? total : Number(paidNow) || 0)
  const due = round2(total - paying)

  const submit = async (e) => {
    e.preventDefault()
    if (cart.length === 0) { setMsg({ type: 'error', text: 'Add at least one product.' }); return }
    if (overLimit) { setMsg({ type: 'error', text: `Staff can give at most ${STAFF_MAX_DISCOUNT}% discount.` }); return }
    try {
      const r = await api.post('/api/orders/sale', {
        customerId: Number(customerId), items: cart, pending,
        discountType: discType, discountValue: discType === 'NONE' ? 0 : dv,
        paymentMethod: method,
        paidAmount: payFull ? null : Number(paidNow) || 0,
      })
      setMsg({
        type: 'ok',
        text: (r.status === 'Pending'
          ? `Order #${r.orderId} is on hold (Pending). Stock is reserved. Complete it from the Orders tab.`
          : `Sale recorded. Order #${r.orderId}.`) + (r.due > 0 ? ` Due: ${money(r.due)}.` : ''),
      })
      setCart([]); setPending(false); setDiscType('NONE'); setDiscValue(''); setPayFull(true); setPaidNow('')
      setReceiptId(r.orderId); load()
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  return (
    <>
      <Msg msg={msg} />
      <div className="card">
        <h2>New sale <span className="hint">(sold by {user.name})</span></h2>
        <form onSubmit={submit}>
          <div className="grid">
            <label>Customer
              <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select...</option>
                {customers.map((c) => <option key={c.customerId} value={c.customerId}>{c.firstName} {c.lastName} {c.phone && `(${c.phone})`}</option>)}
              </select>
            </label>
            <label>Product
              <select value={pickId} onChange={(e) => setPickId(e.target.value)}>
                <option value="">Select...</option>
                {products.map((p) => (
                  <option key={p.productId} value={p.productId} disabled={p.stockQuantity === 0}>
                    {p.productName} - {money(piecePrice(p))} - stock {p.stockQuantity}
                  </option>
                ))}
              </select>
            </label>
            <label>Quantity<input type="number" min="1" value={pickQty} onChange={(e) => setPickQty(e.target.value)} /></label>
            <button type="button" className="primary" onClick={addToCart}>Add to cart</button>
          </div>

          <h3>Cart</h3>
          {cart.length === 0 ? <p className="hint">Cart is empty.</p> : (
            <div className="tablewrap">
              <table>
                <thead><tr><th>Product</th><th className="right">Price / piece</th><th className="right">Qty</th><th className="right">Line total</th><th></th></tr></thead>
                <tbody>
                  {cart.map((l) => {
                    const p = find(l.productId)
                    return (
                      <tr key={l.productId}>
                        <td>{p?.productName}</td>
                        <td className="right">{p && money(piecePrice(p))}</td>
                        <td className="right">{l.quantity}</td>
                        <td className="right">{p && money(piecePrice(p) * l.quantity)}</td>
                        <td><button type="button" className="small danger" onClick={() => removeLine(l.productId)}>Remove</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h3>Discount and payment</h3>
          <div className="grid">
            <label>Discount
              <select value={discType} onChange={(e) => setDiscType(e.target.value)}>
                <option value="NONE">No discount</option>
                <option value="AMOUNT">Amount</option>
                <option value="PERCENT">Percent (%)</option>
              </select>
            </label>
            {discType !== 'NONE' && (
              <label>{discType === 'PERCENT' ? 'Discount %' : 'Discount amount'}
                <input type="number" min="0" step="0.01" value={discValue} onChange={(e) => setDiscValue(e.target.value)} />
              </label>
            )}
            <label>Payment method
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="checkline">
              <input type="checkbox" checked={payFull} onChange={(e) => setPayFull(e.target.checked)} />
              {pending ? 'No payment now (pay later)' : 'Customer pays the full amount now'}
            </label>
            {!payFull && (
              <label>Amount paid now
                <input type="number" min="0" step="0.01" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} />
              </label>
            )}
          </div>
          {!isManager && <p className="hint">Staff can give at most {STAFF_MAX_DISCOUNT}% discount.</p>}
          {overLimit && <p className="msg error">This discount is {discPct.toFixed(1)}%, above your limit of {STAFF_MAX_DISCOUNT}%.</p>}

          {cart.length > 0 && (
            <div className="summary">
              <div><span>Subtotal</span><b>{money(subTotal)}</b></div>
              {discount > 0 && <div><span>Discount</span><b>-{money(discount)}</b></div>}
              {vatPercent > 0 && <div><span>VAT ({vatPercent}%)</span><b>{money(vat)}</b></div>}
              <div className="grand"><span>Total to pay</span><b>{money(total)}</b></div>
              <div><span>Paying now</span><b>{money(paying)}</b></div>
              <div className={due > 0 ? 'duecell' : ''}><span>Due</span><b>{money(due)}</b></div>
            </div>
          )}

          <p>
            <label className="checkline">
              <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} />
              Hold as Pending (reserve the stock now, complete the order later)
            </label>
          </p>
          <p><button className="primary" disabled={overLimit}>{pending ? 'Place order on hold' : 'Confirm sale'}</button></p>
        </form>
      </div>
      {receiptId && <Receipt orderId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  )
}
