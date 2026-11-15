import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Verify from './pages/Verify.jsx'
import './styles.css'

// apply the saved light/dark choice before the first paint (no flash)
document.documentElement.dataset.theme = localStorage.getItem('auralucis_theme') || 'light'

// /verify/<code> is the public receipt page opened by the QR code (no login needed)
const m = window.location.pathname.match(/^\/verify\/([0-9a-fA-F]+)\/?$/)

createRoot(document.getElementById('root')).render(m ? <Verify code={m[1]} /> : <App />)
