# Retrieval Accuracy Benchmark

**Equipo**: Intel(R) Core(TM) Ultra 9 185H · 22 núcleos · 31.5 GB RAM
**OS**: win32 10.0.26200
**Ubicación**: Los Mochis, Sinaloa, México
**Fecha**: martes, 19 de mayo de 2026, 02:41:09 p.m. GMT-7

Benchmarks test LLM comprehension across different input formats using 10 data retrieval questions on 1 model.

<details>
<summary><strong>Show Dataset Catalog</strong></summary>

#### Dataset Catalog

| Dataset | Rows | Structure | CSV Support | Eligibility |
| ------- | ---- | --------- | ----------- | ----------- |
| Uniform employee records | 100 | uniform | ✓ | 100% |
| E-commerce orders with nested structures | 50 | nested | ✗ | 33% |
| Time-series analytics data | 60 | uniform | ✓ | 100% |
| Top 100 GitHub repositories | 100 | uniform | ✓ | 100% |
| Semi-uniform event logs | 75 | semi-uniform | ✗ | 50% |
| Deeply nested configuration | 11 | deep | ✗ | 0% |

**Structure classes:**
- **uniform**: All objects have identical fields with primitive values
- **semi-uniform**: Mix of uniform and non-uniform structures
- **nested**: Objects with nested structures (nested objects or arrays)
- **deep**: Highly nested with minimal tabular eligibility

**CSV Support:** ✓ (supported), ✗ (not supported – would require lossy flattening)

**Eligibility:** Percentage of the dataset that fits a flat tabular layout (uniform objects with primitive values). This is a structural property of the dataset, not a property of any one format.

</details>

#### Efficiency Ranking (Accuracy per 1K Tokens)

Each format ranked by efficiency (accuracy percentage per 1,000 tokens):

```
LOON (llm)       ████████████████████   28.4 acc%/1K tok  │  100.0% acc  │  3,526 tokens
LOON (local)     ████████████████████   28.1 acc%/1K tok  │  100.0% acc  │  3,565 tokens
TOON             ███████████████████░   27.2 acc%/1K tok  │  100.0% acc  │  3,672 tokens
JTON             █████████████████░░░   24.1 acc%/1K tok  │  100.0% acc  │  4,155 tokens
JSON compact     ██████████████░░░░░░   20.4 acc%/1K tok  │  100.0% acc  │  4,906 tokens
LOON (full)      █████████████░░░░░░░   18.5 acc%/1K tok  │  100.0% acc  │  5,395 tokens
LOON (compact)   █████████████░░░░░░░   18.5 acc%/1K tok  │  100.0% acc  │  5,400 tokens
YAML             ████████████░░░░░░░░   16.7 acc%/1K tok  │  100.0% acc  │  6,001 tokens
JSON             █████████░░░░░░░░░░░   12.3 acc%/1K tok  │  100.0% acc  │  8,162 tokens
XML              ████████░░░░░░░░░░░░   10.7 acc%/1K tok  │  100.0% acc  │  9,358 tokens
```

*Efficiency score = (Accuracy % ÷ Tokens) × 1,000. Higher is better.*

**Note on CSV:** Excluded from the headline ranking; CSV cannot represent nested data, so it answers 10 of 10 questions. Per-dataset accuracy is reported below.

#### Per-Model Accuracy

Accuracy across 1 LLM on 10 data retrieval questions:

```
gemini-3-flash-preview
  JSON             ████████████████████   100.0% (10/10)
  JSON compact     ████████████████████   100.0% (10/10)
  YAML             ████████████████████   100.0% (10/10)
  XML              ████████████████████   100.0% (10/10)
  CSV              ████████████████████   100.0% (10/10)
  TOON             ████████████████████   100.0% (10/10)
  LOON (llm)       ████████████████████   100.0% (10/10)
  LOON (full)      ████████████████████   100.0% (10/10)
  LOON (local)     ████████████████████   100.0% (10/10)
  LOON (compact)   ████████████████████   100.0% (10/10)
  JTON             ████████████████████   100.0% (10/10)
```

> [!NOTE]
> Baseline: JSON-compact at **100.0% accuracy**, **4,906 avg tokens**.
> - **JSON**: 100.0% accuracy (+0.0pp vs JSON), +66.4% tokens
> - **YAML**: 100.0% accuracy (+0.0pp vs JSON), +22.3% tokens
> - **XML**: 100.0% accuracy (+0.0pp vs JSON), +90.7% tokens
> - **CSV**: 100.0% accuracy (+0.0pp vs JSON), -28.6% tokens
> - **TOON**: 100.0% accuracy (+0.0pp vs JSON), -25.2% tokens
> - **LOON (llm)**: 100.0% accuracy (+0.0pp vs JSON), -28.1% tokens
> - **LOON (full)**: 100.0% accuracy (+0.0pp vs JSON), +10.0% tokens
> - **LOON (local)**: 100.0% accuracy (+0.0pp vs JSON), -27.3% tokens
> - **LOON (compact)**: 100.0% accuracy (+0.0pp vs JSON), +10.1% tokens
> - **JTON**: 100.0% accuracy (+0.0pp vs JSON), -15.3% tokens

<details>
<summary><strong>Performance by dataset, model, and question type</strong></summary>

#### Performance by Question Type

| Question Type | JSON | JSON compact | YAML | XML | CSV | TOON | LOON (llm) | LOON (full) | LOON (local) | LOON (compact) | JTON |
| ------------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| Field Retrieval | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% |

#### Performance by Dataset

##### Uniform employee records

| Format | Accuracy | Tokens | Correct/Total |
| ------ | -------- | ------ | ------------- |
| `loon-full` | 100.0% | 1,977 | 10/10 |
| `loon-llm` | 100.0% | 2,255 | 10/10 |
| `loon-local` | 100.0% | 2,255 | 10/10 |
| `csv` | 100.0% | 2,329 | 10/10 |
| `toon` | 100.0% | 2,466 | 10/10 |
| `jton` | 100.0% | 3,025 | 10/10 |

#### Performance by Model

##### gemini-3-flash-preview

| Format | Accuracy | Correct/Total |
| ------ | -------- | ------------- |
| `json-pretty` | 100.0% | 10/10 |
| `json-compact` | 100.0% | 10/10 |
| `yaml` | 100.0% | 10/10 |
| `xml` | 100.0% | 10/10 |
| `csv` | 100.0% | 10/10 |
| `toon` | 100.0% | 10/10 |
| `loon-llm` | 100.0% | 10/10 |
| `loon-full` | 100.0% | 10/10 |
| `loon-local` | 100.0% | 10/10 |
| `loon-compact` | 100.0% | 10/10 |
| `jton` | 100.0% | 10/10 |

</details>

#### What's Being Measured

This benchmark tests **LLM comprehension and data retrieval accuracy** across different input formats. Each LLM receives semantically-equivalent data in each format and must answer the same question about it. The benchmark does **not** test the model's ability to generate any specific format – only to read and answer over it.

#### Datasets Tested

Six datasets covering the spectrum from flat tabular to deeply nested:

1. **Tabular** (100 employee records): Uniform objects with identical primitive fields.
2. **Nested** (50 e-commerce orders): Records with nested customer objects and item arrays.
3. **Analytics** (60 days of metrics): Time-series with dates and numeric values.
4. **GitHub** (100 repositories): Real-world data fetched from the GitHub API.
5. **Event Logs** (75 logs): Semi-uniform; ~50% flat logs, ~50% with nested error objects.
6. **Nested Config** (1 configuration): Deeply nested configuration tree.

#### Question Types

10 questions are generated deterministically across three categories. All categories read the same payload across formats; no question relies on a metadata channel that only some formats expose.

- **Field retrieval (680%)**: Direct value lookups.
  - Example: "What is Alice's salary?" → `75000`
  - Example: "What is the customer name for order ORD-0042?" → `John Doe`

- **Aggregation (630%)**: Dataset-level totals, averages, and single-condition counts.
  - Example: "How many employees work in Engineering?" → `17`
  - Example: "What is the total revenue across all orders?" → `45123.50`

- **Filtering (480%)**: Multi-condition queries (AND constraints across fields).
  - Example: "How many employees in Sales have salary > 80000?" → `5`

#### Evaluation Process

1. **Format conversion**: Each dataset is converted to all 11 formats (JSON, JSON compact, YAML, XML, CSV, TOON, LOON (llm), LOON (full), LOON (local), LOON (compact), JTON).
2. **Query LLM**: Each model receives formatted data + question in a prompt and extracts the answer.
3. **Validate deterministically**: Answers are validated using type-aware comparison (e.g., `50000` = `$50,000`, `Engineering` = `engineering`, `2025-01-01` = `January 1, 2025`) without requiring an LLM judge.

#### Models & Configuration

- **Models tested**: `gemini-3-flash-preview`
- **Token counting**: Using `gpt-tokenizer` with `o200k_base` encoding (GPT-5 tokenizer)
- **Temperature**: Not set (models use their defaults)
- **Total evaluations**: 10 questions × 11 formats × 1 models = 110 LLM calls
