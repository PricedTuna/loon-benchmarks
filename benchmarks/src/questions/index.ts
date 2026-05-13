import type { AnalyticsMetric, Employee, EventLog, NestedConfig, Order, Repository } from '../datasets.ts'
import type { Question } from '../types.ts'
import { ACCURACY_DATASETS } from '../datasets.ts'
import { generateAnalyticsQuestions } from './analytics.ts'
import { generateEventLogsQuestions } from './event-logs.ts'
import { generateGithubQuestions } from './github.ts'
import { generateNestedConfigQuestions } from './nested-config.ts'
import { generateNestedQuestions } from './nested.ts'
import { generateTabularQuestions } from './tabular.ts'
import { createIdGenerator } from './utils.ts'

/**
 * Generate questions from all datasets.
 *
 * @remarks
 * Question categories kept (content-bearing, format-agnostic):
 *   - Field Retrieval: direct field access — "What is X's salary?"
 *   - Aggregation: counts / sums / averages — "What is the average revenue?"
 *   - Filtering: multi-condition queries — "How many orders WHERE status=shipped AND total>500?"
 *
 * Question categories removed from the original suite:
 *   - Structure Awareness ("How many records?", "List the field names",
 *     "What is the 3rd field name?", "What is the last record's field?")
 *   - Structural Validation ("Is this dataset truncated?")
 *
 * Both removed categories ask the model to read information that some
 * formats expose as native metadata (length markers, explicit field
 * headers) and that others require manual counting to answer. Including
 * them measures format metadata exposure, not the property this benchmark
 * is meant to measure (LLM retrieval over identical content). Restoring
 * them is fine if you want to measure that property explicitly — but they
 * should be reported in a separate, clearly labelled section, not bundled
 * into the headline accuracy metric.
 */
export function generateQuestions(): Question[] {
  const questions: Question[] = []
  const idGen = createIdGenerator()
  const getId = () => idGen.next().value

  const tabular = (ACCURACY_DATASETS.find(d => d.name === 'tabular')?.data.employees as Employee[]) ?? []
  const nested = (ACCURACY_DATASETS.find(d => d.name === 'nested')?.data.orders as Order[]) ?? []
  const analytics = (ACCURACY_DATASETS.find(d => d.name === 'analytics')?.data.metrics as AnalyticsMetric[]) ?? []
  const github = (ACCURACY_DATASETS.find(d => d.name === 'github')?.data.repositories as Repository[]) ?? []
  const eventLogs = (ACCURACY_DATASETS.find(d => d.name === 'event-logs')?.data.logs as EventLog[]) ?? []
  const nestedConfig = ACCURACY_DATASETS.find(d => d.name === 'nested-config')?.data as NestedConfig | undefined

  questions.push(...generateTabularQuestions(tabular, getId))
  questions.push(...generateNestedQuestions(nested, getId))
  questions.push(...generateAnalyticsQuestions(analytics, getId))
  questions.push(...generateGithubQuestions(github, getId))
  questions.push(...generateEventLogsQuestions(eventLogs, getId))
  questions.push(...generateNestedConfigQuestions(nestedConfig, getId))

  return questions
}
