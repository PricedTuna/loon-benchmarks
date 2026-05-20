import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fsExtra from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const realDataPath = fsExtra.realpathSync(path.join(__dirname, '../results/real-data-token-efficiency.md'));
const roundtripPath = fsExtra.realpathSync(path.join(__dirname, '../results/roundtrip-fidelity.md'));
const multiTokenizerPath = fsExtra.realpathSync(path.join(__dirname, '../results/multi-tokenizer.md'));

// Translation maps
const datasetTranslationMap = {
  'GeoJSON polygon — Canada borders (≈2.2 MB)': 'GeoJSON Canada ($\\approx 2.2$\\,MB)',
  'CITM box-office catalog (≈1.7 MB, deeply nested)': 'Catálogo CITM ($\\approx 1.7$\\,MB)',
  'Twitter API search response (≈630 KB, mixed nesting)': 'API Twitter ($\\approx 630$\\,KB)',
  'Fakestore — 1k structured rows': 'Fakestore (1k estructurado)',
  'Fakestore — business records': 'Fakestore (negocios)',
  'GitHub events sample': 'Eventos GitHub (sample)',
  'World cities reference': 'Ciudades del mundo',
  'US states with detail': 'Estados EE.UU. (detalle)',
  'European countries': 'Países europeos',
  'NFL teams': 'Equipos NFL',
  'World mountains': 'Montañas del mundo',
  'Hikes (20 records)': 'Senderismo (20 recs)',
  'Currencies reference': 'Monedas de referencia',
  'File extensions reference': 'Extensiones de archivo',
  'HTTP status codes': 'Códigos estado HTTP',
  'Keyboard shortcuts': 'Atajos de teclado',
  'Lorem ipsum reference': 'Texto Lorem Ipsum',
  'Programming languages': 'Lenguajes de prog.',
  'Units of measurement': 'Unidades de medida',
  'US state capitals': 'Capitales de EE.UU.',
  'Edge cases (escapes, unicode, deeply nested)': 'Casos borde (escapes/nest)',
};

const formatTranslationMap = {
  'JSON': 'JSON (pretty)',
  'JSON compact': 'JSON compact',
  'YAML': 'YAML',
  'XML': 'XML',
  'CSV': 'CSV',
  'TOON': 'TOON',
  'LOON (llm)': 'LOON (llm)',
  'LOON (full)': 'LOON (full)',
  'LOON (local)': 'LOON (local)',
  'LOON (compact)': 'LOON (compact)',
  'JTON': 'JTON',
};

const roundtripDatasetMap = {
  'tabular': 'Tabular',
  'nested': 'Anidado',
  'analytics': 'Analítica',
  'github': 'GitHub',
  'event-logs': 'Logs Eventos',
  'nested-config': 'Config. Anidada',
  'numeric-precision': 'Prec. Numérica',
  'unicode-and-escapes': 'Unicode/Esc.',
  'sparse-fields': 'Campos Disp.',
  'employees-100': 'Empleados (100)'
};

const synthDatasetTranslationMap = {
  'Uniform employee records': 'Registros de empleados (uniforme)',
  'E-commerce orders with nested structures': 'Órdenes e-commerce (anidado)',
  'Time-series analytics data': 'Analítica temporal (series temp.)',
  'Top 100 GitHub repositories': 'Repositorios GitHub (sintético)',
  'Semi-uniform event logs': 'Logs de eventos (semi-uniforme)',
  'Deeply nested configuration': 'Config. profundamente anidada'
};

const realDatasetTokenizerMap = {
  'canada.json': 'canada.json (Geometría)',
  'citm_catalog.json': 'citm\\_catalog.json (Catálogo)',
  'currencies.json': 'currencies.json (Monedas)',
  'european-countries.json': 'european-countries.json (Países)',
  'fakestore_business.json': 'fakestore\\_business.json',
  'fakestore_struct.json': 'fakestore\\_struct.json',
  'fakestore_struct_1k.json': 'fakestore\\_struct\\_1k.json',
  'file-extensions.json': 'file-extensions.json',
  'github-repos.json': 'github-repos.json (Repositorios)',
  'github.json': 'github.json (API Github)',
  'hikes_20.json': 'hikes\\_20.json',
  'http-status-codes.json': 'http-status-codes.json',
  'keyboard-shortcuts.json': 'keyboard-shortcuts.json',
  'lorem-ipsum.json': 'lorem-ipsum.json',
  'mountains.json': 'mountains.json',
  'programming-languages.json': 'programming-languages.json',
  'sports-teams-nfl.json': 'sports-teams-nfl.json',
  'test-edge-cases.json': 'test-edge-cases.json (Bordes)',
  'twitter.json': 'twitter.json (Tweets)',
  'units-of-measurement.json': 'units-of-measurement.json',
  'us-capitals.json': 'us-capitals.json',
  'us-states-with-detail.json': 'us-states-with-detail.json',
  'world-cities.json': 'world-cities.json'
};

const formatsToExclude = ['JSON', 'YAML', 'XML', 'CSV', 'LOON (local)'];

const datasetsToExclude = [
  'canada.json',
  'github.json',
  'lorem-ipsum.json',
  'test-edge-cases.json',
  'Deeply nested configuration',
  'GeoJSON polygon — Canada borders (≈2.2 MB)',
  'GitHub events sample',
  'Lorem ipsum reference',
  'Edge cases (escapes, unicode, deeply nested)'
];

// Function to clean cell content for LaTeX math and formatting
function cleanCell(cell) {
  cell = cell.trim();
  if (cell === 'n/a') return 'n/a';
  if (cell === '—') return '---';
  
  // Format checkmark
  if (cell === '✅') return '\\textcolor{accent}{\\checkmark}';
  if (cell.includes('lossy')) return '\\textcolor{orange!85!black}{Lossy}';
  if (cell.includes('decode')) return '\\textcolor{red}{Err(dec)}';
  if (cell.includes('encode')) return '\\textcolor{red}{Err(enc)}';
  
  let formatted = cell;
  
  // Parse number and parenthesized label
  // Example: 1,299,741 (+42.9%) -> 1,299,741 {\scriptsize ($+$42.9\%)}
  // Example: 909,327 (baseline) -> 909,327 {\scriptsize (base)}
  const match = formatted.match(/^([0-9,.]+)\s*\((.+)\)$/);
  if (match) {
    const num = match[1];
    let label = match[2];
    
    if (label === 'baseline') {
      label = 'base';
    } else {
      label = label.replace(/%/g, '\\%');
      label = label.replace(/[−-]/g, '$-$');
      label = label.replace(/\+/g, '$+$');
    }
    
    return `${num} {\\scriptsize (${label})}`;
  }
  
  return formatted;
}

function getTokenizerDelta(cell) {
  cell = cell.trim();
  if (cell === 'n/a' || cell === '—') return 'n/a';
  const match = cell.match(/\(([^)]+)\)/);
  if (match) {
    let pct = match[1].trim();
    pct = pct.replace(/%/g, '\\%');
    pct = pct.replace(/[−-]/g, '$-$');
    pct = pct.replace(/\+/g, '$+$');
    return pct;
  }
  return cell;
}

// 1. PARSE REAL-DATA TOKEN EFFICIENCY (FILTERED COLUMNS)
function parseRealData() {
  const content = fsExtra.readFileSync(realDataPath, 'utf8');
  const lines = content.split(/\r?\n/);
  
  let tableHeaderParsed = false;
  let headers = [];
  const sections = [];
  let currentSection = null;
  
  const categoryMap = {
    'Large real-world JSON': { title: 'Grandes conjuntos de datos reales (JSON complejos)', label: 'tab:tokens-real-large' },
    'Tabular real-world JSON': { title: 'Conjuntos de datos tabulares reales de producción', label: 'tab:tokens-real-tabular' },
    'Small reference datasets': { title: 'Conjuntos de datos pequeños de referencia estándar', label: 'tab:tokens-real-small' },
    'Adversarial / edge cases': { title: 'Casos de prueba de borde y adversarios', label: 'tab:tokens-real-edge' }
  };
  
  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      const rawTitle = headingMatch[1].trim();
      if (rawTitle === 'Adversarial / edge cases') {
        currentSection = null;
        continue;
      }
      if (categoryMap[rawTitle]) {
        currentSection = {
          title: categoryMap[rawTitle].title,
          label: categoryMap[rawTitle].label,
          rows: []
        };
        sections.push(currentSection);
      }
      continue;
    }
    
    if (line.startsWith('|')) {
      const parts = line.split('|').map(p => p.trim()).filter((p, i) => i > 0 && i < line.split('|').length - 1);
      if (parts.length === 0 || parts[0].includes('---')) continue;
      
      if (parts[0] === 'File') {
        if (!tableHeaderParsed) {
          headers = parts;
          tableHeaderParsed = true;
        }
        continue;
      }
      
      if (tableHeaderParsed && currentSection) {
        // Data row
        const datasetRaw = parts[0];
        if (datasetsToExclude.includes(datasetRaw)) continue;
        const translatedName = datasetTranslationMap[datasetRaw] || datasetRaw.replace(/_/g, '\\_');
        const bytes = parts[1];
        
        // Keep ONLY the simplified format indices:
        // index 3 (JSON compact), 7 (TOON), 8 (LOON llm), 9 (LOON full), 11 (LOON compact), 12 (JTON)
        const indicesToKeep = [3, 7, 8, 9, 11, 12];
        const formatCells = [];
        for (const idx of indicesToKeep) {
          if (parts[idx] !== undefined) {
            formatCells.push(cleanCell(parts[idx]));
          }
        }
        
        currentSection.rows.push({
          name: translatedName,
          bytes: bytes,
          cells: formatCells
        });
      }
    }
  }
  
  return { headers, sections };
}

// 2. PARSE ROUNDTRIP FIDELITY (FILTERED ROWS)
function parseRoundtrip() {
  const content = fsExtra.readFileSync(roundtripPath, 'utf8');
  const lines = content.split(/\r?\n/);
  
  let tableHeaderParsed = false;
  let headers = [];
  const rows = [];
  const roundtripDatasetsToExclude = ['github', 'nested-config'];
  let headerIndexesToKeep = [];
  
  for (const line of lines) {
    if (line.startsWith('|')) {
      const parts = line.split('|').map(p => p.trim()).filter((p, i) => i > 0 && i < line.split('|').length - 1);
      if (parts.length === 0 || parts[0].includes('---')) continue;
      
      if (parts[0] === 'Format') {
        if (!tableHeaderParsed) {
          headers = [];
          for (let i = 0; i < parts.length; i++) {
            if (i === 0 || !roundtripDatasetsToExclude.includes(parts[i])) {
              headers.push(parts[i]);
              headerIndexesToKeep.push(i);
            }
          }
          tableHeaderParsed = true;
        }
        continue;
      }
      
      if (tableHeaderParsed) {
        const formatRaw = parts[0];
        if (formatsToExclude.includes(formatRaw)) continue;
        const translatedFormat = formatTranslationMap[formatRaw] || formatRaw;
        
        const datasetCells = [];
        for (let i = 1; i < parts.length; i++) {
          if (headerIndexesToKeep.includes(i)) {
            datasetCells.push(cleanCell(parts[i]));
          }
        }
        
        rows.push({
          format: translatedFormat,
          cells: datasetCells
        });
      }
    }
  }
  
  return { headers, rows };
}

// 3. PARSE MULTI-TOKENIZER
function parseMultiTokenizer() {
  const content = fsExtra.readFileSync(multiTokenizerPath, 'utf8');
  const lines = content.split(/\r?\n/);
  
  const syntheticDatasets = [];
  const realDatasets = [];
  
  let currentDataset = null;
  let inTable = false;
  let isSynthetic = true;
  
  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentDataset = null;
      inTable = false;
      continue;
    }
    
    if (line.includes('Real-world JSON files')) {
      isSynthetic = false;
      continue;
    }
    
    const matchHeader = line.match(/^###\s+(.+)$/);
    if (matchHeader) {
      const nameRaw = matchHeader[1].trim();
      // Skip section container headers
      if (nameRaw.toLowerCase().includes('datasets') || nameRaw.toLowerCase().includes('files') || nameRaw.toLowerCase().includes('benchmarks')) {
        continue;
      }
      if (datasetsToExclude.includes(nameRaw)) {
        currentDataset = null;
        inTable = false;
        continue;
      }
      
      currentDataset = {
        name: nameRaw,
        rows: {}
      };
      
      if (isSynthetic) {
        syntheticDatasets.push(currentDataset);
      } else {
        realDatasets.push(currentDataset);
      }
      
      inTable = false;
      continue;
    }
    
    if (line.startsWith('|')) {
      const parts = line.split('|').map(p => p.trim()).filter((p, i) => i > 0 && i < line.split('|').length - 1);
      if (parts.length === 0 || parts[0].includes('---')) continue;
      
      if (parts[0] === 'Format') {
        inTable = true;
        continue;
      }
      
      if (inTable && currentDataset) {
        const format = parts[0];
        if (['TOON', 'LOON (llm)', 'LOON (full)'].includes(format)) {
          // Keep only: GPT-4o (1), Claude (3), Gemini (4), Llama 3.2 (5)
          const cells = [
            parts[1],
            parts[3],
            parts[4],
            parts[5]
          ];
          currentDataset.rows[format] = cells;
        }
      }
    }
  }
  return { syntheticDatasets, realDatasets };
}

// 4. GENERATE LATEX TABLES
function generateLatex() {
  const realData = parseRealData();
  const roundtrip = parseRoundtrip();
  const tokenizers = parseMultiTokenizer();
  
  let out = '% LaTeX tables generated by parse_extra_results.js\n\n';
  
  // --- MULTI-TOKENIZER SYNTHETIC ---
  out += '%% --- TABLA: Eficiencia en tokens de LOON en conjuntos de datos sintéticos (Deltas vs.\\ JSON-compacto) ---\n';
  out += '\\begin{table*}[t]\n';
  out += '  \\centering\n';
  out += '  \\caption{Eficiencia en tokens de LOON en conjuntos de datos sintéticos (Deltas vs.\\ JSON-compacto)}\n';
  out += '  \\label{tab:tokens-synth}\n';
  out += '  \\scriptsize\n';
  out += '  \\begin{tabular}{@{}llcccc@{}}\n';
  out += '    \\toprule\n';
  out += '    \\textbf{Dataset} & \\textbf{Modo} & \\textbf{GPT-4o} & \\textbf{Claude} & \\textbf{Gemini} & \\textbf{Llama 3.2} \\\\\n';
  out += '     & & \\scriptsize (o200k) & \\scriptsize (lenml) & \\scriptsize (lenml) & \\scriptsize (local) \\\\\n';
  out += '    \\midrule\n';
  
  for (let i = 0; i < tokenizers.syntheticDatasets.length; i++) {
    const ds = tokenizers.syntheticDatasets[i];
    const name = synthDatasetTranslationMap[ds.name] || ds.name;
    let isFirst = true;
    for (const mode of ['TOON', 'LOON (llm)', 'LOON (full)']) {
      const modeLabel = mode === 'LOON (llm)' ? '\\texttt{llm}' : (mode === 'LOON (full)' ? '\\texttt{full}' : 'TOON');
      const cells = ds.rows[mode] || ['n/a', 'n/a', 'n/a', 'n/a'];
      const escapedCells = cells.map(getTokenizerDelta);
      if (isFirst) {
        out += `    \\multirow{3}{*}{${name}} & ${modeLabel} & ${escapedCells.join(' & ')} \\\\\n`;
        isFirst = false;
      } else {
        out += `     & ${modeLabel} & ${escapedCells.join(' & ')} \\\\\n`;
      }
    }
    if (i < tokenizers.syntheticDatasets.length - 1) {
      out += '    \\cline{2-6}\n';
    }
  }
  out += '    \\bottomrule\n';
  out += '  \\end{tabular}\n';
  out += '\\end{table*}\n\n';
  
  // --- MULTI-TOKENIZER REAL ---
  out += '%% --- TABLA: Eficiencia en tokens de LOON en conjuntos de datos reales (Deltas vs.\\ JSON-compacto) ---\n';
  out += '\\begin{table*}[t]\n';
  out += '  \\centering\n';
  out += '  \\caption{Eficiencia en tokens de LOON en conjuntos de datos reales (Deltas vs.\\ JSON-compacto)}\n';
  out += '  \\label{tab:tokens-real}\n';
  out += '  \\scriptsize\n';
  out += '  \\begin{tabular}{@{}llcccc@{}}\n';
  out += '    \\toprule\n';
  out += '    \\textbf{Dataset} & \\textbf{Modo} & \\textbf{GPT-4o} & \\textbf{Claude} & \\textbf{Gemini} & \\textbf{Llama 3.2} \\\\\n';
  out += '     & & \\scriptsize (o200k) & \\scriptsize (lenml) & \\scriptsize (lenml) & \\scriptsize (local) \\\\\n';
  out += '    \\midrule\n';
  
  for (let i = 0; i < tokenizers.realDatasets.length; i++) {
    const ds = tokenizers.realDatasets[i];
    const name = realDatasetTokenizerMap[ds.name] || ds.name;
    let isFirst = true;
    for (const mode of ['TOON', 'LOON (llm)', 'LOON (full)']) {
      const modeLabel = mode === 'LOON (llm)' ? '\\texttt{llm}' : (mode === 'LOON (full)' ? '\\texttt{full}' : 'TOON');
      const cells = ds.rows[mode] || ['n/a', 'n/a', 'n/a', 'n/a'];
      const escapedCells = cells.map(getTokenizerDelta);
      if (isFirst) {
        out += `    \\multirow{3}{*}{${name}} & ${modeLabel} & ${escapedCells.join(' & ')} \\\\\n`;
        isFirst = false;
      } else {
        out += `     & ${modeLabel} & ${escapedCells.join(' & ')} \\\\\n`;
      }
    }
    if (i < tokenizers.realDatasets.length - 1) {
      out += '    \\cline{2-6}\n';
    }
  }
  out += '    \\bottomrule\n';
  out += '  \\end{tabular}\n';
  out += '\\end{table*}\n\n';
  
  // Real Data Token Efficiency Tables
  out += '%% --- COMPARATIVAS MULTI-FORMATO POR CATEGORÍA DE DATOS REALES (o200k / GPT-4o) ---\n\n';
  
  for (const section of realData.sections) {
    if (section.rows.length === 0) continue;
    out += `%% --- TABLA: ${section.title} ---\n`;
    out += '\\begin{table*}[htbp]\n';
    out += '  \\centering\n';
    out += `  \\caption{Eficiencia en tokens en ${section.title.toLowerCase()} (Deltas vs.\\ JSON-compacto, usando tokenizador GPT-4o o200k)}\n`;
    out += `  \\label{${section.label}}\n`;
    out += '  \\tiny\n';
    out += '  \\setlength{\\tabcolsep}{2pt}\n';
    out += '  \\begin{tabular}{@{}lcrccccc@{}}\n'; // 8 columns: Dataset(l), Bytes(c), and 6 formats(c)
    out += '    \\toprule\n';
    out += '    \\textbf{Dataset} & \\textbf{Bytes} & \\textbf{JSON compact} & \\textbf{TOON} & \\textbf{LOON (llm)} & \\textbf{LOON (full)} & \\textbf{LOON (compact)} & \\textbf{JTON} \\\\\n';
    out += '    \\midrule\n';
    
    for (const row of section.rows) {
      const name = row.name;
      const formattedBytes = parseInt(row.bytes.replace(/,/g, '')).toLocaleString('es-ES');
      out += `    ${name} & ${formattedBytes} & ${row.cells.join(' & ')} \\\\\n`;
    }
    
    out += '    \\bottomrule\n';
    out += '  \\end{tabular}\n';
    out += '\\end{table*}\n\n';
  }
  
  // Roundtrip Fidelity Table
  out += '%% --- FIDELIDAD DE IDA Y VUELTA (ROUNDTRIP FIDELITY) ---\n';
  out += '\\begin{table*}[t]\n';
  out += '  \\centering\n';
  out += '  \\caption{Fidelidad de ida y vuelta (Roundtrip Fidelity) de múltiples formatos en datasets de prueba}\n';
  out += '  \\label{tab:roundtrip-fidelity}\n';
  out += '  \\scriptsize\n';
  out += '  \\begin{tabular}{@{}l' + 'c'.repeat(roundtrip.headers.length - 1) + '@{}}\n';
  out += '    \\toprule\n';
  out += '    \\textbf{Formato} & ' + roundtrip.headers.slice(1).map(h => `\\textbf{${roundtripDatasetMap[h] || h}}`).join(' & ') + ' \\\\\n';
  out += '    \\midrule\n';
  
  for (const row of roundtrip.rows) {
    out += `    ${row.format} & ${row.cells.join(' & ')} \\\\\n`;
  }
  
  out += '    \\bottomrule\n';
  out += '  \\end{tabular}\n';
  out += '\\end{table*}\n';
  
  const outputPath = path.join(__dirname, '../results_tables.tex');
  fsExtra.writeFileSync(outputPath, out, 'utf8');
  console.log(`Successfully generated LaTeX tables at ${outputPath}`);
}

generateLatex();
