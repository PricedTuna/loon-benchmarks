# XML

XML (eXtensible Markup Language) is a tag-based tree format.

- Each value is wrapped in matched tags: `<name>value</name>`.
- Nested data uses nested tags. Sequences are emitted as repeated tags
  with the same name (`<item>...</item><item>...</item>`).
- Attributes are name=value pairs inside the opening tag; this benchmark's
  encoder does not use them.
- All scalars are emitted as text. Numbers and booleans appear as their
  string forms (`<n>42</n>`, `<flag>true</flag>`); type is implicit.
- Special characters are escaped: `&amp;` `&lt;` `&gt;` `&quot;` `&apos;`.

To answer a question over XML: walk down to the tag named after the field
and read the inner text. If the answer is a number or boolean, treat the
text as that type.
