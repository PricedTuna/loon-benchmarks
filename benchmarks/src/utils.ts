import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { encode as gptEncode } from 'gpt-tokenizer'

const _dir = dirname(fileURLToPath(import.meta.url))
const SP_BRIDGE = join(_dir, '../../extra-formats/', 'sentencepiece-bridge.py')
const PYTHON_CMD = process.platform === 'win32' ? 'py' : 'python3'
const PYTHON_ARGS_PREFIX = process.platform === 'win32' ? ['-3.13'] : []

/**
 * Tokenizer identifiers.
 *
 * | id      | Backend                           | Model family       | Accuracy        |
 * | ------- | --------------------------------- | ------------------ | --------------- |
 * | gpt     | gpt-tokenizer (o200k_base)        | GPT-4o / GPT-5     | Exact           |
 * | gpt4    | tiktoken (cl100k_base)            | GPT-4 / GPT-3.5    | Exact           |
 * | claude  | @anthropic-ai/tokenizer           | Claude 3.x / 4.x   | ±5%             |
 * | gemini  | SentencePiece bridge (Python)     | Gemini 1.5 / 2.x   | ±15% (T5 proxy) |
 *                                                                   ±3%  (Gemma model)|
 *
 * Gemini notes
 * ------------
 * Google has not released the official Gemini vocabulary. The bridge uses the
 * best available public proxy in priority order:
 *   1. benchmarks/gemma_tokenizer.model  — Gemma 2B (same Google team, 256k vocab,
 *      identical BPE approach). Requires HuggingFace auth. Expected error: ±3%.
 *      Download instructions: see sentencepiece-bridge.py header.
 *   2. benchmarks/t5_tokenizer.model     — google-t5/t5-base (public, 32k vocab).
 *      Auto-downloaded on first run. Expected error: ±15%.
 */
export type TokenizerId = 'gpt' | 'gpt4' | 'claude' | 'gemini' | 'llama3' | 'qwen3' | 'gemma3'

export const TOKENIZER_LABELS: Record<TokenizerId, string> = {
  gpt: 'GPT-4o (o200k)',
  gpt4: 'GPT-4 (cl100k)',
  claude: 'Claude (lenml)',
  gemini: 'Gemini (lenml)',
  llama3: 'Llama 3.2 (local)',
  qwen3: 'Qwen3 (local)',
  gemma3: 'Gemma 3 (local)',
}

export const TOKENIZER_NOTES: Record<TokenizerId, string> = {
  gpt: 'exact — OpenAI tiktoken o200k_base',
  gpt4: 'exact — OpenAI tiktoken cl100k_base',
  claude: 'exact — @lenml/tokenizer-claude (HuggingFace bundle)',
  gemini: 'exact — @lenml/tokenizer-gemini (HuggingFace bundle)',
  llama3: 'exact — @lenml/tokenizer-llama3_2 (representative local model)',
  qwen3: 'exact — @lenml/tokenizer-qwen3 (representative local model)',
  gemma3: 'exact — @lenml/tokenizer-gemma3 (representative local model)',
}

// ── Lazy initializers ────────────────────────────────────────────────────────

let _tiktokenGpt4: any | null = null

async function getTiktokenGpt4() {
  if (_tiktokenGpt4) return _tiktokenGpt4
  const { encoding_for_model } = await import('tiktoken')
  _tiktokenGpt4 = encoding_for_model('gpt-4')
  return _tiktokenGpt4
}

// Lazy-init cache for lenml tokenizers. Each `fromPreTrained()` loads a
// bundled HuggingFace tokenizer JSON (deterministic, no network, no Python).
const _lenmlCache: Record<string, ((text: string) => number) | null> = {}

async function getLenmlTokenizer(pkg: string): Promise<(text: string) => number> {
  if (_lenmlCache[pkg]) return _lenmlCache[pkg]!
  const m = await import(pkg)
  const tk = m.fromPreTrained()
  const fn = (text: string) => tk.encode(text).length
  _lenmlCache[pkg] = fn
  return fn
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Synchronous token count using the fast `gpt-tokenizer` (o200k_base).
 * Default used throughout benchmark scripts.
 */
export function tokenize(text: string): number {
  return gptEncode(text).length
}

/**
 * Token count for a specific tokenizer.
 * Returns null if the tokenizer is unavailable.
 */
export async function tokenizeWith(text: string, id: TokenizerId): Promise<number | null> {
  try {
    switch (id) {
      case 'gpt':
        return gptEncode(text).length

      case 'gpt4': {
        const enc = await getTiktokenGpt4()
        return enc.encode(text).length
      }

      case 'claude':
        return (await getLenmlTokenizer('@lenml/tokenizer-claude'))(text)

      case 'gemini':
        return (await getLenmlTokenizer('@lenml/tokenizer-gemini'))(text)

      case 'llama3':
        return (await getLenmlTokenizer('@lenml/tokenizer-llama3_2'))(text)

      case 'qwen3':
        return (await getLenmlTokenizer('@lenml/tokenizer-qwen3'))(text)

      case 'gemma3':
        return (await getLenmlTokenizer('@lenml/tokenizer-gemma3'))(text)
    }
  }
  catch {
    return null
  }
}

/**
 * Count tokens across all supported tokenizers in one pass.
 */
export async function tokenizeAll(text: string): Promise<Record<TokenizerId, number | null>> {
  const ids: TokenizerId[] = ['gpt', 'gpt4', 'claude', 'gemini', 'llama3', 'qwen3', 'gemma3']
  const entries = await Promise.all(ids.map(async id => [id, await tokenizeWith(text, id)] as const))
  return Object.fromEntries(entries) as Record<TokenizerId, number | null>
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

export function createProgressBar(
  value: number,
  max: number,
  width = 25,
  chars: { filled: string, empty: string } = { filled: '█', empty: '░' },
): string {
  const filled = Math.round((value / max) * width)
  const empty = width - filled
  return chars.filled.repeat(filled) + chars.empty.repeat(empty)
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fsp.mkdir(dirPath, { recursive: true })
}

/**
 * Returns a markdown block with the machine specs and local date/time
 * (Los Mochis, Sinaloa, México — America/Mazatlan timezone).
 * Embed at the top of every benchmark report so results are reproducible.
 */
export function getMachineInfo(): string {
  const cpu = os.cpus()[0]
  const cpuModel = cpu?.model?.trim() ?? 'Unknown CPU'
  const cpuCores = os.cpus().length
  const ramGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1)
  const platform = `${os.platform()} ${os.release()}`
  const now = new Date()
  const dateStr = now.toLocaleString('es-MX', {
    timeZone: 'America/Mazatlan',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  })
  return [
    `**Equipo**: ${cpuModel} · ${cpuCores} núcleos · ${ramGB} GB RAM`,
    `**OS**: ${platform}`,
    `**Ubicación**: Los Mochis, Sinaloa, México`,
    `**Fecha**: ${dateStr}`,
  ].join('\n')
}
