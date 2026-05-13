Benchmarks test LLM comprehension across different input formats using 10 data retrieval questions on 2 models.

<details>
<summary><strong>Show Dataset Catalog</strong></summary>

#### Dataset Catalog

| Dataset | Rows | Structure | CSV Support | Eligibility |
| ------- | ---- | --------- | ----------- | ----------- |
| Uniform employee records | 300 | uniform | ✓ | 100% |
| E-commerce orders with nested structures | 150 | nested | ✗ | 33% |
| Time-series analytics data | 180 | uniform | ✓ | 100% |
| Top 100 GitHub repositories | 300 | uniform | ✓ | 100% |
| Semi-uniform event logs | 225 | semi-uniform | ✗ | 50% |
| Deeply nested configuration | 10 | deep | ✗ | 0% |
| Valid complete dataset (control) | 20 | uniform | ✓ | 100% |
| Array truncated: 3 rows removed from end | 17 | uniform | ✓ | 100% |
| Extra rows added beyond declared length | 23 | uniform | ✓ | 100% |
| Inconsistent field count (missing salary in row 10) | 20 | uniform | ✓ | 100% |
| Missing required fields (no email in multiple rows) | 20 | uniform | ✓ | 100% |

**Structure classes:**
- **uniform**: All objects have identical fields with primitive values
- **semi-uniform**: Mix of uniform and non-uniform structures
- **nested**: Objects with nested structures (nested objects or arrays)
- **deep**: Highly nested with minimal tabular eligibility

**CSV Support:** ✓ (supported), ✗ (not supported – would require lossy flattening)

**Eligibility:** Percentage of arrays that qualify for TOON's tabular format (uniform objects with primitive values)

</details>

#### Efficiency Ranking (Accuracy per 1K Tokens)

Each format ranked by efficiency (accuracy percentage per 1,000 tokens):

```
TRON   ████████████████████   274.0 acc%/1K tok  │  100.0% acc  │    365 amortized  │  2,065,065 session total
JTON   ███████████████░░░░░   201.2 acc%/1K tok  │  100.0% acc  │    497 amortized  │  3,029,312 session total
TOON   █████████████░░░░░░░   183.8 acc%/1K tok  │  100.0% acc  │    544 amortized  │  2,894,221 session total
```

*Efficiency score = (Accuracy % ÷ Tokens) × 1,000. Higher is better.*

> [!TIP]
>

#### Per-Model Accuracy

Accuracy across 2 LLMs on 10 data retrieval questions:

```
gemini-3-flash-preview
  TOON           ████████████████████   100.0% (10/10)
→ TRON           ████████████████████   100.0% (10/10)
  JTON           ████████████████████   100.0% (10/10)

o3-mini
  TOON           ████████████████████   100.0% (10/10)
→ TRON           ████████████████████   100.0% (10/10)
  JTON           ████████████████████   100.0% (10/10)
```



<details>
<summary><strong>Performance by dataset, model, and question type</strong></summary>

#### Performance by Question Type

| Question Type | TOON | TRON | JTON |
| ------------- | ---- | ---- | ---- |
| Field Retrieval | 100.0% | 100.0% | 100.0% |

#### Performance by Dataset

##### Uniform employee records

| Format | Accuracy | Tokens | Correct/Total |
| ------ | -------- | ------ | ------------- |
| `tron` | 100.0% | 174 | 20/20 |
| `toon` | 100.0% | 194 | 20/20 |
| `jton` | 100.0% | 228 | 20/20 |

#### Performance by Model

##### gemini-3-flash-preview

| Format | Accuracy | Correct/Total |
| ------ | -------- | ------------- |
| `toon` | 100.0% | 10/10 |
| `tron` | 100.0% | 10/10 |
| `jton` | 100.0% | 10/10 |

##### o3-mini

| Format | Accuracy | Correct/Total |
| ------ | -------- | ------------- |
| `toon` | 100.0% | 10/10 |
| `tron` | 100.0% | 10/10 |
| `jton` | 100.0% | 10/10 |

</details>

#### What's Being Measured

This benchmark tests **LLM comprehension and data retrieval accuracy** across different input formats. Each LLM receives formatted data and must answer questions about it. This does **not** test the model's ability to generate TRON output – only to read and understand it.

#### Datasets Tested

Eleven datasets designed to test different structural patterns and validation capabilities:

**Primary datasets:**

1. **Tabular** (300 employee records): Uniform objects with identical fields – optimal for TOON's tabular format.
2. **Nested** (150 e-commerce orders): Complex structures with nested customer objects and item arrays.
3. **Analytics** (180 days of metrics): Time-series data with dates and numeric values.
4. **GitHub** (300 repositories): Real-world data from top GitHub repos by stars.
5. **Event Logs** (225 logs): Semi-uniform data with ~50% flat logs and ~50% with nested error objects.
6. **Nested Config** (1 configuration): Deeply nested configuration with minimal tabular eligibility.

**Structural validation datasets:**

7. **Control**: Valid complete dataset (baseline for validation)
8. **Truncated**: Array with 3 rows removed from end (tests `[N]` length detection)
9. **Extra rows**: Array with 3 additional rows beyond declared length
10. **Width mismatch**: Inconsistent field count (missing salary in row 10)
11. **Missing fields**: Systematic field omissions (no email in multiple rows)

#### Question Types

10 questions are generated dynamically across five categories:

- **Field retrieval (680%)**: Direct value lookups or values that can be read straight off a record (including booleans and simple counts such as array lengths)
  - Example: "What is Alice's salary?" → `75000`
  - Example: "How many items are in order ORD-0042?" → `3`
  - Example: "What is the customer name for order ORD-0042?" → `John Doe`

- **Aggregation (630%)**: Dataset-level totals and averages plus single-condition filters (counts, sums, min/max comparisons)
  - Example: "How many employees work in Engineering?" → `17`
  - Example: "What is the total revenue across all orders?" → `45123.50`
  - Example: "How many employees have salary > 80000?" → `23`

- **Filtering (480%)**: Multi-condition queries requiring compound logic (AND constraints across fields)
  - Example: "How many employees in Sales have salary > 80000?" → `5`
  - Example: "How many active employees have more than 10 years of experience?" → `8`

- **Structure awareness (250%)**: Tests format-native structural affordances (TOON's `[N]` count and `{fields}`, CSV's header row)
  - Example: "How many employees are in the dataset?" → `100`
  - Example: "List the field names for employees" → `id, name, email, department, salary, yearsExperience, active`
  - Example: "What is the department of the last employee?" → `Sales`

- **Structural validation (50%)**: Tests ability to detect incomplete, truncated, or corrupted data using structural metadata
  - Example: "Is this data complete and valid?" → `YES` (control dataset) or `NO` (corrupted datasets)
  - Tests TOON's `[N]` length validation and `{fields}` consistency checking
  - Demonstrates CSV's lack of structural validation capabilities

#### Evaluation Process

1. **Format conversion**: Each dataset is converted to all 3 formats (TOON, TRON, JTON).
2. **Query LLM**: Each model receives formatted data + question in a prompt and extracts the answer.
3. **Validate deterministically**: Answers are validated using type-aware comparison (e.g., `50000` = `$50,000`, `Engineering` = `engineering`, `2025-01-01` = `January 1, 2025`) without requiring an LLM judge.

#### Models & Configuration

- **Models tested**: `gemini-3-flash-preview`, `o3-mini`
- **Token counting**: Using `gpt-tokenizer` with `o200k_base` encoding (GPT-5 tokenizer)
- **Temperature**: Not set (models use their defaults)
- **Total evaluations**: 10 questions × 3 formats × 2 models = 60 LLM calls
