# CSV

CSV (Comma-Separated Values) is a flat tabular format.

- The first line is the header row: comma-separated field names.
- Each following line is one record: comma-separated values, in the same
  order as the header.
- Values that contain commas, newlines, or double quotes are wrapped in
  double quotes; embedded quotes are escaped by doubling (`""`).
- Empty cells are written as nothing between commas. There is no native
  null type; emptiness is the convention.
- Types are not encoded — every cell is text. Numbers, booleans, and dates
  appear in their natural string form and the consumer infers the type.

CSV cannot represent nested objects or nested arrays. When a payload has
multiple top-level arrays this benchmark emits each as a `# section` header
followed by its own header + rows; it is still flat per section.

To answer a question over CSV: scan the header to find the column index,
then read that index from each data row.
