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
  if (res.status === 403) throw new Error('Only a Manager can do this.')

  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try { msg = (await res.json()).error || msg } catch { /* no JSON body */ }
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
}

export const money = (n) => Number(n ?? 0).toFixed(2)
