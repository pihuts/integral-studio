/** Textbook references for problem sources. */
import manifest from "../references/references.json";

const OPENSTAX_SECTION_PAGES = {
  "4.10": "4-10-antiderivatives",
  "5.2": "5-2-the-definite-integral",
  "5.3": "5-3-the-fundamental-theorem-of-calculus",
  "5.4": "5-4-integration-and-net-change",
  "5.5": "5-5-substitution",
  "6.1": "6-1-areas-between-curves",
  "6.2": "6-2-determining-volumes-by-slicing",
  "6.3": "6-3-volumes-of-revolution-cylindrical-shells",
  "6.4": "6-4-arc-length-and-surface-area",
  "6.5": "6-5-physical-applications",
  "6.6": "6-6-moments-and-centers-of-mass"
};

/** Strip machine-local paths so they never ship in the client bundle. */
export const REFERENCES = (manifest.references || []).map(ref => {
  const { localPath, ...publicRef } = ref;
  return publicRef;
});

export function referenceById(id) {
  return REFERENCES.find(ref => ref.id === id);
}

export function referenceForSource(source = "") {
  if (source.startsWith("OpenStax")) return referenceById("openstax-v1");
  if (source.startsWith("Briggs")) return referenceById("briggs");
  return null;
}

export function openStaxWebUrl(section) {
  const ref = referenceById("openstax-v1");
  const slug = OPENSTAX_SECTION_PAGES[section];
  if (!ref?.webBase || !slug) return ref?.publicPath ?? null;
  return `${ref.webBase}/${slug}`;
}

/** Link for a problem source tag like "OpenStax Vol. 1 §5.2, Ex. 3". */
export function sourceLink(source = "") {
  const match = source.match(/§([\d.]+)/);
  if (!match) return null;
  const section = match[1];
  if (source.startsWith("OpenStax")) return openStaxWebUrl(section);
  if (source.startsWith("Briggs")) {
    const ref = referenceById("briggs");
    return ref?.publicPath ?? null;
  }
  return null;
}

/** Compact HTML footnote for a problem source (empty string when none). */
export function sourceLinkHtml(source, escapeFn) {
  if (!source) return "";
  const href = sourceLink(source);
  if (!href) {
    return `<p class="problem-source">${escapeFn(source)}</p>`;
  }
  const label = `${source} (opens in new tab)`;
  return `<p class="problem-source"><a href="${escapeFn(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeFn(label)}">${escapeFn(source)}<span class="sr-only"> (opens in new tab)</span></a></p>`;
}
