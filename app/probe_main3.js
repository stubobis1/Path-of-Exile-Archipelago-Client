// Minimal: just log and then try to use electron API
console.log("PROBE START")
console.log("process.type:", process.type)
const e = require('electron')
if (typeof e === 'string') {
  console.log("require(electron) = PATH STRING:", e)
} else {
  console.log("require(electron) = OBJECT:", typeof e)
}
// Does the window appear?
setTimeout(() => { console.log("5s later - still alive") }, 5000)
