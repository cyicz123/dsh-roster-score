import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWorkbook } from '../lib/xlsx.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, '..', 'samples', 'roster-50.xlsx')
const report = join(here, 'parse-50-report.txt')
const base = 'http://127.0.0.1:8178/plugins/roster-score'

const bytes = readFileSync(source)
const local = parseWorkbook(bytes)
const lines = []
lines.push(`sheets=${JSON.stringify(local.sheetNames)}`)
lines.push(`rows=${local.sheets[0].rows.length}`)

const response = await fetch(`${base}/parse`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ fileName: 'roster-50.xlsx', dataBase64: bytes.toString('base64') }),
})
const payload = await response.json()
lines.push(`status=${response.status}`)
if (payload.error || !Array.isArray(payload.records)) {
  lines.push(`error=${payload.error}`)
} else {
  const state = payload
  lines.push(`sheetName=${state.sheetName} headerRows=${state.headerRows} nameColumn=${state.nameColumn}`)
  lines.push(`columns=${JSON.stringify(state.columns)}`)
  lines.push(`records=${state.records.length}`)
  const broken = state.records.filter((record) => !record.name || !record.name.trim())
  lines.push(`nameless=${broken.length}`)
  lines.push(`first=${JSON.stringify(state.records[0])}`)
  lines.push(`last=${JSON.stringify(state.records[state.records.length - 1])}`)
  lines.push(`names=${state.records.map((record) => record.name).join(',')}`)
}
writeFileSync(report, lines.join('\n'), 'utf8')
console.log(`report=${report}`)
