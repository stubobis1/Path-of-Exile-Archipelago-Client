// Check all electron-specific process properties
const keys = Object.keys(process).filter(k => {
  try { return ['type','contextId','isMainFrame','contextIsolated','sandboxed'].includes(k) || k.startsWith('electron') || k.startsWith('chrome') } catch { return false }
})
console.log("process props:", keys.map(k => k + '=' + JSON.stringify(process[k])).join(', '))
console.log("process.type:", process.type)
// Check if electron global APIs available
try { const {app} = require('electron'); console.log("app:", typeof app) } catch(e) { console.log("require err:", e.message.slice(0,60)) }
// Check for electron-specific globals
console.log("global keys with electron:", Object.keys(global).filter(k => k.toLowerCase().includes('electron')))
