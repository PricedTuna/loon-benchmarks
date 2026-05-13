import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { BENCHMARKS_DIR, FORMATTER_DISPLAY_NAMES, ROOT_DIR } from '../src/constants.ts'
import { formatters, supportsJTON, supportsTRON } from '../src/formatters.ts'
import { tron } from '../../extra-formats/Tron-Core/dist/index.mjs'
import { ensureDir, getMachineInfo, tokenize } from '../src/utils.ts'

/**
 * Real-data token benchmark.
 *
 * @remarks
 * Token efficiency on JSON files that exist outside of this benchmark — the
 * synthetic generators in `datasets.ts` are convenient but they reward
 * formats that are good at uniform-shape data (which is most non-trivial
 * formats). To detect that bias, we also measure on real-world files.
 *
 * Coverage rules per file:
 *   - Every formatter is attempted.
 *   - CSV is attempted on shape-compatible inputs only (root array of flat
 *     objects, or object with a single top-level array of flat objects).
 *   - TRON is attempted on the same shape-compatible inputs (it is row-
 *     oriented; deeply-nested non-array roots cannot be encoded faithfully).
 *   - Failures are recorded as `null` (rendered as "n/a") and never silently
 *     replaced by another encoding's output.
 *
 * Files come from `benchmarks/data/`. Edit `FILES` below to extend.
 */

interface FileSpec {
  filename: string
  description: string
  category: 'large-real' | 'tabular-real' | 'small-real' | 'edge'
}

const FILES: FileSpec[] = [
  // Large, real-world non-uniform JSON (the canonical "are you actually fast"
  // files used in JSON parser benchmarks).
  { filename: 'canada.json', description: 'GeoJSON polygon — Canada borders (≈2.2 MB)', category: 'large-real' },
  { filename: 'citm_catalog.json', description: 'CITM box-office catalog (≈1.7 MB, deeply nested)', category: 'large-real' },
  { filename: 'twitter.json', description: 'Twitter API search response (≈630 KB, mixed nesting)', category: 'large-real' },

  // Larger tabular JSON with realistic column types.
  { filename: 'fakestore_struct_1k.json', description: 'Fakestore — 1k structured rows', category: 'tabular-real' },
  { filename: 'fakestore_business.json', description: 'Fakestore — business records', category: 'tabular-real' },
  { filename: 'github.json', description: 'GitHub events sample', category: 'tabular-real' },

  // Small reference datasets — common LLM context payloads.
  { filename: 'world-cities.json', description: 'World cities reference', category: 'small-real' },
  { filename: 'us-states-with-detail.json', description: 'US states with detail', category: 'small-real' },
  { filename: 'european-countries.json', description: 'European countries', category: 'small-real' },
  { filename: 'sports-teams-nfl.json', description: 'NFL teams', category: 'small-real' },
  { filename: 'mountains.json', description: 'World mountains', category: 'small-real' },
  { filename: 'hikes_20.json', description: 'Hikes (20 records)', category: 'small-real' },
  { filename: 'currencies.json', description: 'Currencies reference', category: 'small-real' },
  { filename: 'file-extensions.json', description: 'File extensions reference', category: 'small-real' },
  { filename: 'http-status-codes.json', description: 'HTTP status codes', category: 'small-real' },
  { filename: 'keyboard-shortcuts.json', description: 'Keyboard shortcuts', category: 'small-real' },
  { filename: 'lorem-ipsum.json', description: 'Lorem ipsum reference', category: 'small-real' },
  { filename: 'programming-languages.json', description: 'Programming languages', category: 'small-real' },
  { filename: 'units-of-measurement.json', description: 'Units of measurement', category: 'small-real' },
  { filename: 'us-capitals.json', description: 'US state capitals', category: 'small-real' },

  // Adversarial / edge cases.
  { filename: 'test-edge-cases.json', description: 'Edge cases (escapes, unicode, deeply nested)', category: 'edge' },
]

interface Measurement {
  filename: string
  description: string
  category: FileSpec['category']
  bytes: number
  tokensByFormat: Record<string, number | null>
  errors: Record<string, string>
}

prompts.intro('Real-Data Token Benchmark (neutral)')

const dataDir = path.join(BENCHMARKS_DIR, 'data')
const measurements: Measurement[] = []

for (const file of FILES) {
  const fullPath = path.join(dataDir, file.filename)
  let raw: string
  try {
    raw = await fsp.readFile(fullPath, 'utf-8')
  }
  catch (err) {
    prompts.log.warn(`Skipping ${file.filename}: ${err instanceof Error ? err.message : String(err)}`)
    continue
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (err) {
    prompts.log.warn(`Could not JSON.parse ${file.filename}: ${err instanceof Error ? err.message : String(err)}`)
    continue
  }

  const tokensByFormat: Record<string, number | null> = {}
  const errors: Record<string, string> = {}

  // Build a minimal fake Dataset so we can reuse the shape predicates.
  const fakeDs = {
    name: file.filename as any,
    description: file.description,
    data: parsed as Record<string, any>,
    metadata: { supportsCSV: false, structureClass: 'uniform' as const, tabularEligibility: 0 },
  }

  for (const [formatName, formatter] of Object.entries(formatters)) {
    // TRON and JTON are row-oriented; they collapse nested non-tabular data
    // (e.g. GeoJSON coordinates) into a degenerate single-row encoding that
    // is lossy and produces misleadingly low token counts.
    if ((formatName === 'tron' || formatName === 'jton') && !supportsTRON(fakeDs)) {
      tokensByFormat[formatName] = null
      errors[formatName] = 'format cannot represent this shape (skipped)'
      continue
    }

    try {
      const formatted = formatter(parsed)
      // Reject empty output as a non-result (e.g. CSV can return "" for
      // shapes it cannot represent). Don't sweep into the totals.
      if (!formatted) {
        tokensByFormat[formatName] = null
        errors[formatName] = 'empty output (format cannot represent this data)'
        continue
      }
      tokensByFormat[formatName] = tokenize(formatted)
    }
    catch (err) {
      tokensByFormat[formatName] = null
      errors[formatName] = err instanceof Error ? err.message : String(err)
    }
  }

  // Reset TRON session state between files so previous-file dictionaries do
  // not leak into the next measurement (would understate per-file tokens).
  tron.reset()

  measurements.push({
    filename: file.filename,
    description: file.description,
    category: file.category,
    bytes: Buffer.byteLength(raw, 'utf-8'),
    tokensByFormat,
    errors,
  })
}

// ── Reporting ────────────────────────────────────────────────────────────────

function fmtPct(n: number | null, base: number | null): string {
  if (n === null || base === null || base === 0)
    return 'n/a'
  const pct = ((n - base) / base) * 100
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pct).toFixed(1)}%`
}

function fmtNum(n: number | null): string {
  return n === null ? 'n/a' : n.toLocaleString('en-US')
}

const formatNames = Object.keys(formatters)
const BASELINE = 'json-compact'

function renderTable(rows: Measurement[]): string {
  const headerCells = ['File', 'Bytes', ...formatNames.map(f => FORMATTER_DISPLAY_NAMES[f] ?? f)]
  const sep = headerCells.map(() => '---')

  const dataRows = rows.map((m) => {
    const baseline = m.tokensByFormat[BASELINE] ?? null
    const cells = [m.description, m.bytes.toLocaleString('en-US')]
    for (const f of formatNames) {
      const t = m.tokensByFormat[f] ?? null
      if (f === BASELINE) {
        cells.push(t === null ? 'n/a' : `${fmtNum(t)} (baseline)`)
      }
      else {
        cells.push(t === null ? 'n/a' : `${fmtNum(t)} (${fmtPct(t, baseline)})`)
      }
    }
    return `| ${cells.join(' | ')} |`
  })

  return [`| ${headerCells.join(' | ')} |`, `| ${sep.join(' | ')} |`, ...dataRows].join('\n')
}

const byCategory = new Map<FileSpec['category'], Measurement[]>()
for (const m of measurements) {
  if (!byCategory.has(m.category))
    byCategory.set(m.category, [])
  byCategory.get(m.category)!.push(m)
}

const categoryTitles: Record<FileSpec['category'], string> = {
  'large-real': 'Large real-world JSON',
  'tabular-real': 'Tabular real-world JSON',
  'small-real': 'Small reference datasets',
  'edge': 'Adversarial / edge cases',
}

const sections: string[] = []
for (const [cat, title] of Object.entries(categoryTitles) as [FileSpec['category'], string][]) {
  const ms = byCategory.get(cat) ?? []
  if (ms.length === 0)
    continue
  sections.push(`## ${title}\n\n${renderTable(ms)}\n`)
}

// Per-format failure summary so unrepresentable shapes are visible, not
// hidden behind a fallback to JSON-compact.
const failures: string[] = []
for (const m of measurements) {
  for (const [fmt, msg] of Object.entries(m.errors)) {
    failures.push(`- \`${m.filename}\` × \`${fmt}\`: ${msg}`)
  }
}

const failureSection = failures.length === 0
  ? '_No formatter errors._'
  : failures.join('\n')

const markdown = `# Real-Data Token Efficiency

${getMachineInfo()}

**Tokenizer:** \`gpt-tokenizer\` with \`o200k_base\` encoding (GPT-4o / GPT-5 family).
**Baseline:** \`${BASELINE}\` — every other format is reported as a percentage delta against this baseline on the same input.

These files are real or near-real JSON payloads (canada.json, citm_catalog,
twitter, plus reference datasets and edge cases). They are not the synthetic
\`datasets.ts\` generators, which is the point: synthetic data tends to favour
columnar / class-based encodings in ways that real-world JSON does not. If a
format wins overall, it should win on these files too.

\`n/a\` means the formatter could not represent that input or threw. See the
"Formatter errors" section at the end for the verbatim error messages — no
formatter is silently replaced by another encoding.

${sections.join('\n')}

## Formatter errors

${failureSection}

> Methodology note: TRON is given a fresh session (\`tron.reset()\`) between
> files. This prevents dictionary state accumulated on file _N_ from
> compressing file _N+1_ — that state is only useful within a single chat
> context and would inflate measured savings on standalone files.
`

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)

const outputFilePath = path.join(resultsDir, 'real-data-token-efficiency.md')
await fsp.writeFile(outputFilePath, markdown, 'utf-8')

prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputFilePath)}\``)
