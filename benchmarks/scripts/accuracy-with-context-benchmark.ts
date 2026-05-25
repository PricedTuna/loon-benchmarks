import type { Question } from '../src/types.ts'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import * as prompts from '@clack/prompts'
import PQueue from 'p-queue'
import { BENCHMARKS_DIR, DEFAULT_CONCURRENCY, DRY_RUN, DRY_RUN_LIMITS, FAST_FORMAT, FAST_FORMAT_FORMATS, FORMATTER_DISPLAY_NAMES, MODEL_RPM_LIMITS, ROOT_DIR } from '../src/constants.ts'
import { ACCURACY_DATASETS } from '../src/datasets.ts'
import { evaluateQuestion, models } from '../src/evaluate.ts'
import { contextSourcePath, countContextTokens, loadFormatContext } from '../src/format-context.ts'
import { formatters, isLoonFormat, supportsCSV } from '../src/formatters.ts'
import { generateQuestions } from '../src/questions/index.ts'
import { saveContextModelResults } from '../src/storage.ts'
import { ensureDir, getMachineInfo, tokenize } from '../src/utils.ts'
import { getSpec } from 'loon-core'

/**
 * Retrieval-accuracy benchmark **with format context**.
 *
 * @remarks
 * Same setup as `accuracy-benchmark.ts`, with one difference: each prompt is
 * preceded by the format's canonical LLM-facing documentation (markdown).
 *
 *   - LOON  → \`format-docs/loon.md\`
 *   - TOON  → \`format-docs/toon.md\`  (≈ toon's docs/guide/llm-prompts.md)
 *   - JSON / YAML / XML / CSV → short paragraph-level primer.
 *
 * What the report shows for each format:
 *
 *   - context tokens (the .md document, counted once)
 *   - average payload tokens (the encoded data per question)
 *   - average input tokens (= context + payload + prompt scaffolding)
 *   - accuracy
 *
 * Whether to run *with* or *without* context depends on the question being
 * asked. "Can the LLM read this format zero-shot?" → no context (the
 * baseline accuracy benchmark). "Is this format usable in production where
 * I would naturally include a primer in my system prompt?" → with context.
 * Both are valid; reporting both is honest.
 *
 * Important neutrality property: the context is loaded *per format from
 * its own canonical doc*. We do NOT inject hints about the dataset, the
 * questions, or the answers. The context only describes the format.
 */

const PROGRESS_UPDATE_INTERVAL = 10
const RATE_LIMIT_INTERVAL_MS = 60_000

prompts.intro('Retrieval Accuracy Benchmark — with format context')

// ── Load context docs up front (one read per format) ────────────────────────

const contextByFormat: Record<string, string> = {}
const contextTokensByFormat: Record<string, number> = {}

const formatNames = FAST_FORMAT
  ? Object.keys(formatters).filter(name => FAST_FORMAT_FORMATS.has(name))
  : Object.keys(formatters)

for (const formatName of formatNames) {
  const doc = await loadFormatContext(formatName)
  contextByFormat[formatName] = doc
  contextTokensByFormat[formatName] = countContextTokens(doc)
  const src = contextSourcePath(formatName)
  prompts.log.info(`${FORMATTER_DISPLAY_NAMES[formatName] ?? formatName}: ${contextTokensByFormat[formatName]} context tokens ${src ? `(${path.relative(ROOT_DIR, src)})` : '(no doc registered)'}`)
}

// ── Task fan-out ─────────────────────────────────────────────────────────────

function generateEvaluationTasks(questions: Question[]): { question: Question, formatName: string }[] {
  const tasks: { question: Question, formatName: string }[] = []

  const formatKeys = FAST_FORMAT
    ? Object.keys(formatters).filter(name => FAST_FORMAT_FORMATS.has(name))
    : Object.keys(formatters)

  for (const question of questions) {
    const dataset = ACCURACY_DATASETS.find(d => d.name === question.dataset)
    for (const formatName of formatKeys) {
      if (formatName === 'csv' && dataset && !supportsCSV(dataset))
        continue
      tasks.push({ question, formatName })
    }
  }

  return tasks
}

function createEvaluationQueue(modelId: string) {
  const rpmLimit = MODEL_RPM_LIMITS[modelId]
  return new PQueue({
    concurrency: DEFAULT_CONCURRENCY,
    intervalCap: rpmLimit ?? Infinity,
    interval: rpmLimit ? RATE_LIMIT_INTERVAL_MS : 0,
  })
}

function createProgressUpdater(spinner: ReturnType<typeof prompts.spinner>, total: number) {
  let completed = 0
  return () => {
    completed++
    if (completed % PROGRESS_UPDATE_INTERVAL === 0 || completed === total) {
      const percent = ((completed / total) * 100).toFixed(1)
      spinner.message(`Progress: ${completed}/${total} (${percent}%)`)
    }
  }
}

// ── Model selection ─────────────────────────────────────────────────────────

const modelChoices = models.map(({ modelId }) => ({ value: modelId, label: modelId }))

// Non-interactive override via `BENCH_MODELS` (comma-separated ids, or "all")
// so the benchmark runs in CI / scripted environments without a TTY.
let selectedModels: string[]
const envModels = (process.env.BENCH_MODELS ?? '').trim()
if (envModels) {
  selectedModels = envModels === 'all'
    ? models.map(m => m.modelId)
    : envModels.split(',').map(s => s.trim()).filter(Boolean)
}
else {
  const picked = await prompts.multiselect({
    message: 'Select models to benchmark (Space to select, Enter to confirm)',
    options: modelChoices,
    required: true,
  })
  if (prompts.isCancel(picked)) {
    prompts.cancel('Benchmark cancelled')
    process.exit(0)
  }
  selectedModels = picked as string[]
}

const activeModels = models.filter(m => selectedModels.includes(m.modelId))
prompts.log.info(`Selected ${activeModels.length} model(s): ${activeModels.map(m => m.modelId).join(', ')}`)

let questions = generateQuestions()
if (DRY_RUN) {
  const byDataset = new Map<string, number>()
  questions = questions.filter(q => {
    const count = byDataset.get(q.dataset) || 0
    if (count < 2) {
      byDataset.set(q.dataset, count + 1)
      return true
    }
    return false
  })
}

if (FAST_FORMAT) {
  prompts.log.info('Fast format mode: testing only toon, loon, and jton formats')
}

prompts.log.info(`Evaluating ${questions.length} questions (${DRY_RUN ? 'DRY_RUN' : 'full'})`)

// ── Run ──────────────────────────────────────────────────────────────────────

interface RunRecord {
  questionId: string
  format: string
  model: string
  expected: string
  actual: string
  isCorrect: boolean
  inputTokens: number | undefined
  outputTokens: number | undefined
  latencyMs: number
  payloadTokens: number
  contextTokens: number
}

const allRuns: RunRecord[] = []

for (const model of activeModels) {
  prompts.log.step(`Running ${model.modelId}`)
  const tasks = generateEvaluationTasks(questions)
  const queue = createEvaluationQueue(model.modelId)
  const spinner = prompts.spinner()
  spinner.start(`Running ${tasks.length} evaluations…`)
  const updateProgress = createProgressUpdater(spinner, tasks.length)

  const runPromises = tasks.map(task => queue.add(async () => {
    const dataset = ACCURACY_DATASETS.find(d => d.name === task.question.dataset)
    if (!dataset)
      return null
    const formatter = formatters[task.formatName]!
    const formattedData = formatter(dataset.data)
    const payloadTokens = tokenize(formattedData)

    // LOON ships a per-payload decode spec via getSpec(): minimal (only the
    // sections the payload actually uses) and always in sync with the encoder,
    // unlike a hand-maintained static doc. Other formats keep their static doc.
    let extraContext = contextByFormat[task.formatName]
    let contextTokens = contextTokensByFormat[task.formatName] ?? 0
    if (isLoonFormat(task.formatName) && formattedData) {
      extraContext = getSpec(formattedData).text
      contextTokens = tokenize(extraContext)
    }

    const result = await evaluateQuestion({
      question: task.question,
      formatName: task.formatName,
      formattedData,
      model,
      extraContext,
    })

    updateProgress()

    const run: RunRecord = {
      questionId: result.questionId,
      format: result.format,
      model: result.model,
      expected: result.expected,
      actual: result.actual,
      isCorrect: result.isCorrect,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
      payloadTokens,
      contextTokens,
    }
    return run
  }) as Promise<RunRecord | null>)

  const settled = await Promise.all(runPromises)
  spinner.stop(`Done for ${model.modelId}`)
  const modelRuns: RunRecord[] = []
  for (const r of settled) if (r) { allRuns.push(r); modelRuns.push(r) }

  // Persist per-question records to a SEPARATE storage directory
  // (`results/accuracy/models-with-context/`) so the with-spec run never
  // clobbers the no-spec `accuracy-benchmark.ts` results and the no-spec
  // report does not accidentally pick them up.
  await saveContextModelResults(model.modelId, modelRuns.map(r => ({
    questionId: r.questionId,
    format: r.format,
    model: r.model,
    expected: r.expected,
    actual: r.actual,
    isCorrect: r.isCorrect,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    latencyMs: r.latencyMs,
  })))
}

// ── Report ──────────────────────────────────────────────────────────────────

interface FormatSummary {
  format: string
  contextTokens: number
  avgPayloadTokens: number
  avgInputTokens: number
  accuracy: number
  correct: number
  total: number
  avgLatencyMs: number
}

function summarizeByFormat(): FormatSummary[] {
  const byFormat = new Map<string, RunRecord[]>()
  for (const r of allRuns) {
    if (!byFormat.has(r.format))
      byFormat.set(r.format, [])
    byFormat.get(r.format)!.push(r)
  }

  const out: FormatSummary[] = []
  for (const [format, rs] of byFormat) {
    const correct = rs.filter(r => r.isCorrect).length
    const total = rs.length
    const accuracy = total === 0 ? 0 : correct / total
    const avgPayloadTokens = rs.reduce((s, r) => s + r.payloadTokens, 0) / total
    const avgInputTokens = rs.reduce((s, r) => s + (r.inputTokens ?? 0), 0) / total
    const avgLatencyMs = rs.reduce((s, r) => s + r.latencyMs, 0) / total
    // Average the per-run context size. For most formats this is the constant
    // static-doc size; for LOON it varies per payload (getSpec emits only the
    // sections that payload uses), so a static lookup would be wrong.
    const avgContextTokens = rs.reduce((s, r) => s + r.contextTokens, 0) / total
    out.push({
      format,
      contextTokens: Math.round(avgContextTokens),
      avgPayloadTokens: Math.round(avgPayloadTokens),
      avgInputTokens: Math.round(avgInputTokens),
      accuracy,
      correct,
      total,
      avgLatencyMs: Math.round(avgLatencyMs),
    })
  }
  return out.sort((a, b) => b.accuracy - a.accuracy)
}

const summaries = summarizeByFormat()

const table = [
  '| Format | Accuracy | Context tokens | Avg payload | Avg total input | Avg latency |',
  '| ------ | -------- | -------------- | ----------- | --------------- | ----------- |',
  ...summaries.map((s) => {
    const display = FORMATTER_DISPLAY_NAMES[s.format] ?? s.format
    const acc = `${(s.accuracy * 100).toFixed(1)}% (${s.correct}/${s.total})`
    return `| ${display} | ${acc} | ${s.contextTokens.toLocaleString('en-US')} | ${s.avgPayloadTokens.toLocaleString('en-US')} | ${s.avgInputTokens.toLocaleString('en-US')} | ${s.avgLatencyMs.toLocaleString('en-US')} ms |`
  }),
].join('\n')

const totalEvaluations = allRuns.length

const markdown = `# Retrieval Accuracy — with format context

${getMachineInfo()}

This benchmark prepends each format's canonical LLM-facing documentation
to every prompt. The aim is to measure formats under realistic deployment
conditions, where a developer would normally include a short primer in
the system prompt for a non-standard format.

**Models exercised:** ${activeModels.map(m => `\`${m.modelId}\``).join(', ')}.
**Questions:** ${questions.length} (${DRY_RUN ? 'DRY_RUN — limited' : 'full set'}).
**Total evaluations recorded:** ${totalEvaluations.toLocaleString('en-US')}.

## Per-format results

${table}

- **Context tokens** = size of the format's documentation prepended to every prompt (counted once per format, charged per call by the model provider).
- **Avg payload** = average token count of the encoded data per question.
- **Avg total input** = average input tokens reported by the model — context + payload + question + scaffolding.
- **Accuracy** = correct answers ÷ total evaluations across all selected models.

## Methodology — what each format received as context

| Format | Source document | Tokens |
| ------ | --------------- | ------ |
${summaries.map((s) => {
  const display = FORMATTER_DISPLAY_NAMES[s.format] ?? s.format
  const src = contextSourcePath(s.format)
  return `| ${display} | ${src ? path.relative(ROOT_DIR, src) : '_(none)_'} | ${s.contextTokens.toLocaleString('en-US')} |`
}).join('\n')}

The context for each format is its own canonical authoring-team document
(or, for well-known formats, a short paragraph primer comparable to what
an LLM has seen during pretraining). No document contains hints about the
benchmark's dataset, questions, or answers — only the format's syntax.

## Reading the trade-off

A format that scores high accuracy but has a large context cost is more
expensive in production: every API call pays the context tokens. Compare
two formats by **(accuracy gained per total input token)** if cost is what
you care about; compare by raw accuracy if budget is fixed.

The companion zero-context benchmark (\`accuracy-benchmark.ts\`) measures
the same questions without any format primer beyond a one-line label —
useful to see how much each format relies on its primer.
`

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)

const outputFilePath = path.join(resultsDir, 'retrieval-accuracy-with-context.md')
await fsp.writeFile(outputFilePath, markdown, 'utf-8')

prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputFilePath)}\``)
