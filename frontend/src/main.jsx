import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// apply the saved light/dark choice before the first paint (no flash)
document.documentElement.dataset.theme = localStorage.getItem('auralucis_theme') || 'light'

createRoot(document.getElementById('root')).render(<App />)
