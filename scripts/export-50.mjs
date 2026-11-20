import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const base = 'http://127.0.0.1:8178/plugins/roster-score'
const report = join(here, 'export-50-report.txt')
const lines = []

async function post(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, payload: await response.json() }
}

for (const [id, score] of [['r1', 95], ['r2', 88], ['r50', 76]]) {
  const result = await post('/score', { id, score })
  lines.push(`score ${id}=${score} status=${result.status} ok=${Array.isArray(result.payload.records)}`)
}

const exported = await post('/export', {})
lines.push(`export status=${exported.status} fileName=${exported.payload.fileName}`)
if (exported.payload.dataBase64) {
  const bytes = Buffer.from(exported.payload.dataBase64, 'base64')
  const target = join(here, '..', 'samples', 'api-out-50.xlsx')
  writeFileSync(target, bytes)
  lines.push(`wrote=${target} bytes=${bytes.length}`)
}

const state = await fetch(`${base}/state`).then((response) => response.json())
lines.push(`records=${state.records.length} recorded=${state.records.filter((record) => record.score !== null).length}`)
writeFileSync(report, lines.join('\n'), 'utf8')
