/**
 * Unit tests for the Client's pure scoring helpers.
 *
 * The Client half is a browser bundle (`window.__ModuleLoader__.load(...)`), so the helpers
 * cannot be imported. They sit between two markers and are evaluated here as plain code.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const start = source.indexOf('/* @pure-utils-start */')
const end = source.indexOf('/* @pure-utils-end */')
assert.ok(start > 0 && end > start, 'pure utils markers are present')

const helpers = new Function(`${source.slice(start, end)}; return { parseScore, chineseNumber }`)()

test('reads an Arabic number', () => {
  assert.equal(helpers.parseScore('95', 0, 100), 95)
  assert.equal(helpers.parseScore('85分', 0, 100), 85)
  assert.equal(helpers.parseScore('我考了93', 0, 100), 93)
})

test('reads full-width Arabic digits', () => {
  assert.equal(helpers.parseScore('９５', 0, 100), 95)
})

test('reads a Chinese number', () => {
  assert.equal(helpers.parseScore('八十五', 0, 100), 85)
  assert.equal(helpers.parseScore('一百分', 0, 100), 100)
  assert.equal(helpers.parseScore('一百零五', 0, 200), 105)
  assert.equal(helpers.parseScore('两', 0, 100), 2)
  assert.equal(helpers.parseScore('二十分', 0, 100), 20)
})

test('reads digit-by-digit Chinese', () => {
  assert.equal(helpers.parseScore('八五', 0, 100), 85)
})

test('reads a decimal score', () => {
  assert.equal(helpers.parseScore('九十五点五', 0, 100), 95.5)
  assert.equal(helpers.parseScore('95.5分', 0, 100), 95.5)
})

test('rejects out-of-range and meaningless input', () => {
  assert.equal(helpers.parseScore('150', 0, 100), null)
  assert.equal(helpers.parseScore('没听清', 0, 100), null)
  assert.equal(helpers.parseScore('', 0, 100), null)
  assert.equal(helpers.parseScore(null, 0, 100), null)
})

test('honours a custom range', () => {
  assert.equal(helpers.parseScore('150', 0, 200), 150)
  assert.equal(helpers.parseScore('九十八', 0, 120), 98)
})
