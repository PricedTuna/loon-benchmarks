/**
 * LOON Core — public type surface.
 */
/**
 * Encoding mode.
 *
 * Public modes — pick one based on who will read the output:
 *
 * - `full`     — maximum compression for APIs and services. Schema-based
 *                encoding with all optimizations (Base36, RLE, dictionaries,
 *                abbreviations, delta, fixed-point). Smallest output.
 *
 * - `llm`      — optimized for reasoning LLMs (GPT-4, Claude, Gemini).
 *                Same compression as `full` plus safety scaffolding: anchor
 *                row, END sentinel, inline example, checksum, and decode
 *                walkthrough. Slightly larger but much more reliable.
 *
 * - `local`    — plain-text mode for small / non-reasoning models (Llama,
 *                Phi, Mistral, quantized). Everything in decimal, no Base36,
 *                no RLE, no abbreviations. ~60% smaller than JSON.
 *
 * - `compat`   — JSON-hybrid: valid JSON with schema + row arrays.
 *                ~50% smaller than full JSON. Works with ANY model since
 *                every LLM can parse JSON natively. Universal fallback.
 *
 * - `compact`  — label-based encoding for very small or non-uniform datasets.
 *                One record per block, no schema. Human-readable.
 *
 * Internal modes (auto-selected, not for direct use):
 * - `micro`    — tiny datasets (< 5 rows), auto-selected by mode selector.
 * - `adaptive` — legacy alias for `full`.
 * - `json`     — legacy alias for `compat`.
 *
 * If `mode` is omitted, it is selected automatically from the dataset shape.
 */
type LoonMode = 'compact' | 'full' | 'llm' | 'local' | 'compat' | 'adaptive' | 'micro' | 'json';
/**
 * Options forwarded to the tree codec when calling `Loon.fromTree` /
 * `Loon.toTree`.  Matches `TreeCodecOptions` in `codecs/tree.ts`; re-exported
 * here so callers can import everything from one place.
 */
interface TreeCodecOptions$1 {
    /**
     * Property name that holds child nodes.
     * Auto-detected from common names (children, nodes, items, …) when omitted.
     */
    childKey?: string;
    /** Maximum recursion depth before throwing. Default 200. */
    maxDepth?: number;
    /** Column name used for the node id in the flat row.    Default "_id".  */
    idCol?: string;
    /** Column name used for the parent id in the flat row.  Default "_pid". */
    pidCol?: string;
}
/**
 * Public encoder options.
 *
 * The encoder makes its own decisions about constants, sequences, RLE,
 * dictionaries, and so on. The user-facing knob is `mode` — pick one of
 * `full | llm | local | compat | compact` based on the consumer.
 */
interface LoonOptions {
    /** Force a specific encoding mode. Auto-selected when omitted. */
    mode?: LoonMode;
    /** Schema identifier used inside the encoded payload. Defaults to `T1`. */
    tableId?: string;
    /** XML codec only: override the auto-detected row element name. */
    rowTag?: string;
    /** Column projection: only encode these columns. All columns included when omitted. */
    fields?: string[];
    /** Round all float values to at most this many decimal places before encoding. */
    maxDecimals?: number;
    /**
     * NORM encoding: z-score normalize float columns into compact integers [0, 999].
     * Lossy — values are approximate on decode. Ideal for pattern analysis, not exact recovery.
     * `true` = auto-detect all float columns. `string[]` = specific columns only.
     */
    norm?: boolean | string[];
    /**
     * Emit a schema checkpoint comment (`#CKP:col=full,...`) every N data rows.
     * Helps LLMs re-anchor column names mid-payload, reducing drift and hallucinations.
     * Has no effect on decoding — the checkpoint lines are skipped by the decoder.
     * Recommended: 50 for large datasets sent to LLMs.
     */
    checkpointEvery?: number;
    /**
     * Emit a decoded row anchor (`#ANCHOR:rowN=[col:val,...]`) every N data rows.
     * Mitigates the "lost-in-the-middle" attention bias — gives the LLM concrete
     * decoded values to verify its decoding mid-payload. Costs ~1 row of tokens
     * per anchor. The decoder skips these lines. Recommended: 100 for very long
     * payloads sent to non-reasoning models.
     */
    anchorMidPayload?: number;
    /**
     * Columns that are semantically critical — moved to the front of each row
     * and encoded with human-readable decimal (never Base36) for better LLM
     * reasoning and less aggressive compression.
     */
    primaryCols?: string[];
    /**
     * File path to save the encoded output to. If provided, the encoded string
     * will be saved to this file before being returned. (Node.js environments only).
     */
    outFile?: string;
}

/**
 * Structural validation and repair-hint generation for LOON decoded output.
 *
 * validateDecode — checks that decodedRows match the schema declared in the
 *   LOON header (column names, types, row count).
 *
 * repairHint — generates a minimal string (~50-150 tokens) for an LLM retry:
 *   only the failing rows + what was wrong. Avoids re-sending the full prompt.
 */
interface ValidationError {
    row: number;
    col: string;
    expected: string;
    got: string;
}
interface ValidationResult {
    ok: boolean;
    errors: ValidationError[];
}
declare function validateDecode(loonString: string, decodedRows: any[]): ValidationResult;
declare function repairHint(loonString: string, errors: ValidationError[]): string;

/**
 * Session manager.
 *
 * Stateful encoding for multi-call LLM sessions. The decode spec and schema
 * headers are encoded once and placed in the cacheable prompt prefix;
 * subsequent batches send only the data rows, which the LLM decodes using the
 * spec + schema already present in its context window.
 *
 * Why this works: an LLM call is stateless, but providers cache an identical
 * prompt PREFIX (Anthropic/OpenAI/Google prompt caching) and bill it at a
 * fraction of the normal rate. Structuring the prompt as
 *   [ cacheable: spec + schema ]  +  [ variable: data rows ]
 * means the decode rules are paid once and every later call costs only the
 * dense data block. In a single multi-turn conversation the same holds:
 * turn 1 carries spec + schema + data; turns 2+ carry data only.
 *
 * @example
 *   const s = new LoonSession();
 *   s.init(firstBatch, { mode: 'full' });
 *   // System prompt (cache it): s.primer   ← getSpec() + schema headers
 *   // User message 1:           s.dataBlock
 *   for (const batch of subsequentBatches) {
 *     // User message N: just the rows — spec + schema already in context.
 *     send(s.encodeRows(batch).dataBlock);
 *   }
 */

interface LoonSplit {
    schema: string;
    dataBlock: string;
    full: string;
    schemaBytes: number;
    dataBytes: number;
}
/** Splits a LOON string into schema headers and data rows. */
declare function splitLoon(loon: string): LoonSplit;
declare class LoonSession {
    private opts;
    private split;
    /**
     * Initializes the session with a representative dataset.
     * Encodes the full first batch and locks the schema.
     */
    init(data: any[], opts?: LoonOptions): LoonSplit;
    /** Schema block — inject into system prompt or first message header. */
    get schema(): string;
    /** Number of bytes in the schema block. */
    get schemaBytes(): number;
    /** Data rows of the batch passed to {@link init}. */
    get dataBlock(): string;
    /**
     * The complete cacheable prompt prefix: the minimal decode spec
     * (`getSpec()`) followed by the schema headers. Put this in the system
     * prompt (and mark it for prompt caching); every subsequent call then only
     * carries a {@link dataBlock}. Paid once, reused for the whole session.
     */
    get primer(): string;
    /**
     * Encodes a new batch. Returns ONLY the data rows block (no schema headers).
     * The LLM decodes them using the schema already in its context window.
     */
    encodeRows(data: any[]): LoonSplit;
    /**
     * Decodes a rows-only block using the cached schema.
     * Prepends the saved schema headers so the standard decoder works.
     */
    decode(rowBlock: string): any[];
    /** Resets the session state. */
    reset(): void;
}

/**
 * getSpec — returns a minimal LOON decode spec for the given encoded payload.
 *
 * Parses only the header lines to detect which features are used, then
 * assembles a spec that includes only the relevant sections from
 * LLM_INSTRUCTIONS.md. Typical output: 200–600 tokens instead of ~3,500.
 *
 * Usage:
 *   import { getSpec } from 'loon-core';
 *   const spec = getSpec(encoded);
 *   // { text: string, sections: string[], estimatedTokens: number }
 */
interface LoonSpecResult {
    /** Minimal spec text — paste into system prompt. */
    text: string;
    /** Section names included. */
    sections: string[];
    /** Rough token estimate (÷4 chars heuristic). */
    estimatedTokens: number;
}
declare function getSpec(encoded: string): LoonSpecResult;

/**
 * LOON Tree codec.
 *
 * Converts recursive tree structures (DOM, AST, config trees, file trees, …)
 * to and from a flat adjacency-list representation that the adaptive encoder
 * can compress efficiently.
 *
 * Encoding strategy
 * -----------------
 * A tree is walked depth-first and each node is assigned a sequential integer
 * id.  The result is a flat array of rows:
 *
 *   { _id: number, _pid: number | null, ...leafProps }
 *
 * _id is always 0,1,2,… → the encoder detects it as an int-sequence and
 * eliminates it from every data row (Q:_id=0,1 header).  _pid encodes the
 * parent relationship; sibling groups share the same pid value, so RLE and
 * dictionary compression in the adaptive engine reduce it significantly.
 *
 * Nested non-children object properties (e.g. attrs:{class:'x'}) are left
 * intact; flattenRecord in the main encoder expands them to dot-notation
 * columns (attrs.class), which unflattenRecord reconstructs on decode.
 *
 * Token savings vs raw JSON
 * -------------------------
 * For a 50-node DOM tree with tag + 2 attrs + text:
 *   JSON  ≈ 1 800 tokens  (nested, keys repeated every row)
 *   LOON tree ≈ 260 tokens  (~85 % reduction)
 *
 * The TREE: metadata header is amortized over any tree with more than ~3
 * nodes.
 */
/** Metadata needed to reconstruct the original tree shape. */
interface TreeMeta {
    childKey: string;
    isArray: boolean;
    idCol: string;
    pidCol: string;
    /**
     * When true, the payload is a flat LOON record (no adjacency list). Used
     * when the input is a single heterogeneous object whose union schema would
     * be too sparse for the adjacency layout to amortize.
     */
    flat?: boolean;
}
/** Options for tree encoding. */
interface TreeCodecOptions {
    /**
     * Name of the property that holds child nodes.
     * Auto-detected from common names when omitted.
     */
    childKey?: string;
    /** Maximum recursion depth. Default 200. Circular refs are caught before this. */
    maxDepth?: number;
    /** Column name to use for the node id.     Default "_id".  */
    idCol?: string;
    /** Column name to use for the parent id.   Default "_pid". */
    pidCol?: string;
}
declare class TreeEncodeError extends Error {
    readonly code: 'CIRCULAR' | 'MAX_DEPTH' | 'INVALID_NODE';
    readonly treePath: string;
    constructor(code: 'CIRCULAR' | 'MAX_DEPTH' | 'INVALID_NODE', treePath: string, msg: string);
}
declare class TreeDecodeError extends Error {
    readonly code: 'ORPHAN' | 'NO_HEADER' | 'BAD_META';
    readonly detail: string;
    constructor(code: 'ORPHAN' | 'NO_HEADER' | 'BAD_META', detail: string);
}
declare class TreeCodec {
    /**
     * Flattens a tree (or array of trees) into an adjacency-list row array.
     *
     * Throws `TreeEncodeError` on:
     *   - Circular reference  (code: 'CIRCULAR')
     *   - Depth overflow      (code: 'MAX_DEPTH')
     *   - Non-object node     (code: 'INVALID_NODE')
     */
    parse(input: any | any[], opts?: TreeCodecOptions): {
        rows: Record<string, any>[];
        meta: TreeMeta;
    };
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
    serialize(rows: Record<string, any>[], meta: TreeMeta, opts?: {
        preserveNulls?: boolean;
    }): any;
    /**
     * Encodes tree metadata as a compact string for the `TREE:` header line.
     * Only non-default values are emitted to keep the header short.
     */
    encodeMeta(meta: TreeMeta): string;
    /**
     * Parses tree metadata from the value portion of a `TREE:` header line
     * (i.e., the string after `TREE:`).
     */
    decodeMeta(s: string): TreeMeta;
    /**
     * Heuristically determines which property holds child nodes.
     * Checks common names first, then falls back to the first property
     * whose value is a non-empty array of objects.
     */
    private detectChildKey;
}

/**
 * LOON Core — public API.
 *
 * Encodes structured data (JSON arrays, CSV, XML, YAML) into the LOON
 * format and decodes it back. Three primary encoding modes:
 *
 *   - `full`    — maximum compression (Base36, sequences, dictionaries,
 *                 suffixes). Pair with `getSpec()` for LLM use.
 *   - `llm`     — readable: plain decimal, schema + literal rows + `AS:`
 *                 tables. No Base36 / sequences / dictionaries / anchor, so
 *                 it is self-evident to any model — cloud or local — without
 *                 a spec. (The former `local` mode folds into this.)
 *   - `compact` — label-based key:value / indent, for small / non-uniform
 *                 data and single deep objects.
 *
 * `compat` (JSON-hybrid) remains as a maximum-compatibility escape hatch.
 * `local` is accepted as a deprecated alias of `llm`.
 */

declare class Loon {
    private stateManager;
    private encoder;
    private decoder;
    private csv;
    private xml;
    private yaml;
    private treeCodec;
    constructor();
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
    toLOON(json: any[], options?: LoonOptions): string;
    /** Decodes a LOON string back into a JSON array. */
    fromLOON(loon: string): any[];
    /** Alias for {@link toLOON}. */
    encode(json: any[], options?: LoonOptions): string;
    /** Alias for {@link fromLOON}. */
    decode(loon: string): any[];
    /** @deprecated Use {@link toLOON} instead. */
    toJSON(json: any[], options?: LoonOptions): string;
    /** Parses a CSV string and encodes it as LOON. */
    fromCSV(csv: string, options?: LoonOptions): string;
    /** Decodes a LOON string and serializes it as CSV. */
    toCSV(loon: string): string;
    /** Parses a tabular XML string and encodes it as LOON. */
    fromXML(xml: string, options?: LoonOptions): string;
    /** Decodes a LOON string and serializes it as XML. */
    toXML(loon: string, rootTag?: string, rowTag?: string): string;
    /** Parses a YAML string and encodes it as LOON. */
    fromYAML(yaml: string, options?: LoonOptions): string;
    /** Decodes a LOON string and serializes it as YAML. */
    toYAML(loon: string): string;
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
     *   const encoded = l.fromTree(domRoot, { mode: 'llm' });
     *   const back = l.toTree(encoded);  // exact round-trip
     */
    fromTree(input: any | any[], opts?: TreeCodecOptions$1 & LoonOptions): string;
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
    toTree(loon: string, opts?: {
        preserveNulls?: boolean;
    }): any;
    /** Clears all schema state held by this instance. */
    reset(): void;
    /**
     * Splits `data` into LOON-encoded chunks that fit within `maxTokens` each.
     *
     * `chunks[0]` is a complete LOON string (schema + data). Subsequent chunks
     * contain only the data block — the LLM decodes them using the schema already
     * present in its context window from chunk 0.
     *
     * Token estimation uses the chars/4 heuristic.
     */
    chunk(data: any[], opts?: {
        maxTokens?: number;
    } & LoonOptions): string[];
    /**
     * Async generator that encodes batches from `source` and yields LOON strings.
     *
     * The first batch yields a complete LOON string (schema + data). Subsequent
     * batches yield data-only blocks using the schema established by the first batch.
     * The receiver must keep batch 0's schema in context to decode later batches.
     */
    encodeStream(source: AsyncIterable<any[]>, options?: LoonOptions): AsyncGenerator<string, void, unknown>;
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
    fromLOONStream(source: AsyncIterable<string>): AsyncGenerator<any, void, unknown>;
    /**
     * Validates that `decodedRows` matches the schema declared in `loonString`.
     * Checks row count, column names, and value types (i/f/b/a/s).
     *
     * @example
     *   const { ok, errors } = loon.validateDecode(encoded, rows);
     *   if (!ok) console.log(loon.repairHint(encoded, errors));
     */
    validateDecode(loonString: string, decodedRows: any[]): ValidationResult;
    /**
     * Generates a minimal retry hint (~50-150 tokens) for an LLM that decoded
     * incorrectly. Includes only the failing rows and what was wrong — not the
     * full prompt or history.
     */
    repairHint(loonString: string, errors: ValidationError[]): string;
}
/** Default singleton — convenient for one-off calls. */
declare const loon: Loon;

export { Loon, type LoonMode, type LoonOptions, LoonSession, type LoonSpecResult, TreeCodec, type TreeCodecOptions$1 as TreeCodecOptions, TreeDecodeError, TreeEncodeError, type TreeMeta, type ValidationError, type ValidationResult, getSpec, loon, repairHint, splitLoon, validateDecode };
