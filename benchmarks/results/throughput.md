# Encode/Decode Throughput Benchmark

**Equipo**: Intel(R) Core(TM) Ultra 9 185H · 22 núcleos · 31.5 GB RAM
**OS**: win32 10.0.26200
**Ubicación**: Los Mochis, Sinaloa, México
**Fecha**: jueves, 14 de mayo de 2026, 07:59:56 a.m. GMT-7

Measures how many encode (serialize) and decode (deserialize) operations each format
can complete per second. Throughput matters for use cases where the data format is
generated or consumed at scale — e.g., bulk context preparation for LLM inference.

**Methodology**
- Dataset: uniform employee records at three sizes (small/medium/large)
- Warm-up: 5 iterations discarded before timing
- Measurement: 50 timed iterations per phase
- Baseline: JSON compact (JSON.stringify / JSON.parse)
- JTON excluded: Python subprocess overhead (IPC ~5–20 ms/call) dominates the
  measurement and is not a fair comparison for single-process throughput.
  JTON throughput in a production system would require a persistent process pool.

## Summary

### Serialization — Relative performance vs JSON compact (ops/sec ratio)

> Values > 1.00× = faster than JSON compact; < 1.00× = slower.

| Format | Small (50 rows) | Medium (500 rows) | Large (5,000 rows) |
| --- | --- | --- | --- |
| JSON compact | _(baseline)_ | _(baseline)_ | _(baseline)_ |
| JSON | 0.85× | 0.94× | 0.85× |
| YAML | 0.01× | 0.02× | 0.02× |
| XML | 0.05× | 0.14× | 0.15× |
| TOON | 0.09× | 0.24× | 0.30× |
| LOON (llm) | 0.03× | 0.07× | 0.09× |
| LOON (full) | 0.03× | 0.07× | 0.09× |
| LOON (local) | 0.04× | 0.08× | 0.09× |
| LOON (compact) | 0.13× | 0.23× | 0.26× |

### Deserialization — Relative performance vs JSON compact (ops/sec ratio)

> Values > 1.00× = faster than JSON compact; < 1.00× = slower.

| Format | Small (50 rows) | Medium (500 rows) | Large (5,000 rows) |
| --- | --- | --- | --- |
| JSON compact | _(baseline)_ | _(baseline)_ | _(baseline)_ |
| JSON | 0.92× | 0.93× | 1.03× |
| YAML | 0.01× | 0.01× | 0.01× |
| XML | 0.02× | 0.03× | 0.03× |
| TOON | 0.07× | 0.14× | 0.14× |
| LOON (llm) | 0.07× | 0.16× | 0.16× |
| LOON (full) | 0.10× | 0.19× | 0.16× |
| LOON (local) | 0.12× | 0.18× | 0.15× |
| LOON (compact) | 0.11× | 0.16× | 0.16× |

## Detailed results

### Serialization (encode)

#### Small (50 rows) — Serialization

Input: 50 rows, 6.9 KB JSON

| Format | ops/sec | ms/op | vs JSON compact |
| --- | --- | --- | --- |
| JSON compact | 93.6k | 11 µs | _(baseline)_ |
| JSON | 74.5k | 13 µs | 0.85× |
| YAML | 773 | 1.29 ms | 0.01× |
| XML | 4.5k | 221 µs | 0.05× |
| TOON | 8.3k | 121 µs | 0.09× |
| LOON (llm) | 2.4k | 416 µs | 0.03× |
| LOON (full) | 2.6k | 381 µs | 0.03× |
| LOON (local) | 3.9k | 259 µs | 0.04× |
| LOON (compact) | 11.2k | 89 µs | 0.13× |

#### Medium (500 rows) — Serialization

Input: 500 rows, 70.1 KB JSON

| Format | ops/sec | ms/op | vs JSON compact |
| --- | --- | --- | --- |
| JSON compact | 7.4k | 135 µs | _(baseline)_ |
| JSON | 7.2k | 139 µs | 0.94× |
| YAML | 120 | 8.31 ms | 0.02× |
| XML | 1.1k | 907 µs | 0.14× |
| TOON | 1.8k | 544 µs | 0.24× |
| LOON (llm) | 558 | 1.79 ms | 0.07× |
| LOON (full) | 571 | 1.75 ms | 0.07× |
| LOON (local) | 613 | 1.63 ms | 0.08× |
| LOON (compact) | 1.8k | 571 µs | 0.23× |

#### Large (5,000 rows) — Serialization

Input: 5,000 rows, 704.1 KB JSON

| Format | ops/sec | ms/op | vs JSON compact |
| --- | --- | --- | --- |
| JSON compact | 635 | 1.58 ms | _(baseline)_ |
| JSON | 516 | 1.94 ms | 0.85× |
| YAML | 11 | 88.65 ms | 0.02× |
| XML | 94 | 10.58 ms | 0.15× |
| TOON | 183 | 5.46 ms | 0.30× |
| LOON (llm) | 55 | 18.23 ms | 0.09× |
| LOON (full) | 54 | 18.39 ms | 0.09× |
| LOON (local) | 54 | 18.58 ms | 0.09× |
| LOON (compact) | 160 | 6.27 ms | 0.26× |

### Deserialization (decode)

#### Small (50 rows) — Deserialization

Input: 50 rows, 6.9 KB JSON

| Format | ops/sec | ms/op | vs JSON compact |
| --- | --- | --- | --- |
| JSON compact | 64.6k | 15 µs | _(baseline)_ |
| JSON | 59.1k | 17 µs | 0.92× |
| YAML | 349 | 2.86 ms | 0.01× |
| XML | 1.2k | 829 µs | 0.02× |
| TOON | 4.7k | 214 µs | 0.07× |
| LOON (llm) | 4.6k | 216 µs | 0.07× |
| LOON (full) | 6.4k | 156 µs | 0.10× |
| LOON (local) | 7.7k | 129 µs | 0.12× |
| LOON (compact) | 7.2k | 138 µs | 0.11× |

#### Medium (500 rows) — Deserialization

Input: 500 rows, 70.1 KB JSON

| Format | ops/sec | ms/op | vs JSON compact |
| --- | --- | --- | --- |
| JSON compact | 6.3k | 160 µs | _(baseline)_ |
| JSON | 5.8k | 172 µs | 0.93× |
| YAML | 34 | 29.25 ms | 0.01× |
| XML | 166 | 6.04 ms | 0.03× |
| TOON | 850 | 1.18 ms | 0.14× |
| LOON (llm) | 1.0k | 973 µs | 0.16× |
| LOON (full) | 1.2k | 855 µs | 0.19× |
| LOON (local) | 1.1k | 897 µs | 0.18× |
| LOON (compact) | 1000 | 1.00 ms | 0.16× |

#### Large (5,000 rows) — Deserialization

Input: 5,000 rows, 704.1 KB JSON

| Format | ops/sec | ms/op | vs JSON compact |
| --- | --- | --- | --- |
| JSON compact | 616 | 1.62 ms | _(baseline)_ |
| JSON | 613 | 1.63 ms | 1.03× |
| YAML | 3 | 292.33 ms | 0.01× |
| XML | 15 | 65.35 ms | 0.03× |
| TOON | 83 | 11.99 ms | 0.14× |
| LOON (llm) | 96 | 10.47 ms | 0.16× |
| LOON (full) | 94 | 10.61 ms | 0.16× |
| LOON (local) | 89 | 11.29 ms | 0.15× |
| LOON (compact) | 96 | 10.44 ms | 0.16× |
