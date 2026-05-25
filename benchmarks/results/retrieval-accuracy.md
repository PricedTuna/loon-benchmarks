# Retrieval Accuracy Benchmark

**Equipo**: 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz · 8 núcleos · 19.2 GB RAM
**OS**: linux 6.8.0-117-generic
**Ubicación**: Los Mochis, Sinaloa, México
**Fecha**: lunes, 25 de mayo de 2026, 01:09:09 p.m. GMT-7

Benchmarks test LLM comprehension across different input formats using 12 data retrieval questions on 1 model.

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
LOON (llm)       ████████████████████   25.7 acc%/1K tok  │  100.0% acc  │  3,892 tokens
LOON (local)     ████████████████████   25.6 acc%/1K tok  │  100.0% acc  │  3,900 tokens
LOON (compact)   ██████████████████░░   22.6 acc%/1K tok  │  100.0% acc  │  4,423 tokens
TOON             ████████████████░░░░   20.9 acc%/1K tok  │  100.0% acc  │  4,785 tokens
JTON             ███████████████░░░░░   19.5 acc%/1K tok  │  100.0% acc  │  5,131 tokens
LOON (full)      █████████████░░░░░░░   16.3 acc%/1K tok  │  91.7% acc  │  5,611 tokens
```

*Efficiency score = (Accuracy % ÷ Tokens) × 1,000. Higher is better.*

#### Per-Model Accuracy

Accuracy across 1 LLM on 12 data retrieval questions:

```
o3-mini
  TOON             ████████████████████   100.0% (12/12)
  LOON (llm)       ████████████████████   100.0% (12/12)
  LOON (local)     ████████████████████   100.0% (12/12)
  LOON (compact)   ████████████████████   100.0% (12/12)
  JTON             ████████████████████   100.0% (12/12)
  LOON (full)      ██████████████████░░    91.7% (11/12)
```



<details>
<summary><strong>Performance by dataset, model, and question type</strong></summary>

#### Performance by Question Type

| Question Type | TOON | LOON (llm) | LOON (local) | LOON (compact) | JTON | LOON (full) |
| ------------- | ---- | ---- | ---- | ---- | ---- | ---- |
| Field Retrieval | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 91.7% |

#### Performance by Dataset

##### Uniform employee records

| Format | Accuracy | Tokens | Correct/Total |
| ------ | -------- | ------ | ------------- |
| `loon-full` | 100.0% | 1,977 | 2/2 |
| `loon-compact` | 100.0% | 2,253 | 2/2 |
| `loon-llm` | 100.0% | 2,255 | 2/2 |
| `loon-local` | 100.0% | 2,255 | 2/2 |
| `toon` | 100.0% | 2,466 | 2/2 |
| `jton` | 100.0% | 3,025 | 2/2 |

##### E-commerce orders with nested structures

| Format | Accuracy | Tokens | Correct/Total |
| ------ | -------- | ------ | ------------- |
| `loon-full` | 100.0% | 4,126 | 2/2 |
| `loon-llm` | 100.0% | 4,459 | 2/2 |
| `loon-local` | 100.0% | 4,459 | 2/2 |
| `loon-compact` | 100.0% | 6,057 | 2/2 |
| `jton` | 100.0% | 6,770 | 2/2 |
| `toon` | 100.0% | 7,273 | 2/2 |

##### Time-series analytics data

| Format | Accuracy | Tokens | Correct/Total |
| ------ | -------- | ------ | ------------- |
| `loon-compact` | 100.0% | 1,391 | 2/2 |
| `loon-llm` | 100.0% | 1,393 | 2/2 |
| `loon-local` | 100.0% | 1,393 | 2/2 |
| `toon` | 100.0% | 1,524 | 2/2 |
| `jton` | 100.0% | 1,755 | 2/2 |
| `loon-full` | 50.0% | 1,047 | 1/2 |

##### Top 100 GitHub repositories

| Format | Accuracy | Tokens | Correct/Total |
| ------ | -------- | ------ | ------------- |
| `loon-full` | 100.0% | 8,584 | 2/2 |
| `loon-compact` | 100.0% | 8,633 | 2/2 |
| `loon-llm` | 100.0% | 8,635 | 2/2 |
| `loon-local` | 100.0% | 8,635 | 2/2 |
| `toon` | 100.0% | 8,885 | 2/2 |
| `jton` | 100.0% | 11,576 | 2/2 |

##### Semi-uniform event logs

| Format | Accuracy | Tokens | Correct/Total |
| ------ | -------- | ------ | ------------- |
| `loon-llm` | 100.0% | 3,350 | 2/2 |
| `loon-local` | 100.0% | 3,350 | 2/2 |
| `loon-full` | 100.0% | 3,378 | 2/2 |
| `jton` | 100.0% | 4,783 | 2/2 |
| `loon-compact` | 100.0% | 5,151 | 2/2 |
| `toon` | 100.0% | 5,743 | 2/2 |

##### Deeply nested configuration

| Format | Accuracy | Tokens | Correct/Total |
| ------ | -------- | ------ | ------------- |
| `jton` | 100.0% | 549 | 2/2 |
| `loon-llm` | 100.0% | 586 | 2/2 |
| `loon-local` | 100.0% | 586 | 2/2 |
| `loon-compact` | 100.0% | 586 | 2/2 |
| `loon-full` | 100.0% | 586 | 2/2 |
| `toon` | 100.0% | 627 | 2/2 |

#### Performance by Model

##### o3-mini

| Format | Accuracy | Correct/Total |
| ------ | -------- | ------------- |
| `toon` | 100.0% | 12/12 |
| `loon-llm` | 100.0% | 12/12 |
| `loon-local` | 100.0% | 12/12 |
| `loon-compact` | 100.0% | 12/12 |
| `jton` | 100.0% | 12/12 |
| `loon-full` | 91.7% | 11/12 |

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

12 questions are generated deterministically across three categories. All categories read the same payload across formats; no question relies on a metadata channel that only some formats expose.

- **Field retrieval (567%)**: Direct value lookups.
  - Example: "What is Alice's salary?" → `75000`
  - Example: "What is the customer name for order ORD-0042?" → `John Doe`

- **Aggregation (525%)**: Dataset-level totals, averages, and single-condition counts.
  - Example: "How many employees work in Engineering?" → `17`
  - Example: "What is the total revenue across all orders?" → `45123.50`

- **Filtering (400%)**: Multi-condition queries (AND constraints across fields).
  - Example: "How many employees in Sales have salary > 80000?" → `5`

#### Evaluation Process

1. **Format conversion**: Each dataset is converted to all 6 formats (TOON, LOON (llm), LOON (local), LOON (compact), JTON, LOON (full)).
2. **Query LLM**: Each model receives formatted data + question in a prompt and extracts the answer.
3. **Validate deterministically**: Answers are validated using type-aware comparison (e.g., `50000` = `$50,000`, `Engineering` = `engineering`, `2025-01-01` = `January 1, 2025`) without requiring an LLM judge.

#### Models & Configuration

- **Models tested**: `o3-mini`
- **Token counting**: Using `gpt-tokenizer` with `o200k_base` encoding (GPT-5 tokenizer)
- **Temperature**: Not set (models use their defaults)
- **Total evaluations**: 12 questions × 6 formats × 1 models = 72 LLM calls
