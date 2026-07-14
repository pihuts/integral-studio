/**
 * Bank module — deep intake for curriculum problems.
 *
 * Interface (callers + tests):
 *   loadBank()
 *   problem(topic, questionIndex) → raw Problem | null  (clone, titled, not materialized)
 *   problemCount(topic)
 *   conceptCoverage(topic)
 *   TOPICS / QUESTIONS_PER_TOPIC
 *
 * Implementation: generated bank chunk, ban filter, dedupe, concept titles, procedural fallback lives in problemService.
 */

import {
  getBriggsProblem,
  briggsProblemCount,
  loadBriggsBank,
  QUESTIONS_PER_TOPIC,
  conceptCoverage
} from "./briggsProblems.js";

export { QUESTIONS_PER_TOPIC, conceptCoverage };
export { loadBriggsBank as loadBank };

export const TOPICS = {
  fundamentals: { label: "Fundamentals", icon: "∫", description: "Antiderivatives" },
  area: { label: "Area", icon: "▨", description: "Accumulated area" },
  volumes: { label: "Volumes", icon: "◒", description: "Shells & washers" },
  centroids: { label: "Centroids", icon: "◎", description: "Balance points" },
  arc: { label: "Arc Length", icon: "⌒", description: "Curve length" },
  surface: { label: "Surface Area", icon: "◌", description: "Revolution surface" },
  inertia: { label: "Inertia", icon: "I", description: "Area moments" },
  applications: { label: "Word Problems", icon: "W", description: "Work, pumping & motion" }
};

/**
 * Raw bank row for topic + index (cloned). Null if bank short for that index.
 * Does not run Materialization — session prepare owns that seam.
 */
export function problem(topic, questionIndex) {
  return getBriggsProblem(topic, null, questionIndex);
}

export function problemCount(topic) {
  return briggsProblemCount(topic);
}
