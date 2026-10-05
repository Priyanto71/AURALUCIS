import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// A pop-up window drawn on top of the page. Click outside or press Esc to close.
export default function Modal({ onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' wide' : ''}`}>{children}</div>
    </div>,
    document.body,
  )
}
