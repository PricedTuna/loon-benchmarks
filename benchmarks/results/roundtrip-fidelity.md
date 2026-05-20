# Roundtrip Fidelity

**Equipo**: Intel(R) Core(TM) Ultra 9 185H · 22 núcleos · 31.5 GB RAM
**OS**: win32 10.0.26200
**Ubicación**: Los Mochis, Sinaloa, México
**Fecha**: martes, 19 de mayo de 2026, 02:50:26 p.m. GMT-7

For each (format, dataset) pair we encode the dataset, decode the result with
the format's standard parser, and compare the decoded value to the original.

The comparator is type-coercion-aware: a number reconstructed as a numeric
string (e.g. `"123"` instead of `123`) does not count as a difference, so
formats that legitimately stringify scalars by spec (XML, CSV) are not
penalised for that. Structural differences — missing keys, dropped nesting,
length changes — are surfaced.

Cells:
- ✅ — decoded value structurally equals the original.
- ⚠️ lossy — decoded value differs structurally; first difference reported below.
- 🛑 encode / 🛑 decode — exception during encode or decode; message reported below.
- — — pair not exercised.

| Format | tabular | nested | analytics | github | event-logs | nested-config | numeric-precision | unicode-and-escapes | sparse-fields | employees-100 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JSON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON compact | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| YAML | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| XML | ✅ | ⚠️ lossy | ✅ | ⚠️ lossy | ✅ | ⚠️ lossy | ✅ | ✅ | ✅ | ✅ |
| CSV | 🛑 decode | 🛑 decode | 🛑 decode | 🛑 decode | 🛑 decode | ⚠️ lossy | 🛑 decode | 🛑 decode | 🛑 decode | 🛑 decode |
| TOON | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| LOON (llm) | ✅ | ⚠️ lossy | ✅ | ✅ | ✅ | ✅ | ⚠️ lossy | ✅ | ✅ | ✅ |
| LOON (full) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| LOON (local) | ✅ | ⚠️ lossy | ✅ | ✅ | ✅ | ✅ | ⚠️ lossy | ✅ | ✅ | ✅ |
| LOON (compact) | ✅ | ⚠️ lossy | ✅ | ✅ | ✅ | ✅ | ⚠️ lossy | ✅ | ✅ | ✅ |
| JTON | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy |

## Failures

- `csv` × `tabular` — decode error: Invalid Record Length: columns length is 1, got 7 on line 2
- `jton` × `tabular` — no TypeScript decoder available — encode-only format in this suite
- `xml` × `nested` — $.orders[4].items: key set differs (only-orig=0, only-decoded=name,price,quantity,sku)
- `csv` × `nested` — decode error: Invalid Record Length: columns length is 1, got 8 on line 2
- `loon-llm` × `nested` — $[3].total: value mismatch (number=861 vs string="nx")
- `loon-local` × `nested` — $[3].total: value mismatch (number=861 vs string="nx")
- `loon-compact` × `nested` — $[3].total: value mismatch (number=861 vs string="nx")
- `jton` × `nested` — no TypeScript decoder available — encode-only format in this suite
- `csv` × `analytics` — decode error: Invalid Record Length: columns length is 1, got 6 on line 2
- `jton` × `analytics` — no TypeScript decoder available — encode-only format in this suite
- `xml` × `github` — $.repositories[5].description: value mismatch (string="Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞 " vs string="Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞")
- `csv` × `github` — decode error: Invalid Record Length: columns length is 1, got 11 on line 2
- `jton` × `github` — no TypeScript decoder available — encode-only format in this suite
- `csv` × `event-logs` — decode error: Invalid Record Length: columns length is 1, got 6 on line 2
- `jton` × `event-logs` — no TypeScript decoder available — encode-only format in this suite
- `xml` × `nested-config` — $.authentication.providers[1].scopes: value mismatch (object=["read"] vs string="read")
- `csv` × `nested-config` — format cannot represent this shape (skipped)
- `jton` × `nested-config` — format cannot represent this shape (skipped)
- `csv` × `numeric-precision` — decode error: Invalid Record Length: columns length is 1, got 5 on line 2
- `loon-llm` × `numeric-precision` — $[0].sci: value mismatch (number=12300000000 vs string="5nf3oqo")
- `loon-local` × `numeric-precision` — $[0].sci: value mismatch (number=12300000000 vs string="5nf3oqo")
- `loon-compact` × `numeric-precision` — $[0].sci: value mismatch (number=12300000000 vs string="5nf3oqo")
- `jton` × `numeric-precision` — no TypeScript decoder available — encode-only format in this suite
- `csv` × `unicode-and-escapes` — decode error: Invalid Record Length: columns length is 1, got 2 on line 2
- `jton` × `unicode-and-escapes` — no TypeScript decoder available — encode-only format in this suite
- `csv` × `sparse-fields` — decode error: Invalid Record Length: columns length is 1, got 3 on line 2
- `jton` × `sparse-fields` — no TypeScript decoder available — encode-only format in this suite
- `csv` × `employees-100` — decode error: Invalid Record Length: columns length is 1, got 7 on line 2
- `jton` × `employees-100` — no TypeScript decoder available — encode-only format in this suite

> A format that wins on tokens but appears as ⚠️ on real datasets here is
> trading information for size. Whether that trade is acceptable depends on
> the use case; the benchmark just makes the trade visible.
