#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const AP_ROOT = path.resolve(__dirname, '..', '..', '..')
const src = path.join(AP_ROOT, 'worlds', 'poe', 'data')
const dst = path.resolve(__dirname, '..', 'resources', 'data')

const files = [
  'AlternateGems.json',
  'AreaLocations.json',
  'BaseItems.json',
  'Bosses.json',
  'Items.json',
  'LevelLocations.json',
]

fs.mkdirSync(dst, { recursive: true })
for (const f of files) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f))
  console.log(`Copied ${f}`)
}

execSync('python src/data/generate_options.py', {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
})
