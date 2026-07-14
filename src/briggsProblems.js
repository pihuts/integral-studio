import { QUESTIONS_PER_TOPIC as BANK_QUESTIONS_PER_TOPIC } from "./bankMeta.js";
import { CONCEPT_TITLES, GENERIC_CONCEPT_TITLES } from "./conceptTitles.js";

let BANK = {};
let bankPromise;

export const QUESTIONS_PER_TOPIC = BANK_QUESTIONS_PER_TOPIC;

/** Load the large generated bank only when practice is actually opened. */
export function loadBriggsBank() {
  if (!bankPromise) {
    bankPromise = import("./generatedBank.js")
      .then(({ GENERATED_BANK }) => {
        BANK = GENERATED_BANK;
        return BANK;
      })
      .catch(error => {
        // Let the UI retry after a transient chunk/network failure.
        bankPromise = null;
        throw error;
      });
  }
  return bankPromise;
}
/**
 * Strict Calc-1/2 bans — scan the whole problem (prompt, steps, equations, …).
 *
 * Double integration:
 *  - prose "double integral", \iint/\iiint, iterated \int…\int, \,dy\,dx
 *  - does NOT flag sums of separate single integrals (A=∫…+∫…)
 *
 * Hyperbolic functions:
 *  - sinh/cosh/tanh/… and inverses (asinh, \sinh^{-1}, …)
 */
function isBannedProblem(problem) {
  const text = JSON.stringify(problem ?? {});
  if (/double\s+integral/i.test(text)) return true;
  if (/\\iiint|\\iint|\\iiiint/.test(text)) return true;
  if (/\\int\s*\\int/.test(text)) return true;
  if (/\\,d[xy]\\,d[xy]/.test(text)) return true;
  if (/\\int(?:_(?:\{[^}]*\}|[^\s\\^])|\\?\^(?:\{[^}]*\}|[^\s\\_]))+\\int/.test(text)) {
    return true;
  }
  if (/hyperbolic/i.test(text)) return true;
  if (/\\sinh|\\cosh|\\tanh|\\coth|\\sech|\\csch/.test(text)) return true;
  if (/\\operatorname\{a?(?:sinh|cosh|tanh|coth|sech|csch)\}/.test(text)) return true;
  if (/(?<![A-Za-z])a?(?:sinh|cosh|tanh|coth|sech|csch)(?![A-Za-z])/i.test(text)) return true;
  if (/"t"\s*:\s*"(?:cosh|sinh)"/.test(text)) return true;
  return false;
}

function dedupePool(items) {
  const seen = new Set();
  const pool = [];
  for (const item of items.filter((problem) => !isBannedProblem(problem))) {
    const key = `${item.source || ""}|${item.prompt || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(item);
  }
  return pool;
}


function conceptNumber(problem) {
  const match = (problem.source || "").match(/concept\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function withConceptTitle(problem, topic) {
  const n = conceptNumber(problem);
  const map = CONCEPT_TITLES[topic];
  if (!n || !map?.[n]) return problem;
  if (!problem.title || GENERIC_CONCEPT_TITLES.has(problem.title)) {
    problem.title = map[n];
  }
  return problem;
}

function poolFor(topic) {
  const topicBank = BANK[topic];
  if (!topicBank) return [];
  const pool = Array.isArray(topicBank)
    ? topicBank
    : [...(topicBank.easy || []), ...(topicBank.medium || []), ...(topicBank.hard || [])];
  return dedupePool(pool).slice(0, QUESTIONS_PER_TOPIC);
}

export function getBriggsProblem(topic, _difficulty, questionIndex) {
  const pool = poolFor(topic);
  if (!pool.length || questionIndex >= pool.length) return null;
  const problem = structuredClone(pool[questionIndex]);
  withConceptTitle(problem, topic);
  if (!problem.correctId) {
    problem.correctId = problem.choices?.find((choice) => choice.label === "Correct")?.id || "a";
  }
  return problem;
}

export function briggsProblemCount(topic, _difficulty) {
  return poolFor(topic).length;
}

/** Distinct concept labels available in the current pool (for UI / audits). */
export function conceptCoverage(topic) {
  const pool = poolFor(topic);
  const concepts = new Set();
  for (const p of pool) {
    const n = conceptNumber(p);
    if (n != null) concepts.add(n);
  }
  return {
    total: pool.length,
    concepts: [...concepts].sort((a, b) => a - b),
    conceptCount: concepts.size,
  };
}
