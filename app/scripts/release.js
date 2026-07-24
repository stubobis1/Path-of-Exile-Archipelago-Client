#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const { execSync } = require('child_process')

// ── Paths ──────────────────────────────────────────────────────────────────
const CLIENT_ROOT = path.resolve(__dirname, '..')
const AP_ROOT     = path.resolve(CLIENT_ROOT, '..', '..')
const POE_WORLD   = path.join(AP_ROOT, 'worlds', 'poe')

const PATHS = {
  packageJson:    path.join(CLIENT_ROOT, 'package.json'),
  poeVersionJson: path.join(CLIENT_ROOT, 'poe-version.json'),
  versionPy:      path.join(POE_WORLD, 'Version.py'),
  archipelagoJson:path.join(POE_WORLD, 'archipelago.json'),
  apworldOut:     path.join(AP_ROOT, 'build', 'apworlds', 'poe.apworld'),
}

// ── Prompt helper ──────────────────────────────────────────────────────────
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

// ── Main ───────────────────────────────────────────────────────────────────
;(async () => {
  const currentVersion = JSON.parse(fs.readFileSync(PATHS.packageJson, 'utf8')).version
  console.log(`\nCurrent version: ${currentVersion}`)

  let newVersion = ''
  while (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    newVersion = await ask('New version (x.y.z): ')
    if (!/^\d+\.\d+\.\d+$/.test(newVersion)) console.log('  Invalid format, use x.y.z')
  }

  const ans = await ask(`Is v${newVersion} backwards-compatible with old clients? [y/N] `)
  const backwardsCompat = ans.toLowerCase() === 'y'

  // 1 ── sync data
  console.log('\n── Syncing data ──────────────────────────────────')
  require('./sync-data')

  // 2 ── version bump: app/package.json
  console.log('\n── Bumping versions ──────────────────────────────')
  const pkg = JSON.parse(fs.readFileSync(PATHS.packageJson, 'utf8'))
  pkg.version = newVersion
  fs.writeFileSync(PATHS.packageJson, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`  package.json → ${newVersion}`)

  // 3 ── version bump: poe-version.json
  const poeVer = JSON.parse(fs.readFileSync(PATHS.poeVersionJson, 'utf8'))
  const existingCompat = backwardsCompat
    ? [...new Set([...poeVer.backwardsCompatibleVersions, newVersion])]
    : [newVersion]
  poeVer.clientVersion = newVersion
  poeVer.backwardsCompatibleVersions = existingCompat
  fs.writeFileSync(PATHS.poeVersionJson, JSON.stringify(poeVer, null, 2) + '\n')
  console.log(`  poe-version.json → ${newVersion} (compat: [${existingCompat.join(', ')}])`)

  // 4 ── version bump: worlds/poe/Version.py
  const compatSet = existingCompat.map(v => `"${v}"`).join(', ')
  fs.writeFileSync(PATHS.versionPy,
    `POE_VERSION = "${newVersion}"\nBACKWARDS_COMPATIBLE_VERSIONS = {${compatSet}}\n`)
  console.log(`  Version.py → ${newVersion}`)

  // 5 ── version bump: worlds/poe/archipelago.json
  const manifest = JSON.parse(fs.readFileSync(PATHS.archipelagoJson, 'utf8'))
  manifest.world_version = newVersion
  fs.writeFileSync(PATHS.archipelagoJson, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`  archipelago.json → ${newVersion}`)

  // 6 ── build apworld via Archipelago's built-in Build APWorlds launcher component
  console.log('\n── Building poe.apworld ──────────────────────────')
  execSync(`python Launcher.py "Build APWorlds" "Path of Exile"`,
    { stdio: 'inherit', cwd: AP_ROOT })

  // 7 ── build electron client
  console.log('\n── Building electron client ──────────────────────')
  const distDir = path.join(CLIENT_ROOT, 'dist')
  if (fs.existsSync(distDir)) {
    for (const f of fs.readdirSync(distDir)) {
      if (f.endsWith('.exe') || f.endsWith('.blockmap') || f.endsWith('.AppImage') || f.endsWith('.deb')) {
        fs.rmSync(path.join(distDir, f), { force: true })
        console.log(`  Removed ${f}`)
      }
    }
  }
  const winOnly = process.argv.includes('--win-only')
  const linuxOnly = process.argv.includes('--linux-only')
  const doWin = !linuxOnly
  const doLinux = !winOnly

  // AppImage packing needs symlinks; Windows blocks that without dev-mode
  // privilege, so the linux build runs inside WSL. It's built in a separate
  // WSL-native checkout (~/poe-linux-build) with its own node_modules, so
  // linux-ABI native deps never clobber the Windows-side install.
  function wslPath(winP) {
    const drive = winP[0].toLowerCase()
    return '/mnt/' + drive + winP.slice(2).replace(/\\/g, '/')
  }
  // Nesting quotes through cmd.exe -> wsl -> bash -lc is unreliable, so the
  // WSL side of the build runs from a script file instead of an inline -lc string.
  function wslRun(scriptLines) {
    const scriptWin = path.join(CLIENT_ROOT, '.wsl-build-step.sh')
    fs.writeFileSync(scriptWin, '#!/usr/bin/env bash\nset -e\n' + scriptLines.join('\n') + '\n')
    try {
      execSync(`wsl -e bash ${wslPath(scriptWin)}`, { stdio: 'inherit' })
    } finally {
      fs.rmSync(scriptWin, { force: true })
    }
  }

  if (doWin) execSync('npm run dist:win', { stdio: 'inherit', cwd: CLIENT_ROOT })
  if (doLinux) {
    if (process.platform === 'win32') {
      const wslSrc = wslPath(CLIENT_ROOT)
      wslRun([
        'export NVM_DIR="$HOME/.nvm"',
        '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
        'mkdir -p "$HOME/poe-linux-build"',
        `rsync -a --delete --exclude node_modules --exclude dist --exclude out '${wslSrc}/' "$HOME/poe-linux-build/"`,
        'cd "$HOME/poe-linux-build"',
        'npm install',
        'npm run dist:linux',
        `mkdir -p '${wslSrc}/dist'`,
        `cp "$HOME"/poe-linux-build/dist/*.AppImage "$HOME"/poe-linux-build/dist/*.deb '${wslSrc}/dist/' 2>/dev/null || true`,
      ])
    } else {
      execSync('npm run dist:linux', { stdio: 'inherit', cwd: CLIENT_ROOT })
    }
  }

  // 8 ── output artifact paths
  const distFiles = fs.existsSync(distDir)
    ? fs.readdirSync(distDir)
        .filter(f => f.endsWith('.exe') || f.endsWith('.AppImage') || f.endsWith('.deb'))
        .map(f => path.join(distDir, f))
    : []

  console.log('\n════════════════════════════════════════════════')
  console.log(`  apworld:  ${PATHS.apworldOut}`)
  for (const f of distFiles) console.log(`  client:   ${f}`)
  console.log('════════════════════════════════════════════════\n')
})()
