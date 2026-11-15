import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, anything starting with /api is forwarded to the ASP.NET backend (no CORS setup needed).
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173, proxy: { '/api': 'http://localhost:5000' } },
})
