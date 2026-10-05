// Shared helper: shows a green/red message bar.
export default function Msg({ msg }) {
  if (!msg) return null
  return <div className={`msg ${msg.type}`}>{msg.text}</div>
}
