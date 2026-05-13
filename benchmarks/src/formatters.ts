import type { Dataset } from './types.ts'
import { stringify as stringifyCSV } from 'csv-stringify/sync'
import { XMLBuilder } from 'fast-xml-parser'
import { stringify as stringifyYAML } from 'yaml'
import { encode as encodeToon } from '@toon-format/toon'
import { tron } from '../../extra-formats/Tron-Core/dist/index.mjs'
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
 *   - TRON: in-repo `tron.toJSON` from Tron-Core
 *   - JSON/YAML/XML/CSV: standard library encoders
 *
 * Each formatter is a pure function `(data) => string`. The caller is
 * responsible for skipping formatters whose semantics cannot represent
 * the dataset (see `supportsCSV`, `supportsTRON`).
 *
 * Semantic-equivalence note: TRON, like CSV, is row-oriented. Top-level
 * objects whose only meaningful content is a single array of records are
 * encoded directly; deeply nested non-array objects are wrapped as a
 * single-row array so the encoder can still produce output, but this is
 * disclosed to the reader via `supportsTRON()`.
 */
export const formatters: Record<string, (data: unknown) => string> = {
  'json-pretty': data => JSON.stringify(data, undefined, 2),
  'json-compact': data => JSON.stringify(data),
  'yaml': data => stringifyYAML(data),
  'xml': data => toXML(data),
  'csv': data => toCSV(data),
  'toon': data => encodeToon(data),
  'tron': data => toTRON(data),
  'jton': data => toJTON(data),
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
 * Convert data to TRON format using the in-repo encoder.
 *
 * @remarks
 * TRON is row-oriented like CSV. The encoder accepts an array of records.
 * For a top-level object whose only meaningful payload is a single array
 * of records (the common case here: `{ employees: [...] }`,
 * `{ orders: [...] }`, etc.), we pass that array.
 *
 * For non-tabular shapes, the encoder is still called on `[data]` so a
 * value can be produced, but `supportsTRON()` returns `false` for those
 * datasets and the runners skip TRON to avoid an apples-to-oranges
 * comparison.
 */
function toTRON(data: unknown): string {
  if (Array.isArray(data)) return tron.toJSON(data)

  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data)
    if (entries.length === 1 && Array.isArray(entries[0]![1]))
      return tron.toJSON(entries[0]![1] as any[])
    // Multi-key root: encode the largest array present.
    let best: [string, any[]] | null = null
    for (const [k, v] of entries) {
      if (Array.isArray(v) && (!best || v.length > best[1].length))
        best = [k, v as any[]]
    }
    if (best) return tron.toJSON(best[1])
    return tron.toJSON([data as Record<string, unknown>])
  }

  return tron.toJSON([{ value: data }])
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
 * TRON is row-oriented. We treat as TRON-eligible any dataset whose top-level
 * payload is an array, or an object with a single key pointing to an array.
 * Deeply nested config-style data is excluded so its result is not used as a
 * headline comparison (it can still be measured separately).
 */
export function supportsTRON(dataset: Dataset): boolean {
  const data = dataset.data as unknown
  if (Array.isArray(data)) return true
  if (typeof data === 'object' && data !== null) {
    const entries = Object.entries(data)
    if (entries.length === 1 && Array.isArray(entries[0]![1])) return true
    // Multi-key root: any key pointing to a non-trivial array qualifies.
    return entries.some(([, v]) => Array.isArray(v) && (v as any[]).length > 5)
  }
  return false
}

/**
 * JTON Zen Grid is row-oriented, same eligibility rules as TRON.
 * Additionally requires the Python `jton` package to be installed.
 */
export function supportsJTON(dataset: Dataset): boolean {
  return supportsTRON(dataset)
}
