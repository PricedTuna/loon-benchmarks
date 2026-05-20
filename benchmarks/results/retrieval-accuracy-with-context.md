# Retrieval Accuracy — with format context

**Equipo**: Intel(R) Core(TM) Ultra 9 185H · 22 núcleos · 31.5 GB RAM
**OS**: win32 10.0.26200
**Ubicación**: Los Mochis, Sinaloa, México
**Fecha**: jueves, 14 de mayo de 2026, 03:03:01 p.m. GMT-7

This benchmark prepends each format's canonical LLM-facing documentation
to every prompt. The aim is to measure formats under realistic deployment
conditions, where a developer would normally include a short primer in
the system prompt for a non-standard format.

**Models exercised:** `gemini-3-flash-preview`.
**Questions:** 10 (DRY_RUN — limited).
**Total evaluations recorded:** 110.

## Per-format results

| Format | Accuracy | Context tokens | Avg payload | Avg total input | Avg latency |
| ------ | -------- | -------------- | ----------- | --------------- | ----------- |
| JSON | 100.0% (10/10) | 207 | 6,313 | 8,187 | 1,940 ms |
| JSON compact | 100.0% (10/10) | 207 | 3,909 | 4,978 | 1,989 ms |
| YAML | 100.0% (10/10) | 179 | 4,969 | 6,009 | 1,691 ms |
| XML | 100.0% (10/10) | 204 | 7,276 | 9,374 | 2,509 ms |
| CSV | 100.0% (10/10) | 214 | 2,321 | 3,489 | 2,864 ms |
| TOON | 100.0% (10/10) | 1,787 | 2,457 | 5,600 | 2,179 ms |
| LOON (full) | 100.0% (10/10) | 590 | 1,977 | 3,320 | 27,463 ms |
| LOON (compact) | 100.0% (10/10) | 150 | 4,265 | 5,370 | 2,141 ms |
| JTON | 100.0% (10/10) | 0 | 3,025 | 3,856 | 2,018 ms |
| LOON (llm) | 90.0% (9/10) | 374 | 2,283 | 3,723 | 8,749 ms |
| LOON (local) | 90.0% (9/10) | 374 | 2,283 | 3,723 | 16,014 ms |

- **Context tokens** = size of the format's documentation prepended to every prompt (counted once per format, charged per call by the model provider).
- **Avg payload** = average token count of the encoded data per question.
- **Avg total input** = average input tokens reported by the model — context + payload + question + scaffolding.
- **Accuracy** = correct answers ÷ total evaluations across all selected models.

## Methodology — what each format received as context

| Format | Source document | Tokens |
| ------ | --------------- | ------ |
| JSON | benchmarks\format-docs\json.md | 207 |
| JSON compact | benchmarks\format-docs\json.md | 207 |
| YAML | benchmarks\format-docs\yaml.md | 179 |
| XML | benchmarks\format-docs\xml.md | 204 |
| CSV | benchmarks\format-docs\csv.md | 214 |
| TOON | benchmarks\format-docs\toon.md | 1,787 |
| LOON (full) | _(none)_ | 590 |
| LOON (compact) | _(none)_ | 150 |
| JTON | _(none)_ | 0 |
| LOON (llm) | _(none)_ | 374 |
| LOON (local) | _(none)_ | 374 |

The context for each format is its own canonical authoring-team document
(or, for well-known formats, a short paragraph primer comparable to what
an LLM has seen during pretraining). No document contains hints about the
benchmark's dataset, questions, or answers — only the format's syntax.

## Reading the trade-off

A format that scores high accuracy but has a large context cost is more
expensive in production: every API call pays the context tokens. Compare
two formats by **(accuracy gained per total input token)** if cost is what
you care about; compare by raw accuracy if budget is fixed.

The companion zero-context benchmark (`accuracy-benchmark.ts`) measures
the same questions without any format primer beyond a one-line label —
useful to see how much each format relies on its primer.
