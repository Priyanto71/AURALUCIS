import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Draws a QR code for any text (here: the public receipt link).
export default function QrCode({ text, size = 110 }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setFailed(false)
    QRCode.toDataURL(text, { width: size * 3, margin: 1, errorCorrectionLevel: 'M' })
      .then((u) => { if (alive) setSrc(u) })
      .catch(() => { if (alive) { setSrc(''); setFailed(true) } })
    return () => { alive = false }
  }, [text, size])

  if (failed) return <p className="hint">The QR code could not be drawn. Check the website link in Setup, Shop settings.</p>
  return src ? <img src={src} width={size} height={size} alt="QR code" /> : null
}
