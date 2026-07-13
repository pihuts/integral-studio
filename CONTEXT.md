# CEE 103 / integral-studio — domain glossary

Terms used in product and architecture discussions. No implementation details.

## Curriculum

- **Topic** — One of the practice areas: fundamentals, area, volumes, centroids, arc, surface, inertia, applications.
- **Problem** — A multiple-choice integral exercise with prompt, choices, worked steps, and optional dual-method steps.
- **Bank** — The generated set of problems (Briggs / OpenStax style), fifty per topic after filters.
- **Concept** — A numbered skill within a topic (e.g. concept 3 under area). Each non-applications topic has ≥30 distinct concepts; applications has ≥40.

## Visualization

- **VisualSpec** — Serializable description of the region, curves, method, and labels for the 3D animation.
- **VisualParams** — Generator-emitted fields that become a VisualSpec (authoritative when complete).
- **Render method** — How the solid/region is built: area, shell-x/y, disk-x/y, washer-x/y, centroid, inertia, arc, surface-x/y, cross-square, cross-semicircle, pump-bowl, pool-fill, goat-barn.
- **Dual method** — Same region with an alternate strip direction (e.g. shells vs washers).
- **Animation timeline** — Progress phases: region → slice → rotate → stack.
- **Materialization** — Turning a Problem into a validated VisualSpec (and compiled example) for the renderer.

## Practice session

- **Landing** — Topic selection before practice.
- **Practice** — Working through questions for one topic.
- **Scene** — The interactive 3D diagram host (iframe) for the current problem.
