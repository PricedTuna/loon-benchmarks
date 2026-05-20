# Real-Data Token Efficiency

**Equipo**: Intel(R) Core(TM) Ultra 9 185H · 22 núcleos · 31.5 GB RAM
**OS**: win32 10.0.26200
**Ubicación**: Los Mochis, Sinaloa, México
**Fecha**: martes, 19 de mayo de 2026, 02:52:20 p.m. GMT-7

**Tokenizer:** `gpt-tokenizer` with `o200k_base` encoding (GPT-4o / GPT-5 family).
**Baseline:** `json-compact` — every other format is reported as a percentage delta against this baseline on the same input.

These files are real or near-real JSON payloads (canada.json, citm_catalog,
twitter, plus reference datasets and edge cases). They are not the synthetic
`datasets.ts` generators, which is the point: synthetic data tends to favour
columnar / class-based encodings in ways that real-world JSON does not. If a
format wins overall, it should win on these files too.

`n/a` means the formatter could not represent that input or threw. See the
"Formatter errors" section at the end for the verbatim error messages — no
formatter is silently replaced by another encoding.

## Large real-world JSON

| File | Bytes | JSON | JSON compact | YAML | XML | CSV | TOON | LOON (llm) | LOON (full) | LOON (local) | LOON (compact) | JTON |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GeoJSON polygon — Canada borders (≈2.2 MB) | 2,251,051 | 1,299,741 (+42.9%) | 909,327 (baseline) | 1,242,707 (+36.7%) | 1,634,132 (+79.7%) | 909,330 (+0.0%) | 1,189,075 (+30.8%) | 964,897 (+6.1%) | 964,923 (+6.1%) | 964,897 (+6.1%) | 909,316 (−0.0%) | n/a |
| CITM box-office catalog (≈1.7 MB, deeply nested) | 1,727,204 | 270,855 (+72.3%) | 157,200 (baseline) | 206,872 (+31.6%) | 287,264 (+82.7%) | 166,084 (+5.7%) | 204,370 (+30.0%) | 147,681 (−6.1%) | 146,959 (−6.5%) | 147,681 (−6.1%) | 147,681 (−6.1%) | 151,827 (−3.4%) |
| Twitter API search response (≈630 KB, mixed nesting) | 631,514 | 163,117 (+29.7%) | 125,731 (baseline) | 143,024 (+13.8%) | 176,969 (+40.8%) | 75,286 (−40.1%) | 144,093 (+14.6%) | 80,966 (−35.6%) | 49,179 (−60.9%) | 80,966 (−35.6%) | 145,406 (+15.6%) | n/a |

## Tabular real-world JSON

| File | Bytes | JSON | JSON compact | YAML | XML | CSV | TOON | LOON (llm) | LOON (full) | LOON (local) | LOON (compact) | JTON |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fakestore — 1k structured rows | 123,395 | 45,603 (+71.4%) | 26,603 (baseline) | 34,901 (+31.2%) | 55,101 (+107.1%) | 14,712 (−44.7%) | 16,717 (−37.2%) | 14,816 (−44.3%) | 8,838 (−66.8%) | 14,816 (−44.3%) | 14,816 (−44.3%) | 19,617 (−26.3%) |
| Fakestore — business records | 228,538 | 79,937 (+70.3%) | 46,937 (baseline) | 60,901 (+29.8%) | 94,101 (+100.5%) | 24,722 (−47.3%) | 25,727 (−45.2%) | 18,844 (−59.9%) | 10,391 (−77.9%) | 18,844 (−59.9%) | 18,844 (−59.9%) | 33,961 (−27.6%) |
| GitHub events sample | 55,827 | 21,322 (+20.0%) | 17,767 (baseline) | 19,155 (+7.8%) | 22,867 (+28.7%) | 18,786 (+5.7%) | 19,306 (+8.7%) | 20,419 (+14.9%) | 20,343 (+14.5%) | 20,419 (+14.9%) | 19,429 (+9.4%) | 17,767 (+0.0%) |

## Small reference datasets

| File | Bytes | JSON | JSON compact | YAML | XML | CSV | TOON | LOON (llm) | LOON (full) | LOON (local) | LOON (compact) | JTON |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| World cities reference | 4,034 | 1,752 (+59.3%) | 1,100 (baseline) | 1,364 (+24.0%) | 1,975 (+79.5%) | 741 (−32.6%) | 754 (−31.5%) | 741 (−32.6%) | 689 (−37.4%) | 741 (−32.6%) | 741 (−32.6%) | 922 (−16.2%) |
| US states with detail | 9,959 | 3,465 (+70.1%) | 2,037 (baseline) | 2,432 (+19.4%) | 4,719 (+131.7%) | 1,864 (−8.5%) | 2,178 (+6.9%) | 1,334 (−34.5%) | 1,355 (−33.5%) | 1,334 (−34.5%) | 1,334 (−34.5%) | 2,037 (+0.0%) |
| European countries | 6,175 | 2,652 (+64.1%) | 1,616 (baseline) | 1,968 (+21.8%) | 3,189 (+97.3%) | 811 (−49.8%) | 803 (−50.3%) | 819 (−49.3%) | 845 (−47.7%) | 819 (−49.3%) | 819 (−49.3%) | 1,120 (−30.7%) |
| NFL teams | 6,983 | 2,607 (+58.7%) | 1,643 (baseline) | 1,815 (+10.5%) | 3,027 (+84.2%) | 870 (−47.0%) | 892 (−45.7%) | 870 (−47.0%) | 984 (−40.1%) | 870 (−47.0%) | 870 (−47.0%) | 1,216 (−26.0%) |
| World mountains | 2,940 | 1,245 (+55.4%) | 801 (baseline) | 943 (+17.7%) | 1,502 (+87.5%) | 479 (−40.2%) | 500 (−37.6%) | 479 (−40.2%) | 512 (−36.1%) | 479 (−40.2%) | 479 (−40.2%) | 619 (−22.7%) |
| Hikes (20 records) | 2,918 | 1,075 (+64.1%) | 655 (baseline) | 785 (+19.8%) | 1,332 (+103.4%) | 304 (−53.6%) | 341 (−47.9%) | 298 (−54.5%) | 292 (−55.4%) | 298 (−54.5%) | 298 (−54.5%) | 431 (−34.2%) |
| Currencies reference | 3,456 | 1,477 (+84.4%) | 801 (baseline) | 1,011 (+26.2%) | 1,663 (+107.6%) | 565 (−29.5%) | 999 (+24.7%) | 431 (−46.2%) | 407 (−49.2%) | 431 (−46.2%) | 431 (−46.2%) | n/a |
| File extensions reference | 3,711 | 1,305 (+67.7%) | 778 (baseline) | 942 (+21.1%) | 1,535 (+97.3%) | 396 (−49.1%) | 468 (−39.8%) | 396 (−49.1%) | 391 (−49.7%) | 396 (−49.1%) | 396 (−49.1%) | 579 (−25.6%) |
| HTTP status codes | 4,983 | 1,428 (+53.7%) | 929 (baseline) | 1,093 (+17.7%) | 1,650 (+77.6%) | 637 (−31.4%) | 705 (−24.1%) | 636 (−31.5%) | 633 (−31.9%) | 636 (−31.5%) | 636 (−31.5%) | 929 (+0.0%) |
| Keyboard shortcuts | 2,687 | 1,100 (+70.3%) | 646 (baseline) | 769 (+19.0%) | 1,337 (+107.0%) | 368 (−43.0%) | 381 (−41.0%) | 350 (−45.8%) | 360 (−44.3%) | 350 (−45.8%) | 350 (−45.8%) | 482 (−25.4%) |
| Lorem ipsum reference | 2,300 | 680 (+38.2%) | 492 (baseline) | 622 (+26.4%) | 908 (+84.6%) | n/a | 487 (−1.0%) | 496 (+0.8%) | 496 (+0.8%) | 496 (+0.8%) | 496 (+0.8%) | 492 (+0.0%) |
| Programming languages | 3,075 | 1,004 (+75.5%) | 572 (baseline) | 733 (+28.1%) | 1,458 (+154.9%) | 540 (−5.6%) | 649 (+13.5%) | 379 (−33.7%) | 391 (−31.6%) | 379 (−33.7%) | 379 (−33.7%) | 572 (+0.0%) |
| Units of measurement | 2,959 | 1,231 (+74.6%) | 705 (baseline) | 879 (+24.7%) | 1,431 (+103.0%) | 336 (−52.3%) | 370 (−47.5%) | 353 (−49.9%) | 357 (−49.4%) | 353 (−49.9%) | 353 (−49.9%) | 516 (−26.8%) |
| US state capitals | 6,360 | 2,853 (+58.6%) | 1,799 (baseline) | 2,188 (+21.6%) | 3,384 (+88.1%) | 1,100 (−38.9%) | 1,125 (−37.5%) | 1,100 (−38.9%) | 1,083 (−39.8%) | 1,100 (−38.9%) | 1,100 (−38.9%) | 1,412 (−21.5%) |

## Adversarial / edge cases

| File | Bytes | JSON | JSON compact | YAML | XML | CSV | TOON | LOON (llm) | LOON (full) | LOON (local) | LOON (compact) | JTON |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Edge cases (escapes, unicode, deeply nested) | 1,832 | 633 (+51.1%) | 419 (baseline) | 503 (+20.0%) | 738 (+76.1%) | n/a | 505 (+20.5%) | 473 (+12.9%) | 473 (+12.9%) | 473 (+12.9%) | 473 (+12.9%) | n/a |


## Formatter errors

- `canada.json` × `jton`: format cannot represent this shape (skipped)
- `twitter.json` × `jton`: jton-bridge: jton encoder error: Failed to encode string as UTF-8
- `currencies.json` × `jton`: jton-bridge: jton encoder error: Failed to encode string as UTF-8
- `lorem-ipsum.json` × `csv`: empty output (format cannot represent this data)
- `test-edge-cases.json` × `csv`: empty output (format cannot represent this data)
- `test-edge-cases.json` × `jton`: format cannot represent this shape (skipped)

> Methodology note: LOON encoder state is reset (`resetLoonEncoder()`) between
> files. This prevents dictionary state accumulated on file _N_ from
> compressing file _N+1_ — that state is only useful within a single chat
> context and would inflate measured savings on standalone files.
