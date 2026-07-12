import {
  briggsProblemCount,
  conceptCoverage,
  QUESTIONS_PER_TOPIC,
  loadBriggsBank,
} from "../src/briggsProblems.js";
import { GENERATED_BANK } from "../src/generatedBank.js";

await loadBriggsBank();

console.log("QUESTIONS_PER_TOPIC:", QUESTIONS_PER_TOPIC);
let failed = false;
for (const topic of Object.keys(GENERATED_BANK)) {
  const raw = Array.isArray(GENERATED_BANK[topic])
    ? GENERATED_BANK[topic].length
    : "tiered";
  const pool = briggsProblemCount(topic);
  const cov = conceptCoverage(topic);
  const minConcepts = topic === "applications" ? 40 : 10;
  const ok = pool >= QUESTIONS_PER_TOPIC && cov.conceptCount >= minConcepts;
  if (!ok) failed = true;
  console.log(
    `${ok ? "OK" : "LOW"} ${topic}: raw=${raw} pool=${pool} concepts=${cov.conceptCount}/${minConcepts} [${cov.concepts.join(",")}]`
  );
}
if (failed) {
  console.error("\nSome topics are below 50 problems or the concept minimum (10; applications ≥40).");
  process.exit(1);
}
