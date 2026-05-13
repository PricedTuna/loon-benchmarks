import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as prompts from '@clack/prompts'
import { BENCHMARKS_DIR } from '../src/constants.ts'
import { ensureDir } from '../src/utils.ts'
import { tron } from '../../extra-formats/Tron-Core/dist/index.mjs'

/**
 * Convert all JSON datasets in benchmarks/data/ to TRON format.
 * Output: benchmarks/data/.tron/<name>.tron
 *
 * Only flat-array or single-key-wrapped-array datasets are eligible —
 * TRON is row-oriented and cannot faithfully represent arbitrary nested objects.
 * Ineligible files are skipped with a note.
 */

const DATA_DIR = path.join(BENCHMARKS_DIR, 'data')
const OUT_DIR = path.join(DATA_DIR, '.tron')

await ensureDir(OUT_DIR)

prompts.intro('TRON Export — data/*.json → data/.tron/*.tron')

const files = (await fsp.readdir(DATA_DIR))
  .filter(f => f.endsWith('.json'))
  .sort()

let exported = 0
let skipped = 0

for (const file of files) {
  const filePath = path.join(DATA_DIR, file)
  const baseName = file.replace(/\.json$/, '')
  const outPath = path.join(OUT_DIR, `${baseName}.tron`)

  let raw: unknown
  try {
    const content = await fsp.readFile(filePath, 'utf-8')
    raw = JSON.parse(content)
  }
  catch (err) {
    prompts.log.warn(`${file}: JSON parse error — skipped`)
    skipped++
    continue
  }

  // Determine the rows array
  let rows: Record<string, unknown>[] | null = null
  let note = ''

  if (Array.isArray(raw)) {
    // Direct array — check that elements are objects
    if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null && !Array.isArray(raw[0])) {
      rows = raw as Record<string, unknown>[]
      note = `array[${raw.length}]`
    }
  }
  else if (typeof raw === 'object' && raw !== null) {
    const entries = Object.entries(raw)
    if (entries.length === 1 && Array.isArray(entries[0]![1])) {
      const arr = entries[0]![1] as unknown[]
      if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null && !Array.isArray(arr[0])) {
        rows = arr as Record<string, unknown>[]
        note = `{${entries[0]![0]}: array[${arr.length}]}`
      }
    }
  }

  if (!rows) {
    prompts.log.warn(`${file}: not a flat row-array shape — skipped`)
    skipped++
    continue
  }

  try {
    tron.reset()
    const encoded = tron.toJSON(rows)
    await fsp.writeFile(outPath, encoded, 'utf-8')
    const byteSize = Buffer.byteLength(encoded, 'utf-8')
    const jsonSize = Buffer.byteLength(JSON.stringify(raw), 'utf-8')
    const savings = (((jsonSize - byteSize) / jsonSize) * 100).toFixed(1)
    prompts.log.step(`${file} → ${baseName}.tron  (${note}, ${(byteSize / 1024).toFixed(1)} KB, ${savings}% vs JSON compact)`)
    exported++
  }
  catch (err) {
    prompts.log.warn(`${file}: TRON encode error — ${err instanceof Error ? err.message : String(err)}`)
    skipped++
  }
}

prompts.outro(`Done: ${exported} exported, ${skipped} skipped → data/.tron/`)
