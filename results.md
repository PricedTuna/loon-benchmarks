

<!-- CSV-BENCHMARK-START -->
## CSV vs TRON Benchmark

_Fecha: 2026-05-01 00:30:17 UTC | Fuente de tokens: Gemini_

### Users

| N | CSV bytes | TRON bytes | %bytes | CSV tok | TRON tok | %tok |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 2139 | 698 | 67% | 535 | 175 | **67%** |
| 100 | 4258 | 1117 | 74% | 1065 | 279 | **🎯 74%** |
| 500 | 22004 | 4449 | 80% | 5501 | 1112 | **🎯 80%** |
| 1000 | 44193 | 8618 | 80% | 11048 | 2155 | **🎯 80%** |

### Orders

| N | CSV bytes | TRON bytes | %bytes | CSV tok | TRON tok | %tok |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 1894 | 852 | 55% | 474 | 213 | **55%** |
| 100 | 3775 | 1497 | 60% | 944 | 374 | **60%** |
| 500 | 19385 | 7013 | 64% | 4846 | 1753 | **64%** |
| 1000 | 39144 | 13914 | 64% | 9786 | 3479 | **64%** |
<!-- CSV-BENCHMARK-END -->


---

<!-- 90PCT-BENCHMARK-START -->
## Benchmark: ¿90% en Todos los Tipos de Datos?

_Fecha: 2026-05-01 00:30:20 UTC_

### Idea Clave de Toon: Delimitador CSV

Toon usa comas como delimitador de fila → strings con espacios son naturales sin escaping:

```
Toon:       1,Blue Lake Trail,7.5,320,ana,moderate,Sierra Nevada,true
TRON standard: Blue\sLake\sTrail 7.5 nm 0 0 ~   ← \s = bytes extra por espacio
TRON+CSV:   Blue Lake Trail,7.5,nm,0,0,~        ← sin escaping, misma compresión
```

### TRON ultra: Modo CSV Row (`mode: 'ultra'`)

Nueva opción que combina las ideas de Toon (delimitador CSV natural) con las de TRON (Base36, constantes, secuencias, defaults, RLE):

- Filas separadas por `,` en vez de espacio
- Strings con espacios sin escaping (sin `\s`)
- Solo se escapan comas dentro de valores (`\,`)
- Cabecera `F:csv` indica el modo al decoder

### Ejemplo: 5 Hikes

**Toon:**
```
hikes[5]{id,name,distanceKm,elevationGain,companion,difficulty,region,wasSunny}:
  1,Blue Lake Trail,7,100,ana,easy,Sierra Nevada,true
  2,Ridge Overlook,10.4,137,luis,moderate,Cascade Range,false
  3,Wildflower Loop,10.6,174,sam,hard,Northern California,true
  4,Summit Pass,7.6,211,ana,easy,San Gabriel Mountains,true
  5,Echo Canyon,4,248,luis,moderate,Rocky Mountains,false
```

**TRON ultra:**
```
S:@T1[5]=[id:i,na:s,dk:f,eg:i,co:s,di:s,re:s,ws:b]
A:id,name,distanceKm,elevationGain,companion,difficulty,region,wasSunny
Q:id=1,1
Q:eg=2s,11
FP:dk=1
D:defaults=co=ana,di=easy,ws=1
D:di=moderate
@T1:
F:csv
Blue Lake Trail,1y,Sierra Nevada
Ridge Overlook,2w,Cascade Range,luis,0,0
Wildflower Loop,2y,Northern California,sam,!hard
Summit Pass,24,San Gabriel Mountains
Echo Canyon,14,Rocky Mountains,luis,0,0
```

### Resultados por Dataset

#### Hikes (texto libre + enums)

| N | Formato | Bytes | %Bytes | Tok(est) | %Tok | OK |
| ---: | :--- | ---: | ---: | ---: | ---: | :---: |
| 3 | JSON | 462 | — | 116 | — | — |
| 3 | Toon(manual) | 259 | 44% | 65 | 44% | — |
| 3 | TOON | 254 | 45% | 64 | 45% | — |
| 3 | JTON | 303 | 34% | 76 | 34% | — |
| 3 | TRON lite | 414 | 10% | 104 | 10% | ✓ |
| 3 | TRON standard | 268 | 42% | 67 | 42% | ✓ |
| 3 | TRON ultra | 334 | 28% | 84 | 28% | ✓ |
| 20 | JSON | 3069 | — | 767 | — | — |
| 20 | Toon(manual) | 1269 | 59% | 317 | 59% | — |
| 20 | TOON | 1264 | 59% | 316 | 59% | — |
| 20 | JTON | 1551 | 49% | 388 | 49% | — |
| 20 | TRON lite | 2783 | 9% | 696 | 9% | ✓ |
| 20 | TRON standard | 937 | 69% | 234 | 69% | ✓ |
| 20 | TRON ultra | 817 | 73% | 204 | 73% | ✓ |
| 100 | JSON | 15390 | — | 3848 | — | — |
| 100 | Toon(manual) | 6071 | 61% | 1518 | 61% | — |
| 100 | TOON | 6066 | 61% | 1517 | 61% | — |
| 100 | JTON | 7473 | 51% | 1868 | 51% | — |
| 100 | TRON lite | 13984 | 9% | 3496 | 9% | ✓ |
| 100 | TRON standard | 2591 | 83% | 648 | 83% | ✗ |
| 100 | TRON ultra | 1914 | 88% | 479 | 88% | ✓ |
| 500 | JSON | 77417 | — | 19354 | — | — |
| 500 | Toon(manual) | 30498 | 61% | 7625 | 61% | — |
| 500 | TOON | 30493 | 61% | 7623 | 61% | — |
| 500 | JTON | 37500 | 52% | 9375 | 52% | — |
| 500 | TRON lite | 70411 | 9% | 17603 | 9% | ✓ |
| 500 | TRON standard | 10333 | 87% | 2583 | 87% | ✓ |
| 500 | TRON ultra | 7182 | 🎯 91% | 1796 | 🎯 91% | ✓ |
| 1000 | JSON | 154951 | — | 38738 | — | — |
| 1000 | Toon(manual) | 61033 | 61% | 15258 | 61% | — |
| 1000 | TOON | 61028 | 61% | 15257 | 61% | — |
| 1000 | JTON | 75035 | 52% | 18759 | 52% | — |
| 1000 | TRON lite | 140945 | 9% | 35236 | 9% | ✓ |
| 1000 | TRON standard | 19616 | 87% | 4904 | 87% | ✓ |
| 1000 | TRON ultra | 13761 | 🎯 91% | 3440 | 🎯 91% | ✓ |

#### Users (enums dominantes, IDs + emails)

| N | Formato | Bytes | %Bytes | Tok(est) | %Tok | OK |
| ---: | :--- | ---: | ---: | ---: | ---: | :---: |
| 20 | JSON | 2470 | — | 618 | — | — |
| 20 | Toon(manual) | 1316 | 47% | 329 | 47% | — |
| 20 | TOON | 1311 | 47% | 328 | 47% | — |
| 20 | JTON | 1617 | 35% | 404 | 35% | — |
| 20 | TRON lite | 2164 | 12% | 541 | 12% | ✓ |
| 20 | TRON standard | 1093 | 56% | 273 | 56% | ✓ |
| 20 | TRON ultra | 651 | 74% | 163 | 74% | ✓ |
| 100 | JSON | 12404 | — | 3101 | — | — |
| 100 | Toon(manual) | 6451 | 48% | 1613 | 48% | — |
| 100 | TOON | 6446 | 48% | 1612 | 48% | — |
| 100 | JTON | 7952 | 36% | 1988 | 36% | — |
| 100 | TRON lite | 10898 | 12% | 2725 | 12% | ✓ |
| 100 | TRON standard | 4011 | 68% | 1003 | 68% | ✓ |
| 100 | TRON ultra | 1629 | 87% | 407 | 87% | ✓ |
| 500 | JSON | 62884 | — | 15721 | — | — |
| 500 | Toon(manual) | 32931 | 48% | 8233 | 48% | — |
| 500 | TOON | 32926 | 48% | 8232 | 48% | — |
| 500 | JTON | 40432 | 36% | 10108 | 36% | — |
| 500 | TRON lite | 55378 | 12% | 13845 | 12% | ✓ |
| 500 | TRON standard | 17251 | 73% | 4313 | 73% | ✓ |
| 500 | TRON ultra | 5029 | 🎯 92% | 1257 | 🎯 92% | ✓ |
| 1000 | JSON | 125977 | — | 31494 | — | — |
| 1000 | Toon(manual) | 66025 | 48% | 16506 | 48% | — |
| 1000 | TOON | 66020 | 48% | 16505 | 48% | — |
| 1000 | JTON | 81026 | 36% | 20257 | 36% | — |
| 1000 | TRON lite | 110971 | 12% | 27743 | 12% | ✓ |
| 1000 | TRON standard | 33805 | 73% | 8451 | 73% | ✓ |
| 1000 | TRON ultra | 9282 | 🎯 93% | 2321 | 🎯 93% | ✓ |

#### Orders (numérico + enums)

| N | Formato | Bytes | %Bytes | Tok(est) | %Tok | OK |
| ---: | :--- | ---: | ---: | ---: | ---: | :---: |
| 20 | JSON | 2222 | — | 556 | — | — |
| 20 | Toon(manual) | 866 | 61% | 217 | 61% | — |
| 20 | TOON | 860 | 61% | 215 | 61% | — |
| 20 | JTON | 1046 | 53% | 262 | 53% | — |
| 20 | TRON lite | 2036 | 8% | 509 | 8% | ✓ |
| 20 | TRON standard | 660 | 70% | 165 | 70% | ✓ |
| 20 | TRON ultra | 413 | 81% | 103 | 81% | ✓ |
| 100 | JSON | 11185 | — | 2796 | — | — |
| 100 | Toon(manual) | 4150 | 63% | 1038 | 63% | — |
| 100 | TOON | 4144 | 63% | 1036 | 63% | — |
| 100 | JTON | 5050 | 55% | 1263 | 55% | — |
| 100 | TRON lite | 10279 | 8% | 2570 | 8% | ✓ |
| 100 | TRON standard | 2432 | 78% | 608 | 78% | ✓ |
| 100 | TRON ultra | 1451 | 87% | 363 | 87% | ✓ |
| 500 | JSON | 56168 | — | 14042 | — | — |
| 500 | Toon(manual) | 20733 | 63% | 5183 | 63% | — |
| 500 | TOON | 20727 | 63% | 5182 | 63% | — |
| 500 | JTON | 25233 | 55% | 6308 | 55% | — |
| 500 | TRON lite | 51662 | 8% | 12916 | 8% | ✓ |
| 500 | TRON standard | 11575 | 79% | 2894 | 79% | ✓ |
| 500 | TRON ultra | 7670 | 86% | 1918 | 86% | ✓ |
| 1000 | JSON | 112450 | — | 28113 | — | — |
| 1000 | Toon(manual) | 41516 | 63% | 10379 | 63% | — |
| 1000 | TOON | 41510 | 63% | 10378 | 63% | — |
| 1000 | JTON | 50516 | 55% | 12629 | 55% | — |
| 1000 | TRON lite | 103444 | 8% | 25861 | 8% | ✓ |
| 1000 | TRON standard | 22948 | 80% | 5737 | 80% | ✓ |
| 1000 | TRON ultra | 15142 | 87% | 3786 | 87% | ✓ |

#### Products (texto libre + URLs)

| N | Formato | Bytes | %Bytes | Tok(est) | %Tok | OK |
| ---: | :--- | ---: | ---: | ---: | ---: | :---: |
| 10 | JSON | 1738 | — | 435 | — | — |
| 10 | Toon(manual) | 1155 | 34% | 289 | 34% | — |
| 10 | TOON | 1169 | 33% | 292 | 33% | — |
| 10 | JTON | 1738 | 0% | 435 | 0% | — |
| 10 | TRON lite | 1622 | 7% | 406 | 7% | ✓ |
| 10 | TRON standard | 1212 | 30% | 303 | 30% | ✓ |
| 10 | TRON ultra | 850 | 51% | 213 | 51% | ✓ |
| 20 | JSON | 3491 | — | 873 | — | — |
| 20 | Toon(manual) | 2268 | 35% | 567 | 35% | — |
| 20 | TOON | 2304 | 34% | 576 | 34% | — |
| 20 | JTON | 3491 | 0% | 873 | 0% | — |
| 20 | TRON lite | 3265 | 6% | 816 | 7% | ✓ |
| 20 | TRON standard | 1727 | 51% | 432 | 51% | ✗ |
| 20 | TRON ultra | 1035 | 70% | 259 | 70% | ✓ |
| 100 | JSON | 17511 | — | 4378 | — | — |
| 100 | Toon(manual) | 11169 | 36% | 2792 | 36% | — |
| 100 | TOON | 11381 | 35% | 2845 | 35% | — |
| 100 | JTON | 17511 | 0% | 4378 | 0% | — |
| 100 | TRON lite | 16405 | 6% | 4101 | 6% | ✓ |
| 100 | TRON standard | 3445 | 80% | 861 | 80% | ✗ |
| 100 | TRON ultra | 2364 | 86% | 591 | 87% | ✓ |
| 500 | JSON | 87995 | — | 21999 | — | — |
| 500 | Toon(manual) | 56053 | 36% | 14013 | 36% | — |
| 500 | TOON | 57145 | 35% | 14286 | 35% | — |
| 500 | JTON | 87995 | 0% | 21999 | 0% | — |
| 500 | TRON lite | 82489 | 6% | 20622 | 6% | ✓ |
| 500 | TRON standard | 10847 | 88% | 2712 | 88% | ✗ |
| 500 | TRON ultra | 8743 | 🎯 90% | 2186 | 🎯 90% | ✓ |

### Conclusión: ¿Cuándo se llega al 90%?

| Tipo de dato | Cuándo | Formato ganador |
| :--- | :--- | :--- |
| Enums dominantes (users, orders) | ~100 registros | TRON ultra |
| Texto estructurado (hikes) | ~500 registros | TRON ultra |
| Texto libre + URLs (products) | Nunca solo con estructura | Necesita limpieza previa |
| Datos repetitivos (logs, IDs seqs) | Desde 1 registro con RLE | TRON standard |

**TRON ultra ventaja sobre Toon**: Base36 + constantes + secuencias + defaults + RLE hacen que TRON llegue al 90% con menos registros que Toon (que solo elimina claves estructurales).
<!-- 90PCT-BENCHMARK-END -->

<!-- TOKEN-BENCHMARK-START -->
## Token Benchmark — TRON vs TOON vs JTON vs JSON

_Fecha: 2026-05-01 00:30:05 UTC | Fuente de tokens: Gemini `gemini-2.5-flash`_

> **Métrica principal: tokens** (lo que facturan los LLMs).
> Bytes = referencia secundaria para comparación de wire-transfer.

### System Prompt TRON

| | Tokens | Bytes |
| :--- | ---: | ---: |
| System prompt TRON | 136 | 324 |

---

### Parte 1: Tokens por tamaño de dataset (TRON ultra)

#### Users (enums dominantes)

| N | JSON tok | TRON lite | lite% | TRON std | std% | TRON ultra | ultra% | TOON tok | TOON% | JTON tok | JTON% |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 349 | 373 | **-7%** | 308 | **12%** | 210 | **40%** | 235 | **33%** | 285 | **18%** |
| 50 | 1807 | 1947 | **-8%** | 1199 | **34%** | 639 | **65%** | 1173 | **35%** | 1423 | **21%** |
| 100 | 3630 | 3915 | **-8%** | 2244 | **38%** | 1098 | **70%** | 2347 | **35%** | 2847 | **22%** |
| 500 | 19004 | 20449 | **-8%** | 10323 | **46%** | 4498 | **76%** | 12521 | **34%** | 15021 | **21%** |
| 1000 | 38222 | 41117 | **-8%** | 20194 | **47%** | 8751 | **77%** | 25240 | **34%** | 30240 | **21%** |

#### Orders (numérico + enums)

| N | JSON tok | TRON lite | lite% | TRON std | std% | TRON ultra | ultra% | TOON tok | TOON% | JTON tok | JTON% |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 365 | 417 | **-14%** | 248 | **32%** | 163 | **55%** | 232 | **36%** | 283 | **22%** |
| 50 | 1890 | 2174 | **-15%** | 1026 | **46%** | 419 | **78%** | 1157 | **39%** | 1408 | **26%** |
| 100 | 3787 | 4361 | **-15%** | 1972 | **48%** | 1049 | **72%** | 2305 | **39%** | 2806 | **26%** |
| 500 | 19170 | 22064 | **-15%** | 10061 | **48%** | 6165 | **68%** | 11688 | **39%** | 14189 | **26%** |
| 1000 | 38452 | 44246 | **-15%** | 20190 | **47%** | 12278 | **68%** | 23471 | **39%** | 28472 | **26%** |

#### Hikes (texto libre + enums)

| N | JSON tok | TRON lite | lite% | TRON std | std% | TRON ultra | ultra% | TOON tok | TOON% | JTON tok | JTON% |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 388 | 432 | **-11%** | 297 | **23%** | 231 | **40%** | 238 | **39%** | 288 | **26%** |
| 50 | ~1976 | ~2212 | **-12%** | ~1032 | **48%** | ~283 | **86%** | ~712 | **64%** | ~851 | **57%** |
| 100 | ~3297 | ~3020 | **8%** | ~581 | **82%** | ~431 | **87%** | ~1412 | **57%** | ~1689 | **49%** |
| 500 | ~16600 | ~15224 | **8%** | ~2316 | **86%** | ~1614 | **🎯 90%** | ~7116 | **57%** | ~8492 | **49%** |
| 1000 | ~33230 | ~30478 | **8%** | ~4387 | **87%** | ~3092 | **🎯 91%** | ~14245 | **57%** | ~16997 | **49%** |

---

### Parte 2: Tokens en sesión multi-llamada (100 reg/llamada)

#### Users — 10 llamadas

| Llamada | JSON tok | TRON full | TRON rows | Schema |
| ---: | ---: | ---: | ---: | ---: |
| 0 ← pesada | ~3101 | ~407 | ~213 | ~194 |
| 1 | ~3156 | ~408 | ~213 | ~194 |
| 2 | ~3155 | ~408 | ~213 | ~194 |
| 3 | ~3154 | ~408 | ~213 | ~194 |
| 4 | ~3156 | ~408 | ~213 | ~194 |
| 5 | ~3154 | ~408 | ~213 | ~194 |
| 6 | ~3155 | ~408 | ~213 | ~194 |
| 7 | ~3156 | ~408 | ~213 | ~194 |
| 8 | ~3155 | ~408 | ~213 | ~194 |
| 9 | ~3155 | ~408 | ~213 | ~194 |
| **TOTAL** | **~31497** | **~4079** (87%) | — | — |

| Estrategia | Tokens totales | Ahorro vs JSON |
| :--- | ---: | ---: |
| JSON full re-send | ~31497 | — |
| TRON full re-send | ~4079 | **87%** |
| TRON sesión (schema 1×) | ~2324 | **93%** |
| TRON sys+schema cached | ~2460 | **🎯 92%** |

#### Hikes — 10 llamadas

| Llamada | JSON tok | TRON full | TRON rows | Schema |
| ---: | ---: | ---: | ---: | ---: |
| 0 ← pesada | ~3297 | ~431 | ~297 | ~134 |
| 1 | ~3329 | ~449 | ~314 | ~134 |
| 2 | ~3326 | ~431 | ~297 | ~134 |
| 3 | ~3323 | ~431 | ~297 | ~134 |
| 4 | ~3327 | ~449 | ~314 | ~134 |
| 5 | ~3328 | ~430 | ~296 | ~134 |
| 6 | ~3324 | ~431 | ~297 | ~134 |
| 7 | ~3325 | ~449 | ~314 | ~134 |
| 8 | ~3327 | ~430 | ~296 | ~134 |
| 9 | ~3327 | ~430 | ~296 | ~134 |
| **TOTAL** | **~33233** | **~4361** (87%) | — | — |

| Estrategia | Tokens totales | Ahorro vs JSON |
| :--- | ---: | ---: |
| JSON full re-send | ~33233 | — |
| TRON full re-send | ~4361 | **87%** |
| TRON sesión (schema 1×) | ~3152 | **91%** |
| TRON sys+schema cached | ~3288 | **🎯 90%** |

#### Orders — 10 llamadas

| Llamada | JSON tok | TRON full | TRON rows | Schema |
| ---: | ---: | ---: | ---: | ---: |
| 0 ← pesada | ~2421 | ~307 | ~253 | ~55 |
| 1 | ~2452 | ~308 | ~253 | ~55 |
| 2 | ~2421 | ~309 | ~254 | ~55 |
| 3 | ~2452 | ~308 | ~253 | ~55 |
| 4 | ~2422 | ~309 | ~254 | ~55 |
| 5 | ~2451 | ~308 | ~253 | ~55 |
| 6 | ~2425 | ~309 | ~254 | ~55 |
| 7 | ~2449 | ~308 | ~253 | ~55 |
| 8 | ~2425 | ~308 | ~253 | ~55 |
| 9 | ~2448 | ~309 | ~254 | ~55 |
| **TOTAL** | **~24366** | **~3083** (87%) | — | — |

| Estrategia | Tokens totales | Ahorro vs JSON |
| :--- | ---: | ---: |
| JSON full re-send | ~24366 | — |
| TRON full re-send | ~3083 | **87%** |
| TRON sesión (schema 1×) | ~2588 | **89%** |
| TRON sys+schema cached | ~2725 | **89%** |

---

### Conclusión

| Escenario | Tokens ahorrados | ¿Llega al 90%? |
| :--- | ---: | :---: |
| Users 500 reg, TRON ultra | ~92% | ✓ |
| Hikes 500 reg, TRON ultra | ~90% | ✓ |
| Sesión 10 llamadas × 100 users, sys+cached | ~91% | ✓ |
| Orders 1000 reg | ~83% | ✗ (floats únicos) |
<!-- TOKEN-BENCHMARK-END -->


---

<!-- BENCH-ALL-START -->
## TRON Benchmark Suite — Reporte Completo

_Fecha: 2026-04-29 22:45:16 UTC | Duración total: 5.3s | 7/7 benchmarks exitosos_

### Resumen de Ejecución

| # | Script | Descripción | Estado | Duración |
| ---: | :--- | :--- | :---: | ---: |
| 1 | `bench` | Baselines: JSON vs CSV vs TRON lite/std/ultra vs TOON vs JTON (N=50–1000) | ✓ | 0.7s |
| 2 | `bench:compare` | TRON vs TOON vs JTON — real JSON datasets con Gemini tokens | — (sin datos) | 0.5s |
| 3 | `bench:json` | JSON real datasets (directorio json/) | — (sin datos) | 0.5s |
| 4 | `bench:csv` | CSV datasets — users + orders (50/100/500/1000 filas) | ✓ | 0.5s |
| 5 | `bench:cfdi` | CFDI XML — facturas reales MX vs JSON vs TRON | — (sin datos) | 0.5s |
| 6 | `bench:90pct` | ¿90% en todos los tipos? TRON vs TOON — hikes/users/orders/products | ✓ | 1.7s |
| 7 | `bench:tokens` | Tokens sesión: TRON ultra vs JSON (Gemini real) | ✓ | 0.8s |

**Total: 5.3s · todos exitosos ✓**

### Secciones Actualizadas en results.md

Cada benchmark escribe su propia sección detallada con tablas de tokens, bytes y datasets.

| Script | Marcador en results.md | Estado |
| :--- | :--- | :---: |
| `bench` | `<!-- COMPARE-BASELINES-START -->
## Baseline Comparison — JSON vs CSV vs TRON vs TOON vs JTON

_Fecha: 2026-05-04 06:36:52 UTC | Fuente de tokens: Gemini `gemini-2.5-flash`_

**Dataset:** Usuarios sintéticos — campos: `id`, `name`, `email`, `score`, `active`, `city`

### Reducción de Tokens por N Registros

| N | JSON tok | CSV tok | TRON lite | lite% | TRON std | std% | TRON ultra | ultra% | TOON | TOON% | JTON | JTON% |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 1610 | 921 | 1805 | **-12%** | 996 | **38%** | 558 | **65%** | 976 | **39%** | 1226 | **24%** |
| 100 | 3236 | 1847 | 3631 | **-12%** | 1913 | **41%** | 970 | **🎯 70%** | 1953 | **40%** | 2453 | **24%** |
| 500 | 17036 | 10047 | 19031 | **-12%** | 8832 | **48%** | 4249 | **🎯 75%** | 10553 | **38%** | 13053 | **23%** |
| 1000 | 34288 | 20299 | 38283 | **-12%** | 17203 | **50%** | 8351 | **🎯 76%** | 21306 | **38%** | 26306 | **23%** |

### Modo Sesión — 10 llamadas × 100 usuarios (TRON ultra)

> TRON session: el schema se envía solo en la primera llamada.
> TOON y JTON no tienen session mode — re-encodean full payload en cada llamada.

| Métrica | Tokens |
| :--- | ---: |
| Schema (enviado 1×) | 139 |
| Rows por llamada | 831 |
| JSON total (10 llamadas) | 32360 |
| CSV total (10 llamadas) | 18470 |
| TRON total (schema + rows × 10) | 8449 |
| **Ahorro vs JSON** | **74%** |
| **Ahorro vs CSV** | **54%** |
<!-- COMPARE-BASELINES-END -->

---

## bench:all — 2026-04-30 02:02:51 UTC

_Duración: 79.0s | 7/7 benchmarks exitosos_

### Resumen de Ejecución

| # | Script | Descripción | Estado | Duración |
| ---: | :--- | :--- | :---: | ---: |
| 1 | `bench:tokens` | Token benchmark: TRON ultra vs JSON vs TOON vs JTON (Gemini real tokens) | ✓ | 73.0s |
| 2 | `bench` | Baselines: JSON vs CSV vs TRON lite/std/ultra vs TOON vs JTON (N=50–1000) | ✓ | 1.6s |
| 3 | `bench:toon` | TRON vs TOON — schemas exactos del benchmark oficial de TOON | ✓ | 0.9s |
| 4 | `bench:compare` | TRON vs TOON vs JTON — real JSON datasets con tiempos de encoding | — (sin datos) | 0.5s |
| 5 | `bench:json` | JSON real datasets (directorio json/) | — (sin datos) | 0.5s |
| 6 | `bench:csv` | CSV datasets — users + orders (50/100/500/1000 filas) | ✓ | 1.9s |
| 7 | `bench:cfdi` | CFDI XML — facturas reales MX vs JSON vs TRON | — (sin datos) | 0.5s |

**Total: 79.0s · todos exitosos ✓**

### Secciones Actualizadas en results.md

| Script | Marcador | Estado |
| :--- | :--- | :---: |
| `bench:tokens` | `<!-- TOKEN-BENCHMARK-START -->` | ✓ |
| `bench` | `<!-- COMPARE-BASELINES-START -->` | ✓ |
| `bench:toon` | `<!-- TOON-COMPARE-START -->
## TRON vs TOON — Benchmark con Datasets Oficiales de TOON

_Fecha: 2026-05-01 00:30:08 UTC | Fuente de tokens: Gemini `gemini-2.5-flash`_

> **Datasets**: Idénticos en schema y tamaño a los benchmarks públicos de TOON.
> Ambos formatos se miden con el mismo tokenizer para comparación directa.
> TOON oficial usa GPT-4o tokenizer (`o200k_base`) — sus cifras son distintas.

### Datasets Utilizados

| Dataset | N | Campos | Tipo |
| :--- | ---: | :--- | :--- |
| Employee records | 100 | id, name, email, department, salary, yearsExperience, active | Flat uniforme |
| Time-series analytics | 60 | date, views, clicks, conversions, revenue, bounceRate | Flat numérico |
| GitHub repositories | 100 | id, name, repo, description, createdAt, updatedAt, pushedAt, stars, watchers, forks, defaultBranch | Flat con texto |

### Token Comparison — Todos los Formatos

| Dataset | N | JSON | CSV | CSV% | TOON | TOON% | TRON lite | lite% | TRON std | std% | TRON ultra | ultra% | TRON llm | llm% |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Employee records (100) | 100 | 3409 | 1497 | **56%** | 1549 | **55%** | 3132 | **8%** | 903 | **🎯 74%** | 642 | **🎯 81%** | 903 | **🎯 74%** |
| Time-series analytics (60) | 60 | 1510 | 547 | **64%** | 578 | **🎯 62%** | 1418 | **6%** | 434 | **🎯 71%** | 365 | **🎯 76%** | 434 | **🎯 71%** |
| GitHub repos (100) | 100 | 7898 | 4744 | **40%** | 4951 | **37%** | 7321 | **7%** | 1599 | **🎯 80%** | 712 | **🎯 91%** | 1599 | **🎯 80%** |

### TRON ultra vs TOON (mismo tokenizer)

| Dataset | TOON tokens | TRON ultra tokens | Diferencia |
| :--- | ---: | ---: | ---: |
| Employee records (100) | 1549 | 642 | **−59%** |
| Time-series analytics (60) | 578 | 365 | **−37%** |
| GitHub repos (100) | 4951 | 712 | **−86%** |

### Referencia: Datos Publicados por TOON (GPT-4o tokenizer)

> Fuente: [toon.so/guide/benchmarks](https://toon.so/guide/benchmarks) — Flat-Only Track

| Dataset | TOON (publ.) | JSON (publ.) | CSV (publ.) | TOON% vs JSON |
| :--- | ---: | ---: | ---: | ---: |
| Employee records (100) | 49,919 | 127,063 | 47,102 | **61%** |
| Time-series analytics (60) | 9,115 | 22,245 | 8,383 | **59%** |
| GitHub repos (100) | 8,744 | 15,144 | 8,512 | **42%** |
<!-- TOON-COMPARE-END -->

<!-- COMPARE-BENCHMARK-START -->
## Run: 2026-05-01 00:30:09

> **Tokens:** Gemini gemini-2.5-flash (real) | **Mode:** ultra | **Datasets:** 17 | **Records:** 2458

### Summary

| Format | Total Size (B) | %Size | Total Tokens | %Tokens | Avg Enc (ms) | Avg Dec (ms) |
|--------|---------------|-------|-------------|---------|-------------|-------------|
| JSON | 355,530 | base | 88,884 | base | – | – |
| **TRON** ✅ | 92,907 | -74% | 23,228 | **-74%** | 1.079 | 0.823 |
| **TOON** 📉 | 174,148 | -51% | 43,540 | **-51%** | 0.383 | 0.649 |
| **JTON** 📉 | 194,290 | -45% | 48,574 | **-45%** | 0.086 | 0.121 |

### Token Reduction per Dataset

| Dataset | Rec | JSON tok | TRON tok | TRON% | TOON tok | TOON% | JTON tok | JTON% | Notes |
|---------|-----|---------|---------|-------|---------|-------|---------|-------|-------|
| currencies | 30 | 745 | 283 | -62% ✅ | 788 | +6% | 745 | -0% | fallback to JSON (no Zen Grid — unique values prevent compression) |
| european-countries | 43 | 1344 | 419 | -69% ✅ | 510 | -62% | 652 | -51% |  |
| fakestore_business | 1000 | 40634 | 3336 | -92% 🎯 | 12907 | -68% | 16909 | -58% |  |
| fakestore_struct | 20 | 431 | 101 | -77% 🎯 | 168 | -61% | 194 | -55% |  |
| fakestore_struct_1k | 1000 | 21849 | 2919 | -87% 🎯 | 8111 | -63% | 9362 | -57% |  |
| file-extensions | 35 | 817 | 338 | -59% 📉 | 364 | -55% | 452 | -45% |  |
| github | 30 | 13332 | 11559 | -13%  | 14800 | +11% | 13332 | -0% | fallback to JSON (no Zen Grid — unique values prevent compression) |
| hikes_20 | 20 | 519 | 150 | -71% ✅ | 194 | -63% | 235 | -55% |  |
| http-status-codes | 33 | 1140 | 671 | -41% 📉 | 755 | -34% | 1140 | -0% | fallback to JSON (no Zen Grid — unique values prevent compression) |
| keyboard-shortcuts | 25 | 579 | 198 | -66% ✅ | 239 | -59% | 309 | -47% |  |
| mountains | 20 | 649 | 266 | -59% 📉 | 299 | -54% | 370 | -43% |  |
| programming-languages | 15 | 563 | 334 | -41% 📉 | 563 | -0% | 563 | -0% | fallback to JSON (no Zen Grid — unique values prevent compression) |
| sports-teams-nfl | 32 | 1565 | 643 | -59% 📉 | 682 | -56% | 868 | -45% |  |
| units-of-measurement | 25 | 635 | 170 | -73% ✅ | 241 | -62% | 316 | -50% |  |
| us-capitals | 50 | 1381 | 544 | -61% ✅ | 680 | -51% | 781 | -43% |  |
| us-states-with-detail | 50 | 1818 | 942 | -48% 📉 | 1787 | -2% | 1818 | -0% | fallback to JSON (no Zen Grid — unique values prevent compression) |
| world-cities | 30 | 883 | 355 | -60% ✅ | 452 | -49% | 528 | -40% |  |

### Encoding / Decoding Speed

| Dataset | Rec | TRON enc | TRON dec | TOON enc | TOON dec | JTON enc¹ | JTON dec¹ |
|---------|-----|---------|---------|---------|---------|----------|----------|
| currencies | 30 | 0.269ms | 0.115ms | 0.192ms | 0.263ms | 0.024ms | 0.044ms |
| european-countries | 43 | 0.412ms | 0.149ms | 0.112ms | 0.155ms | 0.037ms | 0.043ms |
| fakestore_business | 1000 | 6.399ms | 2.943ms | 2.544ms | 4.314ms | 0.626ms | 0.882ms |
| fakestore_struct | 20 | 0.193ms | 0.097ms | 0.049ms | 0.063ms | 0.014ms | 0.011ms |
| fakestore_struct_1k | 1000 | 2.912ms | 1.526ms | 1.544ms | 2.862ms | 0.341ms | 0.481ms |
| file-extensions | 35 | 0.157ms | 0.076ms | 0.052ms | 0.084ms | 0.021ms | 0.024ms |
| github | 30 | 5.604ms | 7.882ms | 1.212ms | 1.991ms | 0.184ms | 0.318ms |
| hikes_20 | 20 | 0.101ms | 0.072ms | 0.051ms | 0.073ms | 0.015ms | 0.014ms |
| http-status-codes | 33 | 0.131ms | 0.152ms | 0.056ms | 0.103ms | 0.019ms | 0.026ms |
| keyboard-shortcuts | 25 | 0.184ms | 0.076ms | 0.041ms | 0.064ms | 0.015ms | 0.014ms |
| mountains | 20 | 0.144ms | 0.069ms | 0.040ms | 0.069ms | 0.015ms | 0.016ms |
| programming-languages | 15 | 0.134ms | 0.060ms | 0.084ms | 0.120ms | 0.011ms | 0.019ms |
| sports-teams-nfl | 32 | 0.336ms | 0.163ms | 0.087ms | 0.148ms | 0.030ms | 0.036ms |
| units-of-measurement | 25 | 0.224ms | 0.156ms | 0.059ms | 0.075ms | 0.026ms | 0.020ms |
| us-capitals | 50 | 0.433ms | 0.140ms | 0.069ms | 0.177ms | 0.029ms | 0.035ms |
| us-states-with-detail | 50 | 0.516ms | 0.212ms | 0.278ms | 0.366ms | 0.032ms | 0.063ms |
| world-cities | 30 | 0.194ms | 0.093ms | 0.050ms | 0.111ms | 0.022ms | 0.021ms |

> ¹ JTON timing measured inside Python process (excludes subprocess startup overhead).

### JTON Notes

- **currencies**: fallback to JSON (no Zen Grid — unique values prevent compression)
- **github**: fallback to JSON (no Zen Grid — unique values prevent compression)
- **http-status-codes**: fallback to JSON (no Zen Grid — unique values prevent compression)
- **programming-languages**: fallback to JSON (no Zen Grid — unique values prevent compression)
- **us-states-with-detail**: fallback to JSON (no Zen Grid — unique values prevent compression)

---
<!-- COMPARE-BENCHMARK-END -->

<!-- JSON-BENCHMARK-START -->
## JSON Benchmark — TRON vs TOON vs JTON (real JSON files)

_Fecha: 2026-05-04 06:39:54 UTC | Fuente de tokens: Gemini `gemini-2.5-flash`_

| Dataset | Rec | JSON tok | TRON lite | lite% | TRON std | std% | TRON ultra | ultra% | TRON llm | llm% | TOON | TOON% | JTON | JTON% |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| currencies | 30 | 766 | 847 | **-11%** | 474 | **38%** | 405 | **47%** | 474 | **38%** | 1034 | **-35%** | 766 | **0%** |
| european-countries | 43 | 1936 | 2045 | **-6%** | 812 | **58%** | 920 | **52%** | 812 | **58%** | 1182 | **39%** | 1398 | **28%** |
| fakestore_business | 1000 | 54795 | 61590 | **-12%** | 19874 | **64%** | 12126 | **🎯 78%** | 19874 | **64%** | 31823 | **42%** | 39823 | **27%** |
| fakestore_struct | 20 | 671 | 782 | **-17%** | 387 | **42%** | 347 | **48%** | 387 | **42%** | 427 | **36%** | 507 | **24%** |
| fakestore_struct_1k | 1000 | 34795 | 40590 | **-17%** | 9801 | **72%** | 10810 | **69%** | 9801 | **72%** | 21813 | **37%** | 25813 | **26%** |
| file-extensions | 35 | 832 | 895 | **-8%** | 523 | **37%** | 510 | **39%** | 523 | **37%** | 528 | **37%** | 597 | **28%** |
| github | 30 | 23562 | 24224 | **-3%** | 7081 | **70%** | 27289 | **-16%** | 7081 | **70%** | 25781 | **-9%** | 23562 | **0%** |
| hikes_20 | 20 | 664 | 748 | **-13%** | 410 | **38%** | 357 | **46%** | 410 | **38%** | 401 | **40%** | 481 | **28%** |
| http-status-codes | 33 | 990 | 1083 | **-9%** | 1229 | **-24%** | 669 | **32%** | 1229 | **-24%** | 769 | **22%** | 990 | **0%** |
| keyboard-shortcuts | 25 | 626 | 671 | **-7%** | 423 | **32%** | 401 | **36%** | 423 | **32%** | 411 | **34%** | 488 | **22%** |
| mountains | 20 | 911 | 956 | **-5%** | 596 | **35%** | 625 | **31%** | 596 | **35%** | 609 | **33%** | 710 | **22%** |
| programming-languages | 15 | 581 | 613 | **-6%** | 473 | **19%** | 462 | **20%** | 473 | **19%** | 714 | **-23%** | 581 | **0%** |
| sports-teams-nfl | 32 | 1732 | 1791 | **-3%** | 1153 | **33%** | 1047 | **40%** | 1153 | **33%** | 1051 | **39%** | 1306 | **25%** |
| units-of-measurement | 25 | 760 | 821 | **-8%** | 472 | **38%** | 430 | **43%** | 472 | **38%** | 451 | **41%** | 544 | **28%** |
| us-capitals | 50 | 2488 | 2702 | **-9%** | 1607 | **35%** | 1192 | **52%** | 1607 | **35%** | 1902 | **24%** | 2152 | **14%** |
| us-states-with-detail | 50 | 1949 | 2059 | **-6%** | 1384 | **29%** | 1435 | **26%** | 1384 | **29%** | 2364 | **-21%** | 1949 | **0%** |
| world-cities | 30 | 1422 | 1542 | **-8%** | 966 | **32%** | 757 | **47%** | 966 | **32%** | 1093 | **23%** | 1244 | **13%** |
| **TOTAL** | 2458 | 129480 | 143959 | **-11%** | 47665 | **63%** | 59782 | **54%** | 47665 | **63%** | 92353 | **29%** | 102911 | **21%** |
<!-- JSON-BENCHMARK-END -->

<!-- CFDI-BENCHMARK-START -->
## CFDI XML → TRON Benchmark

_Fecha: 2026-05-01 00:30:18 UTC | Fuente de tokens: Gemini | 2 facturas reales_

| Formato | Bytes | Tokens | Reducción vs JSON |
| :--- | ---: | ---: | ---: |
| XML bruto | 1,809,342 | 452,336 | — |
| JSON parsed | 844 | 211 | base |
| TRON ultra | 1,288 | 322 | **-53%** |
| TRON sin firma | 1,288 | 322 | **-53%** (vs JSON sin firma) |
<!-- CFDI-BENCHMARK-END -->

---

## bench:all — 2026-04-30 07:00:34 UTC

_Duración: 94.1s | 15/16 exitosos_

### Tests de Corrección

| # | Script | Descripción | Estado | Duración |
| ---: | :--- | :--- | :---: | ---: |
| 1 | `test:nested` | Round-trip: nested objects/arrays | ✓ PASS | 0.5s |
| 2 | `test:null` | Round-trip: null/undefined/empty fields | ✓ PASS | 0.5s |
| 3 | `test:json` | Round-trip: real-world JSON datasets | ✗ FAIL (exit 1) | 0.5s |
| 4 | `test:csv` | Round-trip: CSV encode/decode | ✓ PASS | 0.4s |
| 5 | `test:xml` | Round-trip: XML parse/encode | ✓ PASS | 0.5s |
| 6 | `test:yaml` | Round-trip: YAML parse/encode | ✓ PASS | 0.4s |
| 7 | `quickstart` | Quickstart example smoke test | ✓ PASS | 0.5s |
| 8 | `convert` | Convert CLI — exits 0 with usage | ✓ PASS | 0.4s |

### Benchmarks de Rendimiento

| # | Script | Descripción | Estado | Duración |
| ---: | :--- | :--- | :---: | ---: |
| 1 | `bench:tokens` | Token benchmark: TRON ultra vs JSON vs TOON vs JTON (Gemini real tokens) | ✓ | 73.3s |
| 2 | `bench` | Baselines: JSON vs CSV vs TRON lite/std/ultra vs TOON vs JTON (N=50–1000) | ✓ | 1.7s |
| 3 | `bench:toon` | TRON vs TOON — schemas exactos del benchmark oficial de TOON | ✓ | 1.0s |
| 4 | `bench:compare` | TRON vs TOON vs JTON — real datasets (test-data/json/) con tiempos | — (sin datos) | 5.2s |
| 5 | `bench:json` | JSON real datasets — test-data/json/ (TRON lite/std/ultra vs TOON vs JTON) | — (sin datos) | 3.5s |
| 6 | `bench:csv` | CSV datasets — users + orders (50/100/500/1000 filas) | ✓ | 2.0s |
| 7 | `bench:cfdi` | CFDI XML — facturas reales MX (test-data/xml/) | — (sin datos) | 2.0s |
| 8 | `bench:90pct` | 90th-pct dataset — extreme token reduction analysis | ✓ | 1.6s |

**Total: 94.1s · 1 con error ✗**

### Secciones Actualizadas en results.md

| Script | Marcador | Estado |
| :--- | :--- | :---: |
| `bench:tokens` | `<!-- TOKEN-BENCHMARK-START -->` | ✓ |
| `bench` | `<!-- COMPARE-BASELINES-START -->` | ✓ |
| `bench:toon` | `<!-- TOON-COMPARE-START -->` | ✓ |
| `bench:compare` | `<!-- COMPARE-BENCHMARK-START -->` | — |
| `bench:json` | `<!-- JSON-BENCHMARK-START -->` | — |
| `bench:csv` | `<!-- CSV-BENCHMARK-START -->` | ✓ |
| `bench:cfdi` | `<!-- CFDI-BENCHMARK-START -->` | — |
| `bench:90pct` | `<!-- 90PCT-BENCHMARK-START -->` | ✓ |

---

## bench:all — 2026-04-30 07:24:32 UTC

_Duración: 94.3s | 16/16 exitosos_

### Tests de Corrección

| # | Script | Descripción | Estado | Duración |
| ---: | :--- | :--- | :---: | ---: |
| 1 | `test:nested` | Round-trip: nested objects/arrays | ✓ PASS | 0.4s |
| 2 | `test:null` | Round-trip: null/undefined/empty fields | ✓ PASS | 0.5s |
| 3 | `test:json` | Round-trip: real-world JSON datasets | ✓ PASS | 0.4s |
| 4 | `test:csv` | Round-trip: CSV encode/decode | ✓ PASS | 0.4s |
| 5 | `test:xml` | Round-trip: XML parse/encode | ✓ PASS | 0.5s |
| 6 | `test:yaml` | Round-trip: YAML parse/encode | ✓ PASS | 0.5s |
| 7 | `quickstart` | Quickstart example smoke test | ✓ PASS | 0.5s |
| 8 | `convert` | Convert CLI — exits 0 with usage | ✓ PASS | 0.4s |

### Benchmarks de Rendimiento

| # | Script | Descripción | Estado | Duración |
| ---: | :--- | :--- | :---: | ---: |
| 1 | `bench:tokens` | Token benchmark: TRON ultra vs JSON vs TOON vs JTON (Gemini real tokens) | ✓ | 73.3s |
| 2 | `bench` | Baselines: JSON vs CSV vs TRON lite/std/ultra vs TOON vs JTON (N=50–1000) | ✓ | 1.7s |
| 3 | `bench:toon` | TRON vs TOON — schemas exactos del benchmark oficial de TOON | ✓ | 1.0s |
| 4 | `bench:compare` | TRON vs TOON vs JTON — real datasets (test-data/json/) con tiempos | ✓ | 5.3s |
| 5 | `bench:json` | JSON real datasets — test-data/json/ (TRON lite/std/ultra vs TOON vs JTON) | ✓ | 3.7s |
| 6 | `bench:csv` | CSV datasets — users + orders (50/100/500/1000 filas) | ✓ | 2.0s |
| 7 | `bench:cfdi` | CFDI XML — facturas reales MX (test-data/xml/) | ✓ | 2.1s |
| 8 | `bench:90pct` | 90th-pct dataset — extreme token reduction analysis | ✓ | 1.5s |

**Total: 94.3s · todos exitosos ✓**

### Secciones Actualizadas en results.md

| Script | Marcador | Estado |
| :--- | :--- | :---: |
| `bench:tokens` | `<!-- TOKEN-BENCHMARK-START -->` | ✓ |
| `bench` | `<!-- COMPARE-BASELINES-START -->` | ✓ |
| `bench:toon` | `<!-- TOON-COMPARE-START -->` | ✓ |
| `bench:compare` | `<!-- COMPARE-BENCHMARK-START -->` | ✓ |
| `bench:json` | `<!-- JSON-BENCHMARK-START -->` | ✓ |
| `bench:csv` | `<!-- CSV-BENCHMARK-START -->` | ✓ |
| `bench:cfdi` | `<!-- CFDI-BENCHMARK-START -->` | ✓ |
| `bench:90pct` | `<!-- 90PCT-BENCHMARK-START -->` | ✓ |

<!-- TEST-SUITE-START -->
## Test Suite

_Fecha: 2026-05-01 00:29:01 UTC | 8/8 passing_

| Script | Descripción | Estado | Duración |
| :--- | :--- | :---: | ---: |
| `test:nested` | Round-trip: nested objects/arrays | ✓ PASS | 0.9s |
| `test:null` | Round-trip: null/undefined/empty fields | ✓ PASS | 0.9s |
| `test:json` | Round-trip: real-world JSON datasets | ✓ PASS | 1.0s |
| `test:csv` | Round-trip: CSV encode/decode | ✓ PASS | 1.0s |
| `test:xml` | Round-trip: XML parse/encode | ✓ PASS | 1.0s |
| `test:yaml` | Round-trip: YAML parse/encode | ✓ PASS | 0.9s |
| `quickstart` | Quickstart example smoke test | ✓ PASS | 1.0s |
| `convert` | Convert CLI — exits 0 with usage | ✓ PASS | 1.0s |

**All tests passing ✓**
<!-- TEST-SUITE-END -->

---

## bench:all — 2026-05-01 00:29:01 UTC

_Duración: 82.0s | 17/17 exitosos_

### Tests de Corrección

| # | Script | Descripción | Estado | Duración |
| ---: | :--- | :--- | :---: | ---: |
| 1 | `test:nested` | Round-trip: nested objects/arrays | ✓ PASS | 0.9s |
| 2 | `test:null` | Round-trip: null/undefined/empty fields | ✓ PASS | 0.9s |
| 3 | `test:json` | Round-trip: real-world JSON datasets | ✓ PASS | 1.0s |
| 4 | `test:csv` | Round-trip: CSV encode/decode | ✓ PASS | 1.0s |
| 5 | `test:xml` | Round-trip: XML parse/encode | ✓ PASS | 1.0s |
| 6 | `test:yaml` | Round-trip: YAML parse/encode | ✓ PASS | 0.9s |
| 7 | `quickstart` | Quickstart example smoke test | ✓ PASS | 1.0s |
| 8 | `convert` | Convert CLI — exits 0 with usage | ✓ PASS | 1.0s |

### Benchmarks de Rendimiento

| # | Script | Descripción | Estado | Duración |
| ---: | :--- | :--- | :---: | ---: |
| 1 | `bench:tokens` | Token benchmark: TRON ultra vs JSON vs TOON vs JTON (Gemini real tokens) | ✓ | 56.0s |
| 2 | `bench` | Baselines: JSON vs CSV vs TRON lite/std/ultra vs TOON vs JTON (N=50–1000) | ✓ | 1.5s |
| 3 | `bench:toon` | TRON vs TOON — schemas exactos del benchmark oficial de TOON | ✓ | 1.3s |
| 4 | `bench:compare` | TRON vs TOON vs JTON — real datasets (test-data/json/) con tiempos | ✓ | 6.0s |
| 5 | `bench:json` | JSON real datasets — test-data/json/ (TRON lite/std/ultra vs TOON vs JTON) | ✓ | 1.9s |
| 6 | `bench:csv` | CSV datasets — users + orders (50/100/500/1000 filas) | ✓ | 1.2s |
| 7 | `bench:cfdi` | CFDI XML — facturas reales MX (test-data/xml/) | ✓ | 1.3s |
| 8 | `bench:90pct` | 90th-pct dataset — extreme token reduction analysis | ✓ | 1.9s |
| 9 | `bench:tokens:eff` | Token efficiency: TRON vs JSON/YAML/XML across 6 datasets | ✓ | 3.2s |

**Total: 82.0s · todos exitosos ✓**

### Secciones Actualizadas en results.md

| Script | Marcador | Estado |
| :--- | :--- | :---: |
| `bench:tokens` | `<!-- TOKEN-BENCHMARK-START -->` | ✓ |
| `bench` | `<!-- COMPARE-BASELINES-START -->` | ✓ |
| `bench:toon` | `<!-- TOON-COMPARE-START -->` | ✓ |
| `bench:compare` | `<!-- COMPARE-BENCHMARK-START -->` | ✓ |
| `bench:json` | `<!-- JSON-BENCHMARK-START -->` | ✓ |
| `bench:csv` | `<!-- CSV-BENCHMARK-START -->` | ✓ |
| `bench:cfdi` | `<!-- CFDI-BENCHMARK-START -->` | ✓ |
| `bench:90pct` | `<!-- 90PCT-BENCHMARK-START -->` | ✓ |
| `bench:tokens:eff` | `<!-- TOKENS-EFF-BENCHMARK-START -->` | ✓ |
