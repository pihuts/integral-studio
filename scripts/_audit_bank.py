import re
from pathlib import Path
from collections import Counter

text = Path("src/generatedBank.js").read_text(encoding="utf-8")
topics = [
    "fundamentals",
    "area",
    "volumes",
    "centroids",
    "arc",
    "surface",
    "inertia",
    "applications",
]
print("=== Bank audit ===")
ok = True
for t in topics:
    m = re.search(rf"{t}: \[", text)
    if not m:
        print(t, "MISSING")
        ok = False
        continue
    start = m.start()
    end = text.find("\n  ],", start)
    block = text[start:end]
    n = len(re.findall(r"source:", block))
    concepts = sorted({int(x) for x in re.findall(r"concept\s+(\d+)", block, re.I)})
    diffs = Counter(re.findall(r"difficulty:\s*['\"](\w+)['\"]", block))
    e, med, h = diffs.get("easy", 0), diffs.get("medium", 0), diffs.get("hard", 0)
    status = "OK" if (e, med, h) == (20, 20, 10) and len(concepts) >= 10 and n == 50 else "FAIL"
    if status != "OK":
        ok = False
    print(f"{t}: n={n} e/m/h={e}/{med}/{h} concepts={len(concepts)} {concepts} [{status}]")
    # first prompt per concept 1..min(4,len)
    for c in concepts[:4]:
        pm = re.search(rf"concept {c}, item \d+[\s\S]*?prompt: \"([^\"]{{0,100}})", block)
        if pm:
            print(f"  c{c}: {pm.group(1)[:90]}")
print("OVERALL:", "PASS" if ok else "FAIL")
