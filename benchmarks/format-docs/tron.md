# TRON — LLM Decoding Reference

This document describes the TRON wire format from the perspective of a
language model that must read it. It is written to be embedded directly
into a system prompt or pre-pended to a user message; everything below
is decoder-grade specification, not marketing.

TRON has two encoding modes — **Compact** and **Adaptive** — and the mode
is identifiable from the first non-empty line of the payload.

| First line begins with                      | Mode      |
| ------------------------------------------- | --------- |
| `key: value` (no `S:` and no `SCHEMA:`)     | Compact   |
| `S:` (or legacy `SCHEMA:`)                  | Adaptive  |

Adaptive mode has two output profiles, distinguished by the presence or
absence of LLM-safety scaffolding:

| Adaptive target  | Anchor row at top?      | `END:@TID` sentinel? | Plain-decimal integers? |
| ---------------- | ----------------------- | -------------------- | ----------------------- |
| `transmission`   | no                      | no                   | no (Base36 always)      |
| `llm`            | yes (line begins `! `)  | yes                  | yes when n × intCols < 30 |

Both targets share the same data-row syntax. The scaffolding does not
change how rows decode; it only makes decoding verifiable and detects
truncation.

---

## Compact mode

Each record is `key: value` pairs, one per line. Records are separated
by a line containing only `---`. Types are inferred:

| Token            | Decoded type        |
| ---------------- | ------------------- |
| `1`, `-3.14`     | number              |
| `true` / `false` | boolean             |
| `^`              | null                |
| anything else    | string              |

Escape sequences inside string values: `\n`, `\r`, `\t`, `\\`.

### Example

```
id: 1
name: Alice
department: Engineering
salary: 95000
active: true
---
id: 2
name: Bob
department: Marketing
salary: 72000
active: false
```

decodes to:

```json
[
  { "id": 1, "name": "Alice", "department": "Engineering", "salary": 95000, "active": true },
  { "id": 2, "name": "Bob",   "department": "Marketing",   "salary": 72000, "active": false }
]
```

### Compact-mode primer

```
Data is in TRON Compact format: each record is key: value pairs, one field per line, records separated by ---.
Types: numbers are numbers, true/false are booleans, ^ is null, everything else is a string.
```

---

## Adaptive mode

Adaptive payloads are organised in three sections:

1. **Schema declaration** — `S:@TID[N]=[col:type,…]`
2. **Header lines** — zero or more of `A:`, `DEC:`, `C:`, `Q:`, `QF:`,
   `QS:`, `FP:`, `X:`, `D:` (defaults), `D:` (column dictionary), `LEGEND:`
3. **Data block** — `@TID:`, optional `F:csv`, then rows; closes with
   `END:@TID` when the target is `llm`.

### Schema declaration

```
S:@T1[N]=[col1:type1,col2:type2,…]
```

| Type tag | Decoded type |
| -------- | ------------ |
| `i`      | integer      |
| `f`      | float        |
| `s`      | string       |
| `b`      | boolean      |
| `a`      | array        |

`N` is the row count of the data block. The legacy `SCHEMA:` header is
identical in semantics; readers must accept both forms.

### Column abbreviation — `A:`

When a column name is long, the schema uses a short abbreviation and an
`A:` line lists the full names in schema-column order. Use the full
names in your answer.

```
S:@T1[5]=[id:i,na:s,de:s,sa:i,ac:b]
A:id,name,department,salary,active
```

### Plain-decimal integers — `DEC:`

```
DEC:salary
```

The listed integer columns use plain decimal representation
(`parseInt(token, 10)`). All other integer columns use Base36
(`parseInt(token, 36)`). `DEC:` is emitted only by the `llm` target and
only when the dataset is small enough that Base36 savings would not
amortize parse-risk.

### Constants — `C:`

```
C:active=1
C:role=^         (constant null)
```

A constant column has the same value in every row; that value is given
on the `C:` line and the column is **omitted** from every row.

### Integer sequences — `Q:`

```
Q:id=1,1
```

Format is `start,step` in Base36. Row `n` of the column equals
`parseInt(start, 36) + parseInt(step, 36) × n`. Column is omitted from
rows.

### Float sequences — `QF:`

```
QF:temperature=0,0.5
```

Format is `start,step` in plain decimal. Row `n` equals
`start + step × n`, rounded to the precision of the start value.
Column is omitted from rows.

### String sequences — `QS:`

```
QS:sku=1,1,SKU-
```

Format is `start,step,prefix` (start and step in Base36). Row `n` equals
`prefix + (parseInt(start, 36) + parseInt(step, 36) × n).toString()`.
Column is omitted from rows.

### Fixed-point floats — `FP:`

```
FP:price=2
```

Each token in the column is a Base36 integer; divide by `10^precision`
to recover the float. Example with `FP:price=2`:

| Token  | Base36 → integer | ÷ 100 → value |
| ------ | ---------------- | ------------- |
| `rr`   | 999              | 9.99          |
| `1f`   | 51               | 0.51          |
| `2dc`  | 3120             | 31.20         |

### Common suffix — `X:`

```
X:email=@company.com
```

Strip the column from rows and append the suffix to every decoded value
in that column.

### Defaults — `D:defaults=`

```
D:defaults=department=Engineering,active=1
```

Tokens equal to `~` mean "use the default". A value equal to the default
may also appear as `~` to save tokens. Trailing `~` tokens at the end
of a row may be omitted entirely.

### Column dictionary — `D:`

```
D:department=Engineering,Marketing,Sales
```

In the row, the token is the index into the dictionary, encoded in
Base36. Above, token `0` decodes to `Engineering`, `1` to `Marketing`,
`2` to `Sales`.

### Optional legend — `LEGEND:`

A purely informational line that expands every dictionary inline.
Decoders that already parsed the `D:` lines may ignore `LEGEND:` entirely;
it is only emitted when the consumer is a small or local model.

### Block marker — `@TID:`

The line `@T1:` (with the same identifier as the schema) marks the start
of the data block. An optional `F:csv` line right after `@T1:` declares
that data rows are comma-delimited; without `F:csv`, rows are
space-delimited.

### Anchor row — `! v1 v2 …` (target `llm` only)

The first data line begins with `!` and contains row 0 in fully literal
form: raw strings, plain decimal numbers, `1`/`0` booleans. The anchor
row is a ground-truth reference the model can use to verify its decoding
of subsequent rows.

### Run-length encoding — `*N[tokens]`

```
*3[Bob 72000 1 0]
```

Repeats the token sequence `N` times, where `N` is in Base36. `*N[]`
repeats an empty (all-defaults) row. `.` on its own represents a single
all-defaults row.

### End sentinel — `END:@TID` (target `llm` only)

A line `END:@T1` immediately after the last row signals that the payload
is complete. Its absence in an `llm`-target payload indicates truncation.

### Special tokens

| Token      | Meaning                                       |
| ---------- | --------------------------------------------- |
| `^`        | Explicit null                                 |
| `~`        | Use the column's default value                |
| `!value`   | Raw string literal (escapes the prefix)       |
| `*N[…]`    | Repeat the bracketed row `N` times (Base36)   |

### Base36 cheat sheet

```
0–9  = 0–9
a    = 10        n = 23
b    = 11        o = 24
c    = 12        p = 25
…                …
m    = 22        z = 35
```

Multi-digit values use positional notation:

```
10   = 1×36 + 0  =   36
1z   = 1×36 + 35 =   71
nm   = 23×36+22  =  850
21aw = 2×46656 + 1×1296 + 10×36 + 32 = 95000
2dc  = 2×1296 + 13×36 + 12          =  3120
```

### Worked example

```
S:@T1[5]=[id:i,na:s,de:s,sa:i,ac:b]
A:id,name,department,salary,active
DEC:sa
Q:id=1,1
D:defaults=de=Engineering,ac=1
D:de=Engineering,Marketing,Sales
@T1:
F:csv
!,Alice,95000,Engineering,1
Bob,72000,1,0
Carol,102000
Dave,68000,2
Eve,88000
END:@T1
```

Step-by-step:

1. Schema: five columns, abbreviated. `A:` gives full names.
2. `DEC:sa` — salary is plain decimal.
3. `Q:id=1,1` — id sequence: 1, 2, 3, 4, 5.
4. `D:defaults=de=Engineering,ac=1` — department defaults to `Engineering`,
   active defaults to `true`.
5. `D:de=…` — department dictionary; tokens `0`/`1`/`2` map to
   `Engineering`/`Marketing`/`Sales`.
6. Active columns (everything not constant or sequence): `name`, `salary`,
   `department`, `active`.
7. Anchor row (literal): `Alice, 95000, Engineering, 1` → row 0.
8. Row 1: `Bob, 72000, 1, 0` → `Bob`, `72000`, dictionary index `1` (Marketing),
   `false`.
9. Row 2: `Carol, 102000` (trailing defaults trimmed) → `Carol`, `102000`,
   default `Engineering`, default `true`.
10. Row 3: `Dave, 68000, 2` → `Dave`, `68000`, `Sales`, default `true`.
11. Row 4: `Eve, 88000` → `Eve`, `88000`, defaults.

Result:

```json
[
  { "id": 1, "name": "Alice", "department": "Engineering", "salary": 95000,  "active": true  },
  { "id": 2, "name": "Bob",   "department": "Marketing",   "salary": 72000,  "active": false },
  { "id": 3, "name": "Carol", "department": "Engineering", "salary": 102000, "active": true  },
  { "id": 4, "name": "Dave",  "department": "Sales",       "salary": 68000,  "active": true  },
  { "id": 5, "name": "Eve",   "department": "Engineering", "salary": 88000,  "active": true  }
]
```

### Adaptive-mode primer

```
Data is in TRON Adaptive format. Decode rules:

S:@T1[N]=[col:type,…]  — schema (i=int, f=float, s=str, b=bool, a=array).
                         Integer tokens are Base36 (a=10, z=35, 10=36) UNLESS the column
                         appears in DEC:.
DEC:c1,c2,…             — listed integer columns are plain decimal (parseInt base 10).
A:n1,n2,…               — full column names; if present, schema names are abbreviations —
                         use the full names in your answer.
@TID:                   — start of the data block. F:csv on the next line means rows are
                         comma-delimited; otherwise rows are space-delimited.
First data line `! …`   — anchor row: row 0 in fully literal form (raw strings, decimal
                         numbers, 1/0 booleans). Use it to verify your decoding.
END:@TID                — end-of-payload sentinel; if absent, the payload may be truncated.

Header lines:
C:col=val               — constant; every row has col=val; column omitted from rows.
Q:col=s,p               — int sequence: row[n].col = parseInt(s,36) + parseInt(p,36) × n;
                         column omitted from rows.
QF:col=s,p              — float sequence: row[n].col = s + p × n (decimal).
QS:col=s,p,pfx          — string sequence: row[n].col = pfx + (parseInt(s,36) + parseInt(p,36) × n).
FP:col=d                — col token is Base36 integer ÷ 10^d
                         (e.g. FP:price=2, token "rr" = 999 ÷ 100 = 9.99).
D:col=v0,v1,…           — column dictionary; token "0" → v0, "1" → v1, …  (Base36 index).
D:defaults=col=val,…    — defaults; ~ in a row means use the default.
X:col=suffix            — append suffix to all decoded values in col.
F:csv                   — rows are comma-delimited; otherwise space-delimited.

Special tokens:
^         = null
~         = column default
!value    = raw literal string
*N[tokens] = repeat row N times (N in Base36)

Active columns = schema columns minus those declared via C: / Q: / QF: / QS:.
Fill active columns left-to-right from row tokens, then fill constants and sequences.
```

---

## Recommended prompt structure

For best results, place this document in the system prompt and the
encoded payload in the user message:

```typescript
import * as fs from 'node:fs/promises';
import { Tron } from 'tron-core';

const guide = await fs.readFile('LLM_INSTRUCTIONS.md', 'utf-8');
const t = new Tron();
const encoded = t.toJSON(records, { mode: 'adaptive', target: 'llm' });

const messages = [
  { role: 'system', content: guide },
  { role: 'user',   content: `\`\`\`tron\n${encoded}\n\`\`\`\n\n${question}` },
];
```

This pattern lets providers that support prompt caching (Anthropic,
OpenAI) cache the system prompt across calls. With caching enabled, the
guide tokens are paid once per session rather than once per call.
