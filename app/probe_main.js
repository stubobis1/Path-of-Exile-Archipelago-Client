console.log("process.type:", process.type)
console.log("process.versions.electron:", process.versions?.electron)
const e = require("electron")
console.log("require electron:", typeof e, typeof e?.app)
