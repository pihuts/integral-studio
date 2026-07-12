#!/usr/bin/env python3
"""Safely rewrite long ln-x arc-length MC choices to compact card forms.

Full closed form remains in finalAnswer + solution steps.
Only touches choice blocks for specific prompts — never a global latex rewrite.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "src" / "generatedBank.js"

# Python strings are the real latex (one backslash). json.dumps → JS source escapes.
LN_E = {
    "a": r"\sqrt{1+e^{2}}+\ln(1+\sqrt{2})-\sqrt{2}-\sinh^{-1}(e^{-1})",
    "b": r"\sqrt{1+e^{2}}-\sinh^{-1}(e^{-1})",
    "c": r"\sqrt{2}-\ln(1+\sqrt{2})",
    "d": "e-1",
}
LN_E2 = {
    "a": r"\sqrt{1+e^{4}}+\ln(1+\sqrt{2})-\sqrt{2}-\sinh^{-1}(e^{-2})",
    "b": r"\sqrt{1+e^{4}}-\sinh^{-1}(e^{-2})",
    "c": r"\sqrt{2}-\ln(1+\sqrt{2})",
    "d": "e^{2}-1",
}

LABELS = {
    "a": "Correct",
    "b": "Common setup error",
    "c": "Missing factor or bound",
    "d": "Arithmetic/axis slip",
}


def choices_js(bodies: dict[str, str]) -> str:
    # Match emit_problem indent (6 spaces for choices key).
    lines = ["      choices: ["]
    for cid in "abcd":
        latex = json.dumps(bodies[cid], ensure_ascii=False)
        label = json.dumps(LABELS[cid], ensure_ascii=False)
        lines.append(f"        {{ id: {json.dumps(cid)}, latex: {latex}, label: {label} }},")
    lines.append("      ],")
    return "\n".join(lines)


def replace_prompt_choices(text: str, prompt: str, bodies: dict[str, str], label: str) -> str:
    """Replace the choices array that follows a given prompt string."""
    # Prompt appears in JS as json-encoded string content inside quotes.
    prompt_js = json.dumps(prompt, ensure_ascii=False)  # includes surrounding quotes
    # After prompt line we have several fields then choices: [ ... ],
    # Match non-greedy until choices block closes.
    pattern = re.compile(
        rf"(prompt: {re.escape(prompt_js)},[\s\S]*?)(choices: \[[\s\S]*?\],)",
        re.MULTILINE,
    )
    replacement_block = choices_js(bodies)

    def repl(m: re.Match) -> str:
        # Function form — backslashes in replacement_block stay literal.
        return m.group(1) + replacement_block

    new_text, count = pattern.subn(repl, text)
    print(f"{label}: replaced {count} block(s)")
    if count == 0:
        print(f"  WARNING: prompt not found: {prompt}")
    return new_text


def main() -> None:
    text = BANK.read_text(encoding="utf-8")
    text = replace_prompt_choices(
        text,
        r"Find the arc length of \(y=\ln x\) on \([1,e]\).",
        LN_E,
        "ln x on [1,e]",
    )
    text = replace_prompt_choices(
        text,
        r"Find the arc length of \(y=\ln x\) on \([1,e^{2}]\).",
        LN_E2,
        "ln x on [1,e^2]",
    )
    BANK.write_text(text, encoding="utf-8")
    print(f"wrote {BANK}")


if __name__ == "__main__":
    main()
