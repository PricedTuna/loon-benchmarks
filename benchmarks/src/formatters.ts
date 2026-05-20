import type { Dataset } from './types.ts'
import { stringify as stringifyCSV } from 'csv-stringify/sync'
import { XMLBuilder } from 'fast-xml-parser'
import { stringify as stringifyYAML } from 'yaml'
import { encode as encodeToon } from '@toon-format/toon'
import { loon } from '../../extra-formats/LOON/dist/index.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const _dir = dirname(fileURLToPath(import.meta.url))
const JTON_BRIDGE = join(_dir, '../../extra-formats/', 'jton-bridge.py')

// On Windows use the Python Launcher (`py -3.13`) so we hit the install
// that has jton. On POSIX fall back to `python3`.
const PYTHON_CMD = process.platform === 'win32' ? 'py' : 'python3'
const PYTHON_ARGS_PREFIX = process.platform === 'win32' ? ['-3.13'] : []

/**
 * Format converters registry.
 *
 * @remarks
 * All formatters use upstream/spec-correct encoders. No reimplementations:
 *   - TOON: official `@toon-format/toon` package (real spec, length markers, comma rows)
 *   - LOON: in-repo `loon` from `extra-formats/LOON`, exercised across all of its
 *     encoding modes (`loon-llm`, `loon-full`, `loon-local`, `loon-compact`) so
 *     each mode's token / fidelity / throughput characteristics are visible
 *     side-by-side instead of judging LOON on a single mode.
 *   - JSON/YAML/XML/CSV: standard library encoders
 *
 * Each formatter is a pure function `(data) => string`. The caller is
 * responsible for skipping formatters whose semantics cannot represent
 * the dataset (see `supportsCSV`, `supportsJTON`).
 */

/** LOON encoding modes exercised by the benchmarks. */
export const LOON_MODES = ['llm', 'full', 'local', 'compact'] as const
export type LoonMode = typeof LOON_MODES[number]

export const formatters: Record<string, (data: unknown) => string> = {
  'json-pretty': data => JSON.stringify(data, undefined, 2),
  'json-compact': data => JSON.stringify(data),
  'yaml': data => stringifyYAML(data),
  'xml': data => toXML(data),
  'csv': data => toCSV(data),
  'toon': data => encodeToon(data),
  'loon-llm': data => encodeLoon(data, 'llm'),
  'loon-full': data => encodeLoon(data, 'full'),
  'loon-local': data => encodeLoon(data, 'local'),
  'loon-compact': data => encodeLoon(data, 'compact'),
  'jton': data => toJTON(data),
}

/** True for any LOON-family formatter id (`loon-llm`, `loon-full`, …). */
export function isLoonFormat(formatName: string): boolean {
  return formatName.startsWith('loon')
}

/** Clears LOON encoder session/schema state between benchmark datasets. */
export function resetLoonEncoder(): void {
  loon.reset()
}

/**
 * Convert data to CSV format.
 *
 * @remarks
 * CSV is designed for flat tabular data only. This formatter:
 *   - Handles a top-level object whose values are arrays of flat objects
 *     (each array becomes a `# section` block followed by header+rows).
 *   - Handles a root-level array of flat objects.
 *   - Does NOT preserve nested structure; nested objects are stringified by
 *     `csv-stringify`. CSV results for non-tabular datasets are not fair
 *     comparisons and the runner skips CSV in that case via
 *     `supportsCSV(dataset)`.
 */
function toCSV(data: unknown): string {
  const sections: string[] = []

  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        if (typeof value[0] !== 'object' || value[0] === null) continue
        sections.push(`# ${key}`)
        sections.push(stringifyCSV(value, { header: true }))
      }
    }
    return sections.join('\n').trim()
  }

  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0] !== 'object' || data[0] === null) return ''
    return stringifyCSV(data, { header: true }).trim()
  }

  return ''
}

/**
 * Convert data to XML format.
 *
 * @remarks
 * Uses `fast-xml-parser` with 2-space indentation and empty-node suppression.
 * No optimisations are applied that would change the comparison's fairness.
 */
function toXML(data: unknown): string {
  const builder = new XMLBuilder({
    format: true,
    indentBy: '  ',
    suppressEmptyNode: true,
  })

  return builder.build(data)
}

/**
 * Encode via in-repo LOON (`extra-formats/LOON`) in a given mode.
 *
 * @remarks
 * `Loon.toLOON` expects an array of records. Root objects with a single
 * array property (e.g. `{ employees: [...] }`) use that array. Multi-key
 * roots pick the longest object-array. Shapes without a representable row
 * array use `fromTree` so nested configs still produce a LOON string
 * (adjacency flatten + `TREE:` header).
 *
 * `mode` is threaded through to both `toLOON` and `fromTree` so every LOON
 * encoding mode is exercised by the benchmark suite.
 */
function encodeLoon(data: unknown, mode: LoonMode): string {
  const opts = { mode }

  if (Array.isArray(data)) {
    return data.length === 0 ? '' : loon.toLOON(data, opts)
  }

  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data)
    if (entries.length === 1 && Array.isArray(entries[0]![1])) {
      const rows = entries[0]![1] as unknown[]
      return rows.length === 0 ? '' : loon.toLOON(rows as Record<string, unknown>[], opts)
    }

    let best: unknown[] | null = null
    for (const [, v] of entries) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
        if (!best || v.length > best.length) best = v
      }
    }
    if (best) return loon.toLOON(best as Record<string, unknown>[], opts)

    return loon.fromTree(data, opts)
  }

  return loon.toLOON([{ value: data }], opts)
}

/**
 * Call the Python JTON bridge to encode data as Zen Grid format.
 *
 * @remarks
 * Spawns `python jton-bridge.py` with the serialised data on stdin.
 * Throws on non-zero exit so callers can record the failure explicitly
 * rather than silently falling back to JSON.
 *
 * Prerequisites: `jton` Python package must be installed in the active
 * Python environment (`cd JTON && maturin develop --release`).
 */
function toJTON(data: unknown): string {
  const input = JSON.stringify(data)
  const result = spawnSync(PYTHON_CMD, [...PYTHON_ARGS_PREFIX, JTON_BRIDGE], {
    input,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  })

  if (result.error) {
    throw new Error(`jton-bridge spawn failed: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const msg = (result.stderr ?? '').trim() || `exit code ${result.status}`
    throw new Error(`jton-bridge: ${msg}`)
  }
  return result.stdout
}

/**
 * CSV is only meaningful for flat tabular datasets.
 */
export function supportsCSV(dataset: Dataset): boolean {
  return dataset.metadata.supportsCSV
}

/**
 * JTON Zen Grid is row-oriented. Eligible when the top-level payload is an
 * array, or an object with a single key pointing to an array, or any key
 * with a non-trivial object array (same shape gate historically used for
 * row-grid encoders).
 */
export function supportsJTON(dataset: Dataset): boolean {
  const data = dataset.data as unknown
  if (Array.isArray(data)) return true
  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data)
    if (entries.length === 1 && Array.isArray(entries[0]![1])) return true
    return entries.some(([, v]) => Array.isArray(v) && (v as any[]).length > 5)
  }
  return false
}
