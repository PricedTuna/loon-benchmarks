import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import PQueue from 'p-queue'
import { stringify as stringifyCSV } from 'csv-stringify/sync'
import { stringify as stringifyYAML } from 'yaml'
import { encode as encodeToon } from '@toon-format/toon'
import { BENCHMARKS_DIR, ROOT_DIR } from '../src/constants.ts'
import { ensureDir, getMachineInfo } from '../src/utils.ts'
import fsDriver from 'unstorage/drivers/fs'
import { createStorage } from 'unstorage'
import { tron } from '../../extra-formats/Tron-Core/dist/index.mjs'

/**
 * Gemini multi-dataset benchmark.
 *
 * Auto-discovers every JSON file in benchmarks/data, extracts the primary
 * array of records, generates up to 8 questions per dataset (field-retrieval,
 * aggregation, filtering) with pre-computed ground truths, and runs every
 * format × every question through Gemini.
 *
 * Measures per dataset and combined:
 *   - Token counts: avg + total input / output / thinking (exact from Gemini API)
 *   - Encoded payload byte sizes
 *   - Retrieval accuracy and efficiency (acc% per 1 000 input tokens)
 */

// ── Model ─────────────────────────────────────────────────────────────────────

const MODEL_ID = 'gemini-3-flash-preview'
const model = google(MODEL_ID)
const CONCURRENCY = 5

// ── Dataset auto-discovery ────────────────────────────────────────────────────

const DATA_DIR = path.join(BENCHMARKS_DIR, 'data')

// Non-tabular files that cannot produce meaningful Q&A
const SKIP_FILES = new Set([
  'canada.json',           // GeoJSON geometry (no uniform records)
  'lorem-ipsum.json',      // text blobs, no structured fields
  'test-edge-cases.json',  // adversarial encoding test data
])

const MIN_ROWS = 5  // skip datasets smaller than this

interface Q {
  id: string
  prompt: string
  groundTruth: string
  type: 'field-retrieval' | 'aggregation' | 'filtering'
}

/**
 * Extract the primary flat array of objects from any JSON shape.
 * Handles: root array, single-key wrapper, multi-key (picks largest array).
 */
function extractRows(raw: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(raw)) {
    if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null && !Array.isArray(raw[0]))
      return raw as Record<string, unknown>[]
    return null
  }
  if (typeof raw === 'object' && raw !== null) {
    const entries = Object.entries(raw as Record<string, unknown>)
    if (entries.length === 1 && Array.isArray(entries[0]![1])) {
      const arr = entries[0]![1] as unknown[]
      if (arr.length > 0 && typeof arr[0] === 'object' && !Array.isArray(arr[0]))
        return arr as Record<string, unknown>[]
    }
    let best: Record<string, unknown>[] | null = null
    for (const [, v] of entries) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && !Array.isArray(v[0])) {
        if (!best || v.length > best.length) best = v as Record<string, unknown>[]
      }
    }
    return best
  }
  return null
}

/**
 * Auto-generate up to 8 questions for a flat tabular dataset.
 * Produces field-retrieval, aggregation, and filtering questions
 * with pre-computed ground truths derived from the data.
 */
function autoGenerateQuestions(rows: Record<string, unknown>[], prefix: string): Q[] {
  if (rows.length === 0) return []
  const fields = Object.keys(rows[0]!)

  let idField: string | null = null
  const numericFields: string[] = []
  const catFields: string[] = []  // low-cardinality string fields
  const strFields: string[] = []

  for (const f of fields) {
    const vals = rows.map(r => r[f]).filter(v => v !== null && v !== undefined)
    if (vals.length === 0) continue
    const first = vals[0]

    if (typeof first === 'number') {
      numericFields.push(f)
      if ((f === 'id' || f.endsWith('_id')) && !idField) idField = f
    } else if (typeof first === 'string') {
      strFields.push(f)
      if ((f === 'id' || f === 'code' || f === 'symbol' || f === 'abbreviation') && !idField)
        idField = f
      const unique = new Set(vals)
      if (unique.size >= 2 && unique.size <= Math.min(25, rows.length * 0.4))
        catFields.push(f)
    }
  }

  // Prefer numeric id
  const numericId = fields.find(f =>
    (f === 'id' || f.endsWith('_id')) && typeof rows[0]![f] === 'number'
  )
  if (numericId) idField = numericId

  const questions: Q[] = []
  let qIdx = 1

  // ── Field retrieval by id ─────────────────────────────────────────────────
  const valueField = numericFields.find(f => f !== idField && f !== 'id')
    ?? numericFields.find(f => f !== idField)

  if (idField && valueField) {
    for (const fraction of [0.25, 0.75]) {
      if (questions.filter(q => q.type === 'field-retrieval').length >= 2) break
      const row = rows[Math.floor(rows.length * fraction)]!
      const id = row[idField]
      const val = row[valueField]
      if (id === undefined || val === undefined) continue
      const idStr = typeof id === 'string' ? `"${id}"` : String(id)
      questions.push({
        id: `${prefix}_q${qIdx++}`,
        prompt: `What is the ${valueField} of the record where ${idField} is ${idStr}?`,
        groundTruth: String(val),
        type: 'field-retrieval',
      })
    }
  }

  // ── Field retrieval by name when no id ────────────────────────────────────
  if (questions.filter(q => q.type === 'field-retrieval').length < 1) {
    const nameField = fields.find(f =>
      ['name', 'title', 'label', 'country', 'city', 'mountain', 'team'].includes(f)
    )
    const targetStrField = strFields.find(f => f !== nameField && !catFields.includes(f))
    if (nameField && targetStrField) {
      const row = rows[Math.floor(rows.length / 2)]!
      const name = row[nameField]
      const val = row[targetStrField]
      if (name && val) {
        questions.push({
          id: `${prefix}_q${qIdx++}`,
          prompt: `What is the ${targetStrField} of the record named "${name}"?`,
          groundTruth: String(val),
          type: 'field-retrieval',
        })
      }
    }
  }

  // ── Aggregation: max, min, total count ────────────────────────────────────
  const aggField = numericFields.find(f => f !== idField && f !== 'id') ?? numericFields[0]
  if (aggField) {
    const vals = rows.map(r => r[aggField]).filter((v): v is number => typeof v === 'number')
    if (vals.length > 0) {
      questions.push({
        id: `${prefix}_q${qIdx++}`,
        prompt: `What is the maximum ${aggField} across all records?`,
        groundTruth: String(Math.max(...vals)),
        type: 'aggregation',
      })
      questions.push({
        id: `${prefix}_q${qIdx++}`,
        prompt: `What is the minimum ${aggField} across all records?`,
        groundTruth: String(Math.min(...vals)),
        type: 'aggregation',
      })
    }
  }
  questions.push({
    id: `${prefix}_q${qIdx++}`,
    prompt: `How many total records are in this dataset?`,
    groundTruth: String(rows.length),
    type: 'aggregation',
  })

  // ── Filtering: count by category ──────────────────────────────────────────
  for (const f of catFields.slice(0, 2)) {
    if (questions.length >= 8) break
    const uniqueVals = [...new Set(rows.map(r => r[f] as string))]
    const targetVal = uniqueVals[Math.floor(uniqueVals.length / 2)]
    if (targetVal === undefined) continue
    const count = rows.filter(r => r[f] === targetVal).length
    questions.push({
      id: `${prefix}_q${qIdx++}`,
      prompt: `How many records have ${f} equal to "${targetVal}"?`,
      groundTruth: String(count),
      type: 'filtering',
    })
  }

  return questions.slice(0, 8)
}

interface DatasetDef {
  name: string
  rows: Record<string, unknown>[]
  questions: Q[]
}

// Load and validate all datasets
const allDataFiles = (await fsp.readdir(DATA_DIR))
  .filter(f => f.endsWith('.json') && !SKIP_FILES.has(f))
  .sort()

prompts.intro(`Loading datasets from ${DATA_DIR}…`)
const datasets: DatasetDef[] = []

for (const file of allDataFiles) {
  const raw: unknown = JSON.parse(await fsp.readFile(path.join(DATA_DIR, file), 'utf-8'))
  const rows = extractRows(raw)
  if (!rows || rows.length < MIN_ROWS) {
    prompts.log.warn(`  Skipping ${file}: not a tabular array (${rows?.length ?? 0} rows)`)
    continue
  }
  const name = file.replace('.json', '')
  const questions = autoGenerateQuestions(rows, name)
  if (questions.length < 3) {
    prompts.log.warn(`  Skipping ${file}: only ${questions.length} questions generated`)
    continue
  }
  prompts.log.info(`  ${file}: ${rows.length} rows, ${questions.length} questions`)
  datasets.push({ name, rows, questions })
}

if (datasets.length === 0) {
  prompts.log.error('No queryable datasets found')
  process.exit(1)
}

// ── TRON format spec (for tron-llm context) ───────────────────────────────────

const TRON_SPEC = await fsp.readFile(
  path.join(BENCHMARKS_DIR, 'format-docs', 'tron.md'),
  'utf-8',
)

// ── Format encoders ───────────────────────────────────────────────────────────

// TRON 2×2 matrix + warm-up strategy comparison:
//
//   Encoding mode × Spec context × Warm-up strategy
//
//   per-call  = spec + data bundled into every prompt (stateless, worst-case cost)
//   session   = spec + data sent as first turn; question as second turn
//               (simulates prompt-caching / session reuse — same API cost on stateless
//                Gemini, but reflects real savings with Anthropic cache or Gemini
//                Context Caching enabled)
//
//   tron              = transmission, no spec,  per-call
//   tron-spec         = transmission + spec,    per-call
//   tron-llm          = llm mode,    no spec,   per-call
//   tron-llm-spec     = llm mode   + spec,      per-call   ← recommended
//   tron-spec-session = transmission + spec,    session
//   tron-llm-spec-session = llm mode + spec,   session
type FormatId =
  | 'json-compact'
  | 'yaml'
  | 'csv'
  | 'toon'
  | 'tron'
  | 'tron-spec'
  | 'tron-llm'
  | 'tron-llm-spec'
  | 'tron-spec-session'
  | 'tron-llm-spec-session'

// Session formats use multi-turn messages (spec+data as prior turn, question as new turn)
const SESSION_FORMATS = new Set<FormatId>(['tron-spec-session', 'tron-llm-spec-session'])


function encodeFormat(id: FormatId, rows: unknown[]): string {
  switch (id) {
    case 'json-compact': return JSON.stringify(rows)
    case 'yaml': return stringifyYAML(rows)
    case 'csv': return stringifyCSV(rows as object[], { header: true })
    case 'toon': return encodeToon(rows)
    case 'tron':
    case 'tron-spec':
    case 'tron-spec-session': {
      tron.reset()
      return tron.toJSON(rows as Record<string, unknown>[])
    }
    case 'tron-llm':
    case 'tron-llm-spec':
    case 'tron-llm-spec-session': {
      tron.reset()
      return tron.toJSON(rows as Record<string, unknown>[], { mode: 'adaptive', target: 'llm' })
    }
  }
}

const FORMAT_LABELS: Record<FormatId, string> = {
  'json-compact': 'JSON compact',
  'yaml': 'YAML',
  'csv': 'CSV',
  'toon': 'TOON',
  'tron': 'TRON (transmission)',
  'tron-spec': 'TRON (transmission + spec, per-call)',
  'tron-llm': 'TRON (llm mode)',
  'tron-llm-spec': 'TRON (llm mode + spec, per-call)',
  'tron-spec-session': 'TRON (transmission + spec, session)',
  'tron-llm-spec-session': 'TRON (llm mode + spec, session)',
}

const FORMAT_PRIMERS: Record<FormatId, string> = {
  'json-compact': 'The data below is in JSON format.',
  'yaml': 'The data below is in YAML format.',
  'csv': 'The data below is in CSV format.',
  'toon': 'The data below is in TOON format.',
  'tron': 'The data below is in TRON format.',
  'tron-spec': 'The data below is in TRON format.',
  'tron-llm': 'The data below is in TRON format.',
  'tron-llm-spec': 'The data below is in TRON format.',
  'tron-spec-session': 'The data below is in TRON format.',
  'tron-llm-spec-session': 'The data below is in TRON format.',
}

const FORMAT_FENCE: Record<FormatId, string> = {
  'json-compact': 'json',
  'yaml': 'yaml',
  'csv': 'csv',
  'toon': 'toon',
  'tron': 'tron',
  'tron-spec': 'tron',
  'tron-llm': 'tron',
  'tron-llm-spec': 'tron',
  'tron-spec-session': 'tron',
  'tron-llm-spec-session': 'tron',
}

// Formats that include the TRON spec as context
const FORMAT_CONTEXT_PREFIX: Partial<Record<FormatId, string>> = {
  'tron-spec': TRON_SPEC,
  'tron-llm-spec': TRON_SPEC,
  'tron-spec-session': TRON_SPEC,
  'tron-llm-spec-session': TRON_SPEC,
}

const FORMAT_IDS: FormatId[] = [
  'json-compact',
  'yaml',
  'csv',
  'toon',
  'tron',
  'tron-spec',
  'tron-llm',
  'tron-llm-spec',
  'tron-spec-session',
  'tron-llm-spec-session',
]

// ── Answer comparison ─────────────────────────────────────────────────────────

function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/[$,€]/g, '').replace(/\s+/g, ' ')
}

function answersMatch(actual: string, expected: string): boolean {
  const a = normalizeAnswer(actual)
  const e = normalizeAnswer(expected)
  if (a === e) return true
  // numeric comparison with tolerance
  const na = Number(a.replace(/[^0-9.-]/g, ''))
  const ne = Number(e.replace(/[^0-9.-]/g, ''))
  if (!Number.isNaN(na) && !Number.isNaN(ne)) {
    return Math.abs(na - ne) <= Math.max(Math.abs(ne) * 1e-4, 0.01)
  }
  return false
}

// ── Result types ──────────────────────────────────────────────────────────────

interface QuestionResult {
  questionId: string
  formatId: FormatId
  expected: string
  actual: string
  isCorrect: boolean
  inputTokens: number      // exact — reported by Gemini API (prompt tokens)
  outputTokens: number     // exact — reported by Gemini API (completion tokens)
  reasoningTokens: number  // thinking tokens (thoughtsTokenCount via usage.reasoningTokens)
  latencyMs: number
}

interface DatasetReport {
  datasetName: string
  rowCount: number
  questions: Q[]
  formatBytes: Record<FormatId, number>  // encoded payload byte size
  questionResults: QuestionResult[]
}

// ── Run benchmark ─────────────────────────────────────────────────────────────

prompts.intro(`Gemini Multi-dataset Benchmark  (model: ${MODEL_ID})`)
prompts.log.info(`Datasets: ${datasets.map(d => `${d.name} (${d.rows.length} rows, ${d.questions.length}q)`).join(', ')}`)

const queue = new PQueue({ concurrency: CONCURRENCY })

async function runDataset(
  datasetName: string,
  rows: unknown[],
  questions: Q[],
): Promise<DatasetReport> {
  prompts.log.step(`Dataset: ${datasetName} (${rows.length} rows, ${questions.length} questions × ${FORMAT_IDS.length} formats)`)

  // 1. Encode all formats, record byte sizes
  const formatBytes: Record<string, number> = {}
  const encoded: Record<string, string> = {}

  prompts.log.step(`  Encoding formats…`)
  for (const fmtId of FORMAT_IDS) {
    const text = encodeFormat(fmtId, rows)
    encoded[fmtId] = text
    formatBytes[fmtId] = Buffer.byteLength(text, 'utf-8')
  }

  // 2. Run accuracy questions
  prompts.log.step(`  Sending ${questions.length * FORMAT_IDS.length} prompts to Gemini…`)

  const questionResults: QuestionResult[] = []
  const tasks: Array<() => Promise<void>> = []

  for (const fmtId of FORMAT_IDS) {
    for (const q of questions) {
      tasks.push(async () => {
        const primer = FORMAT_PRIMERS[fmtId]
        const fence = FORMAT_FENCE[fmtId]
        const contextPrefix = FORMAT_CONTEXT_PREFIX[fmtId]
        const isSession = SESSION_FORMATS.has(fmtId)

        const contextBlock = contextPrefix
          ? `${contextPrefix.trim()}\n\n---\n\n`
          : ''

        const answerInstructions = `Answer format requirements:
- Provide only the value itself, no explanation
- For numbers: output digits only (no commas, currency symbols, or units)
- For strings: use the exact value from the data
- For lists: output comma-separated values`

        const t0 = performance.now()
        let actual = ''
        let inputTokens = 0
        let outputTokens = 0
        let reasoningTokens = 0

        try {
          if (isSession) {
            // Session mode: spec+data as first turn, question as second turn.
            // Simulates prompt-caching / context reuse — same API cost on stateless
            // Gemini, but reflects real savings with Anthropic cache or Gemini
            // Context Caching enabled.
            const { text, usage } = await generateText({
              model,
              messages: [
                {
                  role: 'user',
                  content: `${contextBlock}${primer}\n\n\`\`\`${fence}\n${encoded[fmtId]}\n\`\`\`\n\nAcknowledge the data is loaded and you are ready to answer questions.`,
                },
                {
                  role: 'assistant',
                  content: 'Data loaded and ready for questions.',
                },
                {
                  role: 'user',
                  content: `Question: ${q.prompt}\n\n${answerInstructions}\n\nAnswer:`,
                },
              ],
            })
            actual = text.trim()
            inputTokens = usage.inputTokens ?? 0
            outputTokens = usage.outputTokens ?? 0
            reasoningTokens = (usage as any).reasoningTokens ?? 0
          }
          else {
            const prompt = `${contextBlock}${primer}

\`\`\`${fence}
${encoded[fmtId]}
\`\`\`

Question: ${q.prompt}

${answerInstructions}

Answer:`.trim()

            const { text, usage } = await generateText({ model, prompt })
            actual = text.trim()
            inputTokens = usage.inputTokens ?? 0
            outputTokens = usage.outputTokens ?? 0
            reasoningTokens = (usage as any).reasoningTokens ?? 0
          }
        }
        catch (err) {
          actual = `ERROR: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`
        }

        questionResults.push({
          questionId: q.id,
          formatId: fmtId,
          expected: q.groundTruth,
          actual,
          isCorrect: answersMatch(actual, q.groundTruth),
          inputTokens,
          outputTokens,
          reasoningTokens,
          latencyMs: performance.now() - t0,
        })
      })
    }
  }

  let done = 0
  const total = tasks.length
  await Promise.all(
    tasks.map(t =>
      queue.add(async () => {
        await t()
        done++
        if (done % 5 === 0 || done === total)
          prompts.log.step(`  Progress: ${done}/${total}`)
      }),
    ),
  )

  return { datasetName, rowCount: rows.length, questions, formatBytes: formatBytes as Record<FormatId, number>, questionResults }
}

export const resultsStorage = createStorage({
  driver: fsDriver({
    base: path.join(BENCHMARKS_DIR, 'results', 'accuracy', 'models'),
  }),
})

// Run all datasets
const reports: DatasetReport[] = []
for (const ds of datasets) {
  const report = await runDataset(ds.name, ds.rows, ds.questions)
  reports.push(report)
}

resultsStorage.setItem(MODEL_ID, reports)

// ── Render helpers ────────────────────────────────────────────────────────────

function avgTokens(results: QuestionResult[], fmtId: FormatId, field: 'inputTokens' | 'outputTokens' | 'reasoningTokens'): number {
  const r = results.filter(x => x.formatId === fmtId)
  return r.length > 0 ? Math.round(r.reduce((s, x) => s + x[field], 0) / r.length) : 0
}

function sumTokens(results: QuestionResult[], fmtId: FormatId, field: 'inputTokens' | 'outputTokens' | 'reasoningTokens'): number {
  return results.filter(x => x.formatId === fmtId).reduce((s, x) => s + x[field], 0)
}

function makeBar(fraction: number, width = 20): string {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// ── Token table with averages + totals ─────────────────────────────────────────

function renderTokenTable(report: DatasetReport): string {
  const lines: string[] = []
  const nQ = [...new Set(report.questionResults.map(r => r.questionId))].length
  const baselineAvg = avgTokens(report.questionResults, 'json-compact', 'inputTokens')

  lines.push(`| Format | Bytes | Avg input | Total input (${nQ}q) | Avg thinking | Total thinking | Avg output | vs baseline |`)
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`)

  for (const fmtId of FORMAT_IDS) {
    const bytes = report.formatBytes[fmtId]
    const avgIn  = avgTokens(report.questionResults, fmtId, 'inputTokens')
    const totIn  = sumTokens(report.questionResults, fmtId, 'inputTokens')
    const avgTh  = avgTokens(report.questionResults, fmtId, 'reasoningTokens')
    const totTh  = sumTokens(report.questionResults, fmtId, 'reasoningTokens')
    const avgOut = avgTokens(report.questionResults, fmtId, 'outputTokens')
    const pct    = baselineAvg > 0 ? (((avgIn - baselineAvg) / baselineAvg) * 100) : null
    const pctStr = fmtId === 'json-compact'
      ? '_(baseline)_'
      : pct === null ? 'n/a' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`

    lines.push(
      `| ${FORMAT_LABELS[fmtId]} | ${(bytes / 1024).toFixed(1)} KB` +
      ` | ${avgIn.toLocaleString()} | ${totIn.toLocaleString()}` +
      ` | ${avgTh > 0 ? avgTh.toLocaleString() : '—'} | ${totTh > 0 ? totTh.toLocaleString() : '—'}` +
      ` | ${avgOut > 0 ? avgOut.toLocaleString() : '—'} | ${pctStr} |`
    )
  }

  return lines.join('\n')
}

// ── Accuracy table ─────────────────────────────────────────────────────────────

function renderAccuracyTable(report: DatasetReport): string {
  const lines: string[] = []
  lines.push(`| Format | Correct | Total | Accuracy | Avg input | Total input | Avg thinking | Avg latency |`)
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`)

  for (const fmtId of FORMAT_IDS) {
    const fmtResults = report.questionResults.filter(r => r.formatId === fmtId)
    const correct  = fmtResults.filter(r => r.isCorrect).length
    const total    = fmtResults.length
    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 'n/a'
    const avgIn    = avgTokens(fmtResults, fmtId, 'inputTokens')
    const totIn    = sumTokens(fmtResults, fmtId, 'inputTokens')
    const avgTh    = avgTokens(fmtResults, fmtId, 'reasoningTokens')
    const avgLat   = fmtResults.length > 0
      ? (fmtResults.reduce((s, r) => s + r.latencyMs, 0) / fmtResults.length / 1000).toFixed(2)
      : '0'

    lines.push(
      `| ${FORMAT_LABELS[fmtId]} | ${correct} | ${total} | ${accuracy}%` +
      ` | ${avgIn.toLocaleString()} | ${totIn.toLocaleString()}` +
      ` | ${avgTh > 0 ? avgTh.toLocaleString() : '—'} | ${avgLat}s |`
    )
  }

  return lines.join('\n')
}

// ── Efficiency ranking chart (acc% / 1K input tokens — higher is better) ───────

function renderEfficiencyChart(report: DatasetReport): string {
  const rows: Array<{ label: string; eff: number; acc: number; avgIn: number; tpc: number }> = []

  for (const fmtId of FORMAT_IDS) {
    const fmtResults = report.questionResults.filter(r => r.formatId === fmtId)
    const correct  = fmtResults.filter(r => r.isCorrect).length
    const total    = fmtResults.length
    const acc      = total > 0 ? (correct / total) * 100 : 0
    const avgIn    = avgTokens(fmtResults, fmtId, 'inputTokens')
    const eff      = avgIn > 0 ? (acc / (avgIn / 1000)) : 0
    const tpc      = correct > 0 ? Math.round(avgIn / correct) : 0
    rows.push({ label: FORMAT_LABELS[fmtId], eff, acc, avgIn, tpc })
  }

  rows.sort((a, b) => b.eff - a.eff)
  const maxEff = Math.max(...rows.map(r => r.eff))

  const lines: string[] = []
  for (const r of rows) {
    const bar    = makeBar(maxEff > 0 ? r.eff / maxEff : 0)
    const effStr = r.eff.toFixed(1).padStart(5)
    const accStr = r.acc.toFixed(1).padStart(5) + '%'
    const tpcStr = r.tpc > 0 ? r.tpc.toLocaleString() : 'n/a'
    lines.push(`${r.label.padEnd(42)} ${bar}  ${effStr} acc%/1K tok  │  ${accStr} acc  │  ${tpcStr} tok/correct`)
  }

  return '```\n' + lines.join('\n') + '\n```'
}

// ── Token usage chart (avg input tokens — shorter bar = fewer tokens) ──────────

function renderTokenUsageChart(report: DatasetReport): string {
  const rows: Array<{ label: string; avgIn: number; totIn: number; pct: number | null }> = []
  const baselineAvg = avgTokens(report.questionResults, 'json-compact', 'inputTokens')

  for (const fmtId of FORMAT_IDS) {
    const avgIn = avgTokens(report.questionResults, fmtId, 'inputTokens')
    const totIn = sumTokens(report.questionResults, fmtId, 'inputTokens')
    const pct   = baselineAvg > 0 ? ((avgIn - baselineAvg) / baselineAvg) * 100 : null
    rows.push({ label: FORMAT_LABELS[fmtId], avgIn, totIn, pct })
  }

  const maxIn = Math.max(...rows.map(r => r.avgIn))

  const lines: string[] = []
  for (const r of rows) {
    const bar    = makeBar(maxIn > 0 ? r.avgIn / maxIn : 0)
    const pctStr = r.pct === null
      ? ' baseline '
      : (r.pct >= 0 ? `+${r.pct.toFixed(1)}%` : `${r.pct.toFixed(1)}%`).padStart(8)
    lines.push(`${r.label.padEnd(42)} ${bar}  ${pctStr}  │  avg ${r.avgIn.toLocaleString().padStart(7)}  │  total ${r.totIn.toLocaleString()}`)
  }

  return '```\n' + lines.join('\n') + '\n```'
}

// ── Accuracy by question type ──────────────────────────────────────────────────

function renderByQuestionType(report: DatasetReport, questions: Q[]): string {
  const types = ['field-retrieval', 'aggregation', 'filtering'] as const
  const lines: string[] = []

  const header = `| Format | Field Retrieval | Aggregation | Filtering | Overall |`
  const sep    = `| --- | --- | --- | --- | --- |`
  lines.push(header, sep)

  for (const fmtId of FORMAT_IDS) {
    const cols: string[] = [FORMAT_LABELS[fmtId]]
    let totalCorrect = 0, totalTotal = 0

    for (const qt of types) {
      const qIds = questions.filter(q => q.type === qt).map(q => q.id)
      const res  = report.questionResults.filter(r => r.formatId === fmtId && qIds.includes(r.questionId))
      const c    = res.filter(r => r.isCorrect).length
      const n    = res.length
      totalCorrect += c; totalTotal += n
      cols.push(n > 0 ? `${c}/${n} (${((c / n) * 100).toFixed(0)}%)` : '—')
    }

    const allRes = report.questionResults.filter(r => r.formatId === fmtId)
    const allC   = allRes.filter(r => r.isCorrect).length
    const allN   = allRes.length
    cols.push(allN > 0 ? `${allC}/${allN} (${((allC / allN) * 100).toFixed(0)}%)` : '—')
    lines.push(`| ${cols.join(' | ')} |`)
  }

  return lines.join('\n')
}

// ── Combined summary across all datasets ─────────────────────────────────────

function renderCombinedSummary(
  reports: DatasetReport[],
): string {
  const allResults = reports.flatMap(r => r.questionResults)
  const baselineAvg = avgTokens(allResults, 'json-compact', 'inputTokens')
  const nQ = allResults.filter(r => r.formatId === FORMAT_IDS[0]).length

  // Efficiency chart
  const effRows: Array<{ fmtId: FormatId; label: string; eff: number; acc: number; tpc: number; avgIn: number; totIn: number }> = []

  for (const fmtId of FORMAT_IDS) {
    const res     = allResults.filter(r => r.formatId === fmtId)
    const correct = res.filter(r => r.isCorrect).length
    const total   = res.length
    const acc     = total > 0 ? (correct / total) * 100 : 0
    const avgIn   = res.length > 0 ? Math.round(res.reduce((s, r) => s + r.inputTokens, 0) / res.length) : 0
    const totIn   = res.reduce((s, r) => s + r.inputTokens, 0)
    const eff     = avgIn > 0 ? (acc / (avgIn / 1000)) : 0
    const tpc     = correct > 0 ? Math.round(avgIn / correct) : 0
    effRows.push({ fmtId, label: FORMAT_LABELS[fmtId], eff, acc, tpc, avgIn, totIn })
  }

  effRows.sort((a, b) => b.eff - a.eff)
  const maxEff = Math.max(...effRows.map(r => r.eff))
  const winner = effRows[0]!

  const chartLines: string[] = []
  for (const r of effRows) {
    const bar = makeBar(maxEff > 0 ? r.eff / maxEff : 0)
    chartLines.push(
      `${r.label.padEnd(42)} ${bar}  ${r.eff.toFixed(1).padStart(5)} acc%/1K tok` +
      `  │  ${r.acc.toFixed(1).padStart(5)}% acc` +
      `  │  ${r.tpc > 0 ? r.tpc.toLocaleString() : 'n/a'} tok/correct`
    )
  }

  // Totals table
  const tableLines: string[] = []
  tableLines.push(`| Format | Avg input | Total input (${nQ}q) | Avg thinking | Total thinking | Total output | Overall accuracy |`)
  tableLines.push(`| --- | --- | --- | --- | --- | --- | --- |`)

  for (const fmtId of FORMAT_IDS) {
    const res     = allResults.filter(r => r.formatId === fmtId)
    const correct = res.filter(r => r.isCorrect).length
    const total   = res.length
    const acc     = total > 0 ? `${correct}/${total} (${((correct / total) * 100).toFixed(1)}%)` : 'n/a'
    const avgIn   = res.length > 0 ? Math.round(res.reduce((s, r) => s + r.inputTokens, 0) / res.length) : 0
    const totIn   = res.reduce((s, r) => s + r.inputTokens, 0)
    const avgTh   = res.length > 0 ? Math.round(res.reduce((s, r) => s + r.reasoningTokens, 0) / res.length) : 0
    const totTh   = res.reduce((s, r) => s + r.reasoningTokens, 0)
    const totOut  = res.reduce((s, r) => s + r.outputTokens, 0)
    const pct     = baselineAvg > 0 ? ((avgIn - baselineAvg) / baselineAvg * 100) : null
    const pctStr  = fmtId === 'json-compact' ? '' : (pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : '')

    tableLines.push(
      `| ${FORMAT_LABELS[fmtId]}` +
      ` | ${avgIn.toLocaleString()}${pctStr}` +
      ` | ${totIn.toLocaleString()}` +
      ` | ${avgTh > 0 ? avgTh.toLocaleString() : '—'}` +
      ` | ${totTh > 0 ? totTh.toLocaleString() : '—'}` +
      ` | ${totOut > 0 ? totOut.toLocaleString() : '—'}` +
      ` | ${acc} |`
    )
  }

  return (
    `### Efficiency Ranking (accuracy % per 1 000 input tokens — higher is better)\n\n` +
    `*Combined across ${reports.length} datasets (${nQ} questions total). Efficiency = accuracy% ÷ (avg_input / 1000).*\n\n` +
    `\`\`\`\n${chartLines.join('\n')}\n\`\`\`\n\n` +
    `> [!TIP]\n` +
    `> **${winner.label}** achieves the best combined efficiency: most correct answers per token spent (${winner.eff.toFixed(1)} acc%/1K tok, ${winner.acc.toFixed(1)}% accuracy).\n\n` +
    `### Combined Totals & Averages\n\n` +
    tableLines.join('\n') + '\n\n' +
    `> Token counts are exact values reported by the Gemini API. ` +
    `"Total" = sum across all ${nQ} questions × ${reports.length} datasets. "Avg" = per-question average. ` +
    `Thinking tokens = reasoning tokens used internally by the model (not billed the same way on all APIs).`
  )
}

// ── Efficiency table ───────────────────────────────────────────────────────────

function renderEfficiencyTable(report: DatasetReport): string {
  const lines: string[] = []
  lines.push(`| Format | Avg input | Total input | Accuracy | Tok/correct answer |`)
  lines.push(`| --- | --- | --- | --- | --- |`)

  for (const fmtId of FORMAT_IDS) {
    const fmtResults = report.questionResults.filter(r => r.formatId === fmtId)
    const avgIn   = avgTokens(fmtResults, fmtId, 'inputTokens')
    const totIn   = sumTokens(fmtResults, fmtId, 'inputTokens')
    const correct = fmtResults.filter(r => r.isCorrect).length
    const total   = fmtResults.length
    const acc     = total > 0 ? ((correct / total) * 100).toFixed(1) + '%' : 'n/a'
    const tpc     = (avgIn > 0 && correct > 0) ? Math.round(avgIn / correct).toLocaleString() : 'n/a'

    lines.push(`| ${FORMAT_LABELS[fmtId]} | ${avgIn.toLocaleString()} | ${totIn.toLocaleString()} | ${acc} | ${tpc} |`)
  }

  return lines.join('\n')
}

// ── Per-question detail ────────────────────────────────────────────────────────

function renderQuestionDetail(report: DatasetReport, questions: Q[]): string {
  const lines: string[] = []

  for (const q of questions) {
    lines.push(`\n**${q.id}**: ${q.prompt}  `)
    lines.push(`_Expected: \`${q.groundTruth}\`_ — type: \`${q.type}\`\n`)
    lines.push(`| Format | Answer | Correct |`)
    lines.push(`| --- | --- | --- |`)
    for (const fmtId of FORMAT_IDS) {
      const r    = report.questionResults.find(x => x.questionId === q.id && x.formatId === fmtId)
      const icon = !r ? '—' : r.isCorrect ? '✅' : '❌'
      const ans  = r ? `\`${r.actual.slice(0, 60)}\`` : '—'
      lines.push(`| ${FORMAT_LABELS[fmtId]} | ${ans} | ${icon} |`)
    }
  }

  return lines.join('\n')
}

// ── Per-dataset section ────────────────────────────────────────────────────────

function renderDatasetSection(report: DatasetReport): string {
  const nQ = report.questions.length
  const fields = Object.keys(report.questions.length > 0 ? {} : {})
  void fields

  return `## Dataset: ${report.datasetName} (${report.rowCount} rows)

### Token counts (avg per question + total across ${nQ} questions)

${renderTokenTable(report)}

> Token counts are exact values reported by the Gemini API (usage.inputTokens). Per-call formats bundle spec+data into every prompt. Session formats simulate prompt-caching: spec+data sent as a prior turn, question as a new turn — same API cost on stateless Gemini, but reflects real savings when Anthropic cache or Gemini Context Caching is enabled. Thinking tokens = usage.reasoningTokens (thoughtsTokenCount from Gemini).

### Token usage (avg input — shorter bar = fewer tokens)

${renderTokenUsageChart(report)}

### Accuracy

${renderAccuracyTable(report)}

### Accuracy by question type

${renderByQuestionType(report, report.questions)}

### Token efficiency

${renderEfficiencyTable(report)}

### Efficiency ranking

${renderEfficiencyChart(report)}

*Efficiency = accuracy% ÷ (avg_input_tokens / 1 000). Higher is better: more correct answers per token spent.*

<details>
<summary><strong>Per-question answers (${nQ} questions)</strong></summary>

${renderQuestionDetail(report, report.questions)}

</details>`
}

// ── Markdown assembly ──────────────────────────────────────────────────────────
const totalQuestions = reports.reduce((s, r) => s + r.questions.length, 0)
const totalApiCalls  = totalQuestions * FORMAT_IDS.length

const markdown = `# Gemini Multi-dataset Benchmark

${getMachineInfo()}

**Model**: \`${MODEL_ID}\`
**Datasets**: ${datasets.map(d => `${d.name} (${d.rows.length} rows)`).join(', ')}
**Questions**: ${totalQuestions} total (auto-generated per dataset) × ${FORMAT_IDS.length} formats = ${totalApiCalls} API calls

#### What's Being Measured

Each format encodes the same dataset. The model receives the encoded data plus one question and must return only the answer value. This measures:

- **Token efficiency**: how many input tokens does each format require?
- **Accuracy**: does the model answer correctly despite the encoding?
- **Combined efficiency**: correct answers per 1 000 tokens spent (the only metric that balances both)

Thinking tokens are the model's internal reasoning budget. High thinking token counts on compressed formats indicate the model is spending extra effort decoding — a signal that the format is harder to read, even when it saves input tokens.

#### Question Types

- **field-retrieval**: direct value lookup — "What is the price of item 42?"
- **aggregation**: count / min / max — "How many items are in the 'electronics' category?"
- **filtering**: threshold filter — "How many items have a rating ≥ 4.5?"

#### Datasets Included

| Dataset | Rows | Questions |
| --- | --- | --- |
${datasets.map(d => `| ${d.name} | ${d.rows.length} | ${d.questions.length} |`).join('\n')}

---

## Combined Summary (all ${datasets.length} datasets)

${renderCombinedSummary(reports)}

---

${reports.map(report => renderDatasetSection(report)).join('\n\n---\n\n')}
`

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)
const outputPath = path.join(resultsDir, 'gemini-multi-dataset.md')
await fsp.writeFile(outputPath, markdown, 'utf-8')
prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputPath)}\``)
prompts.outro('Done')
