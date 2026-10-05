import { useEffect, useMemo, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'

const empty = { productName: '', categoryId: '', supplierId: '', metalType: 'Gold', purity: '', weightGrams: '', makingCharge: 0, unitPrice: '', stockQuantity: 0 }

export default function Products({ user }) {
  const isManager = user.role === 'Manager'
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState(null)
  const [msg, setMsg] = useState(null)
  // search and filters (done in the browser on the loaded list)
  const [q, setQ] = useState('')
  const [fCategory, setFCategory] = useState('')
  const [fMetal, setFMetal] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  const load = async () => {
    try {
      const [p, c, s] = await Promise.all([api.get('/api/products'), api.get('/api/categories'), api.get('/api/suppliers')])
      setProducts(p); setCategories(c); setSuppliers(s)
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }
  useEffect(() => { load() }, [])

  const metals = useMemo(() => [...new Set(products.map((p) => p.metalType))].sort(), [products])

  const shown = products.filter((p) => {
    const text = `${p.productName} ${p.categoryName ?? ''} ${p.supplierName ?? ''} ${p.metalType} ${p.purity ?? ''}`.toLowerCase()
    return text.includes(q.toLowerCase())
      && (!fCategory || p.categoryName === fCategory)
      && (!fMetal || p.metalType === fMetal)
      && (!lowOnly || p.stockQuantity <= 3)
  })

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const startEdit = async (id) => {
    try {
      const p = await api.get(`/api/products/${id}`)
      setForm({
        productName: p.productName, categoryId: p.categoryId ?? '', supplierId: p.supplierId ?? '',
        metalType: p.metalType, purity: p.purity ?? '', weightGrams: p.weightGrams,
        makingCharge: p.makingCharge, unitPrice: p.unitPrice, stockQuantity: p.stockQuantity,
      })
      setEditingId(id)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const cancelEdit = () => { setEditingId(null); setForm(empty) }

  const save = async (e) => {
    e.preventDefault()
    const body = {
      ...form,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      weightGrams: Number(form.weightGrams),
      makingCharge: Number(form.makingCharge),
      unitPrice: Number(form.unitPrice),
      stockQuantity: Number(form.stockQuantity),
    }
    try {
      if (editingId) await api.put(`/api/products/${editingId}`, body)
      else await api.post('/api/products', body)
      setMsg({ type: 'ok', text: editingId ? 'Product updated.' : 'Product added.' })
      cancelEdit(); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this product?')) return
    try { await api.del(`/api/products/${id}`); setMsg({ type: 'ok', text: 'Product deleted.' }); load() }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const exportCsv = () => downloadCsv('products.csv',
    ['ID', 'Name', 'Category', 'Supplier', 'Metal', 'Purity', 'Weight (g)', 'Unit price', 'Making charge', 'Stock', 'Stock value'],
    shown.map((p) => [p.productId, p.productName, p.categoryName, p.supplierName, p.metalType, p.purity, p.weightGrams, p.unitPrice, p.makingCharge, p.stockQuantity, p.stockValue]))

  return (
    <>
      <Msg msg={msg} />
      {isManager && (
        <div className="card">
          <h2>{editingId ? `Edit product #${editingId}` : 'Add product'}</h2>
          <form className="grid" onSubmit={save}>
            <label>Name<input required value={form.productName} onChange={set('productName')} /></label>
            <label>Category
              <select value={form.categoryId} onChange={set('categoryId')}>
                <option value="">-</option>
                {categories.map((c) => <option key={c.categoryId} value={c.categoryId}>{c.categoryName}</option>)}
              </select>
            </label>
            <label>Supplier
              <select value={form.supplierId} onChange={set('supplierId')}>
                <option value="">-</option>
                {suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
              </select>
            </label>
            <label>Metal<input required value={form.metalType} onChange={set('metalType')} /></label>
            <label>Purity<input value={form.purity} onChange={set('purity')} placeholder="22K" /></label>
            <label>Weight (g)<input required type="number" step="0.001" value={form.weightGrams} onChange={set('weightGrams')} /></label>
            <label>Making charge<input type="number" step="0.01" value={form.makingCharge} onChange={set('makingCharge')} /></label>
            <label>Unit price<input required type="number" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} /></label>
            <label>{editingId ? 'Stock (use Stock tab)' : 'Opening stock'}
              <input type="number" min="0" disabled={!!editingId} value={form.stockQuantity} onChange={set('stockQuantity')} />
            </label>
            <div>
              <button className="primary">{editingId ? 'Update' : 'Save'}</button>{' '}
              {editingId && <button type="button" className="small" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="cardhead">
          <h2>Catalog <span className="hint">({shown.length} of {products.length})</span></h2>
          <button className="small" onClick={exportCsv}>Export CSV</button>
        </div>
        <p className="hint">Sale price of one piece = unit price + making charge.</p>

        <div className="row">
          <label className="grow">Search<input placeholder="Name, metal, category, supplier..." value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label>Category
            <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => <option key={c.categoryId} value={c.categoryName}>{c.categoryName}</option>)}
            </select>
          </label>
          <label>Metal
            <select value={fMetal} onChange={(e) => setFMetal(e.target.value)}>
              <option value="">All</option>
              {metals.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="checkline"><input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low stock only (3 or less)</label>
        </div>

        <div className="tablewrap"><table>
          <thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Supplier</th><th>Metal</th><th className="right">Weight</th><th className="right">Unit price</th><th className="right">Making</th><th className="right">Stock</th><th className="right">Stock value</th>{isManager && <th></th>}</tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.productId}>
                <td>{p.productId}</td><td>{p.productName}</td><td>{p.categoryName}</td><td>{p.supplierName}</td>
                <td>{p.metalType} {p.purity}</td>
                <td className="right">{p.weightGrams} g</td>
                <td className="right">{money(p.unitPrice)}</td>
                <td className="right">{money(p.makingCharge)}</td>
                <td className="right">{p.stockQuantity}</td>
                <td className="right">{money(p.stockValue)}</td>
                {isManager && (
                  <td className="actions">
                    <button className="small" onClick={() => startEdit(p.productId)}>Edit</button>
                    <button className="small danger" onClick={() => remove(p.productId)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan="11" className="hint">No products match.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  )
}
