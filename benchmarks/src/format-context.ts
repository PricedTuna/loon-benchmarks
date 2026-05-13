import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as url from 'node:url'
import { tokenize } from './utils.ts'

/**
 * Format context loader.
 *
 * @remarks
 * Each format that participates in the "with context" benchmarks has a
 * canonical markdown document describing how the format works to a model.
 * Documents live in `benchmarks/format-docs/<format>.md`.
 *
 * Neutrality / fairness contract:
 *
 *   - Each format provides exactly one document.
 *   - The document is the format's own canonical LLM-facing reference
 *     (TRON: \`LLM_INSTRUCTIONS.md\`. TOON: \`docs/guide/llm-prompts.md\`.
 *      JSON / YAML / XML / CSV: a short paragraph-level primer comparable
 *      in informational content to what an LLM has already seen during
 *      pretraining for those formats).
 *   - The benchmark report counts the *context tokens* separately from
 *     payload tokens. Total cost = context + payload, and that is the
 *     number compared across formats. A format that needs more context
 *     to be parsed correctly pays the cost of that context in the
 *     bottom-line ranking.
 *   - No format is given a tutorial that contains the question's answer
 *     or hints about which fields exist in the dataset.
 *
 * Asymmetry note: TRON's document is substantially longer than the others
 * because TRON's encoding is denser and has more rules to learn. This is
 * a real-world property of the format, not a bias in the experiment;
 * making TRON's document artificially short would understate the cost of
 * adopting TRON. The token-cost columns in the report make this trade-off
 * visible to the reader.
 */

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const FORMAT_DOCS_DIR = path.resolve(__dirname, '..', 'format-docs')

const FORMAT_DOC_FILES: Record<string, string> = {
  'json-pretty': 'json.md',
  'json-compact': 'json.md',
  'yaml': 'yaml.md',
  'xml': 'xml.md',
  'csv': 'csv.md',
  'toon': 'toon.md',
  'tron': 'tron.md',
}

const cache = new Map<string, string>()

/**
 * Load the canonical LLM-facing documentation for a given format.
 * Returns an empty string if no document is registered (treated as "no
 * context"). Throws if a registered file is missing — that should be a
 * loud failure, not a silent fallback to no context.
 */
export async function loadFormatContext(formatName: string): Promise<string> {
  const cached = cache.get(formatName)
  if (cached !== undefined)
    return cached

  const filename = FORMAT_DOC_FILES[formatName]
  if (!filename) {
    cache.set(formatName, '')
    return ''
  }

  const fullPath = path.join(FORMAT_DOCS_DIR, filename)
  const content = await fsp.readFile(fullPath, 'utf-8')
  cache.set(formatName, content)
  return content
}

/**
 * Synchronous count of context tokens — for accounting in the report.
 */
export function countContextTokens(content: string): number {
  if (!content)
    return 0
  return tokenize(content)
}

/**
 * Returns the resolved path of the document used for a format, or null.
 * Useful for dumping methodology in the report.
 */
export function contextSourcePath(formatName: string): string | null {
  const filename = FORMAT_DOC_FILES[formatName]
  return filename ? path.join(FORMAT_DOCS_DIR, filename) : null
}
