import { useStore } from '../store'
import { PaperDoll } from '../components/PaperDoll'
import { ValidationErrors } from '../components/ValidationErrors'

export function GearScreen() {
  const { items, char } = useStore()

  const anyUnlocked = items.some(i =>
    /^(Progressive|Normal|Magic|Rare|Unique) /.test(i.name) ||
    i.name.startsWith('Progressive Flask')
  )

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div className="page-header">
        <h1>Equipment</h1>
        <div className="sub">
          equipment unlocks · {char ? `${char.name} · ${char.class} lv ${char.level}` : 'no character loaded'}
        </div>
      </div>

      <div style={{ padding: '28px 28px' }}>
        <ValidationErrors />
        {!anyUnlocked && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '60px 0' }}>
            Connect to the multiworld to see equipment.
          </div>
        )}

        {anyUnlocked && <PaperDoll items={items} />}

      </div>
    </div>
  )
}
