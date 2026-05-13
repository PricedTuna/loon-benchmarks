# Multi-Tokenizer Token Efficiency

**Equipo**: AMD Ryzen 5 5600X 6-Core Processor · 12 núcleos · 31.3 GB RAM
**OS**: linux 6.14.0-24-generic
**Ubicación**: Los Mochis, Sinaloa, México
**Fecha**: martes, 12 de mayo de 2026, 05:31:45 p.m. GMT-7

Measures token counts across four tokenizers for every (format, dataset) pair.
Token savings that hold across all tokenizers are more robust claims for a paper
than savings measured on a single tokenizer.

## Tokenizer legend

| ID | Label | Accuracy |
| --- | --- | --- |
| `gpt` | GPT-4o (o200k) | exact — OpenAI tiktoken o200k_base |
| `gpt4` | GPT-4 (cl100k) | exact — OpenAI tiktoken cl100k_base |
| `claude` | Claude (≈±5%) | approximate ±5% — @anthropic-ai/tokenizer community build |
| `gemini` | Gemini (SentencePiece) | approximate — SentencePiece bridge (Gemma ±3% if model present, T5 ±15% fallback) |

> **Reading the table**: each cell shows raw token count and % vs `json-compact`
> baseline on the same tokenizer column. Comparing across tokenizer columns is
> intentionally valid — different absolute counts are expected; what matters is
> whether the _relative_ savings are consistent.

## Per-dataset results

### Uniform employee records

| Format | GPT-4o (o200k) | GPT-4 (cl100k) | Claude (≈±5%) | Gemini (SentencePiece) |
| --- | --- | --- | --- | --- |
| JSON | 127,029 (+60.7%) | 127,734 (+60.2%) | 127,180 (+47.6%) | n/a |
| JSON compact | 79,025 _(baseline)_ | 79,729 _(baseline)_ | 86,166 _(baseline)_ | n/a |
| YAML | 100,015 (+26.6%) | 100,749 (+26.4%) | 88,775 (+3.0%) | n/a |
| XML | 146,574 (+85.5%) | 146,651 (+83.9%) | 160,195 (+85.9%) | n/a |
| CSV | 47,124 (−40.4%) | 47,600 (−40.3%) | 55,727 (−35.3%) | n/a |
| TOON | 49,947 (−36.8%) | 50,423 (−36.8%) | 56,651 (−34.3%) | n/a |
| TRON | 38,566 (−51.2%) | 39,232 (−50.8%) | 45,327 (−47.4%) | n/a |
| JTON | 61,042 (−22.8%) | 61,747 (−22.6%) | 63,191 (−26.7%) | n/a |

### E-commerce orders with nested structures

| Format | GPT-4o (o200k) | GPT-4 (cl100k) | Claude (≈±5%) | Gemini (SentencePiece) |
| --- | --- | --- | --- | --- |
| JSON | 109,518 (+57.6%) | 109,958 (+59.5%) | 107,671 (+47.6%) | n/a |
| JSON compact | 69,485 _(baseline)_ | 68,924 _(baseline)_ | 72,954 _(baseline)_ | n/a |
| YAML | 85,397 (+22.9%) | 85,206 (+23.6%) | 75,471 (+3.5%) | n/a |
| XML | 123,203 (+77.3%) | 122,740 (+78.1%) | 127,820 (+75.2%) | n/a |
| CSV | n/a | n/a | n/a | n/a |
| TOON | 73,206 (+5.4%) | 73,515 (+6.7%) | 69,420 (−4.8%) | n/a |
| TRON | 54,289 (−21.9%) | 54,822 (−20.5%) | 58,258 (−20.1%) | n/a |
| JTON | 68,448 (−1.5%) | 68,262 (−1.0%) | 70,086 (−3.9%) | n/a |

### Time-series analytics data

| Format | GPT-4o (o200k) | GPT-4 (cl100k) | Claude (≈±5%) | Gemini (SentencePiece) |
| --- | --- | --- | --- | --- |
| JSON | 22,249 (+56.5%) | 22,249 (+56.5%) | 19,374 (+43.9%) | n/a |
| JSON compact | 14,215 _(baseline)_ | 14,214 _(baseline)_ | 13,465 _(baseline)_ | n/a |
| YAML | 17,862 (+25.7%) | 17,862 (+25.7%) | 13,527 (+0.5%) | n/a |
| XML | 26,620 (+87.3%) | 26,620 (+87.3%) | 25,871 (+92.1%) | n/a |
| CSV | 8,387 (−41.0%) | 8,387 (−41.0%) | 8,367 (−37.9%) | n/a |
| TOON | 9,119 (−35.8%) | 9,119 (−35.8%) | 8,369 (−37.8%) | n/a |
| TRON | 6,023 (−57.6%) | 6,033 (−57.6%) | 6,479 (−51.9%) | n/a |
| JTON | 10,579 (−25.6%) | 10,579 (−25.6%) | 8,798 (−34.7%) | n/a |

### Top 100 GitHub repositories

| Format | GPT-4o (o200k) | GPT-4 (cl100k) | Claude (≈±5%) | Gemini (SentencePiece) |
| --- | --- | --- | --- | --- |
| JSON | 15,268 (+31.9%) | 15,160 (+32.2%) | 15,260 (+26.6%) | n/a |
| JSON compact | 11,576 _(baseline)_ | 11,466 _(baseline)_ | 12,055 _(baseline)_ | n/a |
| YAML | 13,255 (+14.5%) | 13,148 (+14.7%) | 12,092 (+0.3%) | n/a |
| XML | 17,222 (+48.8%) | 16,892 (+47.3%) | 17,815 (+47.8%) | n/a |
| CSV | 8,642 (−25.3%) | 8,735 (−23.8%) | 9,032 (−25.1%) | n/a |
| TOON | 8,876 (−23.3%) | 8,967 (−21.8%) | 9,101 (−24.5%) | n/a |
| TRON | 8,728 (−24.6%) | 8,952 (−21.9%) | 9,100 (−24.5%) | n/a |
| JTON | 11,576 (+0.0%) | 11,466 (+0.0%) | 12,055 (+0.0%) | n/a |

### Semi-uniform event logs

| Format | GPT-4o (o200k) | GPT-4 (cl100k) | Claude (≈±5%) | Gemini (SentencePiece) |
| --- | --- | --- | --- | --- |
| JSON | 181,083 (+41.0%) | 178,751 (+44.1%) | 177,005 (+34.5%) | n/a |
| JSON compact | 128,422 _(baseline)_ | 124,089 _(baseline)_ | 131,596 _(baseline)_ | n/a |
| YAML | 155,274 (+20.9%) | 152,942 (+23.3%) | 134,549 (+2.2%) | n/a |
| XML | 205,738 (+60.2%) | 199,406 (+60.7%) | 210,913 (+60.3%) | n/a |
| CSV | n/a | n/a | n/a | n/a |
| TOON | 153,974 (+19.9%) | 151,642 (+22.2%) | 140,119 (+6.5%) | n/a |
| TRON | 138,416 (+7.8%) | 136,084 (+9.7%) | 139,000 (+5.6%) | n/a |
| JTON | 128,422 (+0.0%) | 124,089 (+0.0%) | 131,596 (+0.0%) | n/a |

### Deeply nested configuration

| Format | GPT-4o (o200k) | GPT-4 (cl100k) | Claude (≈±5%) | Gemini (SentencePiece) |
| --- | --- | --- | --- | --- |
| JSON | 905 (+63.9%) | 913 (+66.0%) | 921 (+59.6%) | n/a |
| JSON compact | 552 _(baseline)_ | 550 _(baseline)_ | 577 _(baseline)_ | n/a |
| YAML | 662 (+19.9%) | 672 (+22.2%) | 625 (+8.3%) | n/a |
| XML | 997 (+80.6%) | 995 (+80.9%) | 1,039 (+80.1%) | n/a |
| CSV | n/a | n/a | n/a | n/a |
| TOON | 620 (+12.3%) | 627 (+14.0%) | 609 (+5.5%) | n/a |
| TRON | n/a | n/a | n/a | n/a |
| JTON | n/a | n/a | n/a | n/a |


## Tokenizer Agreement

How much do Claude and Gemini token counts differ from GPT-4o on the same encoded text?
Cells show the average absolute % difference across all datasets where the format was representable.

| Format | GPT-4 vs GPT-4o | Claude vs GPT-4o | Gemini vs GPT-4o |
| --- | --- | --- | --- |
| JSON | 0.6% | 3.1% | n/a |
| JSON compact | 1.1% | 5.1% | n/a |
| YAML | 0.8% | 12.5% | n/a |
| XML | 0.9% | 4.3% | n/a |
| CSV | 0.7% | 7.7% | n/a |
| TOON | 0.8% | 6.7% | n/a |
| TRON | 1.4% | 7.4% | n/a |
| JTON | 1.2% | 5.9% | n/a |

> **Methodology**: Claude and Gemini tokenizers are approximations. Differences
> of ±5–10% vs the exact tokenizers are expected and disclosed per cell. The
> agreement table above quantifies the systematic bias so readers can judge
> whether cross-tokenizer claims are reliable.
