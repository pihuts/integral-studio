from pathlib import Path
import re

t = Path("src/generatedBank.js").read_text(encoding="utf-8")
for m in re.finditer(r'prompt: "(Find the second moment[^"]+)"', t):
    start = m.start()
    chunk = t[start : start + 3000]
    print("PROMPT", m.group(1)[:100])
    cm = re.search(r"choices: \[(.*?)\]", chunk, re.S)
    print(cm.group(0)[:400] if cm else "NO CHOICES")
    print("---")

print("\nbroken 2 1 samples:")
for m in re.finditer(r'latex: "([^"]*2 1[^"]*)"', t):
    print(" ", m.group(1)[:120])
