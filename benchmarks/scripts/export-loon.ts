import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { BENCHMARKS_DIR } from '../src/constants.ts'
import { formatters, resetLoonEncoder } from '../src/formatters.ts'
import { ensureDir } from '../src/utils.ts'

/**
 * Convert all JSON datasets in benchmarks/data/ to LOON format.
 * Output: benchmarks/data/.loon/<name>.loon
 *
 * Uses the same `formatters.loon` path as the rest of the suite (llm mode).
 * Files that cannot be encoded are skipped with a note.
 */

const DATA_DIR = path.join(BENCHMARKS_DIR, 'data')
const OUT_DIR = path.join(DATA_DIR, '.loon')

await ensureDir(OUT_DIR)

prompts.intro('LOON Export — data/*.json → data/.loon/*.loon')

const files = (await fsp.readdir(DATA_DIR))
  .filter(f => f.endsWith('.json'))
  .sort()

let exported = 0
let skipped = 0

for (const file of files) {
  const filePath = path.join(DATA_DIR, file)
  const baseName = file.replace(/\.json$/, '')
  const outPath = path.join(OUT_DIR, `${baseName}.loon`)

  let raw: unknown
  try {
    const content = await fsp.readFile(filePath, 'utf-8')
    raw = JSON.parse(content)
  }
  catch {
    prompts.log.warn(`${file}: JSON parse error — skipped`)
    skipped++
    continue
  }

  try {
    resetLoonEncoder()
    const encoded = formatters['loon-llm'](raw)
    if (!encoded || !encoded.trim()) {
      prompts.log.warn(`${file}: empty LOON output — skipped`)
      skipped++
      continue
    }
    await fsp.writeFile(outPath, encoded, 'utf-8')
    const byteSize = Buffer.byteLength(encoded, 'utf-8')
    const jsonSize = Buffer.byteLength(JSON.stringify(raw), 'utf-8')
    const savings = (((jsonSize - byteSize) / jsonSize) * 100).toFixed(1)
    prompts.log.step(`${file} → ${baseName}.loon  (${(byteSize / 1024).toFixed(1)} KB, ${savings}% vs JSON compact)`)
    exported++
  }
  catch (err) {
    prompts.log.warn(`${file}: LOON encode error — ${err instanceof Error ? err.message : String(err)}`)
    skipped++
  }
}

prompts.outro(`Done: ${exported} exported, ${skipped} skipped → data/.loon/`)
