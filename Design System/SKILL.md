---
name: exl-medicare-hub-design
description: Use this skill to generate well-branded interfaces and assets for EXL Medicare Hub and its Atlas AI copilot, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files.

This design system is for **EXL Medicare Hub** — a Medicare sales-agent web app — and its
right-docked AI copilot, **Atlas**. The headline asset is `ui_kits/copilot-panel/` (the
full assembled panel).

Key facts to internalize before designing:
- **Dark is the primary theme**; light is a supported variant (`[data-theme="light"]`).
- **#ea580c orange is the only action color.** Use it sparingly — buttons, the user chat
  bubble, the active tab, the Atlas mark. Everything else is neutral slate-navy surfaces.
- **Type:** Inter for all UI; system monospace for codes (MBI, leadId, dialer); Newsreader
  serif **only** on the Atlas AI surface (greetings/headers) for differentiation.
- **Icons:** Lucide, loaded from CDN. Never hand-draw SVGs or use emoji.
- **Atlas mark:** the radar/sonar avatar in `assets/atlas-mark.html` (and `AtlasMark` in
  the kit). The EXL logo is a typographic stand-in until the official PNG is supplied.
- Tone is calm, operational, first-name-and-"you", no emoji. See README → CONTENT
  FUNDAMENTALS.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out
and create static HTML files for the user to view, pulling tokens from
`colors_and_type.css`. If working on production code, copy assets and read the rules here
to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to
build or design, ask some questions, and act as an expert designer who outputs HTML
artifacts _or_ production code, depending on the need.
