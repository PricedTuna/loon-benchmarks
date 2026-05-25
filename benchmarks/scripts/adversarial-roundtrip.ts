import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { stringify as stringifyCSV } from 'csv-stringify/sync'
import { parse as parseCSV } from 'csv-parse/sync'
import { stringify as stringifyYAML, parse as parseYAML } from 'yaml'
import { encode as encodeToon, decode as decodeToon } from '@toon-format/toon'
import { BENCHMARKS_DIR, ROOT_DIR } from '../src/constants.ts'
import { formatters, resetLoonEncoder } from '../src/formatters.ts'
import { loon } from 'loon-core'
import { ensureDir, getMachineInfo } from '../src/utils.ts'

/**
 * Adversarial string roundtrip benchmark.
 *
 * @remarks
 * Each format is presented with tabular data containing strings that are
 * structurally adversarial to that format's syntax. A format that cannot
 * survive its own format-native separator characters is unsuitable for
 * production use without documented escaping requirements.
 *
 * Test cases are chosen to stress-test the most common failure modes:
 *   - Pipe  |  : delimiter inside string cells for row-style formats
 *   - Comma ,  : CSV field delimiter
 *   - Newline  : row separator in line-oriented payloads, YAML scalar boundary
 *   - XML special: <>&"' attribute injection
 *   - YAML special: leading -/:/# characters, bare booleans, null-like values
 *   - JSON special: embedded quotes, backslashes
 *   - Unicode: multi-byte CJK, emoji, RTL overrides
 *   - Very long strings (64 KB): tests buffer limits
 *   - Zero-length and whitespace-only strings
 *   - Numbers that look like strings: "1e5", "true", "null", "undefined"
 *   - Nested format strings: a JSON object encoded as a string value
 */

// ── Test fixture ──────────────────────────────────────────────────────────────

interface AdversarialRow {
  id: number
  label: string
  value: string
  description: string
}

const ADVERSARIAL_CASES: Omit<AdversarialRow, 'id'>[] = [
  { label: 'pipe-in-string', value: 'hello|world|foo|bar', description: 'Pipe delimiter inside string cell' },
  { label: 'pipe-multirow', value: 'first|second\nthird|fourth', description: 'Pipe delimiters + newline' },
  { label: 'comma-in-string', value: 'one,two,three', description: 'CSV field delimiter inside string' },
  { label: 'newline-in-value', value: 'line1\nline2\nline3', description: 'Embedded newlines (row-oriented formats)' },
  { label: 'carriage-return', value: 'windows\r\nline\r\nendings', description: 'CRLF line endings' },
  { label: 'xml-injection', value: '<script>alert("xss")</script>', description: 'XML tag characters' },
  { label: 'xml-attr-inject', value: 'foo" onclick="evil()', description: 'XML attribute injection' },
  { label: 'xml-amp-entities', value: 'A & B < C > D', description: 'XML entity characters' },
  { label: 'yaml-leading-dash', value: '- item one\n- item two', description: 'YAML list-like string' },
  { label: 'yaml-colon-key', value: 'key: value\nfoo: bar', description: 'YAML mapping-like string' },
  { label: 'yaml-hash-comment', value: '# this looks like a comment\nnormal text', description: 'YAML comment character' },
  { label: 'yaml-true-like', value: 'true', description: 'YAML bare boolean (string)' },
  { label: 'yaml-null-like', value: 'null', description: 'YAML null literal as string' },
  { label: 'yaml-tilde', value: '~', description: 'YAML shorthand null as string' },
  { label: 'yaml-yes-no', value: 'yes', description: 'YAML 1.1 boolean-like' },
  { label: 'json-in-string', value: '{"key":"val","num":42}', description: 'JSON object as string value' },
  { label: 'json-array-string', value: '[1,2,3,"four"]', description: 'JSON array as string value' },
  { label: 'backslash-escapes', value: 'path\\to\\file\\n\\t\\r', description: 'Backslash sequences' },
  { label: 'double-quotes', value: 'say "hello world" today', description: 'Embedded double quotes' },
  { label: 'single-quotes', value: "it's a test: 'quoted'", description: 'Embedded single quotes' },
  { label: 'empty-string', value: '', description: 'Zero-length string' },
  { label: 'whitespace-only', value: '   \t\t   ', description: 'Whitespace-only string' },
  { label: 'number-as-string', value: '1e5', description: 'Scientific notation lookalike' },
  { label: 'undefined-as-string', value: 'undefined', description: 'JS undefined keyword as string' },
  { label: 'zero-string', value: '0', description: 'Numeric zero as string' },
  { label: 'emoji', value: '🔥💡🚀 test 🎉', description: 'Emoji (multi-codepoint)' },
  { label: 'cjk-unicode', value: '中文日本語한국어', description: 'CJK multibyte characters' },
  { label: 'rtl-override', value: '‮RTL‬ normal', description: 'RTL override unicode control chars' },
  { label: 'null-byte', value: 'before\x00after', description: 'Null byte embedded in string' },
  { label: 'long-string-1k', value: 'x'.repeat(1024), description: '1 KB repeated character' },
  { label: 'long-string-64k', value: 'ab'.repeat(32 * 1024), description: '64 KB string' },
  { label: 'scheme-header-mimic', value: 'id: 1\nname: Alice', description: 'String that resembles a schema header line' },
  { label: 'toon-header-mimic', value: '[10]{id,name,age}:', description: 'String that looks like TOON header' },
  { label: 'mixed-delimiters', value: '|comma,tab\tnewline\npipe|end', description: 'Mix of all delimiter types' },
  { label: 'number-e-notation', value: '1.23e+10', description: 'Number-like scientific notation string' },
  { label: 'unicode-replacement', value: '�￾￿', description: 'Unicode replacement/BOM characters' },
  { label: 'control-chars', value: '\x01\x02\x03\x1F', description: 'C0 control characters' },
]

function decodeLoonAdv(text: string): unknown {
  const t = text.trimStart()
  if (t.startsWith('TREE:')) return loon.toTree(text)
  return loon.fromLOON(text)
}

const xmlBuilder = new XMLBuilder({ format: false, suppressEmptyNode: true })
const xmlParser = new XMLParser({ ignoreAttributes: false })

interface Codec {
  encode: (rows: AdversarialRow[]) => string
  decode: (text: string) => unknown
}

// For comparison, extract value column from decoded row by id
function extractValues(decoded: unknown, originalRows: AdversarialRow[]): Map<number, string | null> {
  const out = new Map<number, string | null>()
  if (!Array.isArray(decoded)) return out
  for (const item of decoded) {
    if (typeof item !== 'object' || item === null) continue
    const id = Number((item as any).id)
    const val = (item as any).value
    if (!Number.isNaN(id)) out.set(id, typeof val === 'string' ? val : val === null ? null : String(val))
  }
  return out
}

const CODECS: Record<string, Codec> = {
  'json-compact': {
    encode: rows => JSON.stringify(rows),
    decode: text => JSON.parse(text),
  },
  'yaml': {
    encode: rows => stringifyYAML(rows),
    decode: text => parseYAML(text),
  },
  'xml': {
    encode: rows => xmlBuilder.build({ row: rows }),
    decode: text => {
      const parsed = xmlParser.parse(text)
      // fast-xml-parser wraps in root key
      const key = Object.keys(parsed)[0]!
      const val = (parsed as any)[key]
      return Array.isArray(val) ? val : [val]
    },
  },
  'csv': {
    encode: rows => stringifyCSV(rows, { header: true }),
    decode: text => parseCSV(text, { columns: true, cast: false }),
  },
  'toon': {
    encode: rows => encodeToon(rows),
    decode: text => decodeToon(text),
  },
  'loon': {
    encode: (rows: AdversarialRow[]) => {
      resetLoonEncoder()
      return formatters['loon-llm'](rows)
    },
    decode: (text: string) => decodeLoonAdv(text),
  },
}

// ── Roundtrip check ───────────────────────────────────────────────────────────

type Status = 'pass' | 'fail' | 'encode-error' | 'decode-error'

interface CaseResult {
  caseLabel: string
  value: string
  description: string
  status: Status
  notes: string
}

interface FormatReport {
  formatId: string
  cases: CaseResult[]
  passCount: number
  failCount: number
  encodeErrorCount: number
  decodeErrorCount: number
}

const reports: FormatReport[] = []

for (const [fmtId, codec] of Object.entries(CODECS)) {
  prompts.log.step(`Testing ${fmtId}…`)
  const cases: CaseResult[] = []

  for (const row of ROWS) {
    const singleRow = [row]
    let encoded: string
    try {
      encoded = codec.encode(singleRow)
    }
    catch (err) {
      cases.push({
        caseLabel: row.label,
        value: row.value.slice(0, 60),
        description: row.description,
        status: 'encode-error',
        notes: err instanceof Error ? err.message.split('\n')[0]! : String(err),
      })
      continue
    }

    let decoded: unknown
    try {
      decoded = codec.decode(encoded)
    }
    catch (err) {
      cases.push({
        caseLabel: row.label,
        value: row.value.slice(0, 60),
        description: row.description,
        status: 'decode-error',
        notes: err instanceof Error ? err.message.split('\n')[0]! : String(err),
      })
      continue
    }

    // Extract value for row.id
    const vals = extractValues(decoded, [row])
    const recovered = vals.get(row.id)

    if (recovered === row.value) {
      cases.push({
        caseLabel: row.label,
        value: row.value.slice(0, 60),
        description: row.description,
        status: 'pass',
        notes: '',
      })
    }
    else {
      const got = recovered === null ? '(null)' : recovered === undefined ? '(missing)' : JSON.stringify(recovered).slice(0, 80)
      cases.push({
        caseLabel: row.label,
        value: row.value.slice(0, 60),
        description: row.description,
        status: 'fail',
        notes: `got: ${got}`,
      })
    }
  }

  reports.push({
    formatId: fmtId,
    cases,
    passCount: cases.filter(c => c.status === 'pass').length,
    failCount: cases.filter(c => c.status === 'fail').length,
    encodeErrorCount: cases.filter(c => c.status === 'encode-error').length,
    decodeErrorCount: cases.filter(c => c.status === 'decode-error').length,
  })
}

// ── Render ────────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<Status, string> = {
  pass: '✅',
  fail: '⚠️ lossy',
  'encode-error': '🛑 encode',
  'decode-error': '🛑 decode',
}

function renderSummaryTable(): string {
  const lines: string[] = []
  const fmtIds = reports.map(r => r.formatId)
  lines.push(`| Case | Description | ${fmtIds.join(' | ')} |`)
  lines.push(`| --- | --- | ${fmtIds.map(() => '---').join(' | ')} |`)

  for (const row of ROWS) {
    const cells = reports.map((r) => {
      const c = r.cases.find(x => x.caseLabel === row.label)
      return c ? STATUS_ICON[c.status] : '—'
    })
    lines.push(`| \`${row.label}\` | ${row.description} | ${cells.join(' | ')} |`)
  }

  return lines.join('\n')
}

function renderPassCounts(): string {
  const lines: string[] = []
  lines.push(`| Format | ✅ Pass | ⚠️ Lossy | 🛑 Encode err | 🛑 Decode err | Score |`)
  lines.push(`| --- | --- | --- | --- | --- | --- |`)
  const total = ROWS.length
  for (const r of reports) {
    const score = `${r.passCount}/${total}`
    lines.push(`| ${r.formatId} | ${r.passCount} | ${r.failCount} | ${r.encodeErrorCount} | ${r.decodeErrorCount} | ${score} |`)
  }
  return lines.join('\n')
}

function renderFailureDetails(): string {
  const lines: string[] = []
  for (const r of reports) {
    const bad = r.cases.filter(c => c.status !== 'pass')
    if (bad.length === 0) continue
    lines.push(`### ${r.formatId}`)
    lines.push('')
    for (const c of bad) {
      lines.push(`- \`${c.caseLabel}\` — ${STATUS_ICON[c.status]}${c.notes ? `: ${c.notes}` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

const summaryTable = renderSummaryTable()
const passCounts = renderPassCounts()
const failures = renderFailureDetails()

const markdown = `# Adversarial String Roundtrip

${getMachineInfo()}

Tests each format's ability to faithfully preserve string values that are structurally
adversarial to that format's syntax (delimiters, reserved tokens, control characters).

A format that fails here cannot be used without additional escaping middleware, or
must document which string values are unsupported.

## Score summary

${passCounts}

## Per-case results

${summaryTable}

## Failure details

${failures}

> **Methodology**: Each test case is a single-row table with \`{id, label, value, description}\`.
> The row is encoded, then decoded, and the \`value\` field is compared character-for-character
> with the original. Type coercion (e.g. CSV always returns strings) is not penalised for
> \`value\` since it is already a string. The \`id\` field is used to locate the correct row
> after decode regardless of row ordering.
`

prompts.log.message(passCounts)

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)
const outputPath = path.join(resultsDir, 'adversarial-roundtrip.md')
await fsp.writeFile(outputPath, markdown, 'utf-8')
prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputPath)}\``)
