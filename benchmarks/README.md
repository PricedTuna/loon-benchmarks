# Comprehension benchmarks

Neutral benchmarks comparing **JSON / JSON-compact / YAML / XML / CSV / TOON / LOON** across token efficiency, scaling behaviour, roundtrip fidelity, retrieval accuracy, and real LLM task performance.

This suite is a fork of the upstream [`toon-format/toon`](https://github.com/toon-format/toon) `benchmarks/` workspace, with the design choices that biased the original suite toward TOON removed. Both the changes and the rationale for each are documented below so the methodology is auditable.

---

## Quick start

```bash
pnpm bench:tokens                # synthetic-data token efficiency
pnpm bench:tokens:real           # real-world JSON files (canada, citm_catalog, twitter, …)
pnpm bench:scaling               # token count vs record count curve
pnpm bench:roundtrip             # encode → decode → structural compare
pnpm bench:accuracy              # retrieval accuracy, ZERO format primer (LLM, requires API keys)
pnpm bench:accuracy:context      # retrieval accuracy WITH format primer .md per format (LLM, requires API keys)
pnpm bench:llm-task              # production-style LLM tasks (LLM, requires API keys)
pnpm fetch:github-repos          # update github-repos.json (top 100 by stars)
```

The four LLM scripts (`bench:accuracy`, `bench:accuracy:context`, `bench:llm-task`) need `.env` with provider keys. Set `DRY_RUN=true` to limit calls when validating the setup.

### Context vs zero-context: why both exist

Some formats (LOON, TOON) are not part of LLM pretraining — a model encountering them cold has to infer the syntax from the payload alone. In production a developer would typically include a short primer in the system prompt for such a format. The benchmark exposes both regimes:

| Script | What is sent to the model |
| --- | --- |
| `bench:accuracy`            | **One-line primer only.** `"The data below is in <FORMAT> format."` Same shape for every format. Measures zero-shot comprehension. |
| `bench:accuracy:context`    | **Full format guide prepended to the prompt.** Each format's canonical LLM-facing document is loaded from `format-docs/<format>.md` and prepended verbatim. The token cost of the document is reported alongside accuracy so the trade-off is visible. |

The `format-docs/` directory contains:

| Format | Document |
| --- | --- |
| LOON   | `format-docs/loon.md` — short LOON decoding primer for LLMs |
| TOON   | `format-docs/toon.md` (copy of upstream `toon/docs/guide/llm-prompts.md`) |
| JSON / YAML / XML / CSV | `format-docs/<name>.md` — short paragraph primer of comparable informational content. |

Asymmetry note: some format guides (LOON, TOON) are longer than JSON/YAML primers because the wire format carries more decoding rules. The "context tokens" column in the report makes that trade-off visible per call.

### How to send the .md as context manually (for ad-hoc experiments)

When wiring LOON / TOON into your own application, the same documents in `format-docs/` are the ones you'd attach to the system prompt. Two common patterns:

```ts
// Pattern A — single user message, doc + data inline
import * as fs from 'node:fs/promises'
import { loon } from './extra-formats/LOON/dist/index.mjs'

const guide   = await fs.readFile('format-docs/loon.md', 'utf-8')
const encoded = loon.toLOON(records, { mode: 'llm' })

const messages = [
  { role: 'user', content: `${guide}\n\n---\n\n\`\`\`text\n${encoded}\n\`\`\`\n\n${question}` },
]
```

```ts
// Pattern B — system prompt holds the format guide, user message holds data
const messages = [
  { role: 'system', content: guide },
  { role: 'user',   content: `\`\`\`text\n${encoded}\n\`\`\`\n\n${question}` },
]
```

Pattern B is what `bench:accuracy:context` effectively does, except the AI SDK in this benchmark uses a single-turn prompt — the doc is concatenated into the same string as the data, separated by `---`. Either pattern produces the same accuracy for the providers exercised here; pick the one your provider's caching favours.

---

## What changed vs. the upstream `toon/benchmarks`

The upstream suite is well-engineered, but a peer-review reading flagged several patterns that quietly favour the format the benchmark was built to advocate. None of the changes below remove a measurement — they normalise it so each format competes on the same footing.

### 1. Symmetrical format primers (`src/evaluate.ts`)

**Before.** The TOON primer described its specific syntax with an example (`"items[N]{f1,f2}: …"`); JSON, YAML, XML, CSV got one-line generic descriptions. A model receiving only the TOON primer is meaningfully more prepared to read TOON than the others.

**After.** Every primer is the same one-line sentence shape: `"The data below is in <FORMAT> format."` No format is taught its tricks; none gets a tutorial the others don't.

### 2. Removed structurally-biased question categories (`src/questions/index.ts`)

**Before.** Two question categories were added on top of field-retrieval / aggregation / filtering:

- *Structure-awareness* — "How many records are there? List the field names. What is the 3rd field name? What is the last record's field?"
- *Structural validation* — "Is this dataset truncated? Is a field missing?"

The upstream documentation explicitly states these test "TOON's `[N]` and `{fields}`" — i.e. the answer is one token of metadata in TOON / CSV but requires manual counting in JSON / YAML.

**After.** Both categories removed from the headline accuracy metric. Only field-retrieval, aggregation, and filtering remain — those are answerable purely from the data and do not depend on which format exposes which metadata channel. The structural-corruption fixtures (`generateStructuralValidationFixtures`) are kept and used by `bench:roundtrip` instead, which is the place to measure detect-corruption behaviour.

### 3. Neutral baseline in token efficiency (`scripts/token-efficiency-benchmark.ts`)

**Before.** All deltas were reported "vs TOON" and TOON got a leading row in every dataset block. The flat-only track also added a "+X% vs CSV" footnote on TOON's row only.

**After.** Baseline is `json-compact` — the incumbent serialization format. Every other format (TOON, LOON, YAML, XML, CSV) is reported as a delta against the same baseline, with the same row format. No format gets a privileged position in the chart.

### 4. Symmetrical exclusion rules (`src/formatters.ts`)

**Before.** CSV was skipped on non-tabular datasets (correct), but TOON was always run on all six datasets — including the deeply-nested config.

**After.** `supportsCSV(dataset)` skips CSV where it cannot represent the shape; JTON uses `supportsJTON(dataset)`. LOON is measured on every dataset via `extra-formats/LOON` (tabular or `TREE:` flattening). The headline efficiency ranking excludes partial-coverage formats (currently CSV only) and says so.

### 5. Real TOON encoder, real LOON encoder (`src/formatters.ts`)

**Before.** The suite shipped a custom in-tree TOON encoder. Reimplementations are an attack surface for accidental bias (separator choice, when to quote, length-marker presence). The JTON sibling repo's Python equivalent had a stricter version of the same problem.

**After.** TOON encoding goes through `@toon-format/toon` (the upstream package). LOON encoding goes through `loon` from `extra-formats/LOON`. Neither is a benchmark-internal reimplementation.

### 6. No silent fallback to JSON

**Before.** A precedent in the JTON benchmark sibling: if the LOON / TOON encoder threw, the formatter returned `JSON.stringify(data, …)`. The token count for the failing encoder then equalled JSON-compact, which makes "format beats JSON-compact" definitionally impossible to lose honestly.

**After.** Encoder failure is a `null` cell rendered as `n/a` plus a verbatim error in the report. Nothing is replaced with a different encoder's output behind the reader's back.

### 7. Independent measurements

**Before.** Stateful LOON encoder state was exercised across multiple datasets back-to-back, which lets schema state from dataset _N_ affect dataset _N+1_.

**After.** `resetLoonEncoder()` is called between measurements in the token, real-data, scaling, and fidelity benchmarks. Compression numbers are per-payload, the way a stateless API call would actually cost.

### 8. Display order

`FORMATTER_DISPLAY_NAMES` lists formats in input-pipeline order: JSON → JSON-compact → YAML → XML → CSV → TOON → LOON → JTON. There is no preferential placement.

---

## Benchmarks in this suite

| Script | What it measures | Needs LLM? |
| --- | --- | --- |
| `token-efficiency-benchmark.ts` | Tokens per format on the synthetic accuracy datasets, baseline = `json-compact`. | No |
| `real-data-token-benchmark.ts` | **New.** Tokens per format on real-world JSON files in `data/` (canada, citm_catalog, twitter, fakestore_*, reference datasets, edge cases). Detects bias-from-synthetic-data. | No |
| `scaling-benchmark.ts` | **New.** Tokens vs record count at N = 10 / 100 / 1 000 / 10 000 across five generators. Reports asymptotic tokens-per-record (the slope at scale). | No |
| `roundtrip-fidelity.ts` | **New.** Encode → decode → structural compare. Surfaces lossy formats so a token-efficiency win is not silently a fidelity loss. Includes adversarial inputs (numeric precision, unicode/escapes, sparse fields). | No |
| `accuracy-benchmark.ts` | Retrieval accuracy with **zero context** (one-line primer only). Field-retrieval / aggregation / filtering across all formats and configured models. | Yes |
| `accuracy-with-context-benchmark.ts` | **New.** Same questions and models as `accuracy-benchmark.ts`, but each format's canonical LLM guide (`format-docs/<format>.md`) is prepended to every prompt. Reports context tokens, payload tokens, and total input tokens separately so the cost is visible. | Yes |
| `llm-real-task.ts` | **New.** Production-style LLM tasks (multi-condition counts, sums, distinct-value extraction) graded by deterministic checkers. Reports accuracy, input tokens, output tokens, latency per format. | Yes |
| `fetch-github-repos.ts` | Updates `data/github-repos.json` to the current top 100 starred repos. | No |

The four "no LLM" scripts are reproducible from any machine with a stable Node toolchain. The two LLM scripts are reproducible up to provider-side variability (model versions, sampling, rate limits) — `accuracy-benchmark.ts` caches per-model results in `results/accuracy/models/` to make reruns cheap.

---

## Datasets

Two sources, used in different scripts.

**Synthetic generators** (`src/datasets.ts`) — seeded `faker` data. Used by the token-efficiency, scaling, accuracy and llm-real-task benchmarks. Six shapes:

1. Tabular employee records (uniform).
2. E-commerce orders (nested customer + items array).
3. Time-series analytics metrics (uniform).
4. GitHub top-100 repositories (real, snapshotted).
5. Event logs (semi-uniform; ~50% with nested error objects).
6. Nested configuration tree (deeply nested, no tabular component).

**Real-world JSON files** (`data/*.json`) — canonical JSON parser benchmark inputs (`canada.json` ≈ 2.2 MB, `citm_catalog.json` ≈ 1.7 MB, `twitter.json` ≈ 630 KB), tabular real-world payloads (`fakestore_struct_1k.json`, `fakestore_business.json`, `github.json`), small reference lookups (countries, cities, currencies, units …), and `test-edge-cases.json`. Used by `real-data-token-benchmark.ts`.

`data/github-repos.json` is the snapshot used by the synthetic GitHub dataset and by accuracy questions about repos; refresh it via `fetch:github-repos`.

---

## Why two LLM benchmarks?

Different questions, different value:

- `accuracy-benchmark.ts` answers **"can a model find a fact in this format?"** — short, point-lookup style questions, large fan-out (questions × formats × models). Cheap-ish per query, gives a comprehension score.
- `llm-real-task.ts` answers **"can a model do useful work over this format?"** — longer prompts, harder tasks (compound filters, distinct-value extraction, sums), fewer fan-outs. Records cost (input/output tokens) and latency alongside accuracy so the trade-off is visible.

A format that wins on `accuracy-benchmark.ts` but loses on `llm-real-task.ts` is good at one-shot lookups but expensive when the model has to reason. A format that loses on token-efficiency but wins on `llm-real-task.ts` is buying accuracy with tokens. Both numbers belong in the paper.

---

## Reproducibility

- All synthetic data is seeded (`faker.seed(12345)`).
- All token counts are taken with `gpt-tokenizer` `o200k_base` encoding (GPT-4o / GPT-5 family). The tokenizer choice is stated in every report.
- Provider-side LLM variability is the only nondeterminism; cached per-model results live under `results/accuracy/models/` and are reused unless a model is explicitly rerun.

---

## Project structure

```
benchmarks/
├── README.md                         (this file)
├── package.json
├── data/                             (real-world JSON inputs)
├── format-docs/                      (per-format canonical LLM-facing markdown)
│   ├── loon.md                       (LOON LLM primer)
│   ├── toon.md                       (= toon/docs/guide/llm-prompts.md)
│   ├── json.md
│   ├── yaml.md
│   ├── xml.md
│   └── csv.md
├── results/                          (markdown output of each script)
└── src/
    ├── constants.ts                  (model RPM limits, display names, question types)
    ├── datasets.ts                   (synthetic generators)
    ├── evaluate.ts                   (LLM call site, symmetrical primers, optional extraContext)
    ├── format-context.ts             (loader for format-docs/, used by accuracy-with-context)
    ├── formatters.ts                 (JSON/YAML/XML/CSV/TOON/LOON encoders + supportsX gates)
    ├── normalize.ts                  (deterministic answer comparison)
    ├── report.ts                     (markdown report generation for accuracy)
    ├── storage.ts                    (per-model accuracy caching)
    ├── types.ts
    ├── utils.ts                      (tokenize, progress bars, ensureDir)
    └── questions/                    (field-retrieval / aggregation / filtering generators)
└── scripts/
    ├── token-efficiency-benchmark.ts
    ├── real-data-token-benchmark.ts
    ├── scaling-benchmark.ts
    ├── roundtrip-fidelity.ts
    ├── accuracy-benchmark.ts
    ├── accuracy-with-context-benchmark.ts
    ├── llm-real-task.ts
    └── fetch-github-repos.ts
```
