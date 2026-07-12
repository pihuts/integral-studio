#!/usr/bin/env python3
"""Audit generatedBank.js for broken answers, NaNs, and bad choices."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BANK = Path(__file__).resolve().parent.parent / "src" / "generatedBank.js"


def extract_problems(text: str) -> list[dict]:
    """Best-effort parse of export const GENERATED_BANK = {...}"""
    # Convert JS object-ish to JSON: quote keys, strip trailing commas carefully.
    m = re.search(r"export const GENERATED_BANK = (\{[\s\S]*\n\});", text)
    if not m:
        raise SystemExit("GENERATED_BANK not found")
    raw = m.group(1)
    # Problems are objects with known keys — walk with a simpler regex split by topic arrays.
    problems = []
    # Match each problem object roughly
    for pm in re.finditer(
        r"\{\s*source:\s*(\"(?:\\.|[^\"])*\")\s*,\s*title:\s*(\"(?:\\.|[^\"])*\")\s*,\s*"
        r"prompt:\s*(\"(?:\\.|[^\"])*\")\s*,\s*finalAnswer:\s*(\"(?:\\.|[^\"])*\")",
        text,
    ):
        start = pm.start()
        # Find matching closing for this object — scan braces from start
        depth = 0
        end = start
        for i, ch in enumerate(text[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        block = text[start:end]

        def js_str(s: str) -> str:
            return json.loads(s)

        source = js_str(pm.group(1))
        title = js_str(pm.group(2))
        prompt = js_str(pm.group(3))
        final = js_str(pm.group(4))
        choices = []
        for cm in re.finditer(
            r'\{\s*id:\s*"([a-d])"\s*,\s*latex:\s*("(?:\\.|[^"])*")\s*,\s*label:\s*("(?:\\.|[^"])*")\s*\}',
            block,
        ):
            choices.append(
                {
                    "id": cm.group(1),
                    "latex": js_str(cm.group(2)),
                    "label": js_str(cm.group(3)),
                }
            )
        steps = []
        for sm in re.finditer(
            r'\{\s*title:\s*("(?:\\.|[^"])*")\s*,\s*body:\s*("(?:\\.|[^"])*")\s*\}',
            block,
        ):
            steps.append({"title": js_str(sm.group(1)), "body": js_str(sm.group(2))})
        problems.append(
            {
                "source": source,
                "title": title,
                "prompt": prompt,
                "finalAnswer": final,
                "choices": choices,
                "steps": steps,
                "block": block,
            }
        )
    return problems


BAD_PATTERNS = [
    (r"\\text\{NaN\}", "NaN in latex"),
    (r"\bNaN\b", "NaN text"),
    (r"\\text\{Infinity\}", "Infinity latex"),
    (r"\bInfinity\b", "Infinity text"),
    (r"zoo", "sympy complex infinity zoo"),
    (r"\\frac\{\}", "empty frac numerator/denom"),
    (r"undefined", "undefined"),
    (r"2 1\b", "broken pi-strip '2 1'"),
    (r"S = 2 1", "broken pi factor"),
]


def audit(problems: list[dict]) -> list[dict]:
    findings = []
    for i, p in enumerate(problems):
        issues = []
        blob = p["finalAnswer"] + "\n" + "\n".join(
            c["latex"] for c in p["choices"]
        ) + "\n" + "\n".join(s["body"] for s in p["steps"])

        for pat, label in BAD_PATTERNS:
            if re.search(pat, blob):
                issues.append(label)

        # Choice quality
        lats = [c["latex"] for c in p["choices"]]
        labels = [c["label"] for c in p["choices"]]
        if len(p["choices"]) != 4:
            issues.append(f"expected 4 choices, got {len(p['choices'])}")
        if labels.count("Correct") != 1:
            issues.append(f"Correct label count={labels.count('Correct')}")
        # duplicate latex among choices
        if len(set(lats)) < len(lats):
            issues.append("duplicate choice latex")
        # correct choice is NaN
        for c in p["choices"]:
            if c["label"] == "Correct" and ("NaN" in c["latex"] or c["latex"] in ("0", "1", "2") and "NaN" in blob):
                if "NaN" in c["latex"]:
                    issues.append("correct choice is NaN")
        # final answer empty / nan
        if "NaN" in p["finalAnswer"]:
            issues.append("finalAnswer is NaN")
        # step final disagrees with finalAnswer when step has NaN
        for s in p["steps"]:
            if s["title"] == "Final simplified value" and "NaN" in s["body"] and "NaN" not in p["finalAnswer"]:
                issues.append("steps final NaN but finalAnswer ok")

        if issues:
            findings.append(
                {
                    "index": i,
                    "title": p["title"],
                    "prompt": p["prompt"][:100],
                    "source": p["source"][:80],
                    "issues": sorted(set(issues)),
                }
            )
    return findings


def main() -> None:
    text = BANK.read_text(encoding="utf-8")
    problems = extract_problems(text)
    print(f"parsed {len(problems)} problems")
    findings = audit(problems)
    print(f"problems with issues: {len(findings)}")
    # group by issue type
    by = {}
    for f in findings:
        for iss in f["issues"]:
            by.setdefault(iss, []).append(f)
    for iss, items in sorted(by.items(), key=lambda kv: -len(kv[1])):
        print(f"\n## {iss} ({len(items)})")
        for it in items[:12]:
            print(f"  - [{it['title']}] {it['prompt']}")
        if len(items) > 12:
            print(f"  ... +{len(items)-12} more")
    # write report
    out = Path(__file__).resolve().parent.parent / "agent-tools" / "bank-audit.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(findings, indent=2), encoding="utf-8")
    print(f"\nwrote {out}")
    sys.exit(1 if findings else 0)


if __name__ == "__main__":
    main()
