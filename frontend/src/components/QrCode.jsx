import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Draws a QR code for any text (here: the public receipt link).
export default function QrCode({ text, size = 110 }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(text, { width: size * 3, margin: 1, errorCorrectionLevel: 'M' })
      .then((u) => { if (alive) setSrc(u) })
      .catch(() => { if (alive) setSrc('') })
    return () => { alive = false }
  }, [text, size])

  return src ? <img src={src} width={size} height={size} alt="QR code" /> : null
}
