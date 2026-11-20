/**
 * Dependency-free XLSX (zip + SpreadsheetML) reader/writer for the roster-score plugin.
 *
 * Scope on purpose: read cell text for a roster, and append exactly one column to an
 * existing workbook while leaving every other column, row and zip entry intact.
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib'

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const EOCD = 0x06054b50

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Locate the End Of Central Directory record; tolerate trailing comment bytes. */
function findEocd(buffer) {
  const stop = Math.max(0, buffer.length - 0x10000)
  for (let i = buffer.length - 22; i >= stop; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) return i
  }
  throw new Error('not a zip file: end of central directory not found')
}

export function readZip(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const eocd = findEocd(buf)
  const count = buf.readUInt16LE(eocd + 10)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const entries = new Map()
  let cursor = cdOffset
  for (let index = 0; index < count; index += 1) {
    if (buf.readUInt32LE(cursor) !== CENTRAL) throw new Error('not a zip file: bad central directory')
    const method = buf.readUInt16LE(cursor + 10)
    const compressedSize = buf.readUInt32LE(cursor + 20)
    const nameLength = buf.readUInt16LE(cursor + 28)
    const extraLength = buf.readUInt16LE(cursor + 30)
    const commentLength = buf.readUInt16LE(cursor + 32)
    const localOffset = buf.readUInt32LE(cursor + 42)
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    if (buf.readUInt32LE(localOffset) !== LOCAL) throw new Error(`bad local header for ${name}`)
    const localName = buf.readUInt16LE(localOffset + 26)
    const localExtra = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localName + localExtra
    const raw = buf.subarray(dataStart, dataStart + compressedSize)
    entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw))
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export function writeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const compressed = deflateRawSync(data, { level: 6 })
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += 30 + name.length + compressed.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(EOCD, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

/** Concatenate every <t> run of one <si>/<is> node. */
function textRuns(xml) {
  let out = ''
  const pattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
  let match
  while ((match = pattern.exec(xml)) !== null) out += decodeXmlEntities(match[1])
  return out
}

function parseSharedStrings(xml) {
  const shared = []
  if (!xml) return shared
  const pattern = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g
  let match
  while ((match = pattern.exec(xml)) !== null) shared.push(textRuns(match[1]))
  return shared
}

function columnIndex(reference) {
  const letters = /^([A-Z]+)/.exec(reference.replace(/^\$/, ''))?.[1]
  if (!letters) return -1
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function columnName(index) {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const remainder = (n - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function resolveSheetPaths(entries) {
  const workbook = entries.get('xl/workbook.xml')
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')
  if (!workbook) throw new Error('not an xlsx workbook: xl/workbook.xml is missing')
  const rels = new Map()
  if (relsXml) {
    const relPattern = /<Relationship\b[^>]*>/g
    let rel
    while ((rel = relPattern.exec(relsXml.toString('utf8'))) !== null) {
      const id = /\bId="([^"]+)"/.exec(rel[0])?.[1]
      const target = /\bTarget="([^"]+)"/.exec(rel[0])?.[1]
      if (id && target) rels.set(id, target)
    }
  }
  const sheets = []
  const sheetPattern = /<sheet\b[^>]*>/g
  let sheet
  while ((sheet = sheetPattern.exec(workbook.toString('utf8'))) !== null) {
    const name = /\bname="([^"]*)"/.exec(sheet[0])?.[1] ?? `Sheet${sheets.length + 1}`
    const relId = /\br:id="([^"]+)"/.exec(sheet[0])?.[1]
    let target = relId ? rels.get(relId) : undefined
    if (!target) target = `worksheets/sheet${sheets.length + 1}.xml`
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`
    sheets.push({ name: decodeXmlEntities(name), path: target })
  }
  if (sheets.length === 0) sheets.push({ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' })
  return sheets
}

function parseSheetXml(xml, shared) {
  const rows = []
  const rowPattern = /<row\b([^>]*)>([\s\S]*?)<\/row>/g
  let row
  while ((row = rowPattern.exec(xml)) !== null) {
    const rowNumber = Number(/\br="(\d+)"/.exec(row[1])?.[1] ?? rows.length + 1)
    const cells = []
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cell
    while ((cell = cellPattern.exec(row[2])) !== null) {
      const attributes = cell[1]
      const body = cell[2] ?? ''
      const reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1]
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1]
      const index = reference ? columnIndex(reference) : cells.length
      const valueXml = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''
      const inlineXml = /<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? ''
      let value = ''
      if (type === 's') value = shared[Number(valueXml)] ?? ''
      else if (type === 'inlineStr') value = textRuns(inlineXml)
      else if (type === 'b') value = valueXml === '1' ? 'TRUE' : 'FALSE'
      else value = decodeXmlEntities(valueXml)
      while (cells.length < index) cells.push('')
      cells[index] = value
    }
    while (rows.length < rowNumber - 1) rows.push([])
    rows[rowNumber - 1] = cells
  }
  return trimRectangle(rows)
}

function trimRectangle(rows) {
  const out = rows.map((row) => [...row])
  for (const row of out) {
    while (row.length > 0 && row[row.length - 1] === '') row.pop()
  }
  while (out.length > 0 && out[out.length - 1].every((value) => value === '')) out.pop()
  return out
}

export function parseWorkbook(input) {
  const entries = readZip(input)
  const shared = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8'))
  const sheets = resolveSheetPaths(entries)
  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets: sheets.map((sheet, index) => {
      const xml = entries.get(sheet.path)
      if (!xml) throw new Error(`sheet ${sheet.name} is missing at ${sheet.path}`)
      return { name: sheet.name, index, rows: parseSheetXml(xml.toString('utf8'), shared) }
    }),
  }
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cellXml(reference, value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`
}

/**
 * Append one column to an existing workbook.
 * `headerRow` is 1-based; values[0] lands on headerRow + 1.
 */
export function patchColumn(input, options) {
  const { sheetName, headerRow, headerText, values } = options
  const entries = readZip(input)
  const sheets = resolveSheetPaths(entries)
  const sheet = sheetName ? sheets.find((candidate) => candidate.name === sheetName) : sheets[0]
  if (!sheet) throw new Error(`sheet not found: ${sheetName}`)
  const xml = entries.get(sheet.path)?.toString('utf8')
  if (!xml) throw new Error(`sheet ${sheet.name} is missing at ${sheet.path}`)

  let maxColumn = -1
  const cellPattern = /<c\b[^>]*\br="([A-Z]+)(\d+)"/g
  let cell
  while ((cell = cellPattern.exec(xml)) !== null) {
    const index = columnIndex(cell[1])
    if (index > maxColumn) maxColumn = index
  }
  const targetColumn = columnName(maxColumn + 1)

  const additions = new Map()
  if (headerRow > 0 && headerText) additions.set(headerRow, cellXml(`${targetColumn}${headerRow}`, headerText))
  values.forEach((value, index) => {
    const rowNumber = (headerRow > 0 ? headerRow : 0) + index + 1
    const xmlCell = cellXml(`${targetColumn}${rowNumber}`, value)
    if (xmlCell) additions.set(rowNumber, xmlCell)
  })

  const rows = []
  const rowBlock = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
  let block
  while ((block = rowBlock.exec(xml)) !== null) {
    const number = Number(/\br="(\d+)"/.exec(block[1])?.[1] ?? rows.length + 1)
    rows.push({ number, attributes: block[1], body: block[2] ?? '', selfClosing: block[2] === undefined })
  }
  const merged = new Map(rows.map((row) => [row.number, row]))
  for (const [rowNumber, xmlCell] of additions) {
    const target = merged.get(rowNumber)
    if (target) {
      target.body = target.selfClosing ? xmlCell : `${target.body}${xmlCell}`
      target.selfClosing = false
    } else {
      merged.set(rowNumber, { number: rowNumber, attributes: ` r="${rowNumber}"`, body: xmlCell, selfClosing: false })
    }
  }
  const sheetDataBody = [...merged.values()]
    .sort((left, right) => left.number - right.number)
    .map((row) => {
      const attributes = row.attributes.startsWith(' ') ? row.attributes : ` ${row.attributes}`
      return row.body ? `<row${attributes}>${row.body}</row>` : `<row${attributes}/>`
    })
    .join('')

  let patched = xml.replace(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/, `<sheetData>${sheetDataBody}</sheetData>`)
  if (patched === xml) patched = xml.replace('</worksheet>', `<sheetData>${sheetDataBody}</sheetData></worksheet>`)

  const lastRow = Math.max(headerRow, additions.size > 0 ? Math.max(...additions.keys()) : headerRow)
  patched = patched.replace(/<dimension ref="([^"]*?)([A-Z]+)(\d+)"\s*\/>/, (whole, prefix, column, row) => {
    const widened = columnIndex(column) > maxColumn + 1 ? column : targetColumn
    const rowEnd = Math.max(Number(row), lastRow)
    return `<dimension ref="${prefix}${widened}${rowEnd}"/>`
  })

  entries.set(sheet.path, Buffer.from(patched, 'utf8'))
  return writeZip([...entries].map(([name, data]) => ({ name, data })))
}

export function csvToRows(text) {
  const clean = text.replace(/^\uFEFF/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const candidates = ['\t', ',', ';']
  const delimiter = candidates.reduce((best, candidate) => {
    const count = firstLine.split(candidate).length - 1
    return count > best.count ? { candidate, count } : best
  }, { candidate: ',', count: -1 }).candidate

  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"'
          i += 1
        } else quoted = false
      } else field += char
      continue
    }
    if (char === '"' && field === '') quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  row.push(field)
  rows.push(row)
  return trimRectangle(rows)
}
