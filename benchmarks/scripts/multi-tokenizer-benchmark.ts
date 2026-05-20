import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { BENCHMARKS_DIR, FORMATTER_DISPLAY_NAMES, ROOT_DIR } from '../src/constants.ts'
import { TOKEN_EFFICIENCY_DATASETS } from '../src/datasets.ts'
import { formatters, resetLoonEncoder, supportsJTON } from '../src/formatters.ts'
import { TOKENIZER_LABELS, TOKENIZER_NOTES, TokenizerId, ensureDir, getMachineInfo, tokenizeAll } from '../src/utils.ts'

/**
 * Multi-tokenizer token efficiency benchmark.
 *
 * @remarks
 * Measures how token counts differ across seven tokenizers for every
 * (format, dataset) pair. This matters because:
 *
 *   - Token savings reported with one tokenizer may not hold for another.
 *   - Different model families tokenize dense encodings (TOON length markers,
 *     LOON columnar rows) at different rates.
 *
 * Tokenizers (all deterministic, all from npm — no network, no Python):
 *   - GPT-4o (o200k_base):  exact
 *   - GPT-4  (cl100k_base): exact
 *   - Claude:               exact via @lenml/tokenizer-claude
 *   - Gemini:               exact via @lenml/tokenizer-gemini
 *   - Llama 3.2 (local):    exact via @lenml/tokenizer-llama3_2
 *   - Qwen3     (local):    exact via @lenml/tokenizer-qwen3
 *   - Gemma 3   (local):    exact via @lenml/tokenizer-gemma3
 *
 * Datasets exercised:
 *   1. The curated `TOKEN_EFFICIENCY_DATASETS` (six synthetic shapes covering
 *      tabular / nested / semi-uniform / deep-config).
 *   2. Every JSON file in `benchmarks/data/` (~20 real-world payloads, from
 *      small reference lists to large CITM / Canada / Twitter dumps). Real
 *      files surface format biases that synthetic generators reward.
 */

type FormatRow = {
  format: string
  tokens: Partial<Record<TokenizerId, number | null>>
}

type DatasetResult = {
  name: string
  description: string
  rows: FormatRow[]
}

const TOKENIZER_IDS: TokenizerId[] = ['gpt', 'gpt4', 'claude', 'gemini', 'llama3', 'qwen3', 'gemma3']
const BASELINE = 'json-compact'

prompts.intro('Multi-Tokenizer Token Efficiency Benchmark')

/**
 * Load every JSON file under `benchmarks/data/` and wrap each one in the
 * `Dataset` shape expected by this benchmark. CSV is offered only on shapes
 * the CSV formatter can actually represent (array-of-flat-objects, or an
 * object with a single top-level array of flat objects).
 */
async function loadRealDataDatasets() {
  const dataDir = path.join(BENCHMARKS_DIR, 'data')
  const files = await fsp.readdir(dataDir)
  const datasets: Array<{
    name: string
    description: string
    data: unknown
    metadata: { supportsCSV: boolean; structureClass: 'uniform' | 'nested' | 'semi-uniform' | 'deep'; tabularEligibility: number }
  }> = []
  for (const f of files.sort()) {
    if (!f.endsWith('.json') || f.includes(' copy')) continue
    const full = path.join(dataDir, f)
    let raw: unknown
    try { raw = JSON.parse(await fsp.readFile(full, 'utf-8')) }
    catch { continue }
    const supportsCSV = (() => {
      const isFlatObjArray = (a: any): boolean =>
        Array.isArray(a) && a.length > 0 && typeof a[0] === 'object' && a[0] !== null
        && !Array.isArray(a[0]) && Object.values(a[0]).every(v => v === null || typeof v !== 'object')
      if (isFlatObjArray(raw)) return true
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        const entries = Object.entries(raw as object)
        if (entries.length === 1 && isFlatObjArray(entries[0][1])) return true
      }
      return false
    })()
    datasets.push({
      name: f.replace(/\.json$/, ''),
      description: f,
      data: raw,
      metadata: { supportsCSV, structureClass: 'nested', tabularEligibility: 0 },
    })
  }
  return datasets
}

const realDataDatasets = await loadRealDataDatasets()
const allDatasets: Array<{ name: string; description: string; data: unknown; metadata: any; section: 'synthetic' | 'real' }> = [
  ...TOKEN_EFFICIENCY_DATASETS.map(d => ({ ...d, section: 'synthetic' as const })),
  ...realDataDatasets.map(d => ({ ...d, section: 'real' as const })),
]

const results: (DatasetResult & { section: 'synthetic' | 'real' })[] = []

for (const dataset of allDatasets) {
  prompts.log.step(`Encoding ${dataset.name}…`)
  const rows: FormatRow[] = []

  for (const [formatName, formatter] of Object.entries(formatters)) {
    if (formatName === 'csv' && !dataset.metadata.supportsCSV) {
      rows.push({ format: formatName, tokens: Object.fromEntries(TOKENIZER_IDS.map(id => [id, null])) })
      continue
    }

    const fakeDs = { ...dataset, data: dataset.data as any } as any
    if (formatName === 'jton' && !supportsJTON(fakeDs)) {
      rows.push({ format: formatName, tokens: Object.fromEntries(TOKENIZER_IDS.map(id => [id, null])) })
      continue
    }

    let encoded: string
    try {
      encoded = formatter(dataset.data)
    }
    catch (err) {
      prompts.log.warn(`${formatName} failed on ${dataset.name}: ${err instanceof Error ? err.message : String(err)}`)
      rows.push({ format: formatName, tokens: Object.fromEntries(TOKENIZER_IDS.map(id => [id, null])) })
      continue
    }

    const tokens = await tokenizeAll(encoded)
    rows.push({ format: formatName, tokens })
  }

  resetLoonEncoder()
  results.push({ name: dataset.name, description: dataset.description, rows, section: dataset.section })
}

// ── Report ────────────────────────────────────────────────────────────────────

function fmtCell(tokens: number | null | undefined, baseline: number | null | undefined): string {
  if (tokens === null || tokens === undefined) return 'n/a'
  if (baseline === null || baseline === undefined || baseline === 0) return tokens.toLocaleString('en-US')
  const pct = ((tokens - baseline) / baseline) * 100
  const sign = pct >= 0 ? '+' : '−'
  return `${tokens.toLocaleString('en-US')} (${sign}${Math.abs(pct).toFixed(1)}%)`
}

function renderDataset(ds: DatasetResult): string {
  const headerCols = ['Format', ...TOKENIZER_IDS.map(id => TOKENIZER_LABELS[id])]
  const sep = headerCols.map(() => '---')

  const tableRows = ds.rows.map((row) => {
    const display = FORMATTER_DISPLAY_NAMES[row.format] ?? row.format
    const baselineRow = ds.rows.find(r => r.format === BASELINE)
    const cells = [display]
    for (const id of TOKENIZER_IDS) {
      const t = row.tokens[id] ?? null
      const base = baselineRow?.tokens[id] ?? null
      cells.push(row.format === BASELINE ? (t === null ? 'n/a' : `${t.toLocaleString('en-US')} _(baseline)_`) : fmtCell(t, base))
    }
    return `| ${cells.join(' | ')} |`
  })

  return `### ${ds.description}

| ${headerCols.join(' | ')} |
| ${sep.join(' | ')} |
${tableRows.join('\n')}
`
}

// Cross-dataset tokenizer agreement table:
// For each (format, tokenizer pair), compute the % difference vs GPT-4o baseline.
function renderAgreementTable(): string {
  const lines: string[] = []
  // All non-baseline tokenizers — we compare each one against `gpt` (GPT-4o).
  const peerIds = TOKENIZER_IDS.filter(id => id !== 'gpt')
  lines.push('## Tokenizer Agreement')
  lines.push('')
  lines.push('Average absolute % difference vs GPT-4o token count, across every (format, dataset)')
  lines.push('cell where the format was representable. Closer to 0% = the format compresses the same')
  lines.push('amount on that tokenizer as on GPT-4o.')
  lines.push('')

  const headerCols = ['Format', ...peerIds.map(id => `${TOKENIZER_LABELS[id]} vs GPT-4o`)]
  lines.push(`| ${headerCols.join(' | ')} |`)
  lines.push(`| ${headerCols.map(() => '---').join(' | ')} |`)

  for (const [formatName] of Object.entries(formatters)) {
    const diffs: Record<TokenizerId, number[]> = Object.fromEntries(peerIds.map(id => [id, [] as number[]])) as any

    for (const ds of results) {
      const row = ds.rows.find(r => r.format === formatName)
      if (!row) continue
      const gptVal = row.tokens.gpt
      if (gptVal === null || gptVal === undefined || gptVal === 0) continue
      for (const id of peerIds) {
        const v = row.tokens[id]
        if (v === null || v === undefined) continue
        diffs[id].push(Math.abs((v - gptVal) / gptVal) * 100)
      }
    }

    const avg = (arr: number[]) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length
    const fmt = (v: number | null) => v === null ? 'n/a' : `${v.toFixed(1)}%`

    const display = FORMATTER_DISPLAY_NAMES[formatName] ?? formatName
    const cells = peerIds.map(id => fmt(avg(diffs[id])))
    lines.push(`| ${display} | ${cells.join(' | ')} |`)
  }

  return lines.join('\n')
}

const syntheticSection = results.filter(r => r.section === 'synthetic').map(renderDataset).join('\n')
const realSection = results.filter(r => r.section === 'real').map(renderDataset).join('\n')
const datasetSections = `### Synthetic datasets\n\n${syntheticSection}\n### Real-world JSON files (\`benchmarks/data/\`)\n\n${realSection}`
const agreementTable = renderAgreementTable()

const markdown = `# Multi-Tokenizer Token Efficiency

${getMachineInfo()}

Measures token counts across seven tokenizers for every (format, dataset)
pair. Token savings that hold across all of them — frontier (GPT-4o, GPT-4,
Claude, Gemini) and representative local models (Llama 3.2, Qwen3, Gemma 3)
— are more robust claims than savings measured on a single tokenizer.

## Tokenizer legend

| ID | Label | Accuracy |
| --- | --- | --- |
${TOKENIZER_IDS.map(id => `| \`${id}\` | ${TOKENIZER_LABELS[id]} | ${TOKENIZER_NOTES[id]} |`).join('\n')}

> **Reading the table**: each cell shows raw token count and % vs \`json-compact\`
> baseline on the same tokenizer column. Comparing across tokenizer columns is
> intentionally valid — different absolute counts are expected; what matters is
> whether the _relative_ savings are consistent.

## Per-dataset results

${datasetSections}

${agreementTable}

> **Methodology**: every tokenizer is now exact — Claude / Gemini / local
> models are loaded from \`@lenml/tokenizer-*\` bundles (deterministic, no
> network, no Python). Cross-tokenizer differences are real properties of
> each tokenizer, not approximation error. The agreement table above
> quantifies them so a reader can judge whether a given format's compression
> is uniform across model families.
`

prompts.log.message(agreementTable)

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)
const outputPath = path.join(resultsDir, 'multi-tokenizer.md')
await fsp.writeFile(outputPath, markdown, 'utf-8')
prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputPath)}\``)
