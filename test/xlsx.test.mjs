import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readZip, writeZip, crc32, parseWorkbook, patchColumn, csvToRows } from '../lib/xlsx.mjs'

const sample = (name) => readFileSync(new URL(`../samples/${name}`, import.meta.url))

test('readZip / writeZip round-trips entry contents', () => {
  const bytes = sample('roster-3.xlsx')
  const entries = readZip(bytes)
  assert.ok(entries.has('xl/workbook.xml'))
  const again = readZip(writeZip([...entries].map(([name, data]) => ({ name, data }))))
  assert.deepEqual([...again.keys()], [...entries.keys()])
  for (const [name, data] of entries) assert.deepEqual(again.get(name), data)
})

test('crc32 matches the zip of a known payload', () => {
  assert.equal(crc32(Buffer.from('hello')), 0x3610a686)
})

test('parseWorkbook reads a real openpyxl roster', () => {
  const book = parseWorkbook(sample('roster-3.xlsx'))
  assert.deepEqual(book.sheetNames, ['成绩录入'])
  const rows = book.sheets[0].rows
  assert.equal(rows[0][0], '高一(3)班 第一次月考 成绩单')
  assert.deepEqual(rows[1], ['学号', '姓名', '班级'])
  assert.equal(rows[2][1], '张伟')
  assert.equal(rows.length, 5)
})

test('parseWorkbook reads thirty students', () => {
  const rows = parseWorkbook(sample('roster-30.xlsx')).sheets[0].rows
  assert.equal(rows.length, 32)
  assert.equal(rows[31][1], '肖涵')
})

test('patchColumn appends one column and keeps the rest', () => {
  const patched = patchColumn(sample('roster-3.xlsx'), {
    headerRow: 2,
    headerText: '成绩',
    values: [95, 88, 76],
  })
  const rows = parseWorkbook(patched).sheets[0].rows
  assert.equal(rows[0][0], '高一(3)班 第一次月考 成绩单')
  assert.deepEqual(rows[1], ['学号', '姓名', '班级', '成绩'])
  assert.deepEqual(rows[2], ['2024001', '张伟', '高一(3)班', '95'])
  assert.deepEqual(rows[4], ['2024003', '王浩', '高一(3)班', '76'])
})

test('patchColumn on thirty rows and a null keeps alignment', () => {
  const values = Array.from({ length: 30 }, (_, index) => (index === 4 ? null : 60 + index))
  const rows = parseWorkbook(
    patchColumn(sample('roster-30.xlsx'), { headerRow: 2, headerText: '成绩', values }),
  ).sheets[0].rows
  assert.equal(rows[1][3], '成绩')
  assert.equal(rows[2][3], '60')
  assert.equal(rows[6][3] ?? '', '') // index 4 (row 7) was null
  assert.equal(rows[7][3], '65')
  assert.equal(rows[31][3], '89')
})

test('patchColumn rejects a sheet name that does not exist', () => {
  assert.throws(() => patchColumn(sample('roster-3.xlsx'), { sheetName: 'nope', headerRow: 2, headerText: '成绩', values: [] }))
})

test('csvToRows strips the BOM and parses thirty students', () => {
  const rows = csvToRows(sample('roster-30.csv').toString('utf8'))
  assert.equal(rows.length, 31)
  assert.deepEqual(rows[0], ['学号', '姓名', '班级'])
  assert.equal(rows[30][1], '肖涵')
})

test('csvToRows supports quoted delimiters and newlines', () => {
  const rows = csvToRows('name,score\n"张, 伟",90\n"李\n娜",88\n')
  assert.deepEqual(rows, [['name', 'score'], ['张, 伟', '90'], ['李\n娜', '88']])
})

test('a non-zip input is rejected', () => {
  assert.throws(() => readZip(Buffer.from('definitely not a workbook')), /not a zip file/)
})
