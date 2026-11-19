import { useState } from 'react'
import { api, saveUser } from '../api.js'
import Msg from './Messages.jsx'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  const recover = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    try { const r = await api.post('/api/auth/forgot-password', { username }); setMsg({ type: 'ok', text: r.message }) }
    catch (err) { setMsg({ type: 'error', text: err.message }) } finally { setBusy(false) }
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const u = await api.post('/api/auth/login', { username, password })
      saveUser(u)
      onLogin(u)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/logo.png" alt="AURALUCIS logo" />
        <h1>AURALUCIS</h1>
        <p className="tagline">Where Luxury Meets Precision.</p>
        {forgot && <p className="hint">Password reset is available for the Owner account only.</p>}
        <Msg msg={msg} />
        <form onSubmit={forgot ? recover : submit}>
          <label>Username<input autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          {!forgot && <label>Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
          <button className="primary" disabled={busy}>{busy ? 'Please wait...' : forgot ? 'Send reset link' : 'Sign in'}</button>
          <button type="button" className="small" onClick={() => { setForgot(!forgot); setMsg(null) }}>{forgot ? 'Back to sign in' : 'Forgot password?'}</button>
        </form>
      </div>
    </div>
  )
}
