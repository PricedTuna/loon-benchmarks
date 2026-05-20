import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { EvaluationResult, Question } from './types.ts'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import { xai } from '@ai-sdk/xai'
import { generateText } from 'ai'
import { compareAnswers } from './normalize.ts'

/**
 * Models used for evaluation. Each entry is gated on the presence of its
 * provider API key, so the benchmark runs with whatever keys are configured
 * (e.g. only `GOOGLE_GENERATIVE_AI_API_KEY` set → only Gemini runs) instead
 * of crashing on the first missing-key provider.
 */
const ALL_MODELS: { model: LanguageModelV3; envKey: string }[] = [
  { model: anthropic('claude-haiku-4-5-20251001'), envKey: 'ANTHROPIC_API_KEY' },
  { model: google('gemini-3-flash-preview'), envKey: 'GOOGLE_GENERATIVE_AI_API_KEY' },
  { model: openai('gpt-5-nano'), envKey: 'OPENAI_API_KEY' },
  { model: xai('grok-4-1-fast-non-reasoning'), envKey: 'XAI_API_KEY' },
]

export const models: LanguageModelV3[] = ALL_MODELS
  .filter(m => (process.env[m.envKey] ?? '').trim() !== '')
  .map(m => m.model)

/**
 * Format primers.
 *
 * @remarks
 * Each primer is a single short sentence naming the format and pointing to
 * its canonical specification. We deliberately do NOT teach the model
 * format-specific tricks (e.g. "arrays declare length and fields", "header
 * row contains field names"), because doing so for one format and not for
 * others biases retrieval toward the format that received the tutorial.
 *
 * If you change one primer, change them all so they remain symmetrical in
 * length and informativeness.
 */
export const PRIMERS: Record<string, string> = {
  'json-pretty': 'The data below is in JSON format.',
  'json-compact': 'The data below is in JSON format.',
  'yaml': 'The data below is in YAML format.',
  'xml': 'The data below is in XML format.',
  'csv': 'The data below is in CSV format.',
  'toon': 'The data below is in TOON format.',
  'loon': 'The data below is in LOON format.',
}

/**
 * Code-fence language tags. Used purely for syntax highlighting in the
 * prompt; does not affect parsing.
 */
export const FENCE: Record<string, string> = {
  'json-pretty': 'json',
  'json-compact': 'json',
  'yaml': 'yaml',
  'xml': 'xml',
  'csv': 'csv',
  'toon': 'toon',
  'loon': 'text',
}

/**
 * Evaluate a single question with a specific format and model.
 *
 * @remarks
 * If `extraContext` is provided, it is prepended verbatim to the prompt.
 * The intended use is the "with-context" accuracy benchmark, which loads
 * each format's canonical LLM-facing document via `format-context.ts`
 * and passes it here. The context's token cost is reported separately
 * by the caller so the trade-off is visible.
 */
export async function evaluateQuestion(
  {
    question,
    formatName,
    formattedData,
    model,
    extraContext,
  }:
  {
    question: Question
    formatName: string
    formattedData: string
    model: LanguageModelV3
    extraContext?: string
  },
): Promise<EvaluationResult> {
  // LOON is exercised in multiple modes (loon-llm, loon-full, …); they all
  // share the same primer / fence / doc, so normalise to the base name.
  const baseName = formatName.startsWith('loon') ? 'loon' : formatName
  const primer = PRIMERS[baseName] ?? ''
  const fence = FENCE[baseName] ?? ''

  const contextBlock = extraContext
    ? `${extraContext.trim()}\n\n---\n\n`
    : ''

  const prompt = `
${contextBlock}${primer}

\`\`\`${fence}
${formattedData}
\`\`\`

Question: ${question.prompt}

Answer format requirements:
- Provide only the value itself, no explanation
- For numbers: output digits only (no commas, currency symbols, or units)
- For dates/field names: use the exact string from the data
- For lists: output comma-separated values with no spaces

Answer:
`.trim()

  const startTime = performance.now()
  const { text, usage } = await generateText({ model, prompt })

  const actual = text.trim()
  const latencyMs = performance.now() - startTime

  const comparisonResult = compareAnswers(
    actual,
    question.groundTruth,
    question.answerType ?? 'string',
    question.normalizationOptions,
  )
  const isCorrect = comparisonResult.match

  return {
    questionId: question.id,
    format: formatName,
    model: model.modelId,
    expected: question.groundTruth,
    actual,
    isCorrect,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    latencyMs,
  }
}
