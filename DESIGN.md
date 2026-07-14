---
name: CEE 103 Integral Studio
description: Practice integral calculus with live 3D solids of revolution — instrument-sharp, question-first product UI.
colors:
  ink: "#1a1b1e"
  muted: "#5c6570"
  line: "#e2e4e8"
  canvas: "#ffffff"
  panel: "#f5f6f8"
  elevated: "#eef0f3"
  primary: "#5e1f2e"
  primary-light: "#8a3a48"
  primary-hover: "#471622"
  accent: "#c4922e"
  teal: "#1a5c48"
  red: "#9c1f2a"
  warning: "#b07a1a"
  on-primary: "#ffffff"
  disabled: "#a8b0bc"
  media-canvas: "#e8eaee"
  dock-bg: "#1c1d21"
  dock-ink: "#f4f5f7"
  viz-region: "#c4887a"
  viz-shell: "#c4922e"
  viz-solid: "#8a3a48"
  viz-water: "#1a5c48"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, Times New Roman, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "DM Sans, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  ui:
    fontFamily: "DM Sans, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.01em"
  title:
    fontFamily: "DM Sans, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
rounded:
  sm: "8px"
  md: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
    height: "48px"
  topic-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "16px 14px"
  choice:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "56px"
  dock:
    backgroundColor: "{colors.dock-bg}"
    textColor: "{colors.dock-ink}"
    rounded: "{rounded.pill}"
    padding: "6px"
---

## Overview

CEE 103 is a **product-register** practice tool for integral calculus. Students pick a topic, answer multiple-choice application problems, open worked solutions, and drive a live Three.js scene that shows solids of revolution forming.

Design serves the task: **diagram is the argument**, chrome stays out of the way. Personality is **sharp, confident, modern** — NotebookLM-like density without gamified edtech. Reference anti-patterns: streaks, confetti, cartoon mascots, cream SaaS brochure warmth.

Platform is **light-only web** (`color-scheme: light`). Tokens live in `src/style.css` `:root`. CSS custom property `--blue` is the oxblood **primary** brand color (historical name; treat as primary, not blue).

## Colors

**Strategy: Restrained** — cool neutrals carry the surface; oxblood primary ≤10% of chrome for primary actions and selection; honey gold is a limited accent (topic icons, selected choice edge, viz shells).

| Role | Hex | CSS token | Use |
|------|-----|-----------|-----|
| Ink | `#1a1b1e` | `--ink` | Body text, titles |
| Muted | `#5c6570` | `--muted` | Meta, captions (≥4.5:1 on canvas/panel) |
| Line | `#e2e4e8` | `--line` | Borders, dividers |
| Canvas | `#ffffff` | `--canvas` | Page background |
| Panel | `#f5f6f8` | `--panel` | Cards, problem/viz panels |
| Elevated | `#eef0f3` | `--elevated` | Nested chips, banners |
| Primary (oxblood) | `#5e1f2e` | `--blue` | Primary buttons, brand mark, focus |
| Primary hover | `#471622` | `--blue-hover` | Primary hover |
| Accent (honey) | `#c4922e` | `--accent` | Decorative accent; not body text |
| Success teal | `#1a5c48` | `--teal` | Correct state |
| Error red | `#9c1f2a` | `--red` | Incorrect state |
| Dock | `#1c1d21` | `--dock-bg-solid` | Floating navigator (solid, no glass) |

Soft tints use `color-mix` against primary/teal/red (`--blue-soft`, `--teal-soft`, `--red-soft`). Viz materials map through CSS (`--viz-*`) into the scene palette. Graph grid (`--viz-grid: #6e7682`) targets ≥3:1 contrast on `--media-canvas`.

Do not introduce cream/sand body backgrounds or a second competing brand hue.

## Typography

- **UI / body:** DM Sans (400/500/700), system fallbacks. Product scale is rem-fixed, not fluid display.
- **Brand mark only:** Cormorant Garamond 600 on the ∫ mark and “CEE 103” wordmark.
- **Math:** KaTeX; choice math ~1.28em relative to UI.
- Landing title ~1.75–2.25rem clamp; practice prompt (`h1`) 1.375rem / 1.5rem on small screens.
- Prefer `text-wrap: balance` on marketing-ish titles and `pretty` on long prompts.
- Cap prose width ~42–72ch where reading matters; data/math can denser.

Fonts load non-blocking from Google Fonts with system fallbacks first.

## Elevation

- **Default:** 1px `var(--line)` borders on panels — no wide soft shadows on cards.
- **Dock:** solid `#1c1d21` fill, 1px light edge, shallow shadow only (`0 2px 8px`). No backdrop blur / glass.
- **Focus:** 3px solid primary outline + soft ring (`--focus` / `--focus-ring`); dock uses light-on-dark outline.
- **Z-index:** `--z-sticky: 10` (topbar), `--z-dock: 40` (floating navigator).

## Components

### Landing
- Topic **radiogroup** of cards (icon + label + short description); arrow-key roving tabindex.
- Full-width primary “Start practice” (max 360px).

### Practice workspace
- Sticky topbar: brand home control, topic label, progress pill.
- Two-column grid (≥860px): visual ~40% sticky / problem+solution ~60%. Below 860px: problem → viz → solution.
- **Choices:** radio buttons with letter badge, KaTeX, selected (accent edge) / correct (teal) / incorrect (red).
- **Floating dock:** previous · “n of N” · Check/Next. Solid dark capsule; 44×44px targets.
- **Solution:** banner states correct vs not quite in **text** (not color alone); equations, numbered steps, final answer, insight.

### Visualization instrument
- Step track (phase jump buttons) + caption (`aria-live`; clamped, not removed, on short landscape).
- Canvas host with loading status and error + retry; stage `aria-describedby` points at `#viz-instructions` (not a control).
- **Model controls (always visible):** dual-method segmented when applicable; Scrub; Play/Pause; Reset animation. **More** expands Strips, Speed, and Reset view only.
- **Camera help:** `?` toggles an inline panel (touch-safe; not title-only).
- Iframe diagram: orbit/zoom/pan; keyboard arrows, ±, R when focused.
- Autoplay only when reduced-motion is off and viewport is fine + pointer is fine; pause otherwise (mobile/touch defaults to paused).

### Motion
- Transitions ~160ms, `--ease-out` exponential.
- Honor `prefers-reduced-motion`: kill decorative transitions; do not autoplay scene; stepped scrub still works.
- No confetti, bounce, or page-load choreography.

## Do's and Don'ts

**Do**
- Keep the 3D diagram and method steps as the teaching surface.
- Use design tokens from `:root` for app chrome.
- Ship visible focus, labeled controls, and 44px minimum interactive targets.
- State correctness in words (and color), not color alone.
- Prefer instrument language (Play, Scrub, Strips) over game language.

**Don't**
- Add glassmorphism, gradient text, cream paper backgrounds, or hero-metric SaaS templates.
- Decorate with side-stripe accents on cards or numbered section eyebrows.
- Pair border + large soft drop shadows on the same decorative card.
- Use accent gold for body text (contrast fails AA).
- Hide play/scrub controls inside the iframe — parent chrome owns animation control.
- Gamify with points, streaks, or faux urgency.
