import { useState } from 'react'
import { api } from '../api.js'
import Modal from './Modal.jsx'
import Msg from '../pages/Messages.jsx'

// Every logged-in employee can change their own password here.
export default function ChangePassword({ onClose }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [msg, setMsg] = useState(null)
  const [done, setDone] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (f.newPassword !== f.confirm) { setMsg({ type: 'error', text: 'The new passwords do not match.' }); return }
    try {
      await api.post('/api/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword })
      setDone(true)
      setMsg({ type: 'ok', text: 'Password changed. Use the new one next time you sign in.' })
    } catch (err) { setMsg({ type: 'error', text: err.message }) }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Change password</h2>
      <Msg msg={msg} />
      {!done && (
        <form className="stack" onSubmit={submit}>
          <label>Current password<input required type="password" value={f.currentPassword} onChange={set('currentPassword')} /></label>
          <label>New password (min 6)<input required type="password" minLength="6" value={f.newPassword} onChange={set('newPassword')} /></label>
          <label>Repeat new password<input required type="password" minLength="6" value={f.confirm} onChange={set('confirm')} /></label>
          <div className="modal-actions">
            <button className="primary">Save</button>
            <button type="button" className="small" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
      {done && <div className="modal-actions"><button className="small" onClick={onClose}>Close</button></div>}
    </Modal>
  )
}
