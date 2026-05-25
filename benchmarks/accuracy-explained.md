# Explicación del Benchmark de Precisión (Accuracy Benchmark)

El script `accuracy-benchmark.ts` tiene como objetivo principal **medir la capacidad de comprensión y extracción de datos (retrieval accuracy)** de distintos modelos de Inteligencia Artificial (como GPT-5, Claude, Gemini, etc.) cuando se les presenta información en diversos **formatos de serialización de datos**.

## ¿Qué hace el benchmark?

El flujo de funcionamiento del benchmark es el siguiente:

1. **Selección de Modelos:** Construye una lista de modelos disponibles (según las API keys configuradas en el entorno) y permite al usuario definir cuáles serán evaluados.
2. **Generación de Preguntas:** Extrae una lista de preguntas predeterminadas asociadas a distintos conjuntos de datos (`datasets`). Cada pregunta contiene el texto de la consulta y la "respuesta correcta" (ground truth).
3. **Formateo de Datos:** Para cada pregunta, toma los datos en crudo del dataset pertinente y los convierte al vuelo a múltiples combinaciones de formatos de texto (`json`, `yaml`, `csv`, `xml`, `toon`, `loon`).
4. **Evaluación (El Test):** 
   - Toma los datos ya estructurados en un formato específico.
   - Construye un `prompt` que incluye un breve contexto ("Los siguientes datos están en formato X"), los datos serializados y la pregunta.
   - Pasa este *prompt* al LLM seleccionado.
   - Recibe la respuesta del modelo y la **compara programáticamente con la respuesta correcta**, determinando si el modelo logró interpretar correctamente los datos en ese formato.
5. **Generación de Reportes:** Cuando finalizan todas las tareas, se compilan y tabulan los distintos indicadores (Tasa de precisión, costo de tokens, latencia, etc.) y se guardan los resultados formateados en un documento de Markdown (`results/retrieval-accuracy.md`).

---

## Interacción entre el modo `DRY_RUN` y `FAST_FORMAT`

Debido a que iterar sobre múltiples datasets, preguntas y formatos para varios modelos puede consumir demasiados tokens y mucho tiempo, el benchmark provee variables para reducir la matriz de evaluación de manera inteligente:

### 1. `DRY_RUN` (Reducción por número de Preguntas)
Al activar esta constante, el benchmark no ejecuta todas las preguntas. En vez de ello, su lógica escanea y **limita a exactamente 2 preguntas** por cada conjunto de datos en particular. Esto reduce el impacto horizontal de las pruebas, ofreciendo una muestra minúscula pero representativa (2 pruebas por cada fuente) ideal para cerciorar que la conexión de API funciona, el formato compila y el script fluye sin lanzar excepciones.

### 2. `FAST_FORMAT` (Reducción por Formato)
Al activar `FAST_FORMAT`, en vez someter los datos a *todos* los transformadores y formatos (json, yaml, csv, etc.), el script ignora la gran mayoría e itera exclusivamente sobre un subconjunto restringido, que el sistema clasifica como rápidos o de interés prioritario (según la variable subyacente `FAST_FORMAT_FORMATS`, habitualmente formatos nativos como `loon`, `toon`, y `jton`). Esto acorta de raíz la expansión del ensayo de manera verticalmente.

### Efecto Combinado
**Encender ambas banderas genera la evaluación más ágil posible.**
Al hacer esto, el script generará la matriz más pequeña: elegirá únicamente 2 preguntas por cada fuente de datos y luego traducirá la información y cuestionará al LLM circunscribiéndose solamente a los formatos listados como "rápidos". 

* **Ejecución normal predeterminada:** Decenas de preguntas × Todos los formatos (8+) = Cientos de peticiones a la API por modelo evaluado.
* **Solo DRY_RUN:** 2 Preguntas por fuente × Todos los formatos = Evalúa un volumen manejable con amplia variación de sintaxis.
* **Solo FAST_FORMAT:** Decenas de preguntas × 3 formatos prioritarios = Disminuye significativamente el tiempo enfocándose en lo relevante de la arquitectura.
* **Ambas banderas activas:** 2 preguntas por fuente × 3 formatos rápidos = Una decena de peticiones, ideal para una validación "sanity check" rápida mientras el desarrollador depura la infraestructura del script localmente.
