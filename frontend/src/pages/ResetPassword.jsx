import { useState } from 'react'
import { api } from '../api.js'
import Msg from './Messages.jsx'
export default function ResetPassword({ token }) {
  const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState(''); const [msg,setMsg]=useState(null); const [done,setDone]=useState(false)
  const submit=async e=>{e.preventDefault(); if(password!==confirm){setMsg({type:'error',text:'Passwords do not match.'});return} try{await api.post('/api/auth/reset-password',{token,newPassword:password});setDone(true);setMsg({type:'ok',text:'Password changed. You can now sign in.'})}catch(err){setMsg({type:'error',text:err.message})}}
  return <div className="login-wrap"><div className="login-card"><img src="/logo.png" alt=""/><h1>AURALUCIS</h1><p className="tagline">Set a new Owner password</p><Msg msg={msg}/>{!done&&<form onSubmit={submit}><label>New password<input type="password" minLength="8" required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm password<input type="password" minLength="8" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><button className="primary">Reset password</button></form>}<a href="/">Return to AURALUCIS</a></div></div>
}
