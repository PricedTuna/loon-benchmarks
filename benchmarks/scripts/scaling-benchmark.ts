import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { BENCHMARKS_DIR, FORMATTER_DISPLAY_NAMES, ROOT_DIR } from '../src/constants.ts'
import { generateAnalyticsData, generateEmployees, generateEventLogs, generateOrders, generateProducts } from '../src/datasets.ts'
import { formatters, supportsJTON, supportsTRON } from '../src/formatters.ts'
import { tron } from '../../extra-formats/Tron-Core/dist/index.mjs'
import { ensureDir, getMachineInfo, tokenize } from '../src/utils.ts'

/**
 * Scaling benchmark.
 *
 * @remarks
 * Measures how each format's token count scales with the number of records.
 * The point is to expose asymptotic behaviour: some formats have constant
 * per-row overhead (CSV, TRON in row mode), others have a fixed header plus
 * per-row overhead (TOON), and JSON repeats keys per row, so its growth rate
 * is structurally higher.
 *
 * For the paper the interesting numbers are:
 *   - **Slope**: tokens per additional record at large N (the limit).
 *   - **Compression ratio**: total tokens / JSON-compact tokens at each N.
 *   - **Crossover**: the smallest N at which a format beats JSON-compact.
 *
 * No format is privileged — they are all measured on the same generators
 * with the same seeded faker state.
 */

interface Generator {
  name: string
  description: string
  generate: (count: number) => Record<string, any>
  /**
   * Whether the generator outputs an object whose only meaningful payload
   * is a single top-level array (so TRON / CSV are applicable).
   */
  isFlatTabular: boolean
}

const GENERATORS: Generator[] = [
  {
    name: 'employees',
    description: 'Uniform employee records (flat tabular)',
    generate: count => generateEmployees(count),
    isFlatTabular: true,
  },
  {
    name: 'analytics',
    description: 'Time-series analytics metrics (flat tabular)',
    generate: days => generateAnalyticsData(days),
    isFlatTabular: true,
  },
  {
    name: 'products',
    description: 'Large product catalog (flat tabular)',
    generate: count => generateProducts(count),
    isFlatTabular: true,
  },
  {
    name: 'orders',
    description: 'E-commerce orders with nested customer + items (mixed)',
    generate: count => generateOrders(count),
    isFlatTabular: false,
  },
  {
    name: 'event-logs',
    description: 'Semi-uniform event logs (~50% with nested errors)',
    generate: count => generateEventLogs(count),
    isFlatTabular: false,
  },
]

const SIZES = [10, 100, 1000, 10_000]

prompts.intro('Scaling Benchmark (neutral)')

interface DataPoint {
  generator: string
  size: number
  tokensByFormat: Record<string, number | null>
}

const points: DataPoint[] = []

for (const gen of GENERATORS) {
  for (const size of SIZES) {
    const data = gen.generate(size)
    const tokensByFormat: Record<string, number | null> = {}

    for (const [formatName, formatter] of Object.entries(formatters)) {
      // Skip CSV/TRON/JTON on shapes they cannot represent. Classify per-
      // generator so the entire report row is honest.
      if (!gen.isFlatTabular && (formatName === 'csv' || formatName === 'tron' || formatName === 'jton')) {
        // For row-oriented formats (TRON/JTON) we still call the shape check:
        // some generators (orders) wrap an array under a single key, which
        // both can encode.
        if (formatName === 'tron' || formatName === 'jton') {
          const fakeDataset = {
            name: gen.name as any,
            description: gen.description,
            data,
            metadata: { supportsCSV: false, structureClass: 'nested' as const, tabularEligibility: 0 },
          }
          const supported = formatName === 'tron' ? supportsTRON(fakeDataset) : supportsJTON(fakeDataset)
          if (!supported) {
            tokensByFormat[formatName] = null
            continue
          }
        }
        else {
          tokensByFormat[formatName] = null
          continue
        }
      }

      try {
        const formatted = formatter(data)
        tokensByFormat[formatName] = formatted ? tokenize(formatted) : null
      }
      catch {
        tokensByFormat[formatName] = null
      }
    }

    // Reset TRON state so each measurement is independent (no cross-
    // measurement dictionary reuse).
    tron.reset()

    points.push({ generator: gen.name, size, tokensByFormat })
    prompts.log.step(`${gen.name} @ N=${size.toLocaleString('en-US')} measured`)
  }
}

// ── Reporting ────────────────────────────────────────────────────────────────

const formatNames = Object.keys(formatters)
const BASELINE = 'json-compact'

function fmtPct(n: number | null, base: number | null): string {
  if (n === null || base === null || base === 0)
    return 'n/a'
  const pct = ((n - base) / base) * 100
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pct).toFixed(1)}%`
}

function slopePerRecord(genName: string, format: string): { tokensPerRecord: number, samplePoints: number } | null {
  const gp = points
    .filter(p => p.generator === genName && p.tokensByFormat[format] !== null)
    .map(p => ({ size: p.size, tokens: p.tokensByFormat[format] as number }))
    .sort((a, b) => a.size - b.size)
  if (gp.length < 2)
    return null
  // Simple finite-difference between the largest two sample points — this
  // is the asymptotic slope at the scales we measure, which is what the
  // reader cares about. Not a least-squares fit: fewer assumptions.
  const last = gp[gp.length - 1]!
  const prev = gp[gp.length - 2]!
  const tokensPerRecord = (last.tokens - prev.tokens) / (last.size - prev.size)
  return { tokensPerRecord, samplePoints: gp.length }
}

function renderGenerator(gen: Generator): string {
  const headerCells = ['Records', ...formatNames.map(f => FORMATTER_DISPLAY_NAMES[f] ?? f)]
  const sep = headerCells.map(() => '---')

  const rows = SIZES.map((size) => {
    const point = points.find(p => p.generator === gen.name && p.size === size)!
    const baseline = point.tokensByFormat[BASELINE]
    const cells = [size.toLocaleString('en-US')]
    for (const f of formatNames) {
      const t = point.tokensByFormat[f]
      if (t === null || t === undefined) {
        cells.push('n/a')
      }
      else if (f === BASELINE) {
        cells.push(`${t.toLocaleString('en-US')}`)
      }
      else {
        cells.push(`${t.toLocaleString('en-US')} (${fmtPct(t, baseline)})`)
      }
    }
    return `| ${cells.join(' | ')} |`
  })

  // Asymptotic slope row.
  const slopeCells = ['_tokens / record (asymptotic)_']
  for (const f of formatNames) {
    const slope = slopePerRecord(gen.name, f)
    slopeCells.push(slope ? slope.tokensPerRecord.toFixed(2) : 'n/a')
  }

  return `### ${gen.description}

| ${headerCells.join(' | ')} |
| ${sep.join(' | ')} |
${rows.join('\n')}
| ${slopeCells.join(' | ')} |
`
}

const sections = GENERATORS.map(renderGenerator).join('\n')

const markdown = `# Scaling Behaviour

${getMachineInfo()}

**Tokenizer:** \`gpt-tokenizer\` with \`o200k_base\` encoding (GPT-4o / GPT-5 family).
**Baseline:** \`${BASELINE}\` — every other format is shown as a percentage delta on the same input.

For each generator, we measure the encoded token count at sizes ${SIZES.join(', ')}.
The final row, "tokens / record (asymptotic)", reports the difference between
the two largest sample points divided by their record-count difference. That
is the rate at which a format grows with one extra record at scale — the
number that determines cost in production.

A format with a smaller asymptotic slope wins at large N, even if it loses
on small N (where header / schema overhead dominates). A format that fails
on the input shape is reported as \`n/a\` and not silently replaced.

${sections}

> Methodology note: TRON state is reset between each (generator, size) pair
> so per-measurement compression dictionaries do not leak across rows.
`

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)

const outputFilePath = path.join(resultsDir, 'scaling.md')
await fsp.writeFile(outputFilePath, markdown, 'utf-8')

prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputFilePath)}\``)
