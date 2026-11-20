/**
 * Host half of the roster-score bundle.
 *
 * The Client panel speaks JSON to these routes. The Host owns everything stateful or
 * privileged: reading the dropped spreadsheet, asking the session's own model to parse the
 * roster, persisting the run, transcribing recorded scores through the Host speech service,
 * and writing the exported workbook back with one extra column.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { csvToRows, parseWorkbook, patchColumn } from './lib/xlsx.mjs'

const PREFIX = '/plugins/roster-score'
const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'roster-score')
const STATE_FILE = join(DATA_DIR, 'state.json')
const MAX_BODY_BYTES = 24 * 1024 * 1024

const DEFAULT_SETTINGS = {
  reverse: false,
  minScore: 0,
  maxScore: 100,
  scoreColumn: '成绩',
  readBack: 'name+score',
  maxRetries: 2,
  rate: 1,
  deviceId: '',
}

let queue = Promise.resolve()

function serialize(task) {
  const run = queue.then(task, task)
  queue = run.catch(() => {})
  return run
}

async function readState() {
  try {
    const text = await readFile(STATE_FILE, 'utf8')
    const state = JSON.parse(text)
    if (!state || !Array.isArray(state.records)) return null
    state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) }
    return state
  } catch {
    return null
  }
}

async function writeState(state) {
  await mkdir(DATA_DIR, { recursive: true })
  state.updatedAt = new Date().toISOString()
  const temporary = `${STATE_FILE}.temporary`
  await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8')
  await rename(temporary, STATE_FILE)
}

function view(state) {
  if (!state) return { empty: true, settings: DEFAULT_SETTINGS }
  return {
    empty: false,
    fileName: state.fileName,
    sheetName: state.sheetName,
    headerRows: state.headerRows,
    nameColumn: state.nameColumn,
    columns: state.columns,
    records: state.records.map((record, index) => ({
      id: record.id,
      index,
      name: record.name,
      cells: record.cells,
      score: record.score,
      skipped: record.skipped === true,
    })),
    settings: state.settings,
    warning: state.warning,
    updatedAt: state.updatedAt,
    // `text` marks a CSV/text source, whose export is rebuilt from stored rows.
    text: state.table ? true : false,
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body is too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('error', reject)
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('request body is not valid JSON'))
      }
    })
  })
}

function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(body.length),
  })
  response.end(body)
}

function readTextTable(fileName, bytes) {
  const extension = extname(fileName).toLowerCase()
  if (extension === '.csv' || extension === '.tsv' || extension === '.txt') {
    return { kind: 'text', rows: csvToRows(bytes.toString('utf8')) }
  }
  try {
    const book = parseWorkbook(bytes)
    const sheet = book.sheets[0]
    return { kind: 'xlsx', sheetName: sheet.name, rows: sheet.rows, sheetNames: book.sheetNames }
  } catch (error) {
    if (extension === '.xls') throw new Error('旧版 .xls 暂不支持，请另存为 .xlsx 或 .csv 后再拖入')
    throw new Error(`无法读取这个表格：${error.message}`)
  }
}

/** Heuristic roster parse used when the model is unavailable or returns nonsense. */
function heuristicRoster(rows) {
  const nameHeader = /^(姓名|名字|学生姓名|student\s*name|name)$/i
  let headerRows = 0
  let nameColumn = -1
  for (let index = 0; index < Math.min(rows.length, 8); index += 1) {
    const found = rows[index].findIndex((cell) => nameHeader.test(cell.trim()))
    if (found >= 0) {
      headerRows = index + 1
      nameColumn = found
      break
    }
  }
  if (nameColumn < 0) {
    headerRows = 1
    const widest = rows[0] || []
    nameColumn = widest.length > 1 ? 1 : 0
  }
  const width = Math.max(0, ...rows.map((row) => row.length))
  const columns = rows[headerRows - 1]?.length ? [...rows[headerRows - 1]] : []
  while (columns.length < width) columns.push('')
  const records = []
  for (let index = headerRows; index < rows.length; index += 1) {
    const cells = rows[index]
    const name = (cells[nameColumn] ?? '').trim()
    if (!name) continue
    records.push({ id: `r${records.length + 1}`, name, cells: [...cells], score: null })
  }
  return { headerRows, nameColumn, columns, records }
}

function modelPrompt(rows) {
  const lines = rows.map((row) => row.map((cell) => String(cell).replace(/\t/g, ' ')).join('\t'))
  return [
    '你是花名册解析器。下面是老师拖入的班级花名册表格，按行给出，单元格之间用制表符分隔。',
    '请判断：表头占了前几行（标题行 + 列名行），以及"姓名"在第几列（从 0 开始计数）。',
    '只返回严格 JSON，不要代码块，不要解释，格式：',
    '{"headerRows":2,"nameColumn":1,"columns":["学号","姓名","班级"],"rows":[{"name":"张伟","cells":["2024001","张伟","高一(3)班"]}]}',
    'rows 只包含学生数据行（不含标题或表头行），顺序与原文完全一致，cells 是该行原始的每个单元格文本。',
    '如果有同学姓名为空，保留该行并在 name 里填 ""。',
    '',
    '表格内容：',
    ...lines,
  ].join('\n')
}

function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON')
  return JSON.parse(candidate.slice(start, end + 1))
}

function normalizeModelRoster(parsed, rows) {
  const headerRows = Number.isInteger(parsed.headerRows) ? parsed.headerRows : 1
  const nameColumn = Number.isInteger(parsed.nameColumn) ? parsed.nameColumn : 1
  if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) throw new Error('模型没有返回学生行')
  const width = Math.max(0, ...rows.map((row) => row.length))
  const columns = Array.isArray(parsed.columns) ? parsed.columns.map(String) : []
  while (columns.length < width) columns.push('')
  const records = []
  for (const row of parsed.rows) {
    const cells = Array.isArray(row.cells) ? row.cells.map((cell) => String(cell ?? '')) : []
    const name = String(row.name ?? cells[nameColumn] ?? '').trim()
    records.push({ id: `r${records.length + 1}`, name, cells, score: null })
  }
  return { headerRows, nameColumn, columns, records }
}

async function askModel(ctx, rows) {
  const llm = ctx.get('llm')
  if (!llm) throw new Error('当前环境没有可用的语言模型服务')
  let provider
  let model
  const defaults = ctx.get('agentDefaultModel')?.currentSelection?.()
  if (defaults?.provider && defaults?.model) {
    provider = defaults.provider
    model = defaults.model
  } else {
    const providers = llm.listProviders()
    if (!providers.length) throw new Error('没有注册任何模型提供方')
    provider = providers[0].id
    const models = await llm.listModels(provider)
    if (!models.length) throw new Error('模型提供方没有返回可用模型')
    model = models[0].id
  }
  const chunks = llm.stream({
    provider,
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: modelPrompt(rows) }] }],
    maxTokens: 8000,
  })
  let text = ''
  for await (const chunk of chunks) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
      throw new Error(chunk.reason.failure?.message || '模型调用失败')
    }
  }
  return { parsed: extractJson(text), provider, model }
}

async function parseRoster(ctx, fileName, bytes) {
  const table = readTextTable(fileName, bytes)
  const rows = table.rows.filter((row) => row.some((cell) => String(cell).trim() !== ''))
  if (rows.length < 2) throw new Error('表格里没有找到可用的学生数据')
  let roster
  let by = 'heuristic'
  let note
  try {
    const { parsed } = await askModel(ctx, rows)
    roster = normalizeModelRoster(parsed, rows)
    by = 'model'
  } catch (error) {
    roster = heuristicRoster(rows)
    note = `模型解析失败，已按列名规则解析：${error.message}`
  }
  const width = Math.max(0, ...rows.map((row) => row.length))
  while (roster.columns.length < width) roster.columns.push('')
  const expected = rows.length - roster.headerRows
  const warning =
    note ||
    (roster.records.length !== expected
      ? `解析出 ${roster.records.length} 位学生，表里有 ${expected} 行数据，请核对后再录入`
      : undefined)
  return {
    ...roster,
    table: table.kind === 'text' ? rows : undefined,
    sheetName: table.sheetName,
    kind: table.kind,
    by,
    warning,
  }
}

function clampScore(settings, value) {
  const number = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(number)) return null
  if (number < settings.minScore || number > settings.maxScore) return null
  return number
}

async function exportWorkbook(state) {
  const values = state.records.map((record) => (record.score === null ? null : record.score))
  const headerRow = state.headerRows
  const columnName = state.settings.scoreColumn || '成绩'
  if (state.table) {
    const rows = state.table.map((row) => [...row])
    while (rows.length < headerRow + values.length) rows.push([])
    if (headerRow > 0) {
      const header = rows[headerRow - 1]
      header.push(columnName)
    }
    values.forEach((value, index) => {
      const row = rows[(headerRow > 0 ? headerRow : 0) + index]
      row.push(value === null ? '' : String(value))
    })
    const delimiter = state.fileName.toLowerCase().endsWith('.tsv') ? '\t' : ','
    const text = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? '')
            return /[",\n\r\t]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
          })
          .join(delimiter),
      )
      .join('\r\n')
    return { fileName: exportName(state.fileName, 'csv'), bytes: Buffer.from(`\uFEFF${text}`, 'utf8') }
  }
  const sourcePath = join(DATA_DIR, `source${extname(state.fileName) || '.xlsx'}`)
  if (!existsSync(sourcePath)) throw new Error('原始表格文件已丢失，请重新拖入')
  const source = await readFile(sourcePath)
  const patched = patchColumn(source, {
    sheetName: state.sheetName,
    headerRow,
    headerText: columnName,
    values,
  })
  const extension = extname(state.fileName) || '.xlsx'
  return { fileName: exportName(state.fileName, extension.slice(1)), bytes: patched }
}

function exportName(fileName, extension) {
  const stem = basename(fileName, extname(fileName))
  return `${stem}-成绩.${extension}`
}

async function speechSnapshot(ctx) {
  const speech = ctx.get('speechToText')
  if (!speech) return { available: false, providers: [] }
  const snapshot = speech.snapshot()
  return {
    available: true,
    selection: snapshot.selection,
    providers: snapshot.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      location: provider.location,
      languages: provider.languages,
      phase: provider.preparation?.phase,
      progress: provider.preparation?.phase === 'downloading' ? provider.preparation : undefined,
      message: provider.preparation?.phase === 'failed' ? provider.preparation.message : undefined,
    })),
  }
}

async function transcribe(ctx, audioBase64) {
  const speech = ctx.get('speechToText')
  if (!speech) throw new Error('当前环境没有语音识别服务')
  const audio = Buffer.from(audioBase64, 'base64')
  if (audio.length < 100) throw new Error('录音太短，请再说一次')
  const spec = speech.resolve({ audio: new Uint8Array(audio), language: 'zh' })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const transcript = await speech.transcribe(spec, controller.signal)
    return { text: transcript.text, audioSeconds: transcript.audioSeconds }
  } finally {
    clearTimeout(timer)
  }
}

async function routeState(ctx, response) {
  sendJson(response, 200, view(await readState()))
}

async function routeParse(ctx, request, response) {
  const body = await readBody(request)
  if (!body.fileName || !body.dataBase64) {
    sendJson(response, 400, { error: '缺少文件名或文件内容' })
    return
  }
  const bytes = Buffer.from(body.dataBase64, 'base64')
  if (bytes.length === 0) {
    sendJson(response, 400, { error: '文件是空的' })
    return
  }
  const parsed = await parseRoster(ctx, body.fileName, bytes)
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(join(DATA_DIR, `source${extname(body.fileName) || '.xlsx'}`), bytes)
  const state = {
    version: 1,
    fileName: body.fileName,
    headerRows: parsed.headerRows,
    nameColumn: parsed.nameColumn,
    columns: parsed.columns,
    records: parsed.records,
    table: parsed.table,
    sheetName: parsed.sheetName,
    settings: { ...DEFAULT_SETTINGS },
    warning: parsed.warning,
    parsedBy: parsed.by,
  }
  await writeState(state)
  sendJson(response, 200, view(state))
}

async function routeScore(request, response) {
  const body = await readBody(request)
  const state = await readState()
  if (!state) {
    sendJson(response, 409, { error: '还没有载入花名册' })
    return
  }
  const record = state.records.find((candidate) => candidate.id === body.id)
  if (!record) {
    sendJson(response, 404, { error: '找不到这位学生' })
    return
  }
  const value = body.score === null || body.score === '' ? null : clampScore(state.settings, body.score)
  if (value === null && body.score !== null && body.score !== '') {
    sendJson(response, 400, {
      error: `成绩需要在 ${state.settings.minScore} 到 ${state.settings.maxScore} 之间`,
    })
    return
  }
  record.score = value
  record.skipped = body.skipped === true
  await writeState(state)
  sendJson(response, 200, view(state))
}

async function routeSettings(request, response) {
  const body = await readBody(request)
  const state = await readState()
  if (!state) {
    sendJson(response, 409, { error: '还没有载入花名册' })
    return
  }
  const settings = { ...state.settings }
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (body.settings && key in body.settings) settings[key] = body.settings[key]
  }
  settings.minScore = Number(settings.minScore)
  settings.maxScore = Number(settings.maxScore)
  settings.maxRetries = Math.max(0, Math.min(5, Number(settings.maxRetries) || 0))
  settings.rate = Math.max(0.5, Math.min(2, Number(settings.rate) || 1))
  settings.reverse = settings.reverse === true
  settings.readBack = settings.readBack === 'score' ? 'score' : 'name+score'
  settings.deviceId = typeof settings.deviceId === 'string' ? settings.deviceId : ''
  state.settings = settings
  await writeState(state)
  sendJson(response, 200, view(state))
}

async function routeReset(ctx, response) {
  const state = await readState()
  if (state) {
    state.records = state.records.map((record) => ({ ...record, score: null, skipped: false }))
    await writeState(state)
  }
  sendJson(response, 200, view(state))
}

async function routeExport(response) {
  const state = await readState()
  if (!state) {
    sendJson(response, 409, { error: '还没有载入花名册' })
    return
  }
  const { fileName, bytes } = await exportWorkbook(state)
  sendJson(response, 200, { fileName, dataBase64: bytes.toString('base64') })
}

async function handle(ctx, request, response) {
  const url = new URL(request.url || '/', 'http://localhost')
  const path = url.pathname.slice(PREFIX.length) || '/'
  try {
    if (request.method === 'GET' && path === '/state') return await routeState(ctx, response)
    if (request.method === 'GET' && path === '/speech') return sendJson(response, 200, await speechSnapshot(ctx))
    if (request.method === 'POST' && path === '/parse') return await routeParse(ctx, request, response)
    if (request.method === 'POST' && path === '/score') return await routeScore(request, response)
    if (request.method === 'POST' && path === '/settings') return await routeSettings(request, response)
    if (request.method === 'POST' && path === '/reset') return await routeReset(ctx, response)
    if (request.method === 'POST' && path === '/export') return await routeExport(response)
    if (request.method === 'POST' && path === '/speech/prepare') {
      const body = await readBody(request)
      const speech = ctx.get('speechToText')
      if (!speech) return sendJson(response, 503, { error: '没有语音识别服务' })
      const provider = body.providerId || speech.snapshot().selection.providerId
      // The Client polls `/speech` for phase + progress, so start the preparation and answer at once.
      try {
        Promise.resolve(speech.prepare(provider)).catch(() => {})
      } catch {}
      return sendJson(response, 200, await speechSnapshot(ctx))
    }
    if (request.method === 'POST' && path === '/transcribe') {
      const body = await readBody(request)
      if (!body.audioBase64) return sendJson(response, 400, { error: '没有收到录音' })
      return sendJson(response, 200, { ok: true, ...(await transcribe(ctx, body.audioBase64)) })
    }
    sendJson(response, 404, { error: `unknown route ${path}` })
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (!webServer) {
    ctx.logger?.warn?.('[roster-score] webServer service is unavailable; the roster panel cannot reach the Host')
    return
  }
  const handler = (request, response) => serialize(() => handle(ctx, request, response))
  ctx.effect(() => webServer.register({ kind: 'prefix', path: PREFIX, handler }))
}
