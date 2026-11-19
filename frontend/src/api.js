// All calls to the backend go through here. The login token is kept in the browser (localStorage).
const KEY = 'auralucis_user'

export const getUser = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
}
export const saveUser = (u) => localStorage.setItem(KEY, JSON.stringify(u))
export const clearUser = () => localStorage.removeItem(KEY)

async function request(method, url, body) {
  const user = getUser()
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (user?.token) headers.Authorization = `Bearer ${user.token}`

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })

  // Token missing/expired (e.g. the API was restarted): go back to the login page.
  if (res.status === 401 && !url.toLowerCase().includes('/api/auth/login')) {
    clearUser()
    window.dispatchEvent(new Event('auth-expired'))
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
  const data = await res.json()
  msg = data.error || (res.status === 403
    ? 'You do not have permission to perform this action.'
    : msg)
} catch {
  if (res.status === 403) msg = 'You do not have permission to perform this action.'
}
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
  upload: async (url, file) => {
    const user = getUser(); const data = new FormData(); data.append('file', file)
    const res = await fetch(url, { method: 'POST', headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {}, body: data })
    if (!res.ok) {
  let msg = res.status === 403
    ? 'You do not have permission to perform this action.'
    : `Request failed (${res.status})`

  try {
    const data = await res.json()
    msg = data.error || msg
  } catch {}

  throw new Error(msg)
}
    return res.json()
  },
}

export const money = (n) => Number(n ?? 0).toFixed(2)

// Downloads a CSV file (opens fine in Excel). header = array of titles, rows = array of arrays.
export function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    const t = String(v ?? '')
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}
