// Electron E2E: same panel walk as panels.spec.ts, but first injects a fake
// "connected" AppState via the debugSetState IPC action (see ipc-actions.ts),
// bypassing the real AP/GGG network layer entirely. Lets us see what every
// panel actually looks like with real data — items, gear, locations, a goal
// in progress — without standing up a mock Archipelago server.
//
// Run after `npm run build`:
//   unset ELECTRON_RUN_AS_NODE
//   npx playwright test connected-panels
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as path from 'path'
import { PANELS } from './panelList'
import { screenshotScrollable } from './scrollShot'
import type { AppState } from '../src/shared/types'

const appPath = path.resolve(__dirname, '..')
const electronBin = path.join(appPath, 'node_modules', 'electron', 'dist', 'electron.exe')

const FAKE_STATE: Partial<AppState> = {
  connection:  'connected',
  serverAddr:  'archipelago.gg:38281',
  slotName:    'ExampleExile',
  oauthStatus: 'valid',
  oauthAccount: 'ExampleExile',
  oauthDaysLeft: '29',
  charName:    'ExampleExile',
  clientTxtOk:     true,
  clientTxtPathOk: true,
  docPathOk:       true,
  filterOk:        true,
  totalGearUnlocks: 12,
  deathlink:        true,
  whisperUpdates:   true,
  disableGameInput: false,
  errors: [],
  playerGames: { ExampleExile: 'Path of Exile', Sibling: 'Stardew Valley' },

  char: {
    name:  'ExampleExile',
    class: 'Witch',
    level: 68,
    league: 'Standard',
    equipment: {
      Weapon: { typeLine: 'Vaal Regalia', frameType: 2, inventoryId: 'Weapon', socketedItems: [
        { typeLine: 'Fireball', support: false },
        { typeLine: 'Faster Casting Support', support: true },
      ] },
      Helmet: { typeLine: 'Hubris Circlet', frameType: 1, inventoryId: 'Helmet' },
      BodyArmour: { typeLine: 'Vaal Regalia', frameType: 3, inventoryId: 'BodyArmour' },
    },
    inventory: [],
    passives: { hashes: Array(55).fill(0), items: [], totalUsed: 55, totalAlloc: 60 },
  },

  // Main/support skill gems + gear-rarity unlocks — real names/categories/
  // classifications from worlds/poe/data/Items.json.
  items: (() => {
    const mainGems = ['Fireball', 'Freezing Pulse', 'Raise Zombie', 'Spark', 'Ice Nova']
    const supportGems = ['Faster Casting Support', 'Added Fire Damage Support', 'Elemental Focus Support', 'Melee Physical Damage Support']
    // "Progressive {Slot}" gear unlocks — one per equipment slot on the paper
    // doll, received `n` times to climb tiers (rarityCheck() in validation.ts:
    // 1x=Normal, 2x=Magic, 3x=Rare, 4x=Unique). Real names/categories from
    // worlds/poe/data/Items.json (each capped at count: 4).
    const PROGRESSIVE_SLOTS: { slot: string; sub: string; tier: number }[] = [
      { slot: 'Axe',            sub: 'Weapon', tier: 1 },
      { slot: 'Sword',          sub: 'Weapon', tier: 3 },
      { slot: 'Shield',         sub: 'Armour', tier: 1 },
      { slot: 'Helmet',         sub: 'Armour', tier: 2 },
      { slot: 'BodyArmour',     sub: 'Armour', tier: 3 },
      { slot: 'Gloves',         sub: 'Armour', tier: 3 },
      { slot: 'Boots',          sub: 'Armour', tier: 4 },
      { slot: 'Amulet',         sub: 'Armour', tier: 1 },
      { slot: 'Belt',           sub: 'Armour', tier: 2 },
      { slot: 'Ring (left)',    sub: 'Armour', tier: 3 },
      { slot: 'Ring (right)',   sub: 'Armour', tier: 4 },
    ]
    const gearUnlocks = PROGRESSIVE_SLOTS.flatMap(({ slot, sub, tier }) =>
      Array.from({ length: tier }, () => ({
        name: `Progressive ${slot}`,
        classification: 'Useful',
        category: ['Gear', 'Progressive Gear', 'Progressive', sub, slot],
      })),
    )

    const entries: { name: string; classification: string; category: string[] }[] = [
      ...mainGems.map(name => ({ name, classification: 'Filler', category: ['MainSkillGem'] })),
      ...supportGems.map(name => ({ name, classification: 'Useful', category: ['SupportGem'] })),
      ...gearUnlocks,
      // 60 individual points — Dashboard's "unlocked" count is items.length filtered
      // by category "Level" (worlds/poe/data/Items.json: Progressive passive point
      // is category ["Level"], count 136), not a single stacked item.
      ...Array.from({ length: 60 }, () => ({ name: 'Progressive passive point', classification: 'Progression', category: ['Level'] })),
    ]

    return entries.map((e, i) => ({ id: 1000 + i, from: 'Sibling', index: i, ...e }))
  })(),

  locations: [
    ...Array.from({ length: 80 }, (_, i) => ({
      id: 42000 + i,
      name: `Reach The Test Zone ${i + 1}`,
      checked: i < 50,
      act: (i % 10) + 1,
    })),
    // Base-item-type locations — names/acts match worlds/poe/data/BaseItems.json exactly.
    { id: 43000, name: 'Iron Ring - early act 1', checked: true, act: 1 },
    { id: 43001, name: 'Vaal Regalia - maps',     checked: true, act: 11 },
  ],

  // Both hint directions, per HintedItems.tsx's two sections:
  //  - "For {slotName}": receiver === our slot — PoE items sitting in Sibling's
  //    (Stardew Valley) locations, waiting to come to us.
  //  - "At {slotName}'s Locations": location is one of ours, receiver === Sibling
  //    — Stardew items placed in our own PoE world for them to receive.
  hints: [
    { item: 'Fireball',                  location: 'Cindersap Forest',        finder: 'Sibling', receiver: 'ExampleExile', found: true },
    { item: 'Reap',              location: 'The Mines - Floor 40',    finder: 'Sibling', receiver: 'ExampleExile', found: false },
    { item: 'Progressive passive point', location: 'Community Center Vault', finder: 'Sibling', receiver: 'ExampleExile', found: false },
    { item: 'Stardrop',      location: 'Reach The Test Zone 12',  finder: 'ExampleExile', receiver: 'Sibling', found: true },
    { item: 'Galaxy Sword',  location: 'Iron Ring - early act 1', finder: 'ExampleExile', receiver: 'Sibling', found: false },
    { item: 'Ancient Seed',  location: 'Reach The Test Zone 30',  finder: 'ExampleExile', receiver: 'Sibling', found: false },
  ],

  goal: { type: 1, defeated: [], eligible: true, complete: false },

  chat: [
    { t: '12:00', kind: 'sys',  body: 'Connected as "ExampleExile" · Path of Exile' },
    { t: '12:01', kind: 'item', body: 'Fireball from Sibling' },
    { t: '12:02', kind: 'chat', who: 'Sibling', body: 'gl hf' },
  ],
}

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  const env = { ...process.env, E2E_TEST: '1' }
  delete env.ELECTRON_RUN_AS_NODE

  electronApp = await electron.launch({
    executablePath: electronBin,
    args: [appPath, '--no-sandbox'],
    env,
  })
  window = await electronApp.firstWindow({ timeout: 30000 })
  await window.waitForLoadState('domcontentloaded')

  await window.evaluate((delta) => (window as any).electronAPI.action({ type: 'debugSetState', delta }), FAKE_STATE)
  // Let the store fixture propagate before the first navigation click.
  await window.waitForTimeout(300)
})

test.afterAll(async () => {
  await electronApp.close()
})

for (const { label, marker } of PANELS) {
  test(`${label} panel renders with connected state`, async () => {
    await window.locator('.nav .item', { hasText: label }).click()

    const content = window.locator('.content')
    await expect(content).toContainText(marker, { timeout: 10000 })

    const text = await content.innerText()
    expect(text.trim().length).toBeGreaterThan(20)

    const basePath = path.join(__dirname, 'screenshots', `connected-${label.replace(/\s+/g, '-').toLowerCase()}`)
    await screenshotScrollable(window, '.content', basePath)
  })
}
