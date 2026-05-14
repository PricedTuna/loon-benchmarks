"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Loon: () => Loon,
  LoonSession: () => LoonSession,
  TreeCodec: () => TreeCodec,
  TreeDecodeError: () => TreeDecodeError,
  TreeEncodeError: () => TreeEncodeError,
  getSpec: () => getSpec,
  loon: () => loon,
  repairHint: () => repairHint,
  splitLoon: () => splitLoon,
  validateDecode: () => validateDecode
});
module.exports = __toCommonJS(index_exports);

// src/utils/auto-type.ts
function autoType(val) {
  if (val === "" || val === "null" || val === "NULL") return null;
  if (val === "true" || val === "TRUE") return true;
  if (val === "false" || val === "FALSE") return false;
  const n = Number(val);
  if (!isNaN(n) && val.trim() !== "") return n;
  if (val.includes("|")) return val.split("|");
  return val;
}

// src/codecs/csv.ts
var CsvCodec = class {
  /**
   * Parses a CSV string into an array of records.
   * - Header row defines column names.
   * - Values are auto-typed: numbers, booleans, null (empty cell), strings.
   * - Quoted fields (RFC 4180) supported.
   * - Pipe-delimited cells decoded as arrays: "a|b|c" → ["a","b","c"]
   */
  parse(csv) {
    const lines = csv.trim().split("\n").map((l) => l.trimEnd());
    if (lines.length < 2) return [];
    const headers = this.parseLine(lines[0]).map((h) => h.trim());
    const data = lines.slice(1).filter((l) => l.trim() !== "").map((line) => {
      const vals = this.parseLine(line);
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = autoType(vals[i] ?? "");
      });
      return obj;
    });
    headers.forEach((col) => {
      if (data.some((row) => Array.isArray(row[col]))) {
        data.forEach((row) => {
          if (row[col] !== null && !Array.isArray(row[col])) row[col] = [row[col]];
        });
      }
    });
    return data;
  }
  /**
   * Serializes an array of records to CSV.
   * - Nested objects are flattened to dot-notation column names.
   * - Arrays become pipe-delimited values.
   * - null → empty cell.
   */
  serialize(data) {
    if (!data || data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const rows = [
      headers.join(","),
      ...data.map((row) => headers.map((h) => this.cell(row[h])).join(","))
    ];
    return rows.join("\n");
  }
  /** Splits one CSV line respecting RFC 4180 quoting. */
  parseLine(line) {
    const result = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuote = !inQuote;
      } else if (c === "," && !inQuote) {
        result.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }
  /** Serializes one value to a safe CSV cell. */
  cell(val) {
    if (val === null || val === void 0) return "";
    if (Array.isArray(val)) {
      const s2 = val.join("|");
      return s2.includes(",") || s2.includes('"') ? `"${s2.replace(/"/g, '""')}"` : s2;
    }
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }
};

// src/codecs/tree.ts
var TreeEncodeError = class extends Error {
  constructor(code, treePath, msg) {
    super(msg);
    this.name = "TreeEncodeError";
    this.code = code;
    this.treePath = treePath;
  }
};
var TreeDecodeError = class extends Error {
  constructor(code, detail) {
    super(detail);
    this.name = "TreeDecodeError";
    this.code = code;
    this.detail = detail;
  }
};
var COMMON_CHILD_KEYS = [
  "children",
  "nodes",
  "items",
  "elements",
  "childNodes",
  "kids",
  "subnodes",
  "branches",
  "leaves",
  "features"
];
var DEFAULT_MAX_DEPTH = 200;
var DEFAULT_ID_COL = "_id";
var DEFAULT_PID_COL = "_pid";
var TreeCodec = class {
  /**
   * Flattens a tree (or array of trees) into an adjacency-list row array.
   *
   * Throws `TreeEncodeError` on:
   *   - Circular reference  (code: 'CIRCULAR')
   *   - Depth overflow      (code: 'MAX_DEPTH')
   *   - Non-object node     (code: 'INVALID_NODE')
   */
  parse(input, opts = {}) {
    const isArray = Array.isArray(input);
    const roots = isArray ? input : [input];
    const childKey = opts.childKey ?? (roots.length > 0 ? this.detectChildKey(roots[0]) : "children");
    const idCol = opts.idCol ?? DEFAULT_ID_COL;
    const pidCol = opts.pidCol ?? DEFAULT_PID_COL;
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    const meta = { childKey, isArray, idCol, pidCol };
    if (roots.length === 0) return { rows: [], meta };
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    const walk = (node, pid, pkey, depth, path) => {
      if (depth > maxDepth) {
        throw new TreeEncodeError(
          "MAX_DEPTH",
          path,
          `Tree depth ${depth} exceeds maxDepth=${maxDepth} at "${path}"`
        );
      }
      if (node === null || typeof node !== "object") {
        throw new TreeEncodeError(
          "INVALID_NODE",
          path,
          `Expected object at "${path}", got ${node === null ? "null" : typeof node}`
        );
      }
      if (seen.has(node)) {
        throw new TreeEncodeError(
          "CIRCULAR",
          path,
          `Circular reference detected at "${path}"`
        );
      }
      seen.add(node);
      const id = rows.length;
      const row = { [idCol]: id, [pidCol]: pid };
      if (pkey !== null && pkey !== childKey) {
        row["_pkey"] = pkey;
      }
      const childArrays = [];
      for (const [k, v] of Object.entries(node)) {
        if (k === childKey && Array.isArray(v)) {
          childArrays.push({ key: k, children: v });
        } else if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
          childArrays.push({ key: k, children: v });
        } else {
          row[k] = v;
        }
      }
      rows.push(row);
      for (const { key, children } of childArrays) {
        for (let i = 0; i < children.length; i++) {
          walk(children[i], id, key, depth + 1, `${path}.${key}[${i}]`);
        }
      }
    };
    for (let i = 0; i < roots.length; i++) {
      walk(roots[i], null, null, 0, isArray ? `[${i}]` : "root");
    }
    return { rows, meta };
  }
  /**
   * Reconstructs a tree from an adjacency-list row array.
   *
   * Null-valued properties are stripped from each node by default because
   * the adaptive encoder uses a union schema (all columns from all node
   * types) and assigns null to properties absent on a given node.  Stripping
   * restores the original sparse shape.  Pass `preserveNulls: true` to keep
   * explicit nulls (use when nodes legitimately carry null values).
   *
   * Throws `TreeDecodeError` on:
   *   - Orphaned node whose pid doesn't exist  (code: 'ORPHAN')
   *
   * Row order (DFS insertion order) determines children order.
   */
  serialize(rows, meta, opts = {}) {
    if (rows.length === 0) return meta.isArray ? [] : null;
    const { childKey, isArray, idCol, pidCol } = meta;
    const stripNulls = opts.preserveNulls !== true;
    const nodeMap = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const id = Number(row[idCol]);
      const { [idCol]: _id, [pidCol]: _pid, _pkey, ...data } = row;
      const node = stripNulls ? deepStripNulls(data) : data;
      nodeMap.set(id, node);
    }
    const roots = [];
    for (const row of rows) {
      const id = Number(row[idCol]);
      const raw = row[pidCol];
      const pkey = row["_pkey"] ?? childKey;
      const pid = raw === null || raw === void 0 ? null : Number(raw);
      const node = nodeMap.get(id);
      if (pid === null) {
        roots.push(node);
      } else {
        const parent = nodeMap.get(pid);
        if (!parent) {
          throw new TreeDecodeError(
            "ORPHAN",
            `Node ${idCol}=${id} references non-existent parent ${pidCol}=${pid}`
          );
        }
        if (!parent[pkey]) parent[pkey] = [];
        parent[pkey].push(node);
      }
    }
    return isArray ? roots : roots[0] ?? null;
  }
  // ─── Metadata header serialization ────────────────────────────────────────
  /**
   * Encodes tree metadata as a compact string for the `TREE:` header line.
   * Only non-default values are emitted to keep the header short.
   */
  encodeMeta(meta) {
    const parts = [`ck=${esc(meta.childKey)}`];
    if (meta.isArray) parts.push("arr=1");
    if (meta.idCol !== DEFAULT_ID_COL) parts.push(`id=${esc(meta.idCol)}`);
    if (meta.pidCol !== DEFAULT_PID_COL) parts.push(`pid=${esc(meta.pidCol)}`);
    return parts.join(",");
  }
  /**
   * Parses tree metadata from the value portion of a `TREE:` header line
   * (i.e., the string after `TREE:`).
   */
  decodeMeta(s) {
    const parts = [];
    let cur = "";
    let i = 0;
    while (i < s.length) {
      if (s[i] === "\\" && i + 1 < s.length) {
        cur += s[i + 1];
        i += 2;
      } else if (s[i] === ",") {
        parts.push(cur);
        cur = "";
        i++;
      } else {
        cur += s[i++];
      }
    }
    parts.push(cur);
    const kv = {};
    for (const p of parts) {
      const eq = p.indexOf("=");
      if (eq > 0) kv[p.slice(0, eq)] = p.slice(eq + 1);
    }
    return {
      childKey: kv["ck"] ?? "children",
      isArray: kv["arr"] === "1",
      idCol: kv["id"] ?? DEFAULT_ID_COL,
      pidCol: kv["pid"] ?? DEFAULT_PID_COL
    };
  }
  // ─── Private helpers ───────────────────────────────────────────────────────
  /**
   * Heuristically determines which property holds child nodes.
   * Checks common names first, then falls back to the first property
   * whose value is a non-empty array of objects.
   */
  detectChildKey(node) {
    if (typeof node !== "object" || node === null) return "children";
    for (const key of COMMON_CHILD_KEYS) {
      if (key in node && Array.isArray(node[key])) return key;
    }
    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
        return k;
      }
    }
    return "children";
  }
};
function deepStripNulls(value) {
  if (Array.isArray(value)) return value.map(deepStripNulls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, deepStripNulls(v)])
    );
  }
  return value;
}
function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/=/g, "\\=");
}

// src/codecs/xml.ts
var XmlCodec = class {
  /**
   * Parses tabular XML into an array of records.
   * Expected shape: <root> <row> <field>value</field> </row> ... </root>
   * - Nested elements become dot-notation keys (address.city).
   * - Values are auto-typed (numbers, booleans, null for self-closing/empty tags).
   * - Attributes on row elements are ignored; content elements are parsed.
   */
  parse(xml, rowTagHint) {
    const { children } = this.parseDoc(xml, rowTagHint);
    return children;
  }
  /**
   * Serializes an array of records to XML.
   * - Nested objects become nested XML elements.
   * - Arrays become repeated <item> children.
   * - null → self-closing tag.
   */
  serialize(data, rootTag = "data", rowTag = "item") {
    if (!data || data.length === 0) return `<${rootTag}></${rootTag}>`;
    const rows = data.map(
      (row) => `  <${rowTag}>${Object.entries(row).map(([k, v]) => this.field(k, v)).join("")}</${rowTag}>`
    );
    return `<${rootTag}>
${rows.join("\n")}
</${rootTag}>`;
  }
  parseDoc(xml, rowTagHint) {
    const clean = xml.replace(/<\?[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[\s\S]*?>/g, "").replace(/\r\n?/g, "\n").trim();
    const rootMatch = clean.match(/^<([\w:.-]+)(\s[^>]*)?>/);
    if (!rootMatch) throw new Error("XML: no root element found");
    const rootTag = rootMatch[1];
    const rootAttrs = rootMatch[2] ? this.parseAttrs(rootMatch[2]) : {};
    const innerStart = rootMatch[0].length;
    const innerEnd = clean.lastIndexOf(`</${rootTag}>`);
    if (innerEnd === -1) throw new Error(`XML: missing closing </${rootTag}>`);
    const inner = clean.slice(innerStart, innerEnd).trim();
    let rowTag;
    if (rowTagHint) {
      rowTag = rowTagHint;
    } else {
      const rowMatch = inner.match(/^<([\w:.-]+)[^>]*>/);
      if (!rowMatch) {
        if (Object.keys(rootAttrs).length > 0) {
          const fields = this.parseFields(inner);
          return { tag: rootTag, children: [{ ...rootAttrs, ...fields }] };
        }
        return { tag: rootTag, children: [] };
      }
      rowTag = rowMatch[1];
    }
    const children = [];
    const rowRe = new RegExp(
      `<${rowTag.replace(":", "\\:")}((?:\\s[^>]*)?)>([\\s\\S]*?)<\\/${rowTag.replace(":", "\\:")}>`,
      "g"
    );
    let m;
    while ((m = rowRe.exec(inner)) !== null) {
      const rowAttrs = m[1] ? this.parseAttrs(m[1]) : {};
      const fields = this.parseFields(m[2]);
      children.push({ ...rowAttrs, ...fields });
    }
    if (children.length === 0 && !rowTagHint && Object.keys(rootAttrs).length > 0) {
      const fields = this.parseFields(inner);
      return { tag: rootTag, children: [{ ...rootAttrs, ...fields }] };
    }
    return { tag: rootTag, children };
  }
  parseFields(content) {
    const obj = {};
    let m;
    const selfRe = /<([\w:.-]+)(\s[^>]*)?\s*\/>/g;
    while ((m = selfRe.exec(content)) !== null) {
      const key = m[1].replace(/^[\w]+:/, "");
      const attrs = m[2] ? this.parseAttrs(m[2]) : {};
      obj[key] = Object.keys(attrs).length > 0 ? attrs : null;
    }
    const tagRe = /<([\w:.-]+)(\s[^>]*)?>([^]*?)<\/\1>/g;
    while ((m = tagRe.exec(content)) !== null) {
      const key = m[1].replace(/^[\w]+:/, "");
      const attrs = m[2] ? this.parseAttrs(m[2]) : {};
      const inner = m[3].trim();
      if (/<[\w:.-]/.test(inner)) {
        const children = this.parseFields(inner);
        obj[key] = Object.keys(attrs).length > 0 ? { ...attrs, ...children } : children;
      } else if (inner) {
        const val = autoType(this.unescape(inner));
        obj[key] = Object.keys(attrs).length > 0 ? { ...attrs, _text: val } : val;
      } else {
        obj[key] = Object.keys(attrs).length > 0 ? attrs : null;
      }
    }
    return obj;
  }
  parseAttrs(attrStr) {
    const attrs = {};
    const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(attrStr)) !== null) {
      const key = m[1];
      if (key.startsWith("xmlns") || key === "xsi:schemaLocation") continue;
      const cleanKey = key.replace(/^[\w]+:/, "");
      attrs[cleanKey] = autoType(this.unescape(m[2] ?? m[3] ?? ""));
    }
    return attrs;
  }
  field(key, val) {
    if (val === null || val === void 0) return `<${key}/>`;
    if (Array.isArray(val))
      return `<${key}>${val.map((v) => `<item>${this.escape(String(v))}</item>`).join("")}</${key}>`;
    if (typeof val === "object")
      return `<${key}>${Object.entries(val).map(([k, v]) => this.field(k, v)).join("")}</${key}>`;
    return `<${key}>${this.escape(String(val))}</${key}>`;
  }
  escape(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  unescape(s) {
    return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }
};

// src/codecs/yaml.ts
var YamlCodec = class {
  /**
   * Parses a YAML string into an array of records.
   * - Sequences of mappings and mappings with one sequence key are supported.
   * - Nested objects become dot-notation keys after flattening.
   * - Block scalars (| and >), quoted strings, and inline comments supported.
   * - Values auto-typed: numbers, booleans, null (~), strings.
   */
  parse(yaml) {
    const lines = yaml.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
    const toks = this.tokenize(lines);
    if (toks.length === 0) return [];
    const { val } = this.build(toks, { i: 0 }, -1);
    if (Array.isArray(val)) return val.filter((v) => v !== null && typeof v === "object");
    if (val && typeof val === "object") {
      for (const v of Object.values(val)) {
        if (Array.isArray(v)) return v.filter((x) => x !== null && typeof x === "object");
      }
      return [val];
    }
    return [];
  }
  /**
   * Serializes an array of records to YAML.
   * - Nested objects become indented YAML mappings.
   * - Arrays become YAML sequences.
   * - null → null literal.
   */
  serialize(data) {
    if (!data || data.length === 0) return "";
    return data.map((r) => this.dump(r, 0, true)).join("");
  }
  // ── Tokenizer ───────────────────────────────────────────────────────────────
  tokenize(lines) {
    const out = [];
    let bk = "";
    let bls = [];
    let bind = -1;
    let bfold = false;
    for (const raw of lines) {
      const tr = raw.trimStart();
      const ind = raw.length - tr.length;
      if (bk) {
        if (!tr || ind >= bind) {
          bls.push(tr ? raw.slice(bind) : "");
          continue;
        }
        const txt = bfold ? bls.map((l) => l.trim()).filter(Boolean).join(" ") : bls.join("\n").trimEnd();
        out.push({ ind: bind - 2, li: false, k: bk, v: txt });
        bk = "";
      }
      if (!tr || tr.startsWith("#") || /^---/.test(tr) || /^\.\.\./.test(tr)) continue;
      let li = false;
      let content = tr;
      if (content.startsWith("- ")) {
        li = true;
        content = content.slice(2).trimStart();
      } else if (content === "-") {
        li = true;
        content = "";
      }
      const ci = this.colonIdx(content);
      if (ci > 0) {
        const key = content.slice(0, ci).trim();
        const vp = this.stripComment(content.slice(ci + 1).trimStart());
        if (vp === "|" || vp === "|-" || vp === ">" || vp === ">-") {
          bk = key;
          bfold = vp.startsWith(">");
          bind = ind + (li ? 4 : 2);
          bls = [];
          if (li) out.push({ ind, li: true, k: null, v: null });
          continue;
        }
        out.push({ ind, li, k: key, v: vp || null });
      } else {
        const vs = this.stripComment(content);
        out.push({ ind, li, k: null, v: vs || null });
      }
    }
    if (bk && bls.length > 0) {
      const txt = bfold ? bls.map((l) => l.trim()).filter(Boolean).join(" ") : bls.join("\n").trimEnd();
      out.push({ ind: bind - 2, li: false, k: bk, v: txt });
    }
    return out;
  }
  // ── Builder ─────────────────────────────────────────────────────────────────
  build(toks, state, parentInd) {
    if (state.i >= toks.length) return { val: null };
    const t0 = toks[state.i];
    if (t0.ind <= parentInd) return { val: null };
    const myInd = t0.ind;
    if (t0.li) {
      const arr = [];
      while (state.i < toks.length && toks[state.i].ind === myInd && toks[state.i].li) {
        const t = toks[state.i++];
        arr.push(this.buildItem(toks, state, myInd, t));
      }
      return { val: arr };
    }
    const obj = {};
    while (state.i < toks.length && toks[state.i].ind === myInd && !toks[state.i].li && toks[state.i].k) {
      const t = toks[state.i++];
      if (t.v !== null) {
        obj[t.k] = this.yamlType(t.v);
      } else {
        obj[t.k] = state.i < toks.length && toks[state.i].ind > myInd ? this.build(toks, state, myInd).val : null;
      }
    }
    return { val: obj };
  }
  buildItem(toks, state, listInd, t) {
    if (t.k !== null) {
      const obj = {};
      if (t.v !== null) {
        obj[t.k] = this.yamlType(t.v);
      } else {
        obj[t.k] = state.i < toks.length && toks[state.i].ind > listInd ? this.build(toks, state, listInd).val : null;
      }
      while (state.i < toks.length && toks[state.i].ind > listInd && !toks[state.i].li) {
        const kt = toks[state.i++];
        if (!kt.k) continue;
        if (kt.v !== null) {
          obj[kt.k] = this.yamlType(kt.v);
        } else {
          obj[kt.k] = state.i < toks.length && toks[state.i].ind > kt.ind ? this.build(toks, state, kt.ind).val : null;
        }
      }
      return obj;
    }
    if (t.v !== null) return this.yamlType(t.v);
    if (state.i < toks.length && toks[state.i].ind > listInd) {
      return this.build(toks, state, listInd).val;
    }
    return null;
  }
  // ── Serializer ──────────────────────────────────────────────────────────────
  dump(obj, indent, listItem) {
    const pad = " ".repeat(indent);
    const cpad = " ".repeat(indent + 2);
    if (obj === null || obj === void 0) return `${pad}${listItem ? "- " : ""}null
`;
    if (typeof obj !== "object") return `${pad}${listItem ? "- " : ""}${this.lit(obj)}
`;
    if (Array.isArray(obj)) {
      if (!obj.length) return `${pad}${listItem ? "- " : ""}[]
`;
      return obj.map((v) => this.dump(v, indent, true)).join("");
    }
    const entries = Object.entries(obj);
    if (!entries.length) return `${pad}${listItem ? "- " : ""}{}
`;
    let out = "";
    entries.forEach(([k, v], idx) => {
      const pfx = idx === 0 && listItem ? `${pad}- ` : cpad;
      const childIndent = indent + 2;
      if (v === null || v === void 0) {
        out += `${pfx}${k}: null
`;
      } else if (Array.isArray(v)) {
        out += `${pfx}${k}:
`;
        v.forEach((item) => {
          out += this.dump(item, childIndent + 2, true);
        });
      } else if (typeof v === "object") {
        out += `${pfx}${k}:
`;
        out += this.dumpMap(v, childIndent + 2);
      } else {
        out += `${pfx}${k}: ${this.lit(v)}
`;
      }
    });
    return out;
  }
  dumpMap(obj, indent) {
    const pad = " ".repeat(indent);
    let out = "";
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === void 0) {
        out += `${pad}${k}: null
`;
      } else if (Array.isArray(v)) {
        out += `${pad}${k}:
`;
        v.forEach((item) => {
          out += this.dump(item, indent + 2, true);
        });
      } else if (typeof v === "object") {
        out += `${pad}${k}:
`;
        out += this.dumpMap(v, indent + 2);
      } else {
        out += `${pad}${k}: ${this.lit(v)}
`;
      }
    }
    return out;
  }
  // ── Helpers ─────────────────────────────────────────────────────────────────
  colonIdx(s) {
    let inQ = false;
    let qc = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!inQ && (c === '"' || c === "'")) {
        inQ = true;
        qc = c;
        continue;
      }
      if (inQ && c === qc) {
        inQ = false;
        continue;
      }
      if (!inQ && c === ":" && (i === s.length - 1 || s[i + 1] === " " || s[i + 1] === "	")) return i;
    }
    return -1;
  }
  stripComment(s) {
    let inQ = false;
    let qc = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!inQ && (c === '"' || c === "'")) {
        inQ = true;
        qc = c;
        continue;
      }
      if (inQ && c === qc) {
        inQ = false;
        continue;
      }
      if (!inQ && c === "#" && (i === 0 || s[i - 1] === " ")) return s.slice(0, i).trimEnd();
    }
    return s;
  }
  yamlType(v) {
    if (!v || v === "null" || v === "~" || v === "Null" || v === "NULL") return null;
    if (v === "true" || v === "True" || v === "TRUE") return true;
    if (v === "false" || v === "False" || v === "FALSE") return false;
    if (v.startsWith('"') && v.endsWith('"'))
      return v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    if (v.startsWith("'") && v.endsWith("'"))
      return v.slice(1, -1).replace(/''/g, "'");
    const n = Number(v);
    if (!isNaN(n) && v.trim() !== "") return n;
    return v;
  }
  lit(v) {
    if (v === null || v === void 0) return "null";
    if (typeof v === "boolean" || typeof v === "number") return String(v);
    const s = String(v);
    if (/[:#\[\]{}|>&*!,?%@`]/.test(s) || /^(true|false|null|yes|no|on|off|~)$/i.test(s) || s.includes("\n") || s.startsWith(" ") || s.endsWith(" ")) {
      return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
    }
    return s;
  }
};

// src/compression/mode-selector.ts
var SCAN_LIMIT = 40;
function analyzeMode(data) {
  const n = data.length;
  if (n === 0) return { mode: "compact", reason: "empty dataset", signals: [] };
  const firstKeys = Object.keys(data[0] || {});
  const colSample = firstKeys.slice(0, 10);
  const hasNestedObj = (val) => {
    if (val === null || val === void 0) return false;
    if (typeof val === "object") {
      if (!Array.isArray(val)) return true;
      for (const item of val) {
        if (item !== null && typeof item === "object") return true;
      }
    }
    return false;
  };
  for (const col of colSample) {
    for (let i = 0; i < Math.min(n, 5); i++) {
      if (hasNestedObj(data[i][col])) {
        return {
          mode: "compat",
          reason: `nested object or object-array in column "${col}" \u2014 adaptive requires flat primitive values`,
          signals: []
        };
      }
    }
  }
  if (n < 5) return { mode: "micro", reason: `only ${n} record(s) \u2014 micro mode`, signals: [] };
  const keySet = new Set(firstKeys);
  for (let i = 1; i < Math.min(n, 10); i++) {
    const rowKeys = Object.keys(data[i]);
    if (rowKeys.length !== firstKeys.length || !rowKeys.every((k) => keySet.has(k))) {
      return { mode: "compact", reason: "non-uniform schema: rows have different keys", signals: [] };
    }
  }
  const cols = Object.keys(data[0]);
  const scan = Math.min(n, SCAN_LIMIT);
  const signals = [];
  for (const col of cols) {
    const first = String(data[0][col] ?? "");
    let isConst = true;
    for (let i = 1; i < n; i++) {
      if (String(data[i][col] ?? "") !== first) {
        isConst = false;
        break;
      }
    }
    if (isConst) {
      signals.push({ col, type: "constant", detail: `value="${first}"` });
      continue;
    }
    const v0 = data[0][col];
    const v1 = data[1]?.[col];
    if (typeof v0 === "number" && Number.isInteger(v0) && typeof v1 === "number" && Number.isInteger(v1) && n >= 3) {
      const step = v1 - v0;
      if (step !== 0) {
        let isSeq = true;
        for (let i = 2; i < scan; i++) {
          if (data[i][col] !== v0 + step * i) {
            isSeq = false;
            break;
          }
        }
        if (isSeq) {
          signals.push({ col, type: "int-sequence", detail: `start=${v0} step=${step}` });
          continue;
        }
      }
    }
    if (typeof v0 === "number" && typeof v1 === "number" && n >= 3 && !(Number.isInteger(v0) && Number.isInteger(v1))) {
      const step = parseFloat((v1 - v0).toFixed(10));
      if (step !== 0) {
        const dec = (x) => {
          const s = Math.abs(x).toFixed(10).replace(/0+$/, "");
          const d = s.indexOf(".");
          return d < 0 ? 0 : s.length - d - 1;
        };
        const prec = Math.max(dec(v0), dec(step));
        const scale = Math.pow(10, prec);
        let isSeq = true;
        for (let i = 2; i < scan; i++) {
          const expected = Math.round((v0 + step * i) * scale) / scale;
          if (data[i][col] !== expected) {
            isSeq = false;
            break;
          }
        }
        if (isSeq) {
          signals.push({ col, type: "float-sequence", detail: `start=${v0} step=${step}` });
          continue;
        }
      }
    }
    if (typeof v0 === "string" && typeof v1 === "string" && n >= 3) {
      const prefix = v0.replace(/[0-9]+$/, "");
      if (prefix.length > 0 && prefix !== v0) {
        const n0 = parseInt(v0.slice(prefix.length), 10);
        const n1 = parseInt(v1.slice(prefix.length), 10);
        if (!isNaN(n0) && !isNaN(n1)) {
          const step = n1 - n0;
          if (step !== 0) {
            let isSeq = true;
            for (let i = 2; i < scan; i++) {
              const v = String(data[i][col] ?? "");
              if (!v.startsWith(prefix)) {
                isSeq = false;
                break;
              }
              const num = parseInt(v.slice(prefix.length), 10);
              if (num !== n0 + step * i) {
                isSeq = false;
                break;
              }
            }
            if (isSeq) {
              signals.push({ col, type: "string-sequence", detail: `prefix="${prefix}" start=${n0} step=${step}` });
              continue;
            }
          }
        }
      }
    }
    {
      const dec = (x) => {
        const s = Math.abs(x).toFixed(10).replace(/0+$/, "");
        const d = s.indexOf(".");
        return d < 0 ? 0 : s.length - d - 1;
      };
      let maxDec = 0;
      let hasNonInt = false;
      let allNumeric = true;
      for (let i = 0; i < scan; i++) {
        const v = data[i][col];
        if (v === null || v === void 0) continue;
        if (typeof v !== "number" || !Number.isFinite(v)) {
          allNumeric = false;
          break;
        }
        const d = dec(v);
        if (d > 0) hasNonInt = true;
        maxDec = Math.max(maxDec, d);
        if (maxDec > 6) {
          allNumeric = false;
          break;
        }
      }
      if (allNumeric && hasNonInt && maxDec >= 2) {
        signals.push({ col, type: "fixed-point", detail: `decimals=${maxDec}` });
        continue;
      }
    }
    const freq = /* @__PURE__ */ new Map();
    for (let i = 0; i < scan; i++) {
      const v = String(data[i][col] ?? "");
      freq.set(v, (freq.get(v) ?? 0) + 1);
    }
    const maxFreq = Math.max(...freq.values());
    const cardinality = freq.size;
    if (maxFreq / scan > 0.3) {
      signals.push({ col, type: "high-repetition", detail: `${Math.round(maxFreq / scan * 100)}%` });
      continue;
    }
    if (cardinality < scan / 3) {
      signals.push({ col, type: "low-cardinality", detail: `${cardinality} unique / ${scan} rows` });
      continue;
    }
    if (typeof v0 === "string") {
      const vals = [];
      let allStr = true;
      for (let i = 0; i < scan; i++) {
        if (typeof data[i][col] !== "string") {
          allStr = false;
          break;
        }
        vals.push(data[i][col]);
      }
      if (allStr && vals.length >= 2) {
        const suffix = commonSuffix(vals);
        if (suffix.length >= 3) {
          signals.push({ col, type: "suffix", detail: `suffix="${suffix}"` });
        }
      }
    }
  }
  const strongTypes = ["constant", "int-sequence", "float-sequence", "string-sequence", "fixed-point"];
  const strong = signals.find((s) => strongTypes.includes(s.type));
  if (strong) {
    return { mode: "adaptive", reason: `${strong.type} on column "${strong.col}" (${strong.detail})`, signals };
  }
  const mediumTypes = ["high-repetition", "low-cardinality", "suffix"];
  const medium = signals.find((s) => mediumTypes.includes(s.type));
  if (medium && n >= 15) {
    return { mode: "adaptive", reason: `${medium.type} on "${medium.col}" with n=${n} rows`, signals };
  }
  if (medium && n >= 8) {
    const mediumCount = signals.filter((s) => mediumTypes.includes(s.type)).length;
    if (mediumCount >= 2) {
      return { mode: "adaptive", reason: `${mediumCount} medium signals with n=${n} rows`, signals };
    }
  }
  signals.push({ col: "*", type: "count", detail: `n=${n}` });
  return { mode: "adaptive", reason: `n=${n}, adaptive default`, signals };
}
function selectMode(data) {
  return analyzeMode(data).mode;
}
function commonSuffix(vals) {
  if (vals.length < 2) return "";
  let len = 0;
  const minLen = Math.min(...vals.map((v) => v.length));
  for (let i = 1; i <= minLen - 1; i++) {
    const c = vals[0][vals[0].length - i];
    if (vals.every((v) => v[v.length - i] === c)) len = i;
    else break;
  }
  return len >= 1 ? vals[0].slice(-len) : "";
}

// src/decoder/micro.ts
function decodeMicro(loon2) {
  const lines = loon2.trim().split("\n");
  if (lines.length === 0 || !lines[0].startsWith("#")) return [];
  const cols = lines[0].substring(1).split(",");
  const result = [];
  const decodeMicroVal = (raw) => {
    const v = raw.replace(/\\,/g, ",").replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
    if (v === "^") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if ((v.startsWith("{") || v.startsWith("[")) && (v.endsWith("}") || v.endsWith("]"))) {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  };
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const tokens = [];
    let cur = "";
    for (let j = 0; j < line.length; j++) {
      if (line[j] === "\\" && j + 1 < line.length) {
        cur += line[j] + line[j + 1];
        j++;
      } else if (line[j] === ",") {
        tokens.push(cur);
        cur = "";
      } else cur += line[j];
    }
    tokens.push(cur);
    const obj = {};
    for (let k = 0; k < cols.length; k++) obj[cols[k]] = decodeMicroVal(tokens[k] ?? "^");
    result.push(obj);
  }
  return result;
}

// src/decoder/compact.ts
function decodeCompact(tron) {
  const records = tron.split(/\n---\n/);
  return records.map((record) => {
    const obj = {};
    const lines = record.split("\n");
    for (const line of lines) {
      const idx = line.indexOf(": ");
      if (idx < 1) continue;
      const key = line.substring(0, idx).trim();
      const raw = line.substring(idx + 2);
      if (raw.startsWith("\\S")) {
        obj[key] = raw.slice(2).replace(
          /\\(\\|n|r|t)/g,
          (_, c) => c === "\\" ? "\\" : c === "n" ? "\n" : c === "r" ? "\r" : "	"
        );
        continue;
      }
      if (raw.startsWith("\\J")) {
        const inner = raw.slice(2).replace(
          /\\(\\|n|r|t)/g,
          (_, c) => c === "\\" ? "\\" : c === "n" ? "\n" : c === "r" ? "\r" : "	"
        );
        try {
          obj[key] = JSON.parse(inner);
        } catch {
          obj[key] = inner;
        }
        continue;
      }
      const val = raw.replace(
        /\\(\\|n|r|t)/g,
        (_, c) => c === "\\" ? "\\" : c === "n" ? "\n" : c === "r" ? "\r" : "	"
      );
      if (val === "^") {
        obj[key] = null;
      } else if (val === "true") {
        obj[key] = true;
      } else if (val === "false") {
        obj[key] = false;
      } else if (/^-?\d+(\.\d+)?$/.test(val)) {
        obj[key] = Number(val);
      } else if ((val.startsWith("[") || val.startsWith("{")) && (val.endsWith("]") || val.endsWith("}"))) {
        try {
          obj[key] = JSON.parse(val);
        } catch {
          obj[key] = val;
        }
      } else {
        obj[key] = val;
      }
    }
    return obj;
  });
}

// src/decoder/json-hybrid.ts
function decodeJSONHybrid(parsed) {
  const columns = parsed.S;
  const rows = parsed.R;
  return rows.map((row) => {
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = i < row.length ? row[i] : null;
    }
    return obj;
  });
}

// src/compression/adaptive.ts
var AdaptiveEngine = class {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }
  /** Normalizes a raw value for consistent dictionary keys. Integers use Base36. */
  normalize(value) {
    if (value === null || value === void 0) return "";
    if (Array.isArray(value)) return this.encodeArray(value);
    if (typeof value === "number") {
      return Number.isInteger(value) ? value.toString(36) : value.toString();
    }
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "object") return JSON.stringify(value);
    return value.toString();
  }
  /** Encodes an array as a pipe-delimited token. */
  /** Encodes an array as a pipe-delimited token. Objects inside are JSON-encoded. */
  encodeArray(arr, csvMode = false) {
    if (arr.length === 0) return "";
    return arr.map((elem) => {
      const raw = typeof elem === "object" && elem !== null ? JSON.stringify(elem) : String(elem);
      let r = raw.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
      if (!csvMode) r = r.replace(/ /g, "\\s");
      if (csvMode) r = r.replace(/,/g, "\\,");
      return r.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    }).join("|");
  }
  /** Decodes a pipe-delimited token back to an array. JSON-encoded objects are parsed. */
  decodeArray(token) {
    if (token === "") return [];
    const parts = [];
    let cur = "";
    let i = 0;
    while (i < token.length) {
      if (token[i] === "\\" && i + 1 < token.length) {
        const c = token[i + 1];
        if (c === "|") {
          cur += "|";
          i += 2;
        } else if (c === "\\") {
          cur += "\\";
          i += 2;
        } else if (c === "s") {
          cur += " ";
          i += 2;
        } else if (c === "n") {
          cur += "\n";
          i += 2;
        } else if (c === "r") {
          cur += "\r";
          i += 2;
        } else if (c === "t") {
          cur += "	";
          i += 2;
        } else {
          cur += c;
          i += 2;
        }
      } else if (token[i] === "|") {
        parts.push(this._tryParseJson(cur));
        cur = "";
        i++;
      } else {
        cur += token[i++];
      }
    }
    parts.push(this._tryParseJson(cur));
    return parts;
  }
  _tryParseJson(s) {
    if ((s.startsWith("{") || s.startsWith("[")) && (s.endsWith("}") || s.endsWith("]"))) {
      try {
        return JSON.parse(s);
      } catch {
      }
    }
    return s;
  }
  /**
   * Compresses a value using dictionary lookups, default elimination,
   * delta encoding, and prefix optimization.
   */
  compress(value, column, schemaId, csvMode = false) {
    const context = this.stateManager.getContext(schemaId);
    if (Array.isArray(value)) return this.encodeArray(value, csvMode);
    const normalized = this.normalize(value);
    const dict = this.stateManager.getDictionary(schemaId, column);
    if (dict && dict[normalized] !== void 0) {
      return dict[normalized].toString();
    }
    if (typeof value === "string") {
      const globalDict = this.stateManager.getDictionary(schemaId, "__global__");
      if (globalDict) {
        for (const [prefix, token] of Object.entries(globalDict)) {
          if (value.startsWith(prefix)) {
            const rest = value.slice(prefix.length);
            return `$${token}${rest}`;
          }
        }
      }
    }
    if (typeof value === "string") {
      return csvMode ? this.encodeCsvVal(normalized) : this.encodeStrVal(normalized);
    }
    if (typeof value === "object" && value !== null) {
      const jsonStr = JSON.stringify(value);
      return csvMode ? this.encodeCsvVal(jsonStr) : this.encodeStrVal(jsonStr);
    }
    return normalized;
  }
  /**
   * Encodes a value for use inside a LOON header line.
   * Escapes chars that would break header parsing.
   */
  encodeHdrVal(s) {
    return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/,/g, "\\,").replace(/}/g, "\\}").replace(/\^/g, "\\^");
  }
  /** Reverses encodeHdrVal. */
  decodeHdrVal(s) {
    let result = "";
    let i = 0;
    while (i < s.length) {
      if (s[i] === "\\" && i + 1 < s.length) {
        const c = s[i + 1];
        if (c === "n") {
          result += "\n";
          i += 2;
        } else if (c === "r") {
          result += "\r";
          i += 2;
        } else {
          result += c;
          i += 2;
        }
      } else {
        result += s[i++];
      }
    }
    return result;
  }
  /** Encodes a raw string value into a safe single-token form. */
  encodeStrVal(s) {
    let r = s.replace(/\\/g, "\\\\").replace(/ /g, "\\s").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    if (r.length > 0 && "~*+$!^".includes(r[0])) r = "\\" + r;
    return r;
  }
  /** CSV row mode encoding. */
  encodeCsvVal(s) {
    let r = s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
    if (r.length > 0 && "~*+$!^".includes(r[0])) r = "\\" + r;
    return r;
  }
  decodeCsvVal(s) {
    let result = "";
    let i = 0;
    while (i < s.length) {
      if (s[i] === "\\" && i + 1 < s.length) {
        const c = s[i + 1];
        if (c === ",") {
          result += ",";
          i += 2;
        } else if (c === "n") {
          result += "\n";
          i += 2;
        } else if (c === "r") {
          result += "\r";
          i += 2;
        } else if (c === "t") {
          result += "	";
          i += 2;
        } else {
          result += c;
          i += 2;
        }
      } else {
        result += s[i++];
      }
    }
    return result;
  }
  /** Reverses encodeStrVal. */
  decodeStrVal(s) {
    let result = "";
    let i = 0;
    while (i < s.length) {
      if (s[i] === "\\" && i + 1 < s.length) {
        const c = s[i + 1];
        if (c === "s") {
          result += " ";
          i += 2;
        } else if (c === "n") {
          result += "\n";
          i += 2;
        } else if (c === "r") {
          result += "\r";
          i += 2;
        } else if (c === "t") {
          result += "	";
          i += 2;
        } else {
          result += c;
          i += 2;
        }
      } else {
        result += s[i++];
      }
    }
    return result;
  }
  /** Decompresses a token back to its original value. */
  decompress(token, column, type, schemaId, csvMode = false) {
    const dict = this.stateManager.getDictionary(schemaId, column);
    if (dict) {
      const reverseDict = this.stateManager.getReverseDictionary(schemaId, column);
      if (reverseDict && reverseDict[token] !== void 0) {
        return this.castType(reverseDict[token], type);
      }
    }
    if (token.startsWith("$")) {
      const globalDict = this.stateManager.getDictionary(schemaId, "__global__");
      if (globalDict) {
        const prefixToken = token.substring(1, 2);
        const restToken = token.substring(2);
        for (const [prefix, t] of Object.entries(globalDict)) {
          if (t.toString() === prefixToken) {
            return this.castType(prefix + restToken, type);
          }
        }
      }
    }
    if (type === "s") return csvMode ? this.decodeCsvVal(token) : this.decodeStrVal(token);
    if (type === "o") {
      const decoded = csvMode ? this.decodeCsvVal(token) : this.decodeStrVal(token);
      try {
        return JSON.parse(decoded);
      } catch {
        return decoded;
      }
    }
    return this.castType(token, type);
  }
  /** Casts a string token to its typed value. Base36 for integers. */
  castType(value, type) {
    if (value === "" && type !== "a" && type !== "o") return "";
    switch (type) {
      case "int":
      case "i":
      case "number":
        return parseInt(value, 36);
      case "float":
      case "f":
        return value.includes(".") ? Number(value) : parseInt(value, 36);
      case "bool":
      case "b":
      case "boolean":
        return value === "1" || value === "true";
      case "array":
      case "a":
        return this.decodeArray(value);
      case "object":
      case "o":
        if (value === "") return null;
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }
  /** Builds dictionaries for a dataset. */
  buildDictionaries(data, columns, schemaId) {
    const globalPrefixes = /* @__PURE__ */ new Map();
    columns.forEach((column) => {
      const frequencyMap = /* @__PURE__ */ new Map();
      data.forEach((row) => {
        const val = row[column];
        if (val === null || val === void 0) return;
        if (typeof val === "object" && !Array.isArray(val)) {
          Object.values(val).forEach((v) => {
            const norm2 = this.normalize(v);
            frequencyMap.set(norm2, (frequencyMap.get(norm2) || 0) + 1);
          });
          return;
        }
        const norm = this.normalize(val);
        frequencyMap.set(norm, (frequencyMap.get(norm) || 0) + 1);
        if (typeof val === "string" && val.length > 3) {
          const prefix = val.replace(/[0-9]+$/, "");
          if (prefix.length > 2 && prefix !== val) {
            globalPrefixes.set(prefix, (globalPrefixes.get(prefix) || 0) + 1);
          }
        }
      });
      const sorted = Array.from(frequencyMap.entries()).filter(([val, count]) => count > 2 || count > 1 && val.length > 5).sort((a, b) => b[1] - a[1]);
      const dictionary = {};
      let tokenIndex = 0;
      for (const [val] of sorted) {
        dictionary[val] = (tokenIndex++).toString(36);
      }
      if (Object.keys(dictionary).length > 0) {
        this.stateManager.registerDictionary(schemaId, column, dictionary);
      }
    });
    if (globalPrefixes.size > 0) {
      const globalDict = {};
      let gIndex = 0;
      globalPrefixes.forEach((count, prefix) => {
        if (count > 5) globalDict[prefix] = (gIndex++).toString(36);
      });
      if (Object.keys(globalDict).length > 0) {
        this.stateManager.registerDictionary(schemaId, "__global__", globalDict);
      }
    }
  }
};

// src/decoder/utils.ts
function splitCsvRow(s) {
  const tokens = [];
  let cur = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length) {
      cur += s[i] + s[i + 1];
      i += 2;
    } else if (s[i] === ",") {
      tokens.push(cur);
      cur = "";
      i++;
    } else {
      cur += s[i++];
    }
  }
  tokens.push(cur);
  return tokens;
}
function splitEscaped(s, delimiter) {
  const parts = [];
  let current = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length) {
      current += s[i] + s[i + 1];
      i += 2;
    } else if (s[i] === delimiter) {
      parts.push(current);
      current = "";
      i++;
    } else {
      current += s[i++];
    }
  }
  parts.push(current);
  return parts;
}

// src/decoder/adaptive/state.ts
var AdaptiveDecoderState = class {
  constructor() {
    this.standardMode = false;
    this.adaptiveMode = false;
    this.csvMode = false;
    this.currentBlockTable = null;
    this.currentSchemaId = null;
    this.activeColumns = null;
    this.rowCounter = 0;
    this.constants = {};
    this.sequences = {};
    this.floatSequences = {};
    this.fpCols = {};
    this.parsedDefaults = {};
    this.suffixMap = {};
    this.strSequences = {};
    this.aliasMap = {};
    this.decCols = {};
    this.deltaFirstValues = {};
    this.deltaState = {};
    this.normCols = {};
  }
  exp(col) {
    if (!this.currentSchemaId) return col;
    const m = this.aliasMap[this.currentSchemaId];
    return m ? m[col] ?? col : col;
  }
};

// src/decoder/adaptive/header-parser.ts
function parseHeader(line, state, stateManager, adaptive) {
  line = line.trimStart();
  if (!line) return;
  if (line.startsWith("SCHEMA:") || line.startsWith("S:")) {
    if (line.startsWith("S:")) state.standardMode = true;
    const match = line.match(/(?:SCHEMA|S):(@\w+)(?:\[(\d+)\])?=\[(.*)]/);
    if (match && match[1] && match[3]) {
      state.currentSchemaId = match[1];
      const rowCount = match[2] ? parseInt(match[2], 10) : void 0;
      const rawFields = match[3].split(",").map((f) => f.trim());
      const columns = [];
      const types = {};
      rawFields.forEach((f) => {
        if (!f) return;
        let [name, type] = f.split(":");
        columns.push(name);
        types[name] = type || "s";
      });
      stateManager.registerContext(state.currentSchemaId, columns, types);
      const ctx = stateManager.getContext(state.currentSchemaId);
      if (ctx) {
        ctx.rowCount = rowCount;
        ctx.lastValues = {};
      }
      state.activeColumns = null;
      state.rowCounter = 0;
    }
    return;
  }
  if (line.startsWith("A:") && state.currentSchemaId) {
    const fullNames = line.substring(2).split(",");
    const ctx = stateManager.getContext(state.currentSchemaId);
    if (ctx && fullNames.length === ctx.columns.length) {
      const map = {};
      const newTypes = {};
      ctx.columns = ctx.columns.map((abbrev, i) => {
        const full = fullNames[i] ?? abbrev;
        map[abbrev] = full;
        newTypes[full] = ctx.types[abbrev];
        return full;
      });
      ctx.types = newTypes;
      state.aliasMap[state.currentSchemaId] = map;
    }
    return;
  }
  if (line.startsWith("C:")) {
    state.adaptiveMode = true;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 2 && state.currentSchemaId) {
      const col = state.exp(line.substring(2, eqIdx));
      const rawVal = line.substring(eqIdx + 1).trimEnd();
      if (!state.constants[state.currentSchemaId]) state.constants[state.currentSchemaId] = {};
      state.constants[state.currentSchemaId][col] = rawVal === "^" ? null : adaptive.decodeHdrVal(rawVal);
    }
    return;
  }
  if (line.startsWith("Q:")) {
    state.adaptiveMode = true;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 2 && state.currentSchemaId) {
      const col = state.exp(line.substring(2, eqIdx));
      const parts = line.substring(eqIdx + 1).split(",");
      const start = parseInt(parts[0], 36);
      const step = parts.length > 1 ? parseInt(parts[1], 36) : 0;
      if (!state.sequences[state.currentSchemaId]) state.sequences[state.currentSchemaId] = {};
      state.sequences[state.currentSchemaId][col] = { start, step };
    }
    return;
  }
  if (line.startsWith("FP:")) {
    state.adaptiveMode = true;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 3 && state.currentSchemaId) {
      if (!state.fpCols[state.currentSchemaId]) state.fpCols[state.currentSchemaId] = {};
      const lhs = line.substring(3, eqIdx);
      const rhs = line.substring(eqIdx + 1);
      const lhsNum = parseInt(lhs, 10);
      if (!isNaN(lhsNum) && String(lhsNum) === lhs) {
        const cols = rhs.split(",").map((c) => state.exp(c.trim()));
        for (const col of cols) state.fpCols[state.currentSchemaId][col] = lhsNum;
      } else {
        const col = state.exp(lhs);
        const precision = parseInt(rhs, 10);
        state.fpCols[state.currentSchemaId][col] = precision;
      }
    }
    return;
  }
  if ((line.startsWith("DL:") || line.startsWith("DELTA:")) && state.currentSchemaId) {
    state.adaptiveMode = true;
    const prefix = line.startsWith("DL:") ? 3 : 6;
    const eqIdx = line.indexOf("=");
    if (eqIdx > prefix) {
      const col = state.exp(line.substring(prefix, eqIdx));
      const firstVal = parseInt(line.substring(eqIdx + 1), 10);
      if (!state.deltaFirstValues[state.currentSchemaId]) state.deltaFirstValues[state.currentSchemaId] = {};
      if (!state.deltaState[state.currentSchemaId]) state.deltaState[state.currentSchemaId] = {};
      state.deltaFirstValues[state.currentSchemaId][col] = firstVal;
      state.deltaState[state.currentSchemaId][col] = firstVal;
    }
    return;
  }
  if (line.startsWith("QF:")) {
    state.adaptiveMode = true;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 3 && state.currentSchemaId) {
      const col = state.exp(line.substring(3, eqIdx));
      const parts = line.substring(eqIdx + 1).split(",");
      const start = parseFloat(parts[0]);
      const step = parseFloat(parts[1]);
      const dec = (n) => {
        const s = n.toFixed(10).replace(/0+$/, "");
        const d = s.indexOf(".");
        return d < 0 ? 0 : s.length - d - 1;
      };
      const precision = Math.max(dec(start), dec(step));
      if (!state.floatSequences[state.currentSchemaId]) state.floatSequences[state.currentSchemaId] = {};
      state.floatSequences[state.currentSchemaId][col] = { start, step, precision };
    }
    return;
  }
  if (line.startsWith("X:")) {
    state.adaptiveMode = true;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 2 && state.currentSchemaId) {
      const col = state.exp(line.substring(2, eqIdx));
      const suffix = adaptive.decodeHdrVal(line.substring(eqIdx + 1));
      if (!state.suffixMap[state.currentSchemaId]) state.suffixMap[state.currentSchemaId] = {};
      state.suffixMap[state.currentSchemaId][col] = suffix;
    }
    return;
  }
  if (line.startsWith("QS:")) {
    state.adaptiveMode = true;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 3 && state.currentSchemaId) {
      const col = state.exp(line.substring(3, eqIdx));
      const rest = line.substring(eqIdx + 1);
      const parts = rest.split(",");
      const start = parseInt(parts[0], 36);
      const step = parseInt(parts[1], 36);
      const prefix = adaptive.decodeHdrVal(parts.slice(2).join(","));
      if (!state.strSequences[state.currentSchemaId]) state.strSequences[state.currentSchemaId] = {};
      state.strSequences[state.currentSchemaId][col] = { prefix, start, step };
    }
    return;
  }
  if (line.startsWith("DICT:") || line.startsWith("D:")) {
    if (line.startsWith("D:defaults=") || line.startsWith("DICT:defaults=")) {
      state.adaptiveMode = true;
      if (state.currentSchemaId) {
        const ctx = stateManager.getContext(state.currentSchemaId);
        if (ctx) {
          if (!ctx.defaults) ctx.defaults = {};
          if (!state.parsedDefaults[state.currentSchemaId]) state.parsedDefaults[state.currentSchemaId] = {};
          let rhs = line.substring(line.indexOf("=") + 1);
          if (rhs.startsWith("{")) rhs = rhs.slice(1, rhs.endsWith("}") ? -1 : void 0);
          splitEscaped(rhs, ",").forEach((pair) => {
            const eqIdx = pair.indexOf("=");
            if (eqIdx < 1) return;
            const col = state.exp(pair.substring(0, eqIdx));
            const val = adaptive.decodeHdrVal(pair.substring(eqIdx + 1));
            if (ctx.defaults) ctx.defaults[col] = val;
            if (state.currentSchemaId) state.parsedDefaults[state.currentSchemaId][col] = val;
          });
        }
      }
      return;
    }
    const eqIdx2 = line.indexOf("=");
    if (eqIdx2 > 2 && state.currentSchemaId) {
      const colName = state.exp(line.substring(line.indexOf(":") + 1, eqIdx2));
      const rhs = line.substring(eqIdx2 + 1);
      const mapping = {};
      if (rhs.startsWith("{")) {
        const inner = rhs.slice(1, rhs.endsWith("}") ? -1 : void 0);
        splitEscaped(inner, ",").forEach((e) => {
          const colonIdx = e.indexOf(":");
          if (colonIdx > 0) {
            const tokenStr = e.substring(0, colonIdx);
            const valStr = adaptive.decodeHdrVal(e.substring(colonIdx + 1));
            const numericToken = parseInt(tokenStr, 36);
            if (!isNaN(numericToken)) mapping[tokenStr] = valStr;
          }
        });
      } else {
        splitEscaped(rhs, ",").forEach((valStr, idx) => {
          mapping[idx.toString(36)] = adaptive.decodeHdrVal(valStr);
        });
      }
      stateManager.setDictionary(state.currentSchemaId, colName, mapping);
    }
    return;
  }
  if (line.startsWith("DC:")) {
    if (state.currentSchemaId) {
      const cols = line.substring(3).split(",").map((c) => state.exp(c.trim()));
      state.decCols[state.currentSchemaId] = new Set(cols);
    }
    return;
  }
  if (line.startsWith("LY:NM")) {
    return;
  }
  if (line.startsWith("NM:")) {
    state.adaptiveMode = true;
    const eqIdx = line.indexOf("=");
    if (eqIdx > 3 && state.currentSchemaId) {
      const col = state.exp(line.substring(3, eqIdx));
      const parts = line.substring(eqIdx + 1).split(",").map(Number);
      if (parts.length === 4) {
        if (!state.normCols[state.currentSchemaId]) state.normCols[state.currentSchemaId] = {};
        state.normCols[state.currentSchemaId][col] = { mean: parts[0], std: parts[1], sigmaT: parts[2], mT: parts[3] };
      }
    }
    return;
  }
  if (line.startsWith("F:") && state.currentSchemaId) {
    if (line === "F:csv") state.csvMode = true;
    return;
  }
  if (line.startsWith("@") && line.endsWith(":")) {
    state.currentBlockTable = line.substring(1, line.length - 1);
    const ctx = stateManager.getContext(state.currentBlockTable);
    if (ctx && state.activeColumns === null) {
      state.activeColumns = ctx.columns.filter((c) => {
        const hasConst = state.constants[state.currentBlockTable] && state.constants[state.currentBlockTable][c] !== void 0;
        const hasSeq = state.sequences[state.currentBlockTable] && state.sequences[state.currentBlockTable][c] !== void 0;
        const hasFSeq = state.floatSequences[state.currentBlockTable] && state.floatSequences[state.currentBlockTable][c] !== void 0;
        const hasSSeq = state.strSequences[state.currentBlockTable] && state.strSequences[state.currentBlockTable][c] !== void 0;
        return !hasConst && !hasSeq && !hasFSeq && !hasSSeq;
      });
    }
    return;
  }
}

// src/decoder/adaptive/row-reconstructor.ts
function reconstructAdaptiveRow(tokens, context, stateManager, adaptive, state) {
  const obj = {};
  const { columns, types, schemaId } = context;
  const activeCols = state.activeColumns || [];
  let tokenIdx = 0;
  const decodedValues = {};
  for (let i = 0; i < activeCols.length; i++) {
    const col = activeCols[i];
    const type = types[col] || "s";
    const dataPart = tokens[tokenIdx];
    tokenIdx++;
    let val;
    if (dataPart === void 0 || dataPart === "~") {
      const defDict = state.parsedDefaults[schemaId] || {};
      if (defDict[col] !== void 0) {
        const ctx = stateManager.getContext(schemaId);
        const globalDict = stateManager.getDictionary(schemaId, "__global__");
        const colDict = stateManager.getDictionary(schemaId, col);
        const dictToUse = Object.keys(colDict).length > 0 ? colDict : globalDict;
        const defToken = defDict[col];
        let represents = null;
        for (const [k, v] of Object.entries(dictToUse)) {
          if (String(v) === defToken) {
            represents = k;
            break;
          }
        }
        if (represents !== null) {
          val = adaptive.decompress(represents, col, type, schemaId, state.csvMode);
        } else {
          val = adaptive.decompress(defToken, col, type, schemaId, state.csvMode);
          if (type === "i") {
            const isDec = state.decCols[schemaId]?.has(col);
            if (state.fpCols[schemaId]?.[col] !== void 0) {
              val = parseInt(defToken, isDec ? 10 : 36) / Math.pow(10, state.fpCols[schemaId][col]);
            } else {
              val = parseInt(defToken, isDec ? 10 : 36);
            }
          }
        }
      } else {
        val = null;
      }
    } else if (dataPart === "^") {
      val = null;
    } else if (state.normCols[schemaId] && state.normCols[schemaId][col] !== void 0) {
      const { mean, std, sigmaT, mT } = state.normCols[schemaId][col];
      const token = parseInt(dataPart, 36);
      const z = (token - mT) / sigmaT;
      val = mean + z * std;
    } else if (state.deltaFirstValues[schemaId] && state.deltaFirstValues[schemaId][col] !== void 0) {
      if (state.rowCounter === 0) {
        val = state.deltaFirstValues[schemaId][col];
      } else {
        const delta = parseInt(dataPart, 10);
        val = state.deltaState[schemaId][col] + delta;
      }
      state.deltaState[schemaId][col] = val;
    } else if (type === "i") {
      const isDec = state.decCols[schemaId] && state.decCols[schemaId].has(col);
      val = parseInt(dataPart, isDec ? 10 : 36);
      if (state.fpCols[schemaId] && state.fpCols[schemaId][col] !== void 0) {
        val = val / Math.pow(10, state.fpCols[schemaId][col]);
      }
    } else {
      val = adaptive.decompress(dataPart, col, type, schemaId, state.csvMode);
    }
    if (val !== null && state.suffixMap[schemaId] && state.suffixMap[schemaId][col]) {
      val = String(val) + state.suffixMap[schemaId][col];
    }
    decodedValues[col] = val;
    obj[col] = val;
  }
  state.rowCounter++;
  columns.forEach((col) => {
    if (state.constants[schemaId] && state.constants[schemaId][col] !== void 0) {
      obj[col] = state.constants[schemaId][col];
    } else if (state.sequences[schemaId] && state.sequences[schemaId][col]) {
      const seq = state.sequences[schemaId][col];
      obj[col] = seq.start + seq.step * (state.rowCounter - 1);
    } else if (state.floatSequences[schemaId] && state.floatSequences[schemaId][col]) {
      const seq = state.floatSequences[schemaId][col];
      const scale = Math.pow(10, seq.precision);
      obj[col] = Math.round((seq.start + seq.step * (state.rowCounter - 1)) * scale) / scale;
    } else if (state.strSequences[schemaId] && state.strSequences[schemaId][col]) {
      const sq = state.strSequences[schemaId][col];
      const n = sq.start + sq.step * (state.rowCounter - 1);
      obj[col] = sq.prefix + n;
    } else if (!(col in decodedValues)) {
      obj[col] = null;
    }
  });
  return obj;
}
function reconstructRow(tokens, context, adaptive, csvMode = false) {
  const obj = {};
  const { columns, types, schemaId } = context;
  let tokenIdx = 0;
  columns.forEach((col) => {
    const type = types[col] || "s";
    if (type.startsWith("@Sub")) {
      const subKeysMatch = type.match(/\((.*)\)/);
      const subKeys = subKeysMatch ? subKeysMatch[1].split("|") : ["v1", "v2"];
      const subObj = {};
      subKeys.forEach((sk) => {
        const rawV = tokens[tokenIdx++];
        subObj[sk] = adaptive.decompress(rawV || "", col, "str", schemaId);
      });
      obj[col] = subObj;
    } else {
      const rawValue = tokens[tokenIdx++] ?? "";
      obj[col] = adaptive.decompress(rawValue, col, type, schemaId, csvMode);
    }
  });
  return obj;
}

// src/decoder/adaptive/adaptive-decoder.ts
var AdaptiveDecoder = class {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.adaptive = new AdaptiveEngine(stateManager);
  }
  decode(tron) {
    if (!tron || tron.trim() === "") return [];
    const lines = tron.split("\n");
    const result = [];
    const state = new AdaptiveDecoderState();
    lines.forEach((line) => {
      line = line.trimStart();
      if (!line) return;
      if (line.startsWith("SCHEMA:") || line.startsWith("S:") || line.startsWith("A:") || line.startsWith("C:") || line.startsWith("Q:") || line.startsWith("QF:") || line.startsWith("FP:") || line.startsWith("DL:") || line.startsWith("DELTA:") || line.startsWith("X:") || line.startsWith("QS:") || line.startsWith("DICT:") || line.startsWith("D:") || line.startsWith("DC:") || line.startsWith("LY:") || line.startsWith("NM:") || line.startsWith("F:") || line.startsWith("@") && line.endsWith(":")) {
        parseHeader(line, state, this.stateManager, this.adaptive);
        return;
      }
      if (line.startsWith("CK:") || line.startsWith("END:") || line.startsWith("EX:") || line.startsWith("LEGEND:")) {
        return;
      }
      if (line.startsWith("!")) {
        if (!state.currentBlockTable) return;
        const dataPart = line.substring(1);
        const tokens = state.csvMode ? splitCsvRow(dataPart) : splitEscaped(dataPart, " ");
        const ctx = this.stateManager.getContext(state.currentBlockTable);
        if (ctx) {
          const obj = reconstructRow(tokens, ctx, this.adaptive, state.csvMode);
          result.push(obj);
          state.rowCounter++;
        }
        return;
      }
      if (line.startsWith("*")) {
        const bracketIdx = line.indexOf("[");
        if (bracketIdx > 0 && line.endsWith("]")) {
          const countToken = line.substring(1, bracketIdx);
          const rleCount = parseInt(countToken, 36);
          const dataPart = line.substring(bracketIdx + 1, line.length - 1);
          if (!state.currentBlockTable) return;
          const ctx = this.stateManager.getContext(state.currentBlockTable);
          if (!ctx) return;
          const tokens = dataPart === "" ? [] : state.csvMode ? splitCsvRow(dataPart) : splitEscaped(dataPart, " ");
          for (let k = 0; k < rleCount; k++) {
            if (state.adaptiveMode) {
              result.push(reconstructAdaptiveRow(tokens, ctx, this.stateManager, this.adaptive, state));
            } else {
              result.push(reconstructRow(tokens, ctx, this.adaptive, state.csvMode));
            }
          }
        }
        return;
      }
      if (state.currentBlockTable) {
        const ctx = this.stateManager.getContext(state.currentBlockTable);
        if (ctx) {
          const dataPart = line === "." ? "" : line;
          const tokens = dataPart === "" ? [] : state.csvMode ? splitCsvRow(dataPart) : splitEscaped(dataPart, " ");
          if (state.adaptiveMode) {
            result.push(reconstructAdaptiveRow(tokens, ctx, this.stateManager, this.adaptive, state));
          } else {
            result.push(reconstructRow(tokens, ctx, this.adaptive, state.csvMode));
          }
        }
      }
    });
    return result;
  }
};

// src/decoder/decoder.ts
var LoonDecoder = class {
  constructor(stateManager) {
    this.adaptiveDecoder = new AdaptiveDecoder(stateManager);
  }
  decode(tron) {
    if (!tron || tron.trim() === "") return [];
    const trimmed = tron.trimStart();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(tron);
        if (parsed && Array.isArray(parsed.S) && Array.isArray(parsed.R)) {
          return decodeJSONHybrid(parsed);
        }
      } catch {
      }
    }
    if (!tron.startsWith("SCHEMA:") && !tron.startsWith("S:")) {
      if (trimmed.startsWith("#")) return decodeMicro(tron);
      return decodeCompact(tron);
    }
    return this.adaptiveDecoder.decode(tron);
  }
};

// src/encoder/compact.ts
function encodeCompact(data) {
  let output = "";
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    let line = "";
    const keys = Object.keys(row);
    for (let j = 0; j < keys.length; j++) {
      const raw = row[keys[j]];
      let val;
      if (raw === null || raw === void 0) {
        val = "^";
      } else if (typeof raw === "object") {
        val = "\\J" + JSON.stringify(raw).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      } else {
        val = String(raw).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
        if (val.startsWith("{") || val.startsWith("[")) {
          val = "\\S" + val;
        }
      }
      line += keys[j] + ": " + val + (j < keys.length - 1 ? "\n" : "");
    }
    output += line + (i < data.length - 1 ? "\n---\n" : "");
  }
  return output;
}

// src/encoder/micro.ts
function encodeMicro(data, fields) {
  if (!data || data.length === 0) return "";
  const keep = fields && fields.length > 0 ? new Set(fields) : null;
  const cols = keep ? Object.keys(data[0]).filter((k) => keep.has(k)) : Object.keys(data[0]);
  let output = `#${cols.join(",")}
`;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const tokens = cols.map((c) => {
      const v = row[c];
      if (v === null || v === void 0) return "^";
      return String(v).replace(/,/g, "\\,").replace(/\n/g, "\\n");
    });
    output += tokens.join(",") + (i < data.length - 1 ? "\n" : "");
  }
  return output;
}

// src/encoder/utils.ts
function detectColumnType(data, key) {
  let allNum = true;
  let allBool = true;
  let hasFloat = false;
  let allArr = true;
  let allObj = true;
  let hasAny = false;
  for (let i = 0; i < data.length; i++) {
    const val = data[i][key];
    if (val === null || val === void 0 || val === "") continue;
    hasAny = true;
    if (typeof val !== "number") allNum = false;
    else if (!Number.isInteger(val)) hasFloat = true;
    if (typeof val !== "boolean") allBool = false;
    if (!Array.isArray(val)) allArr = false;
    if (typeof val !== "object" || Array.isArray(val) || val === null) allObj = false;
  }
  if (!hasAny) return "s";
  if (allArr) return "a";
  if (allBool) return "b";
  if (allNum) return hasFloat ? "f" : "i";
  if (allObj) return "o";
  return "s";
}

// src/encoder/json-hybrid.ts
function encodeJSONHybrid(data) {
  if (!data || data.length === 0) return '{"S":[],"T":[],"R":[]}';
  const colSet = /* @__PURE__ */ new Set();
  for (const row of data) for (const k of Object.keys(row)) colSet.add(k);
  const columns = Array.from(colSet);
  const types = columns.map((col) => detectColumnType(data, col));
  const rows = [];
  for (const row of data) {
    const arr = [];
    for (const col of columns) {
      const v = row[col];
      arr.push(v === void 0 ? null : v);
    }
    rows.push(arr);
  }
  return JSON.stringify({ S: columns, T: types, R: rows });
}

// src/encoder/adaptive/adaptive-encoder.ts
var AdaptiveEncoder = class {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.adaptive = new AdaptiveEngine(stateManager);
  }
  encodeAdaptive(data, options = {}) {
    if (!data || data.length === 0) return "";
    const tableId = options.tableId || "T1";
    const target = options.target ?? "transmission";
    const csvMode = true;
    const isLocal = target === "local";
    const anchorRow = target === "llm" || isLocal;
    const endSentinel = target === "llm" || isLocal;
    const legend = false;
    const DEC_THRESHOLD = 30;
    const decThreshold = isLocal ? Infinity : target === "llm" ? DEC_THRESHOLD : 0;
    const colSet = /* @__PURE__ */ new Set();
    for (const row of data) for (const k of Object.keys(row)) colSet.add(k);
    const allColumns = Array.from(colSet);
    const types = {};
    for (const key of allColumns) {
      types[key] = this.detectColumnType(data, key);
    }
    const constants = {};
    for (const col of allColumns) {
      const first = data[0][col];
      let isConst = true;
      for (let i = 1; i < data.length; i++) {
        if (data[i][col] !== first) {
          isConst = false;
          break;
        }
      }
      if (isConst) constants[col] = first;
    }
    const sequences = {};
    for (const col of allColumns) {
      if (col in constants) continue;
      if (typeof data[0][col] !== "number" || !Number.isInteger(data[0][col])) continue;
      if (data.length < 2) continue;
      const start = data[0][col];
      const step = data[1][col] - data[0][col];
      if (step === 0) continue;
      let isSeq = true;
      for (let i = 2; i < data.length; i++) {
        if (data[i][col] !== start + step * i) {
          isSeq = false;
          break;
        }
      }
      if (isSeq) sequences[col] = { start, step };
    }
    const floatSequences = {};
    for (const col of allColumns) {
      if (col in constants || col in sequences) continue;
      if (typeof data[0][col] !== "number" || Number.isInteger(data[0][col])) continue;
      if (data.length < 3) continue;
      const start = data[0][col];
      const step = parseFloat((data[1][col] - data[0][col]).toFixed(10));
      if (step === 0) continue;
      const dec2 = (n) => {
        const s = n.toFixed(10).replace(/0+$/, "");
        const d = s.indexOf(".");
        return d < 0 ? 0 : s.length - d - 1;
      };
      const precision = Math.max(dec2(start), dec2(step));
      const scale = Math.pow(10, precision);
      let isSeq = true;
      for (let i = 2; i < data.length; i++) {
        const expected = Math.round((start + step * i) * scale) / scale;
        if (data[i][col] !== expected) {
          isSeq = false;
          break;
        }
      }
      if (isSeq) floatSequences[col] = { start, step, precision };
    }
    const dec = (n) => {
      const s = Math.abs(n).toFixed(10).replace(/0+$/, "");
      const d = s.indexOf(".");
      return d < 0 ? 0 : s.length - d - 1;
    };
    const fpCols = {};
    for (const col of allColumns) {
      if (col in constants || col in sequences || col in floatSequences) continue;
      if (this.detectColumnType(data, col) !== "f") continue;
      let maxDec = 0;
      for (const row of data) {
        const v = row[col];
        if (v === null || v === void 0 || !Number.isFinite(v)) continue;
        maxDec = Math.max(maxDec, dec(v));
      }
      if (maxDec >= 1 && maxDec <= 6) {
        const scale = Math.pow(10, maxDec);
        let lossless = true;
        for (const row of data) {
          const v = row[col];
          if (v === null || v === void 0 || !Number.isFinite(v)) continue;
          if (Math.round(v * scale) / scale !== v) {
            lossless = false;
            break;
          }
        }
        if (lossless) fpCols[col] = maxDec;
      }
    }
    const normCols = {};
    if (options.norm) {
      const SIGMA_T = 25, M_T = 500;
      const normTargets = options.norm === true ? allColumns.filter((c) => types[c] === "f" && !(c in constants) && !(c in sequences) && !(c in floatSequences) && !(c in fpCols)) : options.norm.filter((c) => types[c] === "f" && !(c in constants) && !(c in sequences) && !(c in floatSequences) && !(c in fpCols));
      for (const col of normTargets) {
        const vals = data.map((r) => r[col]).filter((v) => typeof v === "number" && Number.isFinite(v));
        if (vals.length < 2) continue;
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
        if (std === 0) continue;
        normCols[col] = { mean, std, sigmaT: SIGMA_T, mT: M_T };
      }
    }
    let activeColumnsRaw = allColumns.filter((c) => !(c in constants) && !(c in sequences) && !(c in floatSequences));
    const suffixes = {};
    for (const col of activeColumnsRaw) {
      if (types[col] !== "s") continue;
      const uniqueVals = [];
      const seen = /* @__PURE__ */ new Set();
      for (let i = 0; i < data.length; i++) {
        const v = data[i][col];
        if (typeof v !== "string" || seen.has(v)) continue;
        seen.add(v);
        uniqueVals.push(v);
      }
      if (uniqueVals.length < 2) continue;
      const suffix = this.findCommonSuffix(uniqueVals);
      if (suffix) suffixes[col] = suffix;
    }
    if (Object.keys(suffixes).length > 0) {
      data = data.map((row) => {
        const r = { ...row };
        for (const col in suffixes) {
          if (typeof r[col] === "string") {
            r[col] = r[col].slice(0, -suffixes[col].length);
          }
        }
        return r;
      });
    }
    const stringSequences = {};
    for (const col of activeColumnsRaw) {
      if (types[col] !== "s" || data.length < 2) continue;
      const first = String(data[0][col]);
      const prefix = first.replace(/[0-9]+$/, "");
      if (prefix === first || prefix.length === 0) continue;
      let allMatch = true;
      const nums = [];
      for (let i = 0; i < data.length; i++) {
        const v = String(data[i][col]);
        if (!v.startsWith(prefix)) {
          allMatch = false;
          break;
        }
        const numStr = v.substring(prefix.length);
        const num = parseInt(numStr, 10);
        if (isNaN(num) || num.toString() !== numStr) {
          allMatch = false;
          break;
        }
        nums.push(num);
      }
      if (!allMatch || nums.length < 2) continue;
      const seqStart = nums[0];
      const seqStep = nums[1] - nums[0];
      if (seqStep === 0) continue;
      let isSeq = true;
      for (let i = 2; i < nums.length; i++) {
        if (nums[i] !== seqStart + seqStep * i) {
          isSeq = false;
          break;
        }
      }
      if (isSeq) stringSequences[col] = { prefix, start: seqStart, step: seqStep };
    }
    activeColumnsRaw = activeColumnsRaw.filter((c) => !(c in stringSequences));
    this.stateManager.registerContext(tableId, allColumns, types);
    const dictCols = activeColumnsRaw.filter(
      (c) => !(c in fpCols) && !(c in normCols) && types[c] !== "i" && types[c] !== "b" && types[c] !== "a"
    );
    this.adaptive.buildDictionaries(data, dictCols, tableId);
    const defaults = {};
    for (const col of activeColumnsRaw) {
      if (col in normCols) continue;
      const freq = {};
      for (let i = 0; i < data.length; i++) {
        const norm = this.adaptive.normalize(data[i][col]);
        freq[norm] = (freq[norm] || 0) + 1;
      }
      let best = "";
      let max = 0;
      for (const val in freq) {
        if (freq[val] > max) {
          max = freq[val];
          best = val;
        }
      }
      if (max > data.length * 0.3) defaults[col] = best;
    }
    const nonDefCols = activeColumnsRaw.filter((c) => !(c in defaults));
    const defCols = activeColumnsRaw.filter((c) => c in defaults);
    const activeColumns = [...nonDefCols, ...defCols];
    const ctx = this.stateManager.getContext(tableId);
    const globalDict = this.stateManager.getDictionary(tableId, "__global__");
    if (globalDict) {
      for (const col of activeColumns) {
        const colDict = this.stateManager.getDictionary(tableId, col);
        if (!colDict || Object.keys(colDict).length < 15) continue;
        const seen = /* @__PURE__ */ new Set();
        let allCovered = true;
        for (let j = 0; j < data.length && allCovered; j++) {
          const val = data[j][col];
          if (typeof val !== "string") {
            allCovered = false;
            break;
          }
          if (seen.has(val)) continue;
          seen.add(val);
          let found = false;
          for (const prefix of Object.keys(globalDict)) {
            if (val.startsWith(prefix)) {
              found = true;
              break;
            }
          }
          if (!found) allCovered = false;
        }
        if (allCovered) delete ctx.dictionary[col];
      }
    }
    const intActiveCols = allColumns.filter(
      (c) => types[c] === "i" && !(c in constants) && !(c in sequences) && !(c in floatSequences) && !(c in stringSequences) && !(c in fpCols)
    );
    const useDecimal = data.length * intActiveCols.length < decThreshold;
    const decColSet = new Set(useDecimal ? intActiveCols : []);
    const deltaCols = {};
    if (data.length >= 4 && target === "transmission") {
      for (const col of activeColumns) {
        if (types[col] !== "i" || col in fpCols || decColSet.has(col)) continue;
        const vals = [];
        let allInt = true;
        for (const row of data) {
          const v = row[col];
          if (v === null || v === void 0 || !Number.isInteger(v)) {
            allInt = false;
            break;
          }
          vals.push(v);
        }
        if (!allInt || vals.length < 4) continue;
        const avgAbsVal = vals.reduce((s, v) => s + Math.abs(v), 0) / vals.length;
        if (avgAbsVal <= 200) continue;
        const deltas = vals.slice(1).map((v, i) => Math.abs(v - vals[i]));
        const avgAbsDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
        if (avgAbsDelta / avgAbsVal < 0.35) deltaCols[col] = vals[0];
      }
    }
    const abbrevMap = {};
    let useAbbreviation = false;
    if (!isLocal) {
      const candidateAbbrev = {};
      const used = /* @__PURE__ */ new Set();
      for (const col of allColumns) {
        let abbrev = this.makeAbbrev(col);
        let candidate = abbrev;
        let n = 2;
        while (used.has(candidate)) candidate = abbrev + n++;
        used.add(candidate);
        candidateAbbrev[col] = candidate;
      }
      let charSaved = 0;
      for (const col of allColumns) {
        const abbrev = candidateAbbrev[col];
        const saved = col.length - abbrev.length;
        if (saved <= 0) continue;
        let appearances = 1;
        if (col in constants) appearances++;
        if (col in sequences) appearances++;
        if (col in floatSequences) appearances++;
        if (col in fpCols) appearances++;
        if (col in suffixes) appearances++;
        if (col in stringSequences) appearances++;
        if (col in defaults) appearances++;
        if (ctx.dictionary[col] !== void 0) appearances++;
        charSaved += saved * appearances;
      }
      const aLineCost = 3 + allColumns.join(",").length;
      if (charSaved > aLineCost) {
        Object.assign(abbrevMap, candidateAbbrev);
        useAbbreviation = true;
      }
    }
    const ab = (col) => useAbbreviation ? abbrevMap[col] ?? col : col;
    let output = "";
    let colDefs = "";
    for (let i = 0; i < allColumns.length; i++) {
      colDefs += ab(allColumns[i]) + ":" + types[allColumns[i]] + (i < allColumns.length - 1 ? "," : "");
    }
    output += "S:@" + tableId + "[" + data.length + "]=[" + colDefs + "]\n";
    if (useAbbreviation) {
      output += "A:" + allColumns.join(",") + "\n";
    }
    if (decColSet.size > 0) {
      output += "DC:" + Array.from(decColSet).map((c) => ab(c)).join(",") + "\n";
    }
    for (const col in constants) {
      const cv = constants[col];
      if (cv === null || cv === void 0) {
        output += "C:" + ab(col) + "=^\n";
      } else {
        output += "C:" + ab(col) + "=" + this.adaptive.encodeHdrVal(this.adaptive.normalize(cv)) + "\n";
      }
    }
    for (const col in sequences) {
      const s = sequences[col];
      if (isLocal) {
        output += "Q:" + ab(col) + "=" + s.start + "," + s.step + "\n";
      } else {
        output += "Q:" + ab(col) + "=" + s.start.toString(36) + "," + s.step.toString(36) + "\n";
      }
    }
    for (const col in floatSequences) {
      const s = floatSequences[col];
      output += "QF:" + ab(col) + "=" + s.start + "," + s.step + "\n";
    }
    {
      const byPrecision = {};
      for (const col in fpCols) {
        const p = fpCols[col];
        if (!byPrecision[p]) byPrecision[p] = [];
        byPrecision[p].push(ab(col));
      }
      for (const p in byPrecision) {
        output += "FP:" + p + "=" + byPrecision[p].join(",") + "\n";
      }
    }
    for (const col in suffixes) {
      output += "X:" + ab(col) + "=" + this.adaptive.encodeHdrVal(suffixes[col]) + "\n";
    }
    for (const col in stringSequences) {
      const sq = stringSequences[col];
      if (isLocal) {
        output += "QS:" + ab(col) + "=" + sq.start + "," + sq.step + "," + this.adaptive.encodeHdrVal(sq.prefix) + "\n";
      } else {
        output += "QS:" + ab(col) + "=" + sq.start.toString(36) + "," + sq.step.toString(36) + "," + this.adaptive.encodeHdrVal(sq.prefix) + "\n";
      }
    }
    const defKeys = Object.keys(defaults);
    if (defKeys.length > 0) {
      let defStr = "";
      for (let i = 0; i < defKeys.length; i++) {
        defStr += ab(defKeys[i]) + "=" + this.adaptive.encodeHdrVal(defaults[defKeys[i]]) + (i < defKeys.length - 1 ? "," : "");
      }
      output += "D:defaults=" + defStr + "\n";
    }
    for (const col in ctx.dictionary) {
      const mapping = ctx.dictionary[col];
      const sorted = Object.entries(mapping).sort(
        (a, b) => parseInt(a[1].toString(), 36) - parseInt(b[1].toString(), 36)
      );
      const valList = sorted.map(([val]) => this.adaptive.encodeHdrVal(val)).join(",");
      output += "D:" + ab(col) + "=" + valList + "\n";
    }
    if (legend) {
      const legendDictCols = Object.keys(ctx.dictionary).filter((c) => c !== "__global__");
      if (legendDictCols.length > 0) {
        const parts = [];
        for (const col of legendDictCols) {
          const m = ctx.dictionary[col];
          const entries = Object.entries(m).map(([val, tok]) => `${tok}=${val}`).join("|");
          parts.push(`${ab(col)}{${entries}}`);
        }
        output += "LEGEND:" + parts.join(";") + "\n";
      }
    }
    for (const col in deltaCols) {
      output += "DL:" + ab(col) + "=" + deltaCols[col] + "\n";
    }
    if (Object.keys(normCols).length > 0) {
      output += "LY:NM\n";
      for (const col in normCols) {
        const n = normCols[col];
        output += "NM:" + ab(col) + "=" + n.mean + "," + n.std + "," + n.sigmaT + "," + n.mT + "\n";
      }
    }
    output += "@" + tableId + ":\n";
    if (csvMode) output += "F:csv\n";
    const compressedRows = [];
    const rowSep = csvMode ? "," : " ";
    const deltaRowState = { ...deltaCols };
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const tokens = [];
      for (const col of activeColumns) {
        const val = row[col] ?? null;
        if (val === null) {
          tokens.push(csvMode && defaults[col] === void 0 ? "" : "^");
          continue;
        }
        if (normCols[col] !== void 0 && typeof val === "number") {
          const { mean, std, sigmaT, mT } = normCols[col];
          const z = (val - mean) / std;
          const token = Math.max(0, Math.min(999, Math.round(z * sigmaT + mT)));
          tokens.push(isLocal ? String(token) : token.toString(36));
          continue;
        }
        if (deltaCols[col] !== void 0 && typeof val === "number") {
          const delta = val - deltaRowState[col];
          deltaRowState[col] = val;
          tokens.push(delta.toString(10));
          continue;
        }
        if (fpCols[col] !== void 0 && typeof val === "number") {
          const scale = Math.pow(10, fpCols[col]);
          tokens.push(isLocal ? String(Math.round(val * scale)) : Math.round(val * scale).toString(36));
          continue;
        }
        const normVal = this.adaptive.normalize(val);
        if (defaults[col] !== void 0 && normVal === defaults[col]) {
          tokens.push("~");
        } else if (decColSet.has(col) && typeof val === "number" && Number.isInteger(val)) {
          tokens.push(val.toString(10));
        } else {
          const compressed = this.adaptive.compress(val, col, tableId, csvMode);
          const colDict = this.stateManager.getDictionary(tableId, col);
          if (colDict && Object.keys(colDict).length > 0) {
            const norm = this.adaptive.normalize(val);
            if (colDict[norm] === void 0 && !compressed.startsWith("$")) {
              tokens.push("!" + compressed);
            } else {
              tokens.push(compressed);
            }
          } else {
            tokens.push(compressed);
          }
        }
      }
      while (tokens.length > 0 && tokens[tokens.length - 1] === "~") {
        tokens.pop();
      }
      if (tokens.length > 0 && tokens.every((t) => t === "")) {
        tokens[tokens.length - 1] = "^";
      }
      compressedRows.push(tokens.join(rowSep));
    }
    const buildAnchor = () => {
      const aTokens = ["!"];
      const row0 = data[0];
      for (const col of activeColumns) {
        const val = row0[col];
        if (val === null || val === void 0) {
          aTokens.push(csvMode ? "" : "^");
          continue;
        }
        const t = types[col];
        if (t === "b") {
          aTokens.push(val ? "1" : "0");
        } else if (t === "i" || t === "f" || fpCols[col] !== void 0) {
          aTokens.push(String(val));
        } else if (t === "a") {
          aTokens.push(this.adaptive.encodeArray(val, csvMode));
        } else {
          const s = String(val);
          aTokens.push(csvMode ? this.adaptive.encodeCsvVal(s) : this.adaptive.encodeStrVal(s));
        }
      }
      return aTokens.join(rowSep);
    };
    const startIdx = anchorRow && data.length > 0 ? 1 : 0;
    if (anchorRow && data.length > 0) {
      output += buildAnchor() + "\n";
    }
    let ri = startIdx;
    while (ri < compressedRows.length) {
      if (isLocal) {
        const rowStr2 = compressedRows[ri];
        output += (rowStr2 === "" ? "." : rowStr2) + "\n";
        ri++;
        continue;
      }
      let count = 1;
      while (ri + count < compressedRows.length && compressedRows[ri + count] === compressedRows[ri]) {
        count++;
      }
      const rowStr = compressedRows[ri];
      if (count > 1) {
        if (rowStr === "") {
          output += "*" + count.toString(36) + "[]\n";
        } else {
          output += "*" + count.toString(36) + "[" + rowStr + "]\n";
        }
      } else {
        output += (rowStr === "" ? "." : rowStr) + "\n";
      }
      ri += count;
    }
    if (target === "llm" || isLocal) {
      const firstIntCol = activeColumns.find((c) => types[c] === "i");
      let intSum = 0;
      if (firstIntCol) {
        for (const row of data) {
          const v = row[firstIntCol];
          if (typeof v === "number") intSum += v;
        }
      }
      output += "CK:" + data.length + "," + activeColumns.length + (firstIntCol ? "," + intSum : "") + "\n";
    }
    if (endSentinel) output += "END:@" + tableId + "\n";
    if ((target === "llm" || isLocal) && data.length > 0) {
      const row0 = data[0];
      const pairs = [];
      for (const col of allColumns) {
        const v = row0[col];
        if (v === null || v === void 0) pairs.push(col + ":^");
        else if (typeof v === "string") pairs.push(col + ":" + v);
        else pairs.push(col + ":" + String(v));
      }
      output += "EX:row0=[" + pairs.join(",") + "]\n";
    }
    return output.trim();
  }
};

// src/encoder/encoder.ts
var LoonEncoder = class {
  constructor(stateManager) {
    this.adaptiveEncoder = new AdaptiveEncoder(stateManager);
  }
  /**
   * Compact mode encoder.
   * Each record is key: value pairs separated by ---.
   */
  encodeCompact(data) {
    return encodeCompact(data);
  }
  /**
   * Adaptive-mode encoder.
   * Selects compression features automatically based on options target.
   */
  encodeAdaptive(data, options = {}) {
    return this.adaptiveEncoder.encodeAdaptive(data, options);
  }
  /**
   * Micro mode encoder.
   */
  encodeMicro(data, fields) {
    return encodeMicro(data, fields);
  }
  /**
   * JSON-hybrid encoder.
   */
  encodeJSONHybrid(data) {
    return encodeJSONHybrid(data);
  }
};

// src/state/state-manager.ts
var StateManager = class {
  constructor() {
    this.contexts = /* @__PURE__ */ new Map();
    /** Reverse dictionary cache: schemaId → column → { token → value } */
    this.reverseCache = /* @__PURE__ */ new Map();
  }
  /** Registers a new schema context. */
  registerContext(schemaId, columns, types) {
    this.contexts.set(schemaId, {
      schemaId,
      columns,
      types,
      dictionary: {}
    });
  }
  getContext(schemaId) {
    return this.contexts.get(schemaId);
  }
  /** Registers a dictionary mapping for semantic compression. */
  registerDictionary(schemaId, column, mapping) {
    const ctx = this.contexts.get(schemaId);
    if (ctx) {
      if (!ctx.dictionary) ctx.dictionary = {};
      ctx.dictionary[column] = mapping;
    }
  }
  getDictionary(schemaId, column) {
    return this.contexts.get(schemaId)?.dictionary[column];
  }
  /** Returns a reverse lookup map (token → value) for O(1) decompress. Built lazily. */
  getReverseDictionary(schemaId, column) {
    const dict = this.getDictionary(schemaId, column);
    if (!dict) return void 0;
    let schemaCache = this.reverseCache.get(schemaId);
    if (!schemaCache) {
      schemaCache = {};
      this.reverseCache.set(schemaId, schemaCache);
    }
    if (!schemaCache[column]) {
      const rev = {};
      for (const [val, tok] of Object.entries(dict)) {
        rev[tok.toString()] = val;
      }
      schemaCache[column] = rev;
    }
    return schemaCache[column];
  }
  clear() {
    this.contexts.clear();
    this.reverseCache.clear();
  }
  /** Checks if a schema is already registered with a specific signature. */
  hasSchema(schemaId, signature) {
    const ctx = this.contexts.get(schemaId);
    return ctx?.columns.join(",") === signature;
  }
};

// src/utils/flatten.ts
function flattenRecord(obj, prefix = "") {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(result, flattenRecord(val, fullKey));
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}
function unflattenRecord(obj) {
  if (!Object.keys(obj).some((k) => k.includes("."))) return obj;
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const parts = key.split(".");
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in cursor) || cursor[parts[i]] === null || typeof cursor[parts[i]] !== "object" || Array.isArray(cursor[parts[i]])) {
        cursor[parts[i]] = {};
      }
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = val;
  }
  return result;
}

// src/utils/validate.ts
function checkType(val, type) {
  if (val === null || val === void 0) return null;
  switch (type) {
    case "i":
      if (!Number.isInteger(val))
        return { expected: "integer", got: `${typeof val}(${JSON.stringify(val)})` };
      break;
    case "f":
      if (typeof val !== "number" || !Number.isFinite(val))
        return { expected: "float", got: `${typeof val}(${JSON.stringify(val)})` };
      break;
    case "b":
      if (typeof val !== "boolean")
        return { expected: "boolean (true/false)", got: `${typeof val}(${JSON.stringify(val)})` };
      break;
    case "a":
      if (!Array.isArray(val))
        return { expected: "array", got: `${typeof val}(${JSON.stringify(val)})` };
      break;
    case "s":
      if (typeof val !== "string")
        return { expected: "string", got: `${typeof val}(${JSON.stringify(val)})` };
      break;
  }
  return null;
}
function parseSchema(loonString) {
  const lines = loonString.split("\n");
  const schemaLine = lines.find((l) => l.startsWith("S:") || l.startsWith("SCHEMA:"));
  if (!schemaLine) {
    return { declaredRows: void 0, columns: [], constantCols: /* @__PURE__ */ new Set(), isCompact: true };
  }
  const m = schemaLine.match(/(?:S|SCHEMA):@\w+(?:\[(\d+)\])?=\[(.+)\]/);
  if (!m) return { declaredRows: void 0, columns: [], constantCols: /* @__PURE__ */ new Set(), isCompact: false };
  const declaredRows = m[1] ? parseInt(m[1], 10) : void 0;
  const colDefs = (m[2] || "").split(",").map((f) => {
    const [abbrev, type] = f.trim().split(":");
    return { abbrev: (abbrev || "").trim(), type: (type || "s").trim() };
  });
  const aliasLine = lines.find((l) => l.startsWith("A:"));
  const fullNames = aliasLine ? aliasLine.substring(2).split(",").map((n) => n.trim()) : [];
  const columns = colDefs.map((cd, i) => ({
    name: fullNames[i] ?? cd.abbrev,
    type: cd.type
  }));
  const constantCols = /* @__PURE__ */ new Set();
  for (const line of lines) {
    if (!line.startsWith("C:")) continue;
    const eq = line.indexOf("=");
    if (eq > 2) {
      const abbrev = line.substring(2, eq).trim();
      const idx = colDefs.findIndex((c) => c.abbrev === abbrev);
      constantCols.add(idx >= 0 ? fullNames[idx] ?? abbrev : abbrev);
    }
  }
  return { declaredRows, columns, constantCols, isCompact: false };
}
function extractDataLines(loonString) {
  const lines = loonString.split("\n");
  const result = [];
  let inData = false;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!inData) {
      if (/^@\w+:$/.test(trimmed)) inData = true;
      continue;
    }
    if (trimmed.startsWith("F:") || trimmed.startsWith("END:") || trimmed === "") continue;
    const rleMatch = trimmed.match(/^\*(\w+)\[(.*)\]$/);
    if (rleMatch && rleMatch[1]) {
      const count = parseInt(rleMatch[1], 36);
      for (let k = 0; k < count; k++) result.push(trimmed);
      continue;
    }
    const rleSimple = trimmed.match(/^\*(\w+)$/);
    if (rleSimple && rleSimple[1]) {
      const count = parseInt(rleSimple[1], 36);
      for (let k = 0; k < count; k++) result.push(".");
      continue;
    }
    result.push(trimmed);
  }
  return result;
}
function validateDecode(loonString, decodedRows) {
  const errors = [];
  const schema = parseSchema(loonString);
  if (schema.isCompact) {
    for (let i = 0; i < decodedRows.length; i++) {
      const row = decodedRows[i];
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        errors.push({ row: i, col: "__record__", expected: "object", got: `${typeof row}` });
      }
    }
    return { ok: errors.length === 0, errors };
  }
  if (schema.declaredRows !== void 0 && decodedRows.length !== schema.declaredRows) {
    errors.push({
      row: -1,
      col: "__rowCount__",
      expected: `${schema.declaredRows} rows`,
      got: `${decodedRows.length} rows`
    });
  }
  const checkUpTo = schema.declaredRows !== void 0 ? Math.min(decodedRows.length, schema.declaredRows) : decodedRows.length;
  for (let i = 0; i < checkUpTo; i++) {
    const row = decodedRows[i];
    if (typeof row !== "object" || row === null) {
      errors.push({ row: i, col: "__record__", expected: "object", got: `${typeof row}` });
      continue;
    }
    for (const { name, type } of schema.columns) {
      if (schema.constantCols.has(name)) continue;
      const err = checkType(row[name], type);
      if (err) errors.push({ row: i, col: name, ...err });
    }
  }
  return { ok: errors.length === 0, errors };
}
function repairHint(loonString, errors) {
  if (errors.length === 0) return "";
  const lines = [];
  const dataLines = extractDataLines(loonString);
  const structural = errors.filter((e) => e.row < 0);
  const rowErrors = errors.filter((e) => e.row >= 0);
  lines.push(`LOON decode errors (${errors.length}):`);
  for (const e of structural) {
    lines.push(`\u2022 ${e.col}: expected ${e.expected}, got ${e.got}`);
  }
  const byRow = /* @__PURE__ */ new Map();
  for (const e of rowErrors) {
    if (!byRow.has(e.row)) byRow.set(e.row, []);
    byRow.get(e.row).push(e);
  }
  const affectedRows = Array.from(byRow.keys()).sort((a, b) => a - b);
  for (const rowIdx of affectedRows) {
    const errs = byRow.get(rowIdx);
    const parts = errs.map((e) => `"${e.col}": expected ${e.expected}, got ${e.got}`);
    lines.push(`\u2022 row ${rowIdx}: ${parts.join(" | ")}`);
  }
  if (affectedRows.length > 0 && dataLines.length > 0) {
    lines.push("");
    lines.push("Raw lines for affected rows:");
    for (const rowIdx of affectedRows) {
      const raw = dataLines[rowIdx];
      if (raw !== void 0) {
        lines.push(`row ${rowIdx}: ${raw}`);
      }
    }
  }
  return lines.join("\n");
}

// src/session.ts
function splitLoon(loon2) {
  const lines = loon2.split("\n");
  let blockLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^@\w+:$/.test(lines[i] || "")) {
      blockLine = i;
      break;
    }
  }
  if (blockLine < 0) {
    return { schema: loon2, dataBlock: "", full: loon2, schemaBytes: loon2.length, dataBytes: 0 };
  }
  const schema = lines.slice(0, blockLine + 1).join("\n");
  const dataBlock = lines.slice(blockLine + 1).join("\n");
  return { schema, dataBlock, full: loon2, schemaBytes: schema.length, dataBytes: dataBlock.length };
}
var LoonSession = class {
  constructor() {
    this.opts = {};
    this.split = null;
  }
  /**
   * Initializes the session with a representative dataset.
   * Encodes the full first batch and locks the schema.
   */
  init(data, opts = {}) {
    this.opts = opts;
    const l = new Loon();
    const full = l.toJSON(data, opts);
    l.reset();
    this.split = splitLoon(full);
    return this.split;
  }
  /** Schema block — inject into system prompt or first message header. */
  get schema() {
    return this.split?.schema ?? "";
  }
  /** Number of bytes in the schema block. */
  get schemaBytes() {
    return this.split?.schemaBytes ?? 0;
  }
  /**
   * Encodes a new batch. Returns ONLY the data rows block (no schema headers).
   * The LLM decodes them using the schema already in its context window.
   */
  encodeRows(data) {
    const l = new Loon();
    const full = l.toJSON(data, this.opts);
    l.reset();
    const s = splitLoon(full);
    return {
      schema: this.split?.schema ?? s.schema,
      dataBlock: s.dataBlock,
      full: s.full,
      schemaBytes: this.split?.schemaBytes ?? s.schemaBytes,
      dataBytes: s.dataBytes
    };
  }
  /**
   * Decodes a rows-only block using the cached schema.
   * Prepends the saved schema headers so the standard decoder works.
   */
  decode(rowBlock) {
    if (!this.split) throw new Error("Call init() first");
    const l = new Loon();
    const result = l.fromLOON(this.split.schema + "\n" + rowBlock);
    l.reset();
    return result;
  }
  /** Resets the session state. */
  reset() {
    this.split = null;
    this.opts = {};
  }
};

// src/utils/get-spec.ts
var SECTIONS = {
  base: `Data is in LOON Adaptive format. Decode rules:

S:@T1[N]=[col:type,\u2026]  \u2014 schema (i=int, f=float, s=str, b=bool, a=array).
                         Integer tokens are Base36 (a=10, z=35, 10=36) UNLESS the column
                         appears in DC:.
@TID:                   \u2014 start of the data block. F:csv on the next line means rows are
                         comma-delimited; otherwise rows are space-delimited.

Active columns = schema columns minus those declared via C: / Q: / QF: / QS:.
Fill active columns left-to-right from row tokens, then fill constants and sequences.

Special tokens: ^ = null | ~ = column default | !value = raw literal string`,
  compact: `Data is in LOON Compact format: each record is key: value pairs, one field per line,
records separated by ---. Types: numbers are numbers, true/false are booleans, ^ is null,
everything else is a string. Escape sequences: \\n, \\r, \\t, \\\\.`,
  abbreviations: `A:n1,n2,\u2026  \u2014 full column names. The schema S: uses short abbreviations; A: gives the real
names. ALWAYS use the full names from A: in your answer, never the abbreviated schema names.`,
  dec: `DC:col1,col2,\u2026  \u2014 these integer columns use PLAIN DECIMAL (parseInt base 10), NOT Base36.
All other integer columns use Base36. This only applies to columns listed in DC:.`,
  constants: `C:col=val  \u2014 constant column: every row has col=val; the column is OMITTED from row tokens.`,
  sequences: `Q:col=start,step   \u2014 integer sequence (both Base36): row[n].col = parseInt(start,36) + parseInt(step,36) \xD7 n. Column omitted from rows.
QF:col=start,step  \u2014 float sequence (plain decimal): row[n].col = start + step \xD7 n. Column omitted from rows.
QS:col=s,p,prefix  \u2014 string sequence: row[n].col = prefix + (parseInt(s,36) + parseInt(p,36) \xD7 n). Column omitted from rows.`,
  "fixed-point": `FP:d=col1,col2,\u2026  \u2014 fixed-point float: token is a Base36 integer, divide by 10^d to get the value.
Example: FP:2=price,cost \u2192 token "rr" in price = parseInt("rr",36) = 999 \u2192 999\xF7100 = 9.99.`,
  dictionaries: `D:col=v0,v1,\u2026          \u2014 positional dictionary: row token is a Base36 index into this list.
                         Token "0"\u2192v0, "1"\u2192v1, "a"\u2192v10 (Base36), etc.
D:defaults=col=val,\u2026   \u2014 default values. ~ in a row means "use this default". Trailing
                         missing tokens at the end of a row also use the column default.`,
  suffix: `X:col=suffix  \u2014 append suffix to every decoded value in this column. The column is absent
from row tokens; the suffix is added after decoding.`,
  rle: `*N[t1 t2 \u2026]  \u2014 run-length encoding: repeat the bracketed row N times (N in Base36).
*N[]          \u2014 repeat an all-defaults row N times.
.             \u2014 single all-defaults row.`,
  "llm-target": `First data line beginning with ! is the ANCHOR ROW: row 0 in fully literal form
(raw strings, plain decimal numbers, 1/0 booleans). Use it as ground truth to verify
your Base36/dict decoding of subsequent rows.

END:@T1  \u2014 sentinel after the last row. If absent, the payload may be truncated.`,
  delta: `DL:col=firstValue  \u2014 delta-encoded integer column. The first row value is firstValue.
Each subsequent row token is a PLAIN DECIMAL delta (NOT Base36). Accumulate:
  row[0].col = firstValue
  row[n].col = row[n-1].col + parseInt(token, 10)`,
  norm: `LY:NM  \u2014 this payload uses lossy normalization. Decoded values are approximate.

NM:col=mean,std,sigmaT,mT  \u2014 z-score normalized float column. Token is a Base36 integer
in [0,999]. Reverse transform:
  value = (parseInt(token, 36) - mT) / sigmaT \xD7 std + mean
Default sigmaT=25, mT=500 if omitted from the header.`,
  checksum: `CK:rowCount,colCount[,intSum]  \u2014 lightweight checksum. Verify your decoded output:
  - number of rows must equal rowCount
  - number of active columns must equal colCount
  - if intSum is present, the sum of the first integer column across all rows must match`,
  example: `EX:row0=[col:val,col:val,...]  \u2014 decoded row 0 in plain text.
Use this to verify your decoding is correct. Compare your decoded row 0 against this.`,
  local: `Data is in LOON Local format \u2014 a simplified table encoding.

S:@T1[N]=[col:type,...]  \u2014 schema. Types: i=integer, f=float, s=string, b=boolean, a=array.
ALL numbers are in plain decimal (no Base36). Rows are comma-separated.

C:col=val  \u2014 constant column, same value every row. Omitted from row data.
Q:col=start,step  \u2014 integer sequence: row[n].col = start + step \xD7 n.
FP:col=d  \u2014 fixed-point float: row token divided by 10^d gives the value.
D:col=v0,v1,...  \u2014 dictionary: row token is a decimal index (0,1,2,...) into this list.
D:defaults=col=val,...  \u2014 default values. ~ means use default. Missing trailing tokens = default.

First data row starts with ! \u2014 this is a plain-text anchor row (row 0 in readable form).
^ = null. END:@T1 = last row marker.

EX:row0=[...] at the end shows decoded row 0 for verification.
CK:rows,cols[,sum] is a checksum to verify your output.`
};
var HEADER_SECTION_MAP = [
  { pattern: /^A:/m, section: "abbreviations" },
  { pattern: /^(?:DC|DEC):/m, section: "dec" },
  { pattern: /^C:[^=]+=.*/m, section: "constants" },
  { pattern: /^QF?:/m, section: "sequences" },
  { pattern: /^QS:/m, section: "sequences" },
  { pattern: /^FP:/m, section: "fixed-point" },
  { pattern: /^D:[^d]/m, section: "dictionaries" },
  { pattern: /^D:defaults=/m, section: "dictionaries" },
  { pattern: /^X:/m, section: "suffix" },
  { pattern: /\*[0-9a-z]+\[/m, section: "rle" },
  { pattern: /^!/m, section: "llm-target" },
  { pattern: /^END:/m, section: "llm-target" },
  { pattern: /^(?:DL|DELTA):/m, section: "delta" },
  { pattern: /^(?:NM|NORM):/m, section: "norm" },
  { pattern: /^(?:LY|LOSSY):/m, section: "norm" },
  { pattern: /^CK:/m, section: "checksum" },
  { pattern: /^(?:EX|EXAMPLE):/m, section: "example" }
];
function getSpec(encoded) {
  const lines = encoded.slice(0, 4e3);
  const firstLine = encoded.trimStart().split("\n")[0] ?? "";
  const isCompact = !firstLine.startsWith("S:") && !firstLine.startsWith("SCHEMA:");
  if (isCompact) {
    const text2 = SECTIONS.compact;
    return { text: text2, sections: ["compact"], estimatedTokens: Math.ceil(text2.length / 4) };
  }
  const isLocal = /^(?:DC|DEC):/m.test(lines) && /^CK:/m.test(lines) && !/^A:/m.test(lines);
  if (isLocal) {
    const text2 = SECTIONS.local;
    return { text: text2, sections: ["local"], estimatedTokens: Math.ceil(text2.length / 4) };
  }
  const included = /* @__PURE__ */ new Set(["base"]);
  for (const { pattern, section } of HEADER_SECTION_MAP) {
    if (pattern.test(lines)) included.add(section);
  }
  const sectionOrder = [
    "base",
    "abbreviations",
    "dec",
    "constants",
    "sequences",
    "fixed-point",
    "dictionaries",
    "suffix",
    "rle",
    "delta",
    "norm",
    "checksum",
    "example",
    "llm-target"
  ];
  const parts = [];
  for (const name of sectionOrder) {
    if (included.has(name)) {
      parts.push(SECTIONS[name]);
    }
  }
  const walkthrough = buildWalkthrough(encoded);
  if (walkthrough) {
    parts.push(walkthrough);
    included.add("walkthrough");
  }
  const text = parts.join("\n\n");
  return {
    text,
    sections: sectionOrder.filter((n) => included.has(n)).concat(walkthrough ? ["walkthrough"] : []),
    estimatedTokens: Math.ceil(text.length / 4)
  };
}
function buildWalkthrough(encoded) {
  const allLines = encoded.split("\n");
  const schemaLine = allLines.find((l) => l.startsWith("S:") || l.startsWith("SCHEMA:"));
  if (!schemaLine) return null;
  const sm = schemaLine.match(/(?:S|SCHEMA):@\w+(?:\[\d+\])?\=\[(.+)\]/);
  if (!sm) return null;
  const colDefs = sm[1].split(",").map((f) => {
    const [abbrev, type] = f.trim().split(":");
    return { abbrev: abbrev.trim(), type: (type || "s").trim() };
  });
  const aliasLine = allLines.find((l) => l.startsWith("A:"));
  const fullNames = aliasLine ? aliasLine.substring(2).split(",").map((n) => n.trim()) : [];
  const resolve = (abbrev) => {
    const idx = colDefs.findIndex((c) => c.abbrev === abbrev);
    return idx >= 0 && fullNames[idx] ? fullNames[idx] : abbrev;
  };
  const constants = /* @__PURE__ */ new Set();
  const sequences = /* @__PURE__ */ new Set();
  const fpMap = {};
  const decSet = /* @__PURE__ */ new Set();
  const dictMap = {};
  const deltaMap = {};
  const normMap = {};
  for (const line of allLines) {
    if (line.startsWith("C:")) {
      const col = resolve(line.substring(2, line.indexOf("=")));
      constants.add(col);
    }
    if (line.startsWith("Q:") && !line.startsWith("QF:") && !line.startsWith("QS:")) {
      const col = resolve(line.substring(2, line.indexOf("=")));
      sequences.add(col);
    }
    if (line.startsWith("QF:")) sequences.add(resolve(line.substring(3, line.indexOf("="))));
    if (line.startsWith("QS:")) sequences.add(resolve(line.substring(3, line.indexOf("="))));
    if (line.startsWith("FP:")) {
      const eqIdx = line.indexOf("=");
      const lhs = line.substring(3, eqIdx);
      const rhs = line.substring(eqIdx + 1);
      const lhsNum = parseInt(lhs, 10);
      if (!isNaN(lhsNum) && String(lhsNum) === lhs) {
        for (const c of rhs.split(",")) fpMap[resolve(c.trim())] = lhsNum;
      } else {
        fpMap[resolve(lhs)] = parseInt(rhs, 10);
      }
    }
    if (line.startsWith("DC:") || line.startsWith("DEC:")) {
      const prefix = line.startsWith("DC:") ? 3 : 4;
      line.substring(prefix).split(",").forEach((c) => decSet.add(resolve(c.trim())));
    }
    if ((line.startsWith("D:") || line.startsWith("DICT:")) && !line.includes("defaults=")) {
      const eqIdx = line.indexOf("=");
      const col = resolve(line.substring(line.indexOf(":") + 1, eqIdx));
      const rhs = line.substring(eqIdx + 1);
      if (!rhs.startsWith("{")) {
        dictMap[col] = rhs.split(",").map((v) => v.replace(/\\,/g, ",").replace(/\\\\/g, "\\"));
      }
    }
    if (line.startsWith("DL:") || line.startsWith("DELTA:")) {
      const prefix = line.startsWith("DL:") ? 3 : 6;
      const eqIdx = line.indexOf("=");
      deltaMap[resolve(line.substring(prefix, eqIdx))] = parseInt(line.substring(eqIdx + 1), 10);
    }
    if (line.startsWith("NM:") || line.startsWith("NORM:")) {
      const prefix = line.startsWith("NM:") ? 3 : 5;
      const eqIdx = line.indexOf("=");
      const col = resolve(line.substring(prefix, eqIdx));
      const parts = line.substring(eqIdx + 1).split(",");
      normMap[col] = {
        mean: parseFloat(parts[0]),
        std: parseFloat(parts[1]),
        sigmaT: parts.length > 2 ? parseFloat(parts[2]) : 25,
        mT: parts.length > 3 ? parseFloat(parts[3]) : 500
      };
    }
  }
  const activeCols = colDefs.map((cd, i) => ({ name: fullNames[i] ?? cd.abbrev, type: cd.type })).filter((c) => !constants.has(c.name) && !sequences.has(c.name));
  if (activeCols.length === 0) return null;
  let dataStartIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (/^@\w+:$/.test(allLines[i])) {
      dataStartIdx = i + 1;
      break;
    }
  }
  if (dataStartIdx < 0) return null;
  let firstRowIdx = dataStartIdx;
  if (allLines[firstRowIdx]?.startsWith("F:")) firstRowIdx++;
  let dataRow = allLines[firstRowIdx] ?? "";
  if (dataRow.startsWith("!")) {
    firstRowIdx++;
    dataRow = allLines[firstRowIdx] ?? "";
  }
  if (!dataRow || dataRow.startsWith("END:") || dataRow.startsWith("CK:")) return null;
  const tokens = dataRow.split(",");
  if (tokens.length === 0) return null;
  const steps = ["Decode walkthrough (row 1):"];
  const limit = Math.min(tokens.length, activeCols.length);
  for (let i = 0; i < limit; i++) {
    const token = tokens[i];
    const col = activeCols[i];
    const name = col.name;
    if (token === "^" || token === "") {
      steps.push(`  ${name}: "${token}" \u2192 null`);
      continue;
    }
    if (token === "~") {
      steps.push(`  ${name}: "~" \u2192 default value`);
      continue;
    }
    if (token.startsWith("!")) {
      steps.push(`  ${name}: "${token}" \u2192 raw literal "${token.slice(1)}"`);
      continue;
    }
    if (deltaMap[name] !== void 0) {
      const delta = parseInt(token, 10);
      steps.push(`  ${name}: "${token}" \u2192 delta +${delta} (accumulate from first value ${deltaMap[name]})`);
      continue;
    }
    if (normMap[name]) {
      const n = normMap[name];
      const parsed = parseInt(token, 36);
      const val = (parsed - n.mT) / n.sigmaT * n.std + n.mean;
      steps.push(`  ${name}: "${token}" \u2192 parseInt("${token}",36)=${parsed} \u2192 (${parsed}-${n.mT})/${n.sigmaT}\xD7${n.std}+${n.mean} \u2248 ${val.toFixed(2)}`);
      continue;
    }
    if (fpMap[name] !== void 0) {
      const d = fpMap[name];
      const isDec = decSet.has(name);
      const parsed = isDec ? parseInt(token, 10) : parseInt(token, 36);
      const base = isDec ? 10 : 36;
      const val = parsed / Math.pow(10, d);
      steps.push(`  ${name}: "${token}" \u2192 parseInt("${token}",${base})=${parsed} \u2192 ${parsed}\xF7${Math.pow(10, d)} = ${val}`);
      continue;
    }
    if (dictMap[name]) {
      const idx = parseInt(token, 36);
      const val = dictMap[name][idx];
      if (val !== void 0) {
        steps.push(`  ${name}: "${token}" \u2192 dict[${idx}] = "${val}"`);
        continue;
      }
    }
    if (decSet.has(name) && col.type === "i") {
      steps.push(`  ${name}: "${token}" \u2192 ${parseInt(token, 10)} (decimal int)`);
      continue;
    }
    if (col.type === "i") {
      const parsed = parseInt(token, 36);
      steps.push(`  ${name}: "${token}" \u2192 parseInt("${token}",36) = ${parsed}`);
      continue;
    }
    if (col.type === "b") {
      steps.push(`  ${name}: "${token}" \u2192 ${token === "1" ? "true" : "false"}`);
      continue;
    }
    steps.push(`  ${name}: "${token}" \u2192 ${token}`);
  }
  return steps.join("\n");
}

// src/index.ts
var VALID_MODES = [
  "compact",
  "full",
  "llm",
  "local",
  "compat",
  // public
  "adaptive",
  "micro",
  "json"
  // internal / legacy
];
var LEGACY_MODE_HINTS = {
  lite: 'Use { mode: "compact" } instead.',
  ultra: 'Use { mode: "full" } instead.',
  standard: 'Use { mode: "full" } instead.',
  hyper: 'Use { mode: "full" } instead.',
  transmission: 'Use { mode: "full" } instead.'
};
function validateOptions(options) {
  if (options.mode !== void 0 && !VALID_MODES.includes(options.mode)) {
    const hint = LEGACY_MODE_HINTS[options.mode];
    throw new Error(
      hint ? `Unknown LOON mode "${options.mode}". ${hint}` : `Unknown LOON mode "${options.mode}". Valid modes: compact, full, llm, local, compat.`
    );
  }
}
var Loon = class _Loon {
  constructor() {
    this.stateManager = new StateManager();
    this.encoder = new LoonEncoder(this.stateManager);
    this.decoder = new LoonDecoder(this.stateManager);
    this.csv = new CsvCodec();
    this.xml = new XmlCodec();
    this.yaml = new YamlCodec();
    this.treeCodec = new TreeCodec();
  }
  /**
   * Encodes a JSON array into LOON format.
   *
   * Modes:
   * - `full`    — maximum compression for APIs/services (default for large datasets)
   * - `llm`     — optimized for reasoning LLMs (GPT-4, Claude, Gemini)
   * - `local`   — plain decimal for small/local models (Llama, Phi, Mistral)
   * - `compat`  — JSON-hybrid, works with any model
   * - `compact` — label-based, for small/non-uniform data
   *
   * If `mode` is omitted, it is auto-selected from dataset shape.
   */
  toJSON(json, options = {}) {
    validateOptions(options);
    if (!json || json.length === 0) return "";
    const keep = options.fields && options.fields.length > 0 ? new Set(options.fields) : null;
    const factor = options.maxDecimals !== void 0 ? Math.pow(10, options.maxDecimals) : 0;
    const flatData = json.map((r) => {
      const flat = flattenRecord(r);
      const out = {};
      for (const k in flat) {
        if (keep && !keep.has(k)) continue;
        const v = flat[k];
        out[k] = factor && typeof v === "number" && !Number.isInteger(v) && Number.isFinite(v) ? Math.round(v * factor) / factor : v;
      }
      return out;
    });
    let mode = options.mode;
    if (!mode) mode = selectMode(flatData);
    if (mode === "adaptive") {
      const target = options.target ?? "transmission";
      if (target === "llm") mode = "llm";
      else if (target === "local") mode = "local";
      else mode = "full";
    }
    let result = "";
    if (mode === "micro") {
      result = this.encoder.encodeMicro(flatData, options.fields);
    } else if (mode === "compact") {
      result = this.encoder.encodeCompact(flatData);
    } else if (mode === "compat" || mode === "json") {
      result = this.encoder.encodeJSONHybrid(flatData);
    } else {
      const target = mode === "llm" ? "llm" : mode === "local" ? "local" : "transmission";
      result = this.encoder.encodeAdaptive(flatData, { ...options, target });
    }
    if (options.outFile) {
      try {
        const fs = require("fs");
        fs.writeFileSync(options.outFile, result, "utf-8");
      } catch (e) {
        console.warn(`[LOON] Failed to write to file ${options.outFile}. Are you in a Node.js environment?`, e);
      }
    }
    return result;
  }
  /** Decodes a LOON string back into a JSON array. */
  fromLOON(loon2) {
    return this.decoder.decode(loon2).map((r) => unflattenRecord(r));
  }
  /** Parses a CSV string and encodes it as LOON. */
  fromCSV(csv, options = {}) {
    const data = this.csv.parse(csv);
    return data.length ? this.toJSON(data, options) : "";
  }
  /** Decodes a LOON string and serializes it as CSV. */
  toCSV(loon2) {
    const data = this.fromLOON(loon2);
    return this.csv.serialize(data.map((r) => flattenRecord(r)));
  }
  /** Parses a tabular XML string and encodes it as LOON. */
  fromXML(xml, options = {}) {
    const data = this.xml.parse(xml, options.rowTag);
    return data.length ? this.toJSON(data, options) : "";
  }
  /** Decodes a LOON string and serializes it as XML. */
  toXML(loon2, rootTag = "data", rowTag = "item") {
    return this.xml.serialize(this.fromLOON(loon2), rootTag, rowTag);
  }
  /** Parses a YAML string and encodes it as LOON. */
  fromYAML(yaml, options = {}) {
    const data = this.yaml.parse(yaml);
    return data.length ? this.toJSON(data, options) : "";
  }
  /** Decodes a LOON string and serializes it as YAML. */
  toYAML(loon2) {
    return this.yaml.serialize(this.fromLOON(loon2));
  }
  /**
   * Encodes a tree (or array of trees) as LOON.
   *
   * The tree is flattened to an adjacency list (DFS order) and encoded with
   * the adaptive engine.  The `_id` column is always an integer sequence and
   * is eliminated from every data row by the encoder.  The `_pid` column
   * encodes parent relationships; repeated sibling groups compress well under
   * RLE and dictionary compression.
   *
   * A `TREE:` metadata header is prepended so `toTree` can reconstruct the
   * original shape without any extra arguments.
   *
   * Throws `TreeEncodeError` on circular references, depth overflow, or
   * non-object nodes.
   *
   * @example
   *   const l = new Loon();
   *   const encoded = l.fromTree(domRoot, { target: 'llm' });
   *   const back = l.toTree(encoded);  // exact round-trip
   */
  fromTree(input, opts = {}) {
    const { childKey, maxDepth, idCol, pidCol, target, tableId } = opts;
    const treeOpts = {};
    if (childKey !== void 0) treeOpts.childKey = childKey;
    if (maxDepth !== void 0) treeOpts.maxDepth = maxDepth;
    if (idCol !== void 0) treeOpts.idCol = idCol;
    if (pidCol !== void 0) treeOpts.pidCol = pidCol;
    const { rows, meta } = this.treeCodec.parse(input, treeOpts);
    if (rows.length === 0) return "";
    const loonOpts = { mode: "adaptive", target: target ?? "transmission" };
    if (tableId !== void 0) loonOpts.tableId = tableId;
    const encoded = this.toJSON(rows, loonOpts);
    return `TREE:${this.treeCodec.encodeMeta(meta)}
${encoded}`;
  }
  /**
   * Decodes a LOON string produced by `fromTree` back into the original tree.
   *
   * By default, null-valued properties introduced by the union schema are
   * stripped from each node so the round-trip shape matches the original
   * sparse nodes.  Pass `{ preserveNulls: true }` to keep explicit nulls.
   *
   * Throws `TreeDecodeError` if the `TREE:` header is missing or if the
   * adjacency list contains orphaned nodes (pid pointing to a non-existent
   * id — indicates corrupted data).
   */
  toTree(loon2, opts = {}) {
    const nlIdx = loon2.indexOf("\n");
    const firstLine = nlIdx >= 0 ? loon2.slice(0, nlIdx) : loon2;
    if (!firstLine.startsWith("TREE:")) {
      throw new TreeDecodeError(
        "NO_HEADER",
        `Expected "TREE:" on first line, got: "${firstLine.slice(0, 60)}"`
      );
    }
    const meta = this.treeCodec.decodeMeta(firstLine.slice(5));
    const rest = nlIdx >= 0 ? loon2.slice(nlIdx + 1) : "";
    const rows = this.fromLOON(rest);
    return this.treeCodec.serialize(rows, meta, opts);
  }
  /** Clears all schema state held by this instance. */
  reset() {
    this.stateManager.clear();
  }
  // ── Feature 4: Chunker ──────────────────────────────────────────────────────
  /**
   * Splits `data` into LOON-encoded chunks that fit within `maxTokens` each.
   *
   * `chunks[0]` is a complete LOON string (schema + data). Subsequent chunks
   * contain only the data block — the LLM decodes them using the schema already
   * present in its context window from chunk 0.
   *
   * Token estimation uses the chars/4 heuristic.
   */
  chunk(data, opts = {}) {
    const { maxTokens = 2e3, ...loonOpts } = opts;
    if (data.length === 0) return [];
    const splitLoonLocal = (encoded) => {
      const lines = encoded.split("\n");
      let blockLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^@\w+:$/.test(lines[i] ?? "")) {
          blockLine = i;
          break;
        }
      }
      if (blockLine < 0) return { schema: encoded, dataBlock: "" };
      return {
        schema: lines.slice(0, blockLine + 1).join("\n"),
        dataBlock: lines.slice(blockLine + 1).join("\n")
      };
    };
    const sampleSize = Math.min(10, data.length);
    const sampleEncoded = this.toJSON(data.slice(0, sampleSize), loonOpts);
    const { schema, dataBlock } = splitLoonLocal(sampleEncoded);
    const schemaTokens = Math.ceil(schema.length / 4);
    const dataTokensPerRow = dataBlock.length > 0 ? Math.ceil(dataBlock.length / 4 / sampleSize) : Math.ceil(sampleEncoded.length / 4 / sampleSize);
    const rowsPerChunk = Math.max(1, Math.floor((maxTokens - schemaTokens) / Math.max(1, dataTokensPerRow)));
    if (rowsPerChunk >= data.length) return [this.toJSON(data, loonOpts)];
    const chunks = [];
    for (let i = 0; i < data.length; i += rowsPerChunk) {
      const batch = data.slice(i, i + rowsPerChunk);
      const encoded = this.toJSON(batch, loonOpts);
      if (i === 0) {
        chunks.push(encoded);
      } else {
        const { dataBlock: batchData } = splitLoonLocal(encoded);
        chunks.push(batchData || encoded);
      }
    }
    return chunks;
  }
  // ── Feature 5 & 6: Streaming ────────────────────────────────────────────────
  /**
   * Async generator that encodes batches from `source` and yields LOON strings.
   *
   * The first batch yields a complete LOON string (schema + data). Subsequent
   * batches yield data-only blocks using the schema established by the first batch.
   * The receiver must keep batch 0's schema in context to decode later batches.
   */
  async *encodeStream(source, options = {}) {
    const splitLoonLocal = (encoded) => {
      const lines = encoded.split("\n");
      let blockLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^@\w+:$/.test(lines[i] ?? "")) {
          blockLine = i;
          break;
        }
      }
      if (blockLine < 0) return { schema: encoded, dataBlock: "" };
      return {
        schema: lines.slice(0, blockLine + 1).join("\n"),
        dataBlock: lines.slice(blockLine + 1).join("\n")
      };
    };
    let initialized = false;
    for await (const batch of source) {
      if (batch.length === 0) continue;
      if (!initialized) {
        yield this.toJSON(batch, options);
        initialized = true;
      } else {
        const tempLoon = new _Loon();
        const encoded = tempLoon.toJSON(batch, options);
        tempLoon.reset();
        const { dataBlock } = splitLoonLocal(encoded);
        yield dataBlock || encoded;
      }
    }
  }
  /**
   * Async generator that decodes a LOON string stream line by line.
   *
   * `source` should yield raw text chunks (e.g. from a file read stream or
   * network socket). Rows are yielded as they are decoded — schema headers are
   * buffered internally and never emitted.
   *
   * Note: the schema block is re-used for each data line; this is correct but
   * O(headers) per row. For extremely large payloads, batch decoding with
   * `fromLOON` is faster.
   */
  async *fromLOONStream(source) {
    let lineBuffer = "";
    let schemaBuffer = "";
    let state = "headers";
    for await (const chunk of source) {
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trimStart();
        if (trimmed === "" && state !== "data") continue;
        if (state === "headers") {
          schemaBuffer += line + "\n";
          if (/^@\w+:$/.test(trimmed)) state = "post-block";
          continue;
        }
        if (state === "post-block") {
          schemaBuffer += line + "\n";
          if (trimmed.startsWith("F:")) {
            state = "data";
            continue;
          }
          state = "data";
        }
        if (trimmed.startsWith("END:") || trimmed === "") continue;
        const rows = this.fromLOON(schemaBuffer + line);
        for (const row of rows) yield row;
      }
    }
    if (lineBuffer.trim() && state === "data") {
      const rows = this.fromLOON(schemaBuffer + lineBuffer);
      for (const row of rows) yield row;
    }
  }
  /**
   * Validates that `decodedRows` matches the schema declared in `loonString`.
   * Checks row count, column names, and value types (i/f/b/a/s).
   *
   * @example
   *   const { ok, errors } = loon.validateDecode(encoded, rows);
   *   if (!ok) console.log(loon.repairHint(encoded, errors));
   */
  validateDecode(loonString, decodedRows) {
    return validateDecode(loonString, decodedRows);
  }
  /**
   * Generates a minimal retry hint (~50-150 tokens) for an LLM that decoded
   * incorrectly. Includes only the failing rows and what was wrong — not the
   * full prompt or history.
   */
  repairHint(loonString, errors) {
    return repairHint(loonString, errors);
  }
};
var loon = new Loon();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Loon,
  LoonSession,
  TreeCodec,
  TreeDecodeError,
  TreeEncodeError,
  getSpec,
  loon,
  repairHint,
  splitLoon,
  validateDecode
});
