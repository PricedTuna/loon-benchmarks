#!/usr/bin/env python3
"""
JTON bridge for the TypeScript benchmark suite.

Reads a JSON array or object from stdin, encodes it with jton.dumps()
(Zen Grid format), and writes the result to stdout.

Exit codes:
  0  success
  1  jton not installed
  2  bad JSON input
  3  encoder error
"""
import json
import sys


def main() -> None:
    try:
        import jton
    except ImportError:
        sys.stderr.write(
            "jton not installed. "
            "Run: cd JTON && maturin develop --release\n"
        )
        sys.exit(1)

    raw = sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"JSON parse error: {exc}\n")
        sys.exit(2)

    try:
        result = jton.dumps(data, zen_grid=True)
    except Exception as exc:
        sys.stderr.write(f"jton encoder error: {exc}\n")
        sys.exit(3)

    sys.stdout.write(result)


if __name__ == "__main__":
    main()
