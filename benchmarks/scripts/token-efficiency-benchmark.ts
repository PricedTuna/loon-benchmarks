import type { Dataset } from '../src/types.ts'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { BENCHMARKS_DIR, FORMATTER_DISPLAY_NAMES, ROOT_DIR } from '../src/constants.ts'
import { TOKEN_EFFICIENCY_DATASETS } from '../src/datasets.ts'
import { formatters, resetLoonEncoder, supportsCSV, supportsJTON } from '../src/formatters.ts'
import { createProgressBar, ensureDir, getMachineInfo, tokenize } from '../src/utils.ts'

/**
 * Token-efficiency benchmark.
 *
 * @remarks
 * Neutrality choices vs. the original toon-format benchmark:
 *   - Baseline format is `json-compact`, not TOON. JSON-compact is the
 *     incumbent serialization format and the natural neutral reference.
 *   - All formats are reported with the same delta semantics; no format
 *     receives a leading row, baseline-bar, or "vs CSV" footnote.
 *   - CSV is skipped on datasets where it cannot represent the structure
 *     (`supportsCSV` returns false). JTON is skipped on datasets it cannot
 *     represent (`supportsJTON`).
 *   - Reports are emitted with explicit "n/a" cells for unrepresentable
 *     pairs rather than silently omitting rows.
 */

interface FormatMetric {
  name: string
  tokens: number | null // null when format cannot represent the dataset
}

interface DatasetResult {
  dataset: Dataset
  metrics: FormatMetric[]
}

const PROGRESS_BAR_WIDTH = 20
const TOKEN_PADDING = 8
const BASELINE_FORMAT = 'json-compact'

const DATASET_ICONS: Record<string, string> = {
  'tabular': '👥',
  'nested': '🛒',
  'analytics': '📈',
  'github': '⭐',
  'event-logs': '🧾',
  'nested-config': '🧩',
}

prompts.intro('Token Efficiency Benchmark (neutral)')

// ── Measurement ───────────────────────────────────────────────────────────────

const results: DatasetResult[] = []

for (const dataset of TOKEN_EFFICIENCY_DATASETS) {
  const metrics: FormatMetric[] = []

  for (const [formatName, formatter] of Object.entries(formatters)) {
    if (formatName === 'csv' && !supportsCSV(dataset)) {
      metrics.push({ name: formatName, tokens: null })
      continue
    }
    if (formatName === 'jton' && !supportsJTON(dataset)) {
      metrics.push({ name: formatName, tokens: null })
      continue
    }

    let tokens: number | null = null
    try {
      const formatted = formatter(dataset.data)
      tokens = tokenize(formatted)
    }
    catch (err) {
      // A format threw on this dataset. We record null and surface the
      // failure so it cannot be silently swept into a fallback path.
      prompts.log.warn(`${formatName} failed on ${dataset.name}: ${err instanceof Error ? err.message : String(err)}`)
    }

    metrics.push({ name: formatName, tokens })
  }

  resetLoonEncoder()
  results.push({ dataset, metrics })
}

// ── Report generation ────────────────────────────────────────────────────────

function deltaPctVsBaseline(tokens: number | null, baseline: number | null): string {
  if (tokens === null || baseline === null || baseline === 0)
    return '   n/a'
  const pct = ((tokens - baseline) / baseline) * 100
  const sign = pct >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pct).toFixed(1)}%`.padStart(7)
}

function renderDataset(result: DatasetResult): string {
  const { dataset, metrics } = result
  const baseline = metrics.find(m => m.name === BASELINE_FORMAT)?.tokens ?? null

  const validTokens = metrics
    .map(m => m.tokens)
    .filter((t): t is number => t !== null)
  const maxTokens = Math.max(...validTokens, 1)

  const emoji = DATASET_ICONS[dataset.name] ?? '📊'
  const header = `${emoji} ${dataset.description}  ┊  Tabular eligibility: ${dataset.metadata.tabularEligibility}%`

  const rows = metrics.map((m) => {
    const display = FORMATTER_DISPLAY_NAMES[m.name] ?? m.name
    if (m.tokens === null) {
      return `   ${display.padEnd(14)}  ${'░'.repeat(PROGRESS_BAR_WIDTH)}   ${'n/a'.padStart(TOKEN_PADDING)}            (not representable)`
    }
    const bar = createProgressBar(m.tokens, maxTokens, PROGRESS_BAR_WIDTH)
    const tokenStr = m.tokens.toLocaleString('en-US').padStart(TOKEN_PADDING)
    const isBaseline = m.name === BASELINE_FORMAT
    const delta = isBaseline ? ' (baseline)' : `   (${deltaPctVsBaseline(m.tokens, baseline)})`
    return `   ${display.padEnd(14)}  ${bar}   ${tokenStr} tokens${delta}`
  })

  return [header, '   │', ...rows].join('\n')
}

function renderTotals(rs: DatasetResult[]): string {
  const formatNames = Object.keys(formatters)

  const totals = formatNames.map((formatName) => {
    let sum = 0
    let countable = true
    for (const r of rs) {
      const m = r.metrics.find(x => x.name === formatName)
      if (!m || m.tokens === null) {
        countable = false
        break
      }
      sum += m.tokens
    }
    return { name: formatName, tokens: countable ? sum : null }
  })

  const baseline = totals.find(t => t.name === BASELINE_FORMAT)?.tokens ?? null
  const validTokens = totals.map(t => t.tokens).filter((t): t is number => t !== null)
  const maxTokens = Math.max(...validTokens, 1)

  const lines = [`${'─'.repeat(34)} Totals across all datasets ${'─'.repeat(34)}`]

  for (const t of totals) {
    const display = FORMATTER_DISPLAY_NAMES[t.name] ?? t.name
    if (t.tokens === null) {
      lines.push(`   ${display.padEnd(14)}  ${'░'.repeat(PROGRESS_BAR_WIDTH)}   ${'n/a'.padStart(TOKEN_PADDING)}            (partial coverage — not all datasets representable)`)
      continue
    }
    const bar = createProgressBar(t.tokens, maxTokens, PROGRESS_BAR_WIDTH)
    const tokenStr = t.tokens.toLocaleString('en-US').padStart(TOKEN_PADDING)
    const isBaseline = t.name === BASELINE_FORMAT
    const delta = isBaseline ? ' (baseline)' : `   (${deltaPctVsBaseline(t.tokens, baseline)})`
    lines.push(`   ${display.padEnd(14)}  ${bar}   ${tokenStr} tokens${delta}`)
  }

  return lines.join('\n')
}

const datasetSection = results.map(renderDataset).join('\n\n')
const totalsSection = renderTotals(results)

const markdown = `# Token Efficiency

${getMachineInfo()}

**Tokenizer:** \`gpt-tokenizer\` with \`o200k_base\` encoding (GPT-4o / GPT-5 family).
**Baseline:** \`${BASELINE_FORMAT}\` — every other format is reported as a percentage delta against this baseline.

Formats whose semantics cannot represent a given dataset are marked **n/a** in
that dataset's row and excluded from the totals row if the omission is not
total. No format is privileged in the headline ranking.

\`\`\`
${datasetSection}

${totalsSection}
\`\`\`

> **Reading the numbers**: A negative delta means the format produced fewer
> tokens than \`${BASELINE_FORMAT}\` on that input. A positive delta means more
> tokens. Token efficiency alone does not measure whether a model can answer
> questions over the encoded data — see \`retrieval-accuracy.md\` for that.
`

prompts.log.message(`\n${datasetSection}\n\n${totalsSection}\n`)

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)

const outputFilePath = path.join(resultsDir, 'token-efficiency.md')
await fsp.writeFile(outputFilePath, markdown, 'utf-8')

prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputFilePath)}\``)
