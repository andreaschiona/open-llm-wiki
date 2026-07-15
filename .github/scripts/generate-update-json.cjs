#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const version = process.argv[2]
if (!version) {
  console.error('Usage: node generate-update-json.js <version>')
  process.exit(1)
}

const releaseTag = version.startsWith('v') ? version : `v${version}`
const repo = 'andreaschiona/open-llm-wiki'
const baseUrl = `https://github.com/${repo}/releases/download/${releaseTag}`
const pubDate = new Date().toISOString()

const platforms = {}

const artifactsDir = process.env.ARTIFACTS_DIR || 'src-tauri/target/release/bundle'
const portableDir = '.'

function findSignature(artifactPath) {
  const sigPath = artifactPath + '.sig'
  if (fs.existsSync(sigPath)) {
    return fs.readFileSync(sigPath, 'utf-8').trim()
  }
  return null
}

const platformMap = [
  { pattern: /\.msi$/, key: 'windows-x86_64', name: 'msi' },
  { pattern: /\.exe$/, key: 'windows-x86_64', name: 'exe' },
  { pattern: /_x64_portable\.zip$/, key: 'windows-x86_64', name: 'zip' },
  { pattern: /\.dmg$/, key: 'darwin-aarch64', name: 'dmg' },
  { pattern: /\.AppImage$/, key: 'linux-x86_64', name: 'appimage' },
  { pattern: /\.deb$/, key: 'linux-x86_64', name: 'deb' },
  { pattern: /\.rpm$/, key: 'linux-x86_64', name: 'rpm' },
]

function scanDir(dir) {
  if (!fs.existsSync(dir)) return
  const items = fs.readdirSync(dir)
  for (const item of items) {
    const fullPath = path.join(dir, item)
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath)
    } else {
      for (const { pattern, key, name } of platformMap) {
        if (pattern.test(item) && !platforms[key]) {
          const signature = findSignature(fullPath)
          if (signature) {
            platforms[key] = { signature, url: `${baseUrl}/${item}` }
          } else {
            console.warn(`No signature found for ${item}, skipping updater entry`)
          }
        }
      }
    }
  }
}

scanDir(artifactsDir)
scanDir(portableDir)

if (Object.keys(platforms).length === 0) {
  console.error('No signed artifacts found for any platform')
  process.exit(1)
}

const updateJson = JSON.stringify({ version, pub_date: pubDate, platforms }, null, 2)
console.log(updateJson)
fs.writeFileSync('update.json', updateJson)
console.log(`\nupdate.json written with ${Object.keys(platforms).length} platform(s)`)
