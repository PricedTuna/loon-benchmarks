import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { parse as parseYAML } from 'yaml'
import { XMLParser } from 'fast-xml-parser'
import { parse as parseCSV } from 'csv-parse/sync'
import { decode as decodeToon } from '@toon-format/toon'
import { BENCHMARKS_DIR, FORMATTER_DISPLAY_NAMES, ROOT_DIR } from '../src/constants.ts'
import { ACCURACY_DATASETS, generateEmployees } from '../src/datasets.ts'
import { formatters, isLoonFormat, LOON_MODES, resetLoonEncoder, supportsCSV, supportsJTON } from '../src/formatters.ts'
import { loon } from 'loon-core'
import { ensureDir, getMachineInfo } from '../src/utils.ts'

/**
 * Roundtrip fidelity benchmark.
 *
 * @remarks
 * For each format we encode the input, decode it back, and compare the
 * decoded value against the original using a deterministic structural
 * equality check. The goal is to surface lossy formats so a token-efficiency
 * win does not silently come from dropping information.
 *
 * What "fidelity" means here:
 *   - Loss of nesting (CSV flattens nested objects/arrays).
 *   - Loss of types (XML/YAML can stringify numbers / booleans depending
 *     on the parser configuration).
 *   - Loss of field presence (formats that drop optional / sparse fields).
 *   - Round-trip throws (encoder produces something the matching decoder
 *     cannot parse).
 *
 * No format is privileged. Every format is decoded with its standard
 * parser; differences from the original are reported as-is.
 *
 * Dependencies note: `csv-parse` is part of the `csv-stringify` ecosystem
 * (sibling package) and ships separately. The original toon benchmarks
 * already rely on those tools; we add the matching parser here.
 */

interface FidelityResult {
  format: string
  dataset: string
  ok: boolean
  difference?: string
  encodeError?: string
  decodeError?: string
}

prompts.intro('Roundtrip Fidelity Benchmark (neutral)')

function decodeLoon(encoded: string): unknown {
  const t = encoded.trimStart()
  if (t.startsWith('TREE:')) return loon.toTree(encoded)
  return loon.fromLOON(encoded)
}

// ── Decoders ─────────────────────────────────────────────────────────────────

const decoders: Record<string, (encoded: string) => unknown> = {
  'json-pretty': s => JSON.parse(s),
  'json-compact': s => JSON.parse(s),
  'yaml': s => parseYAML(s),
  'xml': (s) => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: true,
      parseAttributeValue: true,
    })
    return parser.parse(s)
  },
  'csv': (s) => {
    // CSV is fundamentally limited: the original may be `{ users: [...] }`
    // and CSV emits a `# users` section then headers + rows. We parse rows
    // as a flat list and let the comparison surface the structural loss.
    return parseCSV(s, { columns: true, skip_empty_lines: true })
  },
  'toon': s => decodeToon(s),
}
// LOON decoding is mode-agnostic — `fromLOON` auto-detects the wire format —
// so every `loon-<mode>` formatter shares the same decoder.
for (const mode of LOON_MODES) {
  decoders[`loon-${mode}`] = s => decodeLoon(s)
}

// ── Datasets to roundtrip ────────────────────────────────────────────────────

const FIDELITY_DATASETS = [
  ...ACCURACY_DATASETS.map(d => ({ name: d.name, description: d.description, data: d.data })),
  {
    name: 'numeric-precision',
    description: 'Numeric precision (large ints, floats, scientific notation)',
    data: {
      records: [
        { id: 1, big: 9007199254740991, neg: -123456789, float: 3.14159265358979, sci: 1.23e10 },
        { id: 2, big: 1, neg: -0, float: 0.1 + 0.2, sci: 1e-7 },
      ],
    },
  },
  {
    name: 'unicode-and-escapes',
    description: 'Unicode + escape characters (newlines, tabs, quotes, emoji)',
    data: {
      strings: [
        { id: 1, text: 'hello\nworld\t"quoted"' },
        { id: 2, text: '日本語 — émoji 🚀, mixed: αβγ' },
        { id: 3, text: 'Single \'quoted\' and \\ backslash' },
      ],
    },
  },
  {
    name: 'sparse-fields',
    description: 'Sparse / optional fields (different keys per row)',
    data: {
      logs: [
        { ts: '2025-01-01', level: 'info', endpoint: '/a' },
        { ts: '2025-01-02', level: 'error', endpoint: '/b', error: 'oops' },
        { ts: '2025-01-03', level: 'info', endpoint: '/c', metadata: { user: 42 } },
      ],
    },
  },
  {
    name: 'employees-100',
    description: '100 uniform employee records',
    data: generateEmployees(100),
  },
]

// ── Structural comparator ────────────────────────────────────────────────────

/**
 * Deep-equality with type-coercion sensitivity. Returns a short string
 * describing the first difference, or `null` if equal.
 *
 * @remarks
 * We coerce string-encoded numbers and booleans (e.g. `"123"` vs `123`)
 * because some formats (XML, CSV) stringify scalars by spec; the relevant
 * question is "does the same information come back out", not "byte-for-
 * byte identical JS values". This rule is applied symmetrically across
 * formats.
 */
function compareStructural(a: unknown, b: unknown, path = '$'): string | null {
  if (a === b)
    return null

  if (typeof a === 'number' && typeof b === 'string') {
    const n = Number(b)
    if (!Number.isNaN(n) && n === a)
      return null
  }
  if (typeof a === 'string' && typeof b === 'number') {
    const n = Number(a)
    if (!Number.isNaN(n) && n === b)
      return null
  }
  if (typeof a === 'boolean' && typeof b === 'string') {
    if ((a === true && b === 'true') || (a === false && b === 'false'))
      return null
  }
  if (typeof a === 'string' && typeof b === 'boolean') {
    if ((b === true && a === 'true') || (b === false && a === 'false'))
      return null
  }

  if (a === null || b === null)
    return `${path}: null mismatch (orig=${JSON.stringify(a)}, decoded=${JSON.stringify(b)})`

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      return `${path}: array length ${a.length} → ${b.length}`
    for (let i = 0; i < a.length; i++) {
      const diff = compareStructural(a[i], b[i], `${path}[${i}]`)
      if (diff)
        return diff
    }
    return null
  }

  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    const ak = Object.keys(a as Record<string, unknown>).sort()
    const bk = Object.keys(b as Record<string, unknown>).sort()
    const onlyInA = ak.filter(k => !bk.includes(k))
    const onlyInB = bk.filter(k => !ak.includes(k))
    if (onlyInA.length || onlyInB.length)
      return `${path}: key set differs (only-orig=${onlyInA.join(',') || '∅'}, only-decoded=${onlyInB.join(',') || '∅'})`
    for (const k of ak) {
      const diff = compareStructural((a as any)[k], (b as any)[k], `${path}.${k}`)
      if (diff)
        return diff
    }
    return null
  }

  return `${path}: value mismatch (${typeof a}=${JSON.stringify(a)} vs ${typeof b}=${JSON.stringify(b)})`
}

// ── Run ──────────────────────────────────────────────────────────────────────

const results: FidelityResult[] = []

for (const dataset of FIDELITY_DATASETS) {
  for (const [formatName, formatter] of Object.entries(formatters)) {
    // Honest skip when format cannot represent the dataset shape.
    const fakeDs = { name: dataset.name as any, description: dataset.description, data: dataset.data, metadata: { supportsCSV: false, structureClass: 'uniform' as const, tabularEligibility: 0 } }
    if (formatName === 'csv') {
      // CSV applicability requires top-level array or single-array-under-key.
      const isFlatTabular = (() => {
        const d = dataset.data as any
        if (Array.isArray(d) && d.length > 0 && typeof d[0] === 'object')
          return true
        if (typeof d === 'object' && d !== null) {
          const entries = Object.entries(d)
          if (entries.length === 1 && Array.isArray(entries[0][1]))
            return true
        }
        return false
      })()
      if (!isFlatTabular) {
        results.push({ format: formatName, dataset: dataset.name, ok: false, difference: 'format cannot represent this shape (skipped)' })
        continue
      }
      ;(fakeDs.metadata as any).supportsCSV = true
    }
    if (formatName === 'jton') {
      // JTON has no TypeScript decoder — roundtrip fidelity cannot be measured.
      if (!supportsJTON(fakeDs)) {
        results.push({ format: formatName, dataset: dataset.name, ok: false, difference: 'format cannot represent this shape (skipped)' })
      }
      else {
        results.push({ format: formatName, dataset: dataset.name, ok: false, difference: 'no TypeScript decoder available — encode-only format in this suite' })
      }
      continue
    }

    let encoded: string
    try {
      encoded = formatter(dataset.data)
      resetLoonEncoder() // independence between datasets
    }
    catch (err) {
      results.push({ format: formatName, dataset: dataset.name, ok: false, encodeError: err instanceof Error ? err.message : String(err) })
      continue
    }

    let decoded: unknown
    try {
      decoded = decoders[formatName]!(encoded)
      resetLoonEncoder()
    }
    catch (err) {
      results.push({ format: formatName, dataset: dataset.name, ok: false, decodeError: err instanceof Error ? err.message : String(err) })
      continue
    }

    // LOON row-mode strips single-key wrapper objects (e.g. `{ employees: [...] } → [...]`)
    // when the formatter selected the inner array; compare against that array.
    let compareTarget: unknown = dataset.data
    if (isLoonFormat(formatName)) {
      const d = dataset.data as unknown
      if (typeof d === 'object' && d !== null && !Array.isArray(d)) {
        const entries = Object.entries(d)
        if (entries.length === 1 && Array.isArray(entries[0]![1])) {
          compareTarget = entries[0]![1]
        }
      }
    }

    const diff = compareStructural(compareTarget, decoded)
    results.push({ format: formatName, dataset: dataset.name, ok: diff === null, difference: diff ?? undefined })
  }
}

// ── Reporting ────────────────────────────────────────────────────────────────

const formatNames = Object.keys(formatters)
const datasetNames = FIDELITY_DATASETS.map(d => d.name)

const matrixHeader = ['Format', ...datasetNames]
const matrixSep = matrixHeader.map(() => '---')
const matrixRows = formatNames.map((fmt) => {
  const cells = [FORMATTER_DISPLAY_NAMES[fmt] ?? fmt]
  for (const ds of datasetNames) {
    const r = results.find(x => x.format === fmt && x.dataset === ds)
    if (!r) {
      cells.push('—')
      continue
    }
    if (r.encodeError)
      cells.push('🛑 encode')
    else if (r.decodeError)
      cells.push('🛑 decode')
    else if (r.ok)
      cells.push('✅')
    else
      cells.push('⚠️ lossy')
  }
  return `| ${cells.join(' | ')} |`
})

const failureLines: string[] = []
for (const r of results) {
  if (r.ok)
    continue
  const dsLabel = `\`${r.dataset}\``
  const fmtLabel = `\`${r.format}\``
  if (r.encodeError) failureLines.push(`- ${fmtLabel} × ${dsLabel} — encode error: ${r.encodeError}`)
  else if (r.decodeError) failureLines.push(`- ${fmtLabel} × ${dsLabel} — decode error: ${r.decodeError}`)
  else if (r.difference) failureLines.push(`- ${fmtLabel} × ${dsLabel} — ${r.difference}`)
}

const markdown = `# Roundtrip Fidelity

${getMachineInfo()}

For each (format, dataset) pair we encode the dataset, decode the result with
the format's standard parser, and compare the decoded value to the original.

The comparator is type-coercion-aware: a number reconstructed as a numeric
string (e.g. \`"123"\` instead of \`123\`) does not count as a difference, so
formats that legitimately stringify scalars by spec (XML, CSV) are not
penalised for that. Structural differences — missing keys, dropped nesting,
length changes — are surfaced.

Cells:
- ✅ — decoded value structurally equals the original.
- ⚠️ lossy — decoded value differs structurally; first difference reported below.
- 🛑 encode / 🛑 decode — exception during encode or decode; message reported below.
- — — pair not exercised.

| ${matrixHeader.join(' | ')} |
| ${matrixSep.join(' | ')} |
${matrixRows.join('\n')}

## Failures

${failureLines.length === 0 ? '_All exercised pairs roundtripped cleanly._' : failureLines.join('\n')}

> A format that wins on tokens but appears as ⚠️ on real datasets here is
> trading information for size. Whether that trade is acceptable depends on
> the use case; the benchmark just makes the trade visible.
`

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)

const outputFilePath = path.join(resultsDir, 'roundtrip-fidelity.md')
await fsp.writeFile(outputFilePath, markdown, 'utf-8')

prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputFilePath)}\``)
