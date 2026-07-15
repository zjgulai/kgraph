---
title: Visual Foundations
updated: 2026-07-15
---

# Visual Foundations

## Composition

- Treat the canvas as a front-facing industrial cross-section, not a pile of floating cards.
- Use a fixed title lintel, sawtooth roof rhythm, floor slabs, columns, door frames, a central production spine, and horizontal branch pipes.
- Keep the building at 78%–90% of usable desktop width and 62%–82% of usable height after fit-to-view.
- Desktop overview shows room-level relationships. Node-level relationships belong to the room workspace.

## Color and type

- Warm paper is dominant. Forest green carries primary flow, copper carries governance, and slate carries dependencies.
- Display headings use the local serif stack; body content uses the approved Chinese sans stack; codes and room labels use the mono stack.
- Never communicate a relation by color alone. Combine line style, arrow direction, label, and selection behavior.

## Shape and depth

- Shell radius is at most 8px; room panels are at most 6px.
- Wall surfaces have no floating shadow. Foreground content uses the 8px depth token; overlays use the 16px depth token.
- CSS layers, wall thickness, occlusion, and at most 6px pointer parallax provide 2.5D depth. Text remains front-facing.
- Avoid colored left-border module cards and generic white rounded-card grids.

## Motion

- Room entry uses 220–240ms translation, scale, and depth changes.
- Hover feedback is short and structural; it may lift a room face by 2px but must not tilt readable text.
- Disable parallax and camera scaling under `prefers-reduced-motion: reduce`.

## Iconography and imagery

- Use the existing Lucide icon dependency for controls and status affordances.
- Do not use Unicode arrows, emoji, or decorative glyphs as interface icons.
- Digital employee portraits share a 4:5 crop, shoulder-height composition, soft side light, coherent workwear, and warm neutral environments.
- Environment imagery stays low contrast behind a stable content surface and never carries required text.
