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
export type TokenizerId = 'gpt' | 'gpt4' | 'claude' | 'gemini'

export const TOKENIZER_LABELS: Record<TokenizerId, string> = {
  gpt: 'GPT-4o (o200k)',
  gpt4: 'GPT-4 (cl100k)',
  claude: 'Claude (≈±5%)',
  gemini: 'Gemini (SentencePiece)',
}

export const TOKENIZER_NOTES: Record<TokenizerId, string> = {
  gpt: 'exact — OpenAI tiktoken o200k_base',
  gpt4: 'exact — OpenAI tiktoken cl100k_base',
  claude: 'approximate ±5% — @anthropic-ai/tokenizer community build',
  gemini: 'approximate — SentencePiece bridge (Gemma ±3% if model present, T5 ±15% fallback)',
}

// ── Lazy initializers ────────────────────────────────────────────────────────

let _tiktokenGpt4: any | null = null

async function getTiktokenGpt4() {
  if (_tiktokenGpt4) return _tiktokenGpt4
  const { encoding_for_model } = await import('tiktoken')
  _tiktokenGpt4 = encoding_for_model('gpt-4')
  return _tiktokenGpt4
}

let _anthropicTokenizer: ((text: string) => number) | null = null

async function getClaudeTokenizer(): Promise<(text: string) => number> {
  if (_anthropicTokenizer) return _anthropicTokenizer
  try {
    const m = await import('@anthropic-ai/tokenizer')
    const fn = m.countTokens ?? m.default?.countTokens
    if (typeof fn !== 'function') throw new Error('countTokens not found')
    _anthropicTokenizer = (text: string) => fn(text) as number
  }
  catch {
    // Fallback: cl100k_base is a reasonable Claude proxy (±5%)
    const { encoding_for_model } = await import('tiktoken')
    const enc = encoding_for_model('gpt-4')
    _anthropicTokenizer = (text: string) => enc.encode(text).length
  }
  return _anthropicTokenizer!
}

/**
 * Tokenize via the Python SentencePiece bridge.
 * Returns null if the bridge is unavailable (Python not installed, bridge error).
 */
function tokenizeGeminiSentencePiece(text: string): number | null {
  const result = spawnSync(PYTHON_CMD, [...PYTHON_ARGS_PREFIX, SP_BRIDGE], {
    input: text,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) return null
  const n = parseInt(result.stdout.trim(), 10)
  return Number.isFinite(n) ? n : null
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

      case 'claude': {
        const fn = await getClaudeTokenizer()
        return fn(text)
      }

      case 'gemini':
        return tokenizeGeminiSentencePiece(text)
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
  const ids: TokenizerId[] = ['gpt', 'gpt4', 'claude', 'gemini']
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
