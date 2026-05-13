# JSON

JSON (JavaScript Object Notation) is the standard data interchange format
for the web and for most LLM-facing APIs.

- Objects are wrapped in `{ ... }` with `"key": value` pairs separated by `,`.
- Arrays are wrapped in `[ ... ]` with values separated by `,`.
- Strings are double-quoted: `"hello"`. Numbers are unquoted: `42`, `3.14`,
  `1.5e3`. Booleans: `true` / `false`. Null: `null`.
- Keys are always strings. Trailing commas are not allowed.
- Whitespace between tokens is insignificant; "pretty" JSON adds indentation
  for readability, "compact" JSON omits it. Both decode to the same value.

To answer a question over JSON: locate the field by name (object) or position
(array), and read the value as-is. Numbers in the data are numbers in the
answer; strings are strings.
