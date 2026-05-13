import type { LanguageModelV3 } from '@ai-sdk/provider'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import * as prompts from '@clack/prompts'
import PQueue from 'p-queue'
import { generateText } from 'ai'
import { BENCHMARKS_DIR, DEFAULT_CONCURRENCY, DRY_RUN, FORMATTER_DISPLAY_NAMES, MODEL_RPM_LIMITS, ROOT_DIR } from '../src/constants.ts'
import { generateEmployees, generateEventLogs, generateOrders } from '../src/datasets.ts'
import { models, PRIMERS } from '../src/evaluate.ts'
import { formatters, supportsCSV, supportsTRON } from '../src/formatters.ts'
import { ensureDir, getMachineInfo, tokenize } from '../src/utils.ts'

/**
 * LLM real-task benchmark.
 *
 * @remarks
 * The questions used by `accuracy-benchmark.ts` are deliberately small and
 * deterministic so the comparator can score them automatically. That keeps
 * the headline accuracy number objective — but it means the LLM is mostly
 * doing point lookups, which any format can support.
 *
 * This benchmark runs *production-style* tasks where the model has to do
 * real work over the data: aggregations, multi-condition filters, and
 * extractions that return structured output. Tasks are graded by a
 * deterministic checker, not by an LLM judge, so the scoring is reproducible.
 *
 * Task shape: every task is `{ prompt, check(answer): boolean }`. We measure:
 *   - whether the model's answer passes the checker (correctness),
 *   - input + output token usage (cost),
 *   - end-to-end latency (responsiveness).
 *
 * Tasks are dataset-agnostic in wording. Same prompt template across all
 * formats — only the encoded payload differs. No format gets a tutorial in
 * its primer (see `evaluate.ts`).
 */

interface Task {
  id: string
  prompt: string
  check: (modelAnswer: string) => boolean
  payload: unknown
  /**
   * The shape class controls which formats are skipped. A `flat-array` task
   * is representable by every format including CSV and TRON; a `nested`
   * task skips both.
   */
  shape: 'flat-array' | 'flat-object-array' | 'nested'
}

interface Run {
  taskId: string
  format: string
  model: string
  ok: boolean
  answer: string
  expected: string
  inputTokens: number | undefined
  outputTokens: number | undefined
  latencyMs: number
}

prompts.intro('LLM Real-Task Benchmark (neutral)')

// ── Task generation ──────────────────────────────────────────────────────────

function buildTasks(): Task[] {
  const employees = generateEmployees(80).employees // 80 employees
  const orders = generateOrders(40).orders // 40 orders
  const eventLogs = generateEventLogs(60).logs // 60 logs

  const tasks: Task[] = []

  // Task 1: aggregation count (employees)
  {
    const target = 'Engineering'
    const expected = employees.filter(e => e.department === target).length
    tasks.push({
      id: 'employees.count_engineering',
      prompt: `How many records have department equal to "${target}"? Reply with the integer only.`,
      check: ans => Number.parseInt(ans.trim(), 10) === expected,
      payload: { employees },
      shape: 'flat-object-array',
    })
  }

  // Task 2: average (employees salary)
  {
    const expected = employees.reduce((s, e) => s + e.salary, 0) / employees.length
    tasks.push({
      id: 'employees.avg_salary',
      prompt: 'What is the average salary across all records? Reply with the number rounded to the nearest integer, no separators.',
      check: (ans) => {
        const n = Number.parseInt(ans.replace(/[^\d-]/g, ''), 10)
        return Math.abs(n - Math.round(expected)) <= 1
      },
      payload: { employees },
      shape: 'flat-object-array',
    })
  }

  // Task 3: multi-condition filter (employees)
  {
    const expected = employees.filter(e => e.department === 'Sales' && e.salary > 80000).length
    tasks.push({
      id: 'employees.sales_over_80k',
      prompt: 'How many records have department "Sales" AND salary greater than 80000? Reply with the integer only.',
      check: ans => Number.parseInt(ans.trim(), 10) === expected,
      payload: { employees },
      shape: 'flat-object-array',
    })
  }

  // Task 4: extraction returning a list (orders.statuses)
  {
    const distinct = [...new Set(orders.map(o => o.status))].sort()
    tasks.push({
      id: 'orders.distinct_statuses',
      prompt: 'List all distinct values of the "status" field across the dataset. Reply with comma-separated values, no spaces, sorted alphabetically.',
      check: (ans) => {
        const got = ans.trim().split(',').map(s => s.trim()).sort()
        return JSON.stringify(got) === JSON.stringify(distinct)
      },
      payload: { orders },
      shape: 'nested',
    })
  }

  // Task 5: aggregation over nested array (orders.total_revenue)
  {
    const expected = Math.round(orders.reduce((s, o) => s + o.total, 0))
    tasks.push({
      id: 'orders.total_revenue',
      prompt: 'What is the sum of the "total" field across all records? Reply with the integer (rounded to the nearest unit) only, no symbols.',
      check: (ans) => {
        const n = Number.parseInt(ans.replace(/[^\d-]/g, ''), 10)
        return Math.abs(n - expected) <= 2
      },
      payload: { orders },
      shape: 'nested',
    })
  }

  // Task 6: filter then count, multi-step over semi-uniform (events.errors_on_payments)
  {
    const expected = eventLogs.filter(l => l.level === 'error' && l.endpoint === '/api/payments').length
    tasks.push({
      id: 'events.errors_on_payments',
      prompt: 'How many records have level equal to "error" AND endpoint equal to "/api/payments"? Reply with the integer only.',
      check: ans => Number.parseInt(ans.trim(), 10) === expected,
      payload: { logs: eventLogs },
      shape: 'nested',
    })
  }

  return tasks
}

// ── Format → encode ──────────────────────────────────────────────────────────

function isFormatApplicable(formatName: string, task: Task): boolean {
  if (formatName === 'csv') {
    // CSV needs flat-array shape — it cannot carry nested.
    return task.shape !== 'nested' && supportsCSV({
      name: 'task' as any,
      description: '',
      data: task.payload as Record<string, any>,
      metadata: { supportsCSV: true, structureClass: 'uniform', tabularEligibility: 100 },
    })
  }
  if (formatName === 'tron') {
    return supportsTRON({
      name: 'task' as any,
      description: '',
      data: task.payload as Record<string, any>,
      metadata: { supportsCSV: false, structureClass: 'uniform', tabularEligibility: 100 },
    })
  }
  return true
}

// ── Run all (task × format × model) ──────────────────────────────────────────

const tasks = buildTasks()
const taskCount = tasks.length

prompts.log.info(`Tasks: ${taskCount}`)
prompts.log.info(`Formats: ${Object.keys(formatters).length}`)
prompts.log.info(`Models in pool: ${models.length}`)

const modelChoices = models.map(({ modelId }) => ({ value: modelId, label: modelId }))
const selectedModels = await prompts.multiselect({
  message: 'Select models to run (Space to select, Enter to confirm)',
  options: modelChoices,
  required: true,
})
if (prompts.isCancel(selectedModels)) {
  prompts.cancel('Cancelled')
  process.exit(0)
}

const activeModels = models.filter(m => selectedModels.includes(m.modelId))
const runs: Run[] = []

const taskList = DRY_RUN ? tasks.slice(0, 2) : tasks

for (const model of activeModels) {
  prompts.log.step(`Running ${model.modelId}`)
  const queue = new PQueue({
    concurrency: DEFAULT_CONCURRENCY,
    intervalCap: MODEL_RPM_LIMITS[model.modelId] ?? Infinity,
    interval: MODEL_RPM_LIMITS[model.modelId] ? 60_000 : 0,
  })

  const jobs: Promise<Run | null>[] = []
  for (const task of taskList) {
    for (const [formatName, formatter] of Object.entries(formatters)) {
      if (!isFormatApplicable(formatName, task))
        continue
      jobs.push(queue.add(async () => {
        let formattedPayload: string
        try {
          formattedPayload = formatter(task.payload)
        }
        catch {
          return null
        }
        if (!formattedPayload)
          return null

        const primer = PRIMERS[formatName] ?? ''
        const prompt = `${primer}\n\n\`\`\`\n${formattedPayload}\n\`\`\`\n\n${task.prompt}\n\nAnswer:`

        const start = performance.now()
        const { text, usage } = await generateText({ model: model as LanguageModelV3, prompt })
        const latency = performance.now() - start
        const answer = text.trim()

        return {
          taskId: task.id,
          format: formatName,
          model: model.modelId,
          ok: task.check(answer),
          answer,
          expected: '(see check function)',
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          latencyMs: Math.round(latency),
        } as Run
      }) as Promise<Run | null>)
    }
  }

  const settled = await Promise.all(jobs)
  for (const r of settled) if (r) runs.push(r)
}

// ── Reporting ────────────────────────────────────────────────────────────────

const formatNames = Object.keys(formatters)

function bucket<T, K extends string>(items: T[], key: (i: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const i of items) {
    const k = key(i)
    if (!m.has(k))
      m.set(k, [])
    m.get(k)!.push(i)
  }
  return m
}

const byFormat = bucket(runs, r => r.format)
const summaryRows = formatNames.map((fmt) => {
  const rs = byFormat.get(fmt) ?? []
  if (rs.length === 0)
    return `| ${FORMATTER_DISPLAY_NAMES[fmt] ?? fmt} | _no runs_ | — | — | — |`
  const correct = rs.filter(r => r.ok).length
  const total = rs.length
  const acc = (correct / total) * 100
  const avgIn = rs.reduce((s, r) => s + (r.inputTokens ?? 0), 0) / total
  const avgOut = rs.reduce((s, r) => s + (r.outputTokens ?? 0), 0) / total
  const avgLat = rs.reduce((s, r) => s + r.latencyMs, 0) / total
  return `| ${FORMATTER_DISPLAY_NAMES[fmt] ?? fmt} | ${correct}/${total} (${acc.toFixed(1)}%) | ${Math.round(avgIn)} | ${Math.round(avgOut)} | ${Math.round(avgLat)} ms |`
})

const perTaskHeader = ['Task', ...formatNames.map(f => FORMATTER_DISPLAY_NAMES[f] ?? f)]
const perTaskRows = tasks.map((t) => {
  const cells = [t.id]
  for (const f of formatNames) {
    const rs = runs.filter(r => r.taskId === t.id && r.format === f)
    if (rs.length === 0) {
      cells.push('—')
      continue
    }
    const correct = rs.filter(r => r.ok).length
    cells.push(`${correct}/${rs.length}`)
  }
  return `| ${cells.join(' | ')} |`
})

// Per-task encoded sizes (one measurement, model-independent).
const sizesHeader = ['Task', ...formatNames.map(f => FORMATTER_DISPLAY_NAMES[f] ?? f)]
const sizesRows = tasks.map((t) => {
  const cells = [t.id]
  for (const f of formatNames) {
    if (!isFormatApplicable(f, t)) {
      cells.push('n/a')
      continue
    }
    try {
      const encoded = formatters[f]!(t.payload)
      cells.push(encoded ? tokenize(encoded).toLocaleString('en-US') : 'n/a')
    }
    catch {
      cells.push('n/a')
    }
  }
  return `| ${cells.join(' | ')} |`
})

const markdown = `# LLM Real-Task Benchmark

${getMachineInfo()}

**Models exercised:** ${activeModels.map(m => `\`${m.modelId}\``).join(', ')}.
**Tasks:** ${taskList.length} (${DRY_RUN ? 'DRY_RUN — first 2 only' : 'full set'}).

Each task is graded by a deterministic checker — no LLM judge. The same
prompt template is used across formats; only the encoded payload differs.
Each format's primer is one short, symmetrical sentence (see \`evaluate.ts\`).

## Per-format summary (averaged across tasks and models)

| Format | Accuracy | Avg input tokens | Avg output tokens | Avg latency |
| ------ | -------- | ---------------- | ----------------- | ----------- |
${summaryRows.join('\n')}

## Per-task accuracy (correct / total runs)

| ${perTaskHeader.join(' | ')} |
| ${perTaskHeader.map(() => '---').join(' | ')} |
${perTaskRows.join('\n')}

## Encoded payload size per task (tokens)

| ${sizesHeader.join(' | ')} |
| ${sizesHeader.map(() => '---').join(' | ')} |
${sizesRows.join('\n')}

> Tasks 4–6 use nested payloads; CSV is omitted there because it cannot
> represent the input. Tasks 1–3 use a flat array; every format runs.
> No format is excluded for any other reason.
`

const resultsDir = path.join(BENCHMARKS_DIR, 'results')
await ensureDir(resultsDir)

const outputFilePath = path.join(resultsDir, 'llm-real-task.md')
await fsp.writeFile(outputFilePath, markdown, 'utf-8')

prompts.log.success(`Report saved to \`${path.relative(ROOT_DIR, outputFilePath)}\``)
