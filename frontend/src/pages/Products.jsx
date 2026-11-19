import { useEffect, useMemo, useState } from 'react'
import { api, money, downloadCsv } from '../api.js'
import Msg from './Messages.jsx'

const empty = { productName: '', sku: '', barcode: '', hallmarkNumber: '', hallmarkDetails: '', certificateNumber: '', certificateIssuer: '', certificateDate: '', categoryId: '', supplierId: '', metalType: 'Gold', purity: '', weightGrams: '', makingCharge: 0, makingType: 'FIXED', makingPercent: '', pricingMode: 'FIXED', unitPrice: '', costPrice: 0, stockQuantity: 0, description: '', imageUrl: '', isPublished: 0 }

export default function Products({ user }) {
  const isManager = ['Manager', 'Owner'].includes(user.role)
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
    const text = `${p.productName} ${p.sku ?? ''} ${p.barcode ?? ''} ${p.hallmarkNumber ?? ''} ${p.certificateNumber ?? ''} ${p.categoryName ?? ''} ${p.supplierName ?? ''} ${p.metalType} ${p.purity ?? ''}`.toLowerCase()
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
        productName: p.productName, sku: p.sku ?? '', barcode: p.barcode ?? '',
        hallmarkNumber: p.hallmarkNumber ?? '', hallmarkDetails: p.hallmarkDetails ?? '',
        certificateNumber: p.certificateNumber ?? '', certificateIssuer: p.certificateIssuer ?? '',
        certificateDate: p.certificateDate ? String(p.certificateDate).slice(0, 10) : '',
        categoryId: p.categoryId ?? '', supplierId: p.supplierId ?? '',
        metalType: p.metalType, purity: p.purity ?? '', weightGrams: p.weightGrams,
        makingCharge: p.makingCharge, makingType: p.makingPercent != null ? 'PERCENT' : 'FIXED', makingPercent: p.makingPercent ?? '',
        pricingMode: p.pricingMode, unitPrice: p.unitPrice, costPrice: p.costPrice, stockQuantity: p.stockQuantity, description: p.description ?? '', imageUrl: p.imageUrl ?? '', isPublished: p.isPublished ?? 0,
      })
      setEditingId(id)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const cancelEdit = () => { setEditingId(null); setForm(empty) }

  const save = async (e) => {
    e.preventDefault()
    const rate = form.pricingMode === 'RATE'
    const pct = form.makingType === 'PERCENT'
    const body = {
      ...form,
      pricingMode: form.pricingMode,
      makingPercent: pct ? Number(form.makingPercent) || 0 : null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      weightGrams: Number(form.weightGrams),
      makingCharge: pct ? 0 : Number(form.makingCharge),
      unitPrice: rate ? 0 : Number(form.unitPrice),
      costPrice: Number(form.costPrice) || 0,
      stockQuantity: Number(form.stockQuantity),
      isPublished: Number(form.isPublished),
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
    ['ID', 'Name', 'SKU', 'Barcode', 'Hallmark', 'Certificate', 'Category', 'Supplier', 'Metal', 'Purity', 'Weight (g)', 'Unit price', 'Making charge', ...(isManager ? ['Cost price'] : []), 'Stock', 'Stock value'],
    shown.map((p) => [p.productId, p.productName, p.sku, p.barcode, p.hallmarkNumber, p.certificateNumber, p.categoryName, p.supplierName, p.metalType, p.purity, p.weightGrams, p.unitPrice, p.makingCharge, ...(isManager ? [p.costPrice] : []), p.stockQuantity, p.stockValue]))

  return (
    <>
      <Msg msg={msg} />
      {isManager && (
        <div className="card">
          <h2>{editingId ? `Edit product #${editingId}` : 'Add product'}</h2>
          <form className="grid" onSubmit={save}>
            <label>Name<input required value={form.productName} onChange={set('productName')} /></label>
            <label>SKU<input value={form.sku} onChange={set('sku')} maxLength={50} /></label>
            <label>Barcode<input value={form.barcode} onChange={set('barcode')} maxLength={100} /></label>
            <label>Hallmark number<input value={form.hallmarkNumber} onChange={set('hallmarkNumber')} maxLength={100} /></label>
            <label>Hallmark details<input value={form.hallmarkDetails} onChange={set('hallmarkDetails')} maxLength={500} /></label>
            <label>Certificate number<input value={form.certificateNumber} onChange={set('certificateNumber')} maxLength={100} /></label>
            <label>Certificate issuer<input value={form.certificateIssuer} onChange={set('certificateIssuer')} maxLength={150} /></label>
            <label>Certificate date<input type="date" value={form.certificateDate} onChange={set('certificateDate')} /></label>
            <label>Description<textarea rows={3} value={form.description} onChange={e => setForm({...form, description:e.target.value})}/></label>
            <label>Product image (JPG, PNG, WEBP; max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { const file=e.target.files?.[0]; if(!file)return; try { const r=await api.upload('/api/catalog/image',file); setForm(f=>({...f,imageUrl:r.imageUrl})); setMsg({type:'ok',text:'Image uploaded to Cloudinary.'}) } catch(err) { setMsg({type:'error',text:err.message}) } }}/></label>
            <label>Image URL<input value={form.imageUrl} onChange={set('imageUrl')} placeholder="Cloudinary URL"/></label>
            <label className="checkline"><input type="checkbox" checked={!!Number(form.isPublished)} onChange={e=>setForm({...form,isPublished:e.target.checked?1:0})}/> Show in public catalogue</label>
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
            <label>Pricing
              <select value={form.pricingMode} onChange={set('pricingMode')}>
                <option value="FIXED">Fixed price (type it)</option>
                <option value="RATE">By metal rate (weight x today's rate)</option>
              </select>
            </label>
            {form.pricingMode === 'FIXED'
              ? <label>Unit price<input required type="number" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} /></label>
              : <label>Unit price<input disabled value="from the rate (Rates tab)" readOnly /></label>}
            <label>Making charge is
              <select value={form.makingType} onChange={set('makingType')}>
                <option value="FIXED">A fixed amount</option>
                <option value="PERCENT">A percent of the price</option>
              </select>
            </label>
            {form.makingType === 'FIXED'
              ? <label>Making charge<input type="number" min="0" step="0.01" value={form.makingCharge} onChange={set('makingCharge')} /></label>
              : <label>Making charge %<input required type="number" min="0" max="100" step="0.01" value={form.makingPercent} onChange={set('makingPercent')} /></label>}
            <label>Cost price (what you paid)<input type="number" min="0" step="0.01" value={form.costPrice} onChange={set('costPrice')} /></label>
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
          <thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Supplier</th><th>Metal</th><th className="right">Weight</th><th className="right">Unit price</th><th className="right">Making</th>{isManager && <th className="right">Cost</th>}{isManager && <th className="right">Profit / pc</th>}<th className="right">Stock</th><th className="right">Stock value</th>{isManager && <th></th>}</tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.productId}>
                <td>{p.productId}</td><td>{p.productName}</td><td>{p.categoryName}</td><td>{p.supplierName}</td>
                <td>{p.metalType} {p.purity}</td>
                <td className="right">{p.weightGrams} g</td>
                <td className="right">{money(p.unitPrice)} {p.pricingMode === 'RATE' && <span className="badge" title="Priced from today's metal rate">rate</span>}</td>
                <td className="right">{money(p.makingCharge)} {p.makingPercent != null && <span className="badge" title="Making charge in percent">{Number(p.makingPercent)}%</span>}</td>
                {isManager && <td className="right">{p.costPrice > 0 ? money(p.costPrice) : <span className="hint">not set</span>}</td>}
                {isManager && <td className="right">{p.costPrice > 0 ? money(Number(p.unitPrice) + Number(p.makingCharge) - Number(p.costPrice)) : ''}</td>}
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
            {shown.length === 0 && <tr><td colSpan="13" className="hint">No products match.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>
  )
}
