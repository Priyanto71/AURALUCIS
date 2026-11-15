import { useEffect, useRef, useState } from 'react'

// Small SVG charts (no chart library needed): a line chart and a pie chart.
const PALETTE = ['#b8962e', '#e6c76a', '#7a5c0e', '#d9b45a', '#8c6d1f', '#f0d98f', '#5c4710', '#c9a24b']
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n)))
const money = (n) => Number(n ?? 0).toFixed(2)

// data = [{ label: '10/05', value: 1200 }, ...]
export function LineChart({ data, height = 220 }) {
  // draw at the real width of the card so the text stays crisp on phones and wide screens
  const box = useRef(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    if (!box.current) return undefined
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const W = width, H = height, L = 46, R = 12, T = 14, B = 30
  if (!data || data.length === 0) return <p className="hint">No data yet.</p>

  const max = Math.max(1, ...data.map((d) => d.value))
  const x = (i) => L + (data.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (data.length - 1))
  const y = (v) => T + (H - T - B) * (1 - v / max)
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  const area = `${x(0)},${H - B} ${pts} ${x(data.length - 1)},${H - B}`
  const every = Math.ceil(data.length / Math.max(2, Math.floor(W / 80)))

  return (
    <div ref={box} style={{ width: '100%' }}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Line chart" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b8962e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#b8962e" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" />
          <text x={L - 6} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{compact(max * t)}</text>
        </g>
      ))}
      <polygon points={area} fill="url(#lineFill)" />
      <polyline points={pts} fill="none" stroke="#b8962e" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r="3.5" fill="#b8962e"><title>{`${d.label}: ${money(d.value)}`}</title></circle>
          {i % every === 0 && <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>}
        </g>
      ))}
    </svg>
    </div>
  )
}

// data = [{ label: 'Rings', value: 7400 }, ...]
export function PieChart({ data, size = 170 }) {
  const items = (data ?? []).filter((d) => d.value > 0)
  const total = items.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <p className="hint">No data yet.</p>

  const R = size / 2 - 4, C = size / 2
  let angle = -Math.PI / 2
  const slices = items.map((d, i) => {
    const frac = d.value / total
    const a0 = angle
    angle += frac * Math.PI * 2
    const large = frac > 0.5 ? 1 : 0
    const p = (a) => `${C + R * Math.cos(a)},${C + R * Math.sin(a)}`
    return { ...d, frac, color: PALETTE[i % PALETTE.length], path: `M${C},${C} L${p(a0)} A${R},${R} 0 ${large} 1 ${p(angle)} Z` }
  })

  return (
    <div className="pie">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Pie chart">
        {slices.length === 1
          ? <circle cx={C} cy={C} r={R} fill={slices[0].color}><title>{`${slices[0].label}: ${money(slices[0].value)} (100%)`}</title></circle>
          : slices.map((s) => (
            <path key={s.label} d={s.path} fill={s.color} stroke="var(--card)" strokeWidth="1.5">
              <title>{`${s.label}: ${money(s.value)} (${(s.frac * 100).toFixed(1)}%)`}</title>
            </path>
          ))}
      </svg>
      <ul className="legend">
        {slices.map((s) => (
          <li key={s.label}>
            <span className="swatch" style={{ background: s.color }} />
            <span className="lname">{s.label}</span>
            <span className="lval">{money(s.value)} <em>{(s.frac * 100).toFixed(0)}%</em></span>
          </li>
        ))}
      </ul>
    </div>
  )
}
