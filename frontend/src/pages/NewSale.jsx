import { useEffect, useState } from 'react'
import { api, money } from '../api.js'
import Msg from './Messages.jsx'

export default function NewSale({ user }) {
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [pickId, setPickId] = useState('')
  const [pickQty, setPickQty] = useState(1)
  const [cart, setCart] = useState([]) // [{ productId, quantity }]
  const [msg, setMsg] = useState(null)

  const load = async () => {
    try {
      const [c, p] = await Promise.all([api.get('/api/customers'), api.get('/api/products')])
      setCustomers(c); setProducts(p)
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

  const total = cart.reduce((sum, l) => {
    const p = find(l.productId)
    return sum + (p ? piecePrice(p) * l.quantity : 0)
  }, 0)

  const submit = async (e) => {
    e.preventDefault()
    if (cart.length === 0) { setMsg({ type: 'error', text: 'Add at least one product.' }); return }
    try {
      const r = await api.post('/api/orders/sale', { customerId: Number(customerId), items: cart })
      setMsg({ type: 'ok', text: `Sale recorded. Order #${r.orderId}` })
      setCart([]); load()
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
                <tr><th colSpan="3" className="right">Grand total</th><th className="right">{money(total)}</th><th></th></tr>
              </tbody>
            </table>
          )}
          <p><button className="primary">Confirm sale</button></p>
        </form>
      </div>
    </>
  )
}
