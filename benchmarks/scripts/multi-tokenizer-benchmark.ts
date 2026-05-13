import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { BENCHMARKS_DIR, FORMATTER_DISPLAY_NAMES, ROOT_DIR } from '../src/constants.ts'
import { TOKEN_EFFICIENCY_DATASETS } from '../src/datasets.ts'
import { formatters, supportsJTON, supportsTRON } from '../src/formatters.ts'
import { TOKENIZER_LABELS, TOKENIZER_NOTES, TokenizerId, ensureDir, getMachineInfo, tokenizeAll } from '../src/utils.ts'
import { tron } from '../../extra-formats/Tron-Core/dist/index.mjs'

/**
 * Multi-tokenizer token efficiency benchmark.
 *
 * @remarks
 * Measures how token counts differ across GPT-4o, GPT-4, Claude, and Gemini
 * tokenizers for the same encoded payloads. This matters because:
 *
 *   - Token savings reported with one tokenizer may not hold for another.
 *   - TRON uses Base36 integers; tokenizers split digits differently.
 *   - Anthropic and Google tokenizers handle punctuation-dense formats
 *     (TRON pipe-delimited arrays, TOON length markers) at different rates.
 *
 * Accuracy notes per tokenizer:
 *   - GPT-4o (o200k_base): exact
 *   - GPT-4 (cl100k_base): exact
 *   - Claude (≈): @anthropic-ai/tokenizer community build, ±5%
 *   - Gemini (≈): SentencePiece not public; o200k_base proxy, ±10%
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

const TOKENIZER_IDS: TokenizerId[] = ['gpt', 'gpt4', 'claude', 'gemini']
const BASELINE = 'json-compact'

prompts.intro('Multi-Tokenizer Token Efficiency Benchmark')

const results: DatasetResult[] = []

for (const dataset of TOKEN_EFFICIENCY_DATASETS) {
  prompts.log.step(`Encoding ${dataset.name}…`)
  const rows: FormatRow[] = []

  for (const [formatName, formatter] of Object.entries(formatters)) {
    if (formatName === 'csv' && !dataset.metadata.supportsCSV) {
      rows.push({ format: formatName, tokens: Object.fromEntries(TOKENIZER_IDS.map(id => [id, null])) })
      continue
    }

    const fakeDs = { ...dataset, data: dataset.data as any }
    if (formatName === 'tron' && !supportsTRON(fakeDs)) {
      rows.push({ format: formatName, tokens: Object.fromEntries(TOKENIZER_IDS.map(id => [id, null])) })
      continue
    }
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

  tron.reset()
  results.push({ name: dataset.name, description: dataset.description, rows })
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
  lines.push('## Tokenizer Agreement')
  lines.push('')
  lines.push('How much do Claude and Gemini token counts differ from GPT-4o on the same encoded text?')
  lines.push('Cells show the average absolute % difference across all datasets where the format was representable.')
  lines.push('')

  const headerCols = ['Format', 'GPT-4 vs GPT-4o', 'Claude vs GPT-4o', 'Gemini vs GPT-4o']
  lines.push(`| ${headerCols.join(' | ')} |`)
  lines.push(`| ${headerCols.map(() => '---').join(' | ')} |`)

  for (const [formatName] of Object.entries(formatters)) {
    const diffs: Record<'gpt4' | 'claude' | 'gemini', number[]> = { gpt4: [], claude: [], gemini: [] }

    for (const ds of results) {
      const row = ds.rows.find(r => r.format === formatName)
      if (!row) continue
      const gptVal = row.tokens.gpt
      if (gptVal === null || gptVal === undefined || gptVal === 0) continue
      for (const id of ['gpt4', 'claude', 'gemini'] as const) {
        const v = row.tokens[id]
        if (v === null || v === undefined) continue
        diffs[id].push(Math.abs((v - gptVal) / gptVal) * 100)
      }
    }

    const avg = (arr: number[]) => arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length
    const fmt = (v: number | null) => v === null ? 'n/a' : `${v.toFixed(1)}%`

    const display = FORMATTER_DISPLAY_NAMES[formatName] ?? formatName
    lines.push(`| ${display} | ${fmt(avg(diffs.gpt4))} | ${fmt(avg(diffs.claude))} | ${fmt(avg(diffs.gemini))} |`)
  }

  return lines.join('\n')
}

const datasetSections = results.map(renderDataset).join('\n')
const agreementTable = renderAgreementTable()

const markdown = `# Multi-Tokenizer Token Efficiency

${getMachineInfo()}

Measures token counts across four tokenizers for every (format, dataset) pair.
Token savings that hold across all tokenizers are more robust claims for a paper
than savings measured on a single tokenizer.

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

> **Methodology**: Claude and Gemini tokenizers are approximations. Differences
> of ±5–10% vs the exact tokenizers are expected and disclosed per cell. The
> agreement table above quantifies the systematic bias so readers can judge
> whether cross-tokenizer claims are reliable.
`

prompts.log.message(agreementTable)

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)
const outputPath = path.join(resultsDir, 'multi-tokenizer.md')
await fsp.writeFile(outputPath, markdown, 'utf-8')
prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputPath)}\``)
