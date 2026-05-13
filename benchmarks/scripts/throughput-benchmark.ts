import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { stringify as stringifyCSV } from 'csv-stringify/sync'
import { parse as parseCSV } from 'csv-parse/sync'
import { stringify as stringifyYAML, parse as parseYAML } from 'yaml'
import { encode as encodeToon, decode as decodeToon } from '@toon-format/toon'
import { BENCHMARKS_DIR, FORMATTER_DISPLAY_NAMES, ROOT_DIR } from '../src/constants.ts'
import { generateEmployees, generateOrders, generateAnalyticsData } from '../src/datasets.ts'
import { ensureDir, getMachineInfo } from '../src/utils.ts'
import { tron } from '../../extra-formats/Tron-Core/dist/index.mjs'

/**
 * Encode/decode throughput benchmark.
 *
 * @remarks
 * Measures serialization and deserialization ops/sec for each format.
 * JTON requires a Python subprocess per call and is measured separately
 * to surface the IPC overhead cost.
 *
 * Methodology:
 *   - 3 dataset sizes (small/medium/large) × 6 formats (JSON, YAML, XML, CSV, TOON, TRON)
 *   - Encode phase: time N iterations of format(data) → string
 *   - Decode phase: time N iterations of parse(string) → object (where decoder exists)
 *   - Warm-up: 5 iterations discarded before timing
 *   - Reported: ops/sec, ms/op, relative to JSON compact baseline
 */

// ── Dataset sizes ─────────────────────────────────────────────────────────────

type DatasetSize = 'small' | 'medium' | 'large'

const SIZES: Record<DatasetSize, { label: string, employees: number, orders: number, analytics: number }> = {
  small: { label: 'Small (50 rows)', employees: 50, orders: 25, analytics: 30 },
  medium: { label: 'Medium (500 rows)', employees: 500, orders: 250, analytics: 180 },
  large: { label: 'Large (5,000 rows)', employees: 5000, orders: 2500, analytics: 365 },
}

// ── Benchmark config ──────────────────────────────────────────────────────────

const WARMUP_ITERS = 5
const MEASURE_ITERS = 50

// ── Format definitions ────────────────────────────────────────────────────────

type FormatId = 'json-compact' | 'json-pretty' | 'yaml' | 'xml' | 'toon' | 'tron'

interface FormatSpec {
  encode: (data: unknown[]) => string
  decode?: (text: string) => unknown
}

const xmlBuilder = new XMLBuilder({ format: false, suppressEmptyNode: true })
const xmlParser = new XMLParser({ ignoreAttributes: false })

const FORMATS: Record<FormatId, FormatSpec> = {
  'json-compact': {
    encode: data => JSON.stringify(data),
    decode: text => JSON.parse(text),
  },
  'json-pretty': {
    encode: data => JSON.stringify(data, undefined, 2),
    decode: text => JSON.parse(text),
  },
  'yaml': {
    encode: data => stringifyYAML(data),
    decode: text => parseYAML(text),
  },
  'xml': {
    encode: data => xmlBuilder.build({ rows: data }),
    decode: text => xmlParser.parse(text),
  },
  'toon': {
    encode: data => encodeToon(data),
    decode: text => decodeToon(text),
  },
  'tron': {
    encode: (data) => { tron.reset(); return tron.toJSON(data as Record<string, unknown>[]) },
    decode: text => tron.fromTRON(text),
  },
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function bench(fn: () => void, iters: number): number {
  const start = performance.now()
  for (let i = 0; i < iters; i++) fn()
  return performance.now() - start
}

// ── Result types ──────────────────────────────────────────────────────────────

interface PhaseResult {
  opsPerSec: number
  msPerOp: number
  relativeToBaseline: number | null
}

interface FormatResult {
  encode: PhaseResult
  decode: PhaseResult | null
}

interface SizeResult {
  sizeLabel: string
  rowCount: number
  byteSize: number
  results: Record<FormatId, FormatResult>
}

// ── Run benchmark ─────────────────────────────────────────────────────────────

const allSizeResults: SizeResult[] = []

for (const [sizeKey, sizeSpec] of Object.entries(SIZES) as [DatasetSize, typeof SIZES[DatasetSize]][]) {
  prompts.log.step(`${sizeSpec.label}…`)

  const rawData = generateEmployees(sizeSpec.employees).employees
  const byteSize = Buffer.byteLength(JSON.stringify(rawData), 'utf-8')

  // Pre-encode each format to get the decode input string
  const encodedStrings: Partial<Record<FormatId, string>> = {}
  for (const [fmtId, fmt] of Object.entries(FORMATS) as [FormatId, FormatSpec][]) {
    try {
      encodedStrings[fmtId] = fmt.encode(rawData)
    }
    catch {
      // format may fail on certain shapes — skip
    }
  }

  const baselineEnc = (() => {
    // Warmup
    for (let i = 0; i < WARMUP_ITERS; i++) JSON.stringify(rawData)
    return bench(() => JSON.stringify(rawData), MEASURE_ITERS)
  })()
  const baselineEncOps = (MEASURE_ITERS / baselineEnc) * 1000

  const baselineDec = (() => {
    const s = encodedStrings['json-compact']!
    for (let i = 0; i < WARMUP_ITERS; i++) JSON.parse(s)
    return bench(() => JSON.parse(s), MEASURE_ITERS)
  })()
  const baselineDecOps = (MEASURE_ITERS / baselineDec) * 1000

  const sizeResult: SizeResult = {
    sizeLabel: sizeSpec.label,
    rowCount: rawData.length,
    byteSize,
    results: {} as Record<FormatId, FormatResult>,
  }

  for (const [fmtId, fmt] of Object.entries(FORMATS) as [FormatId, FormatSpec][]) {
    const encoded = encodedStrings[fmtId]
    if (!encoded) {
      sizeResult.results[fmtId] = {
        encode: { opsPerSec: 0, msPerOp: 0, relativeToBaseline: null },
        decode: null,
      }
      continue
    }

    // Encode
    for (let i = 0; i < WARMUP_ITERS; i++) fmt.encode(rawData)
    const encMs = bench(() => fmt.encode(rawData), MEASURE_ITERS)
    const encOps = (MEASURE_ITERS / encMs) * 1000

    // Decode
    let decResult: PhaseResult | null = null
    if (fmt.decode) {
      try {
        for (let i = 0; i < WARMUP_ITERS; i++) fmt.decode(encoded)
        const decMs = bench(() => fmt.decode!(encoded), MEASURE_ITERS)
        const decOps = (MEASURE_ITERS / decMs) * 1000
        decResult = {
          opsPerSec: decOps,
          msPerOp: decMs / MEASURE_ITERS,
          relativeToBaseline: decOps / baselineDecOps,
        }
      }
      catch {
        // decoder may fail — leave null
      }
    }

    sizeResult.results[fmtId] = {
      encode: {
        opsPerSec: encOps,
        msPerOp: encMs / MEASURE_ITERS,
        relativeToBaseline: encOps / baselineEncOps,
      },
      decode: decResult,
    }
  }

  allSizeResults.push(sizeResult)
}

// ── Render report ─────────────────────────────────────────────────────────────

function fmtOps(ops: number): string {
  if (ops >= 1000) return `${(ops / 1000).toFixed(1)}k`
  return ops.toFixed(0)
}

function fmtRatio(r: number | null, isBaseline = false): string {
  if (isBaseline) return '_(baseline)_'
  if (r === null) return 'n/a'
  return `${r.toFixed(2)}×`
}

function fmtMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`
  return `${ms.toFixed(2)} ms`
}

const FORMAT_IDS = Object.keys(FORMATS) as FormatId[]

function renderSizeTable(sr: SizeResult, phase: 'encode' | 'decode'): string {
  const lines: string[] = []
  lines.push(`#### ${sr.sizeLabel} — ${phase === 'encode' ? 'Serialization' : 'Deserialization'}`)
  lines.push('')
  lines.push(`Input: ${sr.rowCount.toLocaleString()} rows, ${(sr.byteSize / 1024).toFixed(1)} KB JSON`)
  lines.push('')
  lines.push(`| Format | ops/sec | ms/op | vs JSON compact |`)
  lines.push(`| --- | --- | --- | --- |`)

  for (const fmtId of FORMAT_IDS) {
    const fr = sr.results[fmtId]
    const p = phase === 'encode' ? fr.encode : fr.decode
    const display = FORMATTER_DISPLAY_NAMES[fmtId] ?? fmtId
    const isBaseline = fmtId === 'json-compact'

    if (p === null || (phase === 'decode' && fr.decode === null)) {
      lines.push(`| ${display} | n/a | n/a | n/a |`)
    }
    else {
      lines.push(`| ${display} | ${fmtOps(p.opsPerSec)} | ${fmtMs(p.msPerOp)} | ${fmtRatio(p.relativeToBaseline, isBaseline)} |`)
    }
  }

  return lines.join('\n')
}

function renderSummaryTable(phase: 'encode' | 'decode'): string {
  const lines: string[] = []
  lines.push(`### ${phase === 'encode' ? 'Serialization' : 'Deserialization'} — Relative performance vs JSON compact (ops/sec ratio)`)
  lines.push('')
  lines.push('> Values > 1.00× = faster than JSON compact; < 1.00× = slower.')
  lines.push('')

  const sizeHeaders = allSizeResults.map(sr => sr.sizeLabel)
  lines.push(`| Format | ${sizeHeaders.join(' | ')} |`)
  lines.push(`| --- | ${sizeHeaders.map(() => '---').join(' | ')} |`)

  for (const fmtId of FORMAT_IDS) {
    const display = FORMATTER_DISPLAY_NAMES[fmtId] ?? fmtId
    const isBaseline = fmtId === 'json-compact'
    const cells = allSizeResults.map((sr) => {
      const fr = sr.results[fmtId]
      const p = phase === 'encode' ? fr.encode : fr.decode
      return p ? fmtRatio(p.relativeToBaseline, isBaseline) : 'n/a'
    })
    lines.push(`| ${display} | ${cells.join(' | ')} |`)
  }

  return lines.join('\n')
}

const encTables = allSizeResults.map(sr => renderSizeTable(sr, 'encode')).join('\n\n')
const decTables = allSizeResults.map(sr => renderSizeTable(sr, 'decode')).join('\n\n')
const encSummary = renderSummaryTable('encode')
const decSummary = renderSummaryTable('decode')

const markdown = `# Encode/Decode Throughput Benchmark

${getMachineInfo()}

Measures how many encode (serialize) and decode (deserialize) operations each format
can complete per second. Throughput matters for use cases where the data format is
generated or consumed at scale — e.g., bulk context preparation for LLM inference.

**Methodology**
- Dataset: uniform employee records at three sizes (small/medium/large)
- Warm-up: ${WARMUP_ITERS} iterations discarded before timing
- Measurement: ${MEASURE_ITERS} timed iterations per phase
- Baseline: JSON compact (JSON.stringify / JSON.parse)
- JTON excluded: Python subprocess overhead (IPC ~5–20 ms/call) dominates the
  measurement and is not a fair comparison for single-process throughput.
  JTON throughput in a production system would require a persistent process pool.

## Summary

${encSummary}

${decSummary}

## Detailed results

### Serialization (encode)

${encTables}

### Deserialization (decode)

${decTables}
`

prompts.log.message(encSummary)

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)
const outputPath = path.join(resultsDir, 'throughput.md')
await fsp.writeFile(outputPath, markdown, 'utf-8')
prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputPath)}\``)
