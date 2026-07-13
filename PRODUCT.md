# Product

## Register

product

## Platform

web

## Users

Primary users are **course students** enrolled in CEE 103 (integral calculus). They open the app between classes, during study blocks, or before exams — phone or laptop, often with limited patience for chrome that fights the math. The job in the moment is to **understand the method**: how shells, disks, or washers build a solid of revolution, not only to mark an answer correct.

## Product Purpose

CEE 103 is self-paced integral calculus practice with a **live 3D visual**. Students pick a topic and difficulty, work exact-answer application problems, check responses, open worked solutions, and scrub or play a Three.js scene that shows the bounded region and solid forming. Success looks like: fewer “I can plug into the formula but don’t see it” moments, and a durable mental model of the solid-of-revolution methods.

## Positioning

**You watch the solid of revolution form in live 3D as the method builds** — not a static textbook figure, and not a quiz that only grades the number.

## Brand Personality

**Sharp, confident, modern.** Voice is direct and unsentimental: clear labels, tight controls, no pep-talk copy. Emotional goal is competent focus — “I’m driving a precise tool,” not “I’m being entertained into learning.” Reference feel: **NotebookLM’s quiz interface** — question-first layout, minimal ceremony, answer affordances that stay quiet until needed, polished product density without edtech theater.

## Anti-references

Do **not** feel like gamified edtech: points, streaks, confetti, cartoon mascots, faux urgency, or dopamine loops dressed as pedagogy. Prefer instrument clarity over reward systems.

## Design Principles

1. **Diagram is the argument.** The 3D scene and method steps carry understanding; UI chrome supports them and stays out of the way.
2. **Sharp over soft.** Prefer decisive hierarchy, confident type and control weight, and modern product density — not cozy brochure warmth for its own sake.
3. **Show the method, don’t decorate the grade.** Feedback exists to correct understanding (check, solution, animation steps), not to celebrate completion.
4. **Practice what the course teaches.** Course-aligned problems, textbook references, and dual methods (e.g. shells vs washers) stay first-class when they exist.
5. **Instrument, not game.** Every interaction should feel like adjusting a lab tool (strips, speed, scrub, camera) rather than advancing a level.

## Accessibility & Inclusion

Target **WCAG 2.2 AA**: readable contrast, keyboard access, visible focus, labeled controls, and meaningful names for interactive elements. Honor **`prefers-reduced-motion`**: do not force playback or motion that blocks comprehension; provide static or stepped alternatives when animation is reduced. KaTeX math must remain readable; viz failures need clear non-visual fallback (error state + solution text).
