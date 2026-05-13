# YAML

YAML (YAML Ain't Markup Language) is an indentation-based serialization
format. Same data model as JSON.

- Mappings: `key: value`, one pair per line. Nested mappings are indented
  (2 spaces by convention).
- Sequences: lines beginning with `- ` for each element.
- Scalars are usually unquoted; quote only when the value contains special
  characters or could be misinterpreted as another type.
- Booleans: `true` / `false`. Null: `null` or `~`. Numbers are unquoted.
- A document may contain repeated keys via merge / anchors (`&name`,
  `*name`); this benchmark does not use them.

To answer a question over YAML: follow the indentation tree to the named
field, and read the scalar. The data semantics match JSON.
