import React from 'react'
import { useStore } from '../store'

const SLOT_LABELS: Record<string, string> = {
  BodyArmour: 'Body Armour', Helmet: 'Helmet', Gloves: 'Gloves', Boots: 'Boots',
  Belt: 'Belt', Amulet: 'Amulet', Ring: 'Ring (left)', Ring2: 'Ring (right)',
  Weapon: 'Weapon', Offhand: 'Off-hand', Flask: 'Flask',
  Passives: 'Passive Points', Class: 'Class', GucciHobo: 'Gucci Hobo Mode',
}

const PULSE_CSS = `@keyframes err-pulse {
  0%,100% { background: color-mix(in srgb, var(--err) 8%, var(--bg-3)); border-color: color-mix(in srgb, var(--err) 25%, transparent); }
  50%      { background: color-mix(in srgb, var(--err) 22%, var(--bg-3)); border-color: color-mix(in srgb, var(--err) 60%, transparent); }
}`

export function ValidationErrors() {
  const { errors } = useStore()
  if (errors.length === 0) return null
  return (
    <div style={{ marginBottom: 24 }}>
      <style>{PULSE_CSS}</style>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--err)', marginBottom: 6 }}>
        Out of Logic · {errors.length} issue{errors.length !== 1 ? 's' : ''}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {errors.map((e, i) => (
          <div key={i} style={{ padding: '8px 12px', borderRadius: 5, border: '1px solid', fontSize: 12, animation: 'err-pulse 1.6s ease-in-out infinite' }}>
            <span style={{ color: 'var(--err)', fontWeight: 600 }}>{SLOT_LABELS[e.slot] ?? e.slot}</span>
            <span className="muted" style={{ marginLeft: 8 }}>{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
