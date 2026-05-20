# LOON — LLM decoding primer

LOON (Lean Object-Oriented Notation) compresses structured data for LLM prompts: schema headers, typed row tokens, optional `TREE:` metadata when the payload is a hierarchy flattened to an adjacency list.

This document is a **short** production-style primer for the comprehension benchmark. It is not a substitute for the full LOON specification shipped with the encoder.

## What you receive

- **Tabular payloads**: header lines declare column names and types, then one compact row per record.
- **Hierarchical payloads**: the first line may begin with `TREE:` describing which property held child nodes; rows are `_id` / `_pid` linked records that decode back to nested JSON.

## Reading rows

1. Parse header lines until you see the start of the data block (row lines).
2. Each data line is a sequence of fields in column order; respect the type markers from the schema (`i` integer, `f` float, `s` string, `b` bool, `a` array / structured cell per spec).
3. Row count should match any declared length in the header when present.

## Answering benchmark questions

- Treat numbers with the precision shown; strip decorative encoding (Base36, run-length markers) only after you have identified the semantic value from the schema.
- For field lookups, anchor on the schema column order — do not invent columns.
- If a `TREE:` block is present, walk parent/child ids to recover nested objects before answering questions about inner paths.

## Output discipline

When the task asks for a **single value**, return digits or the exact string only — no explanation, no units unless the question asks for them.

## Encoder note (benchmark harness)

The benchmark uses LOON **llm** mode (`mode: 'llm'`) for a balance between compression and decode scaffolding suitable for reasoning models.
