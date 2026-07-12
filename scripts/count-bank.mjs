import {
  briggsProblemCount,
  conceptCoverage,
  QUESTIONS_PER_TOPIC,
} from "../src/briggsProblems.js";
import { GENERATED_BANK } from "../src/generatedBank.js";

console.log("QUESTIONS_PER_TOPIC:", QUESTIONS_PER_TOPIC);
let failed = false;
for (const topic of Object.keys(GENERATED_BANK)) {
  const raw = Array.isArray(GENERATED_BANK[topic])
    ? GENERATED_BANK[topic].length
    : "tiered";
  const pool = briggsProblemCount(topic);
  const cov = conceptCoverage(topic);
  const ok = pool >= QUESTIONS_PER_TOPIC && cov.conceptCount >= 10;
  if (!ok) failed = true;
  console.log(
    `${ok ? "OK" : "LOW"} ${topic}: raw=${raw} pool=${pool} concepts=${cov.conceptCount} [${cov.concepts.join(",")}]`
  );
}
if (failed) {
  console.error("\nSome topics are below 50 problems or 10 concepts.");
  process.exit(1);
}
