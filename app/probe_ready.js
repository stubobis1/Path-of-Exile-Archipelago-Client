console.log("BEFORE APP: process.type =", process.type)
const electron = require('electron')
console.log("require electron type:", typeof electron)
if (typeof electron === 'object' && electron !== null) {
  const {app} = electron
  if (app) {
    app.whenReady().then(() => {
      console.log("AFTER READY: process.type =", process.type)
      app.quit()
    })
  } else {
    console.log("no app found in electron obj")
    console.log("electron keys:", Object.keys(electron))
  }
} else {
  console.log("electron is not an object:", electron)
}
