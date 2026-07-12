#!/usr/bin/env python3
"""Re-emit MC choices from finalAnswer using fixed compact_math_latex / auto_mc_choices."""
from __future__ import annotations

import re
from pathlib import Path

# Load helpers from the bank builder without running main.
code = Path("scripts/build-problem-bank.py").read_text(encoding="utf-8")
ns: dict = {"__name__": "bpb", "__file__": "scripts/build-problem-bank.py"}
exec(compile(code, "scripts/build-problem-bank.py", "exec"), ns)

auto_mc_choices = ns["auto_mc_choices"]
js_string = ns["js_string"]

BANK = Path("src/generatedBank.js")
text = BANK.read_text(encoding="utf-8")

# Match each problem's finalAnswer + following choices array
pattern = re.compile(
    r'(finalAnswer: )("(?:\\.|[^"\\])*")(,\n(?:      [^\n]+\n)*?      choices: \[)([\s\S]*?)(\n      \],)',
    re.MULTILINE,
)


def choices_js(choices: list[dict]) -> str:
    lines = []
    for c in choices:
        lines.append(
            "        { id: "
            + js_string(c["id"])
            + ", latex: "
            + js_string(c["latex"])
            + ", label: "
            + js_string(c["label"])
            + " },"
        )
    return "\n".join(lines)


fixed = 0


def repl(m: re.Match) -> str:
    global fixed
    final_raw = m.group(2)
    # decode JS string
    import json

    final = json.loads(final_raw)
    choices = auto_mc_choices(final, compute=None)
    fixed += 1
    return m.group(1) + m.group(2) + m.group(3) + "\n" + choices_js(choices) + m.group(5)


new_text, n = pattern.subn(repl, text)
print(f"matched {n} choice blocks, rebuilt {fixed}")
if n:
    BANK.write_text(new_text, encoding="utf-8")
    print(f"wrote {BANK}")
else:
    print("no matches — bank format may have changed")
