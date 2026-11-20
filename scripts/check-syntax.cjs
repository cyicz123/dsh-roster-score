const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
// SourceTextModule parses ESM syntax without resolving imports; pass
// --experimental-vm-modules on Node versions where it is still gated.
const SourceTextModule = vm.SourceTextModule || null

function checkModule(relative) {
  const file = path.join(root, relative)
  const source = fs.readFileSync(file, 'utf8')
  try {
    if (!SourceTextModule) {
      console.log(`skip ${relative} (vm.SourceTextModule unavailable)`)
      return
    }
    new SourceTextModule(source, { identifier: file })
    console.log(`ok   ${relative}`)
  } catch (error) {
    console.log(`fail ${relative}: ${error.message.split('\n')[0]}`)
    process.exitCode = 1
  }
}

function checkScript(relative) {
  const file = path.join(root, relative)
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file })
    console.log(`ok   ${relative}`)
  } catch (error) {
    console.log(`fail ${relative}: ${error.message.split('\n')[0]}`)
    process.exitCode = 1
  }
}

checkModule('index.js')
checkModule('lib/xlsx.mjs')
// client.js is a plain script handed to window.__ModuleLoader__.
checkScript('client.js')
