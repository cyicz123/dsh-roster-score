import { readFileSync } from 'node:fs'
import { parseWorkbook, patchColumn, csvToRows } from '../lib/xlsx.mjs'

const three = readFileSync(new URL('../samples/roster-3.xlsx', import.meta.url))
const book = parseWorkbook(three)
console.log('sheets', book.sheetNames)
for (const row of book.sheets[0].rows) console.log(JSON.stringify(row))

const patched = patchColumn(three, { headerRow: 2, headerText: '成绩', values: ['95', 88, 76] })
const after = parseWorkbook(patched)
console.log('after patch:')
for (const row of after.sheets[0].rows) console.log(JSON.stringify(row))

const csv = readFileSync(new URL('../samples/roster-30.csv', import.meta.url), 'utf8')
const csvRows = csvToRows(csv)
console.log('csv rows', csvRows.length, JSON.stringify(csvRows.slice(0, 3)))
