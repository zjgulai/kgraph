---
title: DocCanvas Product Factory Design System
status: approved
updated: 2026-07-15
---

# DocCanvas Product Factory Design System

This system turns DocCanvas into a warm, industrial product-factory cross-section for AI product owners and founders. It combines a stable editorial reading surface with restrained 2.5D architecture, deterministic production pipelines, and synthetic digital employee roles.

## Source material

- `docs/superpowers/specs/2026-07-15-doccanvas-living-product-factory-design.md` — approved product and visual specification.
- `app/globals.css` — existing canvas surface and responsive behavior.
- `components/canvas/ArchitectureNodes.tsx` — existing building and room rendering.
- `components/canvas/MobileArchitectureView.tsx` — existing mobile architecture surface.
- `components/canvas/CanvasViewer.tsx` — existing canvas interaction and export ownership.
- Browser audit of `/`, `/canvas/vibe-track`, `/canvas/v2-pro`, and `/canvas/playbook-v2` at desktop and 390×844 mobile sizes.

The codebase and approved specification are the sources of truth. Historical screenshots are supporting evidence only.

## Index

- `tokens/colors_and_type.css` — canonical color, typography, spacing, depth, motion, and pipeline tokens.
- `brand/voice-and-tone.md` — language and status-copy rules.
- `brand/style-notes.md` — visual foundations and component composition rules.
- `SKILL.md` — portable usage contract.

## Integration

`app/globals.css` imports the canonical token file and aliases legacy `--canvas-*`, `--track-*`, and `--status-*` variables during migration. New product-factory components consume `--factory-*` semantic variables directly.

No runtime font or UI dependency is required. Digital employee and environment assets are governed separately by the factory presentation registry and its asset contract.
