import { createRequire } from "module"
const req = createRequire(import.meta.url)
console.log("process.type:", process.type)
console.log("process.versions.electron:", process.versions?.electron)
try {
  const e = req("electron")
  console.log("cjs require electron:", typeof e, typeof e?.app)
} catch(err) {
  console.log("cjs require failed:", err.message.slice(0,60))
}
import * as ns from 'electron'
console.log("esm ns keys:", Object.keys(ns).join(","))
console.log("esm ns.default:", typeof ns.default, Object.getOwnPropertyNames(ns.default||{}).slice(0,5).join(","))
