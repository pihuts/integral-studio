/**
 * KaTeX / HTML helpers for Practice UI.
 */

let katex = null;

export function setKatex(instance) {
  katex = instance;
}

export function getKatex() {
  return katex;
}

export const escape = value =>
  String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));

export const normalizeLatex = value => String(value).replace(/\\\\/g, "\\");

export const tex = (value, display = false) => {
  if (!katex) return escape(value);
  return katex.renderToString(normalizeLatex(value), {
    displayMode: display,
    throwOnError: false,
    strict: "ignore",
    trust: false,
    maxSize: 20,
    maxExpand: 500
  });
};

export const richMath = value => {
  const text = String(value ?? "");
  const parts = [];
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  let last = 0;
  let match;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(escape(text.slice(last, match.index)));
    const display = match[1] != null || match[2] != null;
    const body = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    parts.push(tex(body, display));
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(escape(text.slice(last)));
  return parts.join("") || escape(text);
};

/**
 * Solution step body: preserve structure for "intro + bullet list" bank copy.
 * Lines starting with "- " become a definition list; blank lines split paragraphs.
 */
export function formatSolutionBody(value) {
  const text = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const lines = text.split("\n");
  const chunks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, "").trim());
        i += 1;
      }
      chunks.push({ type: "list", items });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*-\s+/.test(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    chunks.push({ type: "p", text: para.join(" ") });
  }

  return chunks
    .map(chunk => {
      if (chunk.type === "list") {
        const lis = chunk.items
          .map(item => {
            const { symbol, detail } = splitQtyLine(item);
            if (detail) {
              return `<li class="solution-qty-item"><span class="solution-qty-symbol">${richMath(symbol)}</span><span class="solution-qty-detail">${richMath(detail)}</span></li>`;
            }
            return `<li class="solution-qty-item"><span class="solution-qty-detail">${richMath(item)}</span></li>`;
          })
          .join("");
        return `<ul class="solution-qty-list">${lis}</ul>`;
      }
      return `<p class="solution-step-lead">${richMath(chunk.text)}</p>`;
    })
    .join("");
}

/** Split "\\(R=x^{2}\\): disk radius — …" into symbol + detail after the first ": ". */
function splitQtyLine(item) {
  // Prefer split after inline math \(...\) or $...$
  const mathEnd = item.match(/^(\\\([\s\S]+?\\\)|\$[^$\n]+?\$)\s*:\s+([\s\S]+)$/);
  if (mathEnd) {
    return { symbol: mathEnd[1], detail: mathEnd[2] };
  }
  const colon = item.indexOf(": ");
  if (colon > 0 && colon < 120) {
    return { symbol: item.slice(0, colon), detail: item.slice(colon + 2) };
  }
  return { symbol: item, detail: "" };
}

export const mathDescription = value =>
  normalizeLatex(value)
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
